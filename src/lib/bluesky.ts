import {
  Agent, CredentialSession, RichText, moderatePost, moderateProfile, moderateNotification, moderateFeedGenerator, LABELS, DEFAULT_LABEL_SETTINGS,
  AppBskyFeedDefs, AppBskyFeedPost, AppBskyEmbedImages,
  AppBskyEmbedExternal, AppBskyEmbedVideo, AppBskyEmbedRecord,
  AppBskyEmbedRecordWithMedia,
  AppBskyActorDefs, type AtpSessionData, type ModerationOpts,
} from '@atproto/api';
import type { FeedGenerator, FeedPage, Notification, Page, Post, Profile, SessionUser, TextSegment, Thread } from './types';
import { activateAccountLifetime, getAccountLifetime, subscribeAccountInvalidation, clearAccountLocalContent, readOfflineSnapshot, saveOfflineSnapshot, type AccountLifetime } from './offline';

const PUBLIC_SERVICE = 'https://public.api.bsky.app';
const DEFAULT_SERVICE = 'https://bsky.social';
export const DEFAULT_DISCOVER_FEED = 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot';
const STORAGE_KEY = 'sliding-panels.bluesky-session';
const LIMIT = 30;
const DEFAULT_MODERATION: ModerationOpts = {
  userDid: undefined,
  prefs: { adultContentEnabled: false, labels: { ...DEFAULT_LABEL_SETTINGS }, mutedWords: [], hiddenPosts: [],
    labelers: [{ did: 'did:plc:ar7c4by46qjdydhdevvrndac', labels: {} }] },
};

type StoredSession = { service: string; session: AtpSessionData };

/** Serializable identity for one user-initiated publication, including explicit retries. */
export interface PublishAttempt {
  readonly actorDid: string;
  readonly rkey: string;
  readonly text: string;
  readonly replyTo?: Post;
  readonly createdAt: string;
  record?: AppBskyFeedPost.Record;
  dispatched: boolean;
  confirmed?: Post;
}

export class PublicationUncertainError extends Error {
  constructor(public readonly attempt: PublishAttempt) {
    super('Bluesky may have received this post. Check again to confirm it before starting another post.');
    this.name = 'PublicationUncertainError';
  }
}

let lastRecordTime = 0n;
function nextRecordKey(): string {
  // AT Protocol TID: 53-bit microsecond timestamp plus a 10-bit clock identifier.
  const now = BigInt(Date.now()) * 1000n;
  lastRecordTime = now > lastRecordTime ? now : lastRecordTime + 1n;
  let value = (lastRecordTime << 10n) | BigInt(crypto.getRandomValues(new Uint16Array(1))[0] & 1023);
  const alphabet = '234567abcdefghijklmnopqrstuvwxyz';
  let key = '';
  for (let i = 0; i < 13; i++) { key = alphabet[Number(value & 31n)] + key; value >>= 5n; }
  return key;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}

class OfflineError extends Error {
  constructor() { super('You are offline. Reconnect to Bluesky before sending changes.'); }
}

function networkUnavailable(): boolean { return typeof navigator !== 'undefined' && navigator.onLine === false; }
function canUseSnapshot(error: unknown): boolean {
  const status = (error as { status?: number }).status;
  return error instanceof OfflineError || (status !== undefined
    ? status < 400 || status >= 500 || status === 429
    : /network|fetch|load failed|abort|timeout/i.test((error as Error)?.message ?? ''));
}

/** Only network requests are bounded; writes are never automatically retried. */
const timedFetch: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const source = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const abort = () => controller.abort(source?.reason);
  if (source?.aborted) abort();
  else source?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    // fetch resolves at headers. XRPC needs the complete finite response body;
    // drain a clone under the same deadline, preserving the original Response.
    if (response.body) await response.clone().arrayBuffer();
    return response;
  }
  finally { clearTimeout(timer); source?.removeEventListener('abort', abort); }
};

export function errorMessage(error: unknown): string {
  const info = error as { status?: number; error?: string; message?: string; name?: string } | null;
  if (info?.status === 429 || info?.error === 'RateLimitExceeded') return 'Bluesky is limiting requests. Please wait a moment and try again.';
  if (info?.status === 401 || ['AuthenticationRequired', 'ExpiredToken', 'InvalidToken'].includes(info?.error ?? '')) return 'Your session has expired. Please sign in again.';
  if (info?.name === 'AbortError' || info?.name === 'TimeoutError') return 'The request timed out. Please try again.';
  if (info?.message?.match(/fetch failed|failed to fetch|networkerror|load failed/i)) return 'Cannot reach Bluesky. Check your connection and try again.';
  return info?.message || 'Bluesky could not complete this request. Please try again.';
}

function safeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined; }
  catch { return undefined; }
}

/** Read moderation preferences without Agent.getPreferences(), which migrates saved feeds via a write. */
async function readModerationOptions(agent: Agent, userDid: string): Promise<ModerationOpts> {
  const { data } = await agent.app.bsky.actor.getPreferences({});
  const prefs: ModerationOpts['prefs'] = { ...DEFAULT_MODERATION.prefs, labels: { ...DEFAULT_LABEL_SETTINGS },
    labelers: DEFAULT_MODERATION.prefs.labelers.map(labeler => ({ did: labeler.did, labels: {} })) };
  const labels: AppBskyActorDefs.ContentLabelPref[] = [];
  for (const pref of data.preferences) {
    if (AppBskyActorDefs.isAdultContentPref(pref) && AppBskyActorDefs.validateAdultContentPref(pref).success) prefs.adultContentEnabled = pref.enabled;
    else if (AppBskyActorDefs.isLabelersPref(pref) && AppBskyActorDefs.validateLabelersPref(pref).success) {
      prefs.labelers = [...new Set([...DEFAULT_MODERATION.prefs.labelers.map(labeler => labeler.did), ...pref.labelers.map(labeler => labeler.did)])]
        .map(did => ({ did, labels: {} }));
    } else if (AppBskyActorDefs.isContentLabelPref(pref) && AppBskyActorDefs.validateContentLabelPref(pref).success) labels.push(pref);
    else if (AppBskyActorDefs.isMutedWordsPref(pref) && AppBskyActorDefs.validateMutedWordsPref(pref).success) prefs.mutedWords = pref.items.map(word => ({ ...word, actorTarget: word.actorTarget || 'all' }));
    else if (AppBskyActorDefs.isHiddenPostsPref(pref) && AppBskyActorDefs.validateHiddenPostsPref(pref).success) prefs.hiddenPosts = pref.items;
  }
  const legacy: Record<string, string> = { gore: 'graphic-media', nsfw: 'porn', suggestive: 'sexual' };
  for (const pref of labels) {
    const visibility = pref.visibility === 'show' ? 'ignore' : pref.visibility;
    if (!['ignore', 'warn', 'hide'].includes(visibility)) continue;
    const target = pref.labelerDid ? prefs.labelers.find(labeler => labeler.did === pref.labelerDid)?.labels : prefs.labels;
    if (target) target[pref.labelerDid ? pref.label : legacy[pref.label] ?? pref.label] = visibility as 'ignore' | 'warn' | 'hide';
  }
  agent.configureLabelers(prefs.labelers.map(labeler => labeler.did));
  return { userDid, prefs };
}

/** Unknown labels from subscribed labelers must not silently bypass a hide preference. */
function unknownSubscribedLabel(labels: Array<{ src: string; val: string }> | undefined, options: ModerationOpts): boolean {
  return !!labels?.some(label => options.prefs.labelers.some(labeler => labeler.did === label.src)
    && !Object.hasOwn(LABELS, label.val)
    && !options.labelDefs?.[label.src]?.some(def => def.identifier === label.val));
}

function normalizeProfile(profile: AppBskyActorDefs.ProfileViewBasic | AppBskyActorDefs.ProfileView | AppBskyActorDefs.ProfileViewDetailed, options = DEFAULT_MODERATION): Profile {
  const decision = moderateProfile(profile, options);
  const view = decision.ui('profileView');
  const list = decision.ui('profileList');
  const unknown = unknownSubscribedLabel(profile.labels, options);
  const moderation = { hidden: list.filter || unknown, blur: view.blur || unknown, noOverride: view.noOverride,
    avatar: decision.ui('avatar').blur || unknown, banner: decision.ui('banner').blur || unknown,
    displayName: decision.ui('displayName').blur || unknown, warning: unknown ? 'Label definitions unavailable' : undefined };
  const detail = profile as AppBskyActorDefs.ProfileViewDetailed;
  return {
    did: profile.did, handle: profile.handle,
    displayName: moderation.displayName ? profile.handle : profile.displayName || profile.handle,
    avatar: moderation.avatar ? undefined : safeUrl(profile.avatar), banner: moderation.banner ? undefined : safeUrl(detail.banner),
    moderation,
    description: detail.description, followersCount: detail.followersCount,
    followsCount: detail.followsCount, postsCount: detail.postsCount,
    following: profile.viewer?.following, followedBy: profile.viewer?.followedBy,
    muted: profile.viewer?.muted || !!profile.viewer?.mutedByList,
    blocked: !!profile.viewer?.blocking || !!profile.viewer?.blockingByList || profile.viewer?.blockedBy,
  };
}

function normalizeGenerator(view: AppBskyFeedDefs.GeneratorView, options = DEFAULT_MODERATION): FeedGenerator {
  const decision = moderateFeedGenerator(view, options);
  const list = decision.ui('contentList');
  const content = decision.ui('contentView');
  const media = decision.ui('contentMedia');
  const unknown = unknownSubscribedLabel(view.labels, options) || unknownSubscribedLabel(view.creator.labels, options);
  const creator = normalizeProfile(view.creator, options);
  const blur = content.blur || media.blur || unknown || !!creator.moderation?.blur;
  return { uri: view.uri, cid: view.cid, displayName: blur ? 'Content warning' : view.displayName,
    description: blur ? undefined : view.description, avatar: blur ? undefined : safeUrl(view.avatar),
    creator, likeCount: view.likeCount ?? 0,
    moderation: { hidden: list.filter || unknown || !!creator.moderation?.hidden, blur,
      noOverride: list.noOverride || content.noOverride || media.noOverride,
      warning: unknown ? 'Label definitions unavailable' : blur ? 'Content warning' : undefined } };
}

function segments(record: AppBskyFeedPost.Record): TextSegment[] {
  const richText = new RichText({ text: record.text, facets: record.facets });
  return Array.from(richText.segments(), (segment) => ({
    text: segment.text,
    href: segment.isLink() ? safeUrl(segment.link?.uri) : undefined,
    mention: segment.isMention() ? segment.mention?.did : undefined,
    tag: segment.isTag() ? segment.tag?.tag : undefined,
  }));
}

function normalizePost(view: AppBskyFeedDefs.PostView, depth = 0, options = DEFAULT_MODERATION): Post {
  const validated = AppBskyFeedPost.validateRecord(view.record);
  const record = validated.success ? validated.value : undefined;
  const moderation = moderatePost(view, options);
  const unknown = unknownSubscribedLabel(view.labels, options) || unknownSubscribedLabel(view.author.labels, options);
  const listDecision = moderation.ui('contentList');
  const contentDecision = moderation.ui('contentView');
  const mediaDecision = moderation.ui('contentMedia');
  const causes = [...listDecision.filters, ...contentDecision.blurs, ...mediaDecision.blurs];
  const warning = causes.some(cause => cause.type === 'blocking' || cause.type === 'blocked-by' || cause.type === 'block-other')
    ? 'Blocked account' : causes.some(cause => cause.type === 'muted' || cause.type === 'mute-word')
      ? 'Muted content' : causes.length ? 'Content warning' : undefined;
  const post: Post = {
    uri: view.uri, cid: view.cid, author: normalizeProfile(view.author, options),
    text: record?.text ?? '', segments: record ? segments(record) : [],
    createdAt: record?.createdAt ?? view.indexedAt, indexedAt: view.indexedAt,
    replyCount: view.replyCount ?? 0, repostCount: view.repostCount ?? 0, likeCount: view.likeCount ?? 0,
    likeUri: view.viewer?.like, repostUri: view.viewer?.repost,
    replyTo: record?.reply, images: [], labels: view.labels?.map(label => label.val) ?? [],
    moderation: { hidden: listDecision.filter || unknown, blur: contentDecision.blur || mediaDecision.blur || unknown,
      noOverride: listDecision.noOverride || contentDecision.noOverride || mediaDecision.noOverride, warning: unknown ? 'Label definitions unavailable' : warning },
  };
  function applyEmbed(embed: AppBskyFeedDefs.PostView['embed'] | AppBskyEmbedRecord.View) {
    if (AppBskyEmbedImages.isView(embed)) {
      post.images = embed.images.map(image => ({ ...image, thumb: safeUrl(image.thumb) ?? '', fullsize: safeUrl(image.fullsize) ?? '' }));
    } else if (AppBskyEmbedExternal.isView(embed)) {
      const uri = safeUrl(embed.external.uri);
      if (uri) post.external = { ...embed.external, uri, thumb: safeUrl(embed.external.thumb) };
    } else if (AppBskyEmbedVideo.isView(embed)) {
      const playlist = safeUrl(embed.playlist);
      if (playlist) post.video = { playlist, thumbnail: safeUrl(embed.thumbnail), alt: embed.alt, aspectRatio: embed.aspectRatio };
    } else if (AppBskyEmbedRecordWithMedia.isView(embed)) {
      applyEmbed(embed.media);
      applyEmbed(embed.record);
    } else if (AppBskyEmbedRecord.isView(embed)) {
      const quoted = embed.record;
      if (AppBskyEmbedRecord.isViewRecord(quoted) && depth < 2) {
        post.quote = normalizePost({
          uri: quoted.uri, cid: quoted.cid, author: quoted.author, record: quoted.value,
          indexedAt: quoted.indexedAt, embed: quoted.embeds?.[0],
          likeCount: quoted.likeCount, replyCount: quoted.replyCount, repostCount: quoted.repostCount,
          labels: quoted.labels,
        }, depth + 1, options);
      } else if (AppBskyFeedDefs.isGeneratorView(quoted)) post.feedGenerator = normalizeGenerator(quoted, options);
      else if (AppBskyEmbedRecord.isViewBlocked(quoted)) post.unavailableQuote = 'This quoted post is blocked.';
      else if (AppBskyEmbedRecord.isViewNotFound(quoted)) post.unavailableQuote = 'This quoted post is no longer available.';
      else if (AppBskyEmbedRecord.isViewDetached(quoted)) post.unavailableQuote = 'The author removed this quote.';
    }
  }
  applyEmbed(view.embed);
  return post;
}

function normalizeFeed(feed: AppBskyFeedDefs.FeedViewPost[], cursor?: string, options = DEFAULT_MODERATION): FeedPage {
  const seen = new Set<string>();
  const items = feed.flatMap(item => {
    if (seen.has(item.post.uri)) return [];
    seen.add(item.post.uri);
    const post = normalizePost(item.post, 0, options);
    if (AppBskyFeedDefs.isReasonRepost(item.reason)) post.repostedBy = normalizeProfile(item.reason.by, options);
    return [post];
  });
  return { items, cursor };
}

/** A browser-only client: credentials go directly to the selected PDS. */
export class BlueskyClient {
  private publicAgent = new Agent({ service: PUBLIC_SERVICE, fetch: timedFetch });
  // Post search is not served by the cached public.api.bsky.app CDN.
  private searchAgent = new Agent({ service: 'https://api.bsky.app', fetch: timedFetch });
  private authenticatedAgent: Agent | null = null;
  private credentials: CredentialSession | null = null;
  private currentUser: SessionUser | null = null;
  private restoring: Promise<SessionUser | null> | null = null;
  private moderationOptions = DEFAULT_MODERATION;
  private authVersion = 0;
  private loginVersion = 0;
  private volatileSession: StoredSession | null = null;
  private lifetime: AccountLifetime | null = null;

  constructor() {
    subscribeAccountInvalidation((did, epoch) => {
      if (this.currentUser?.did === did && this.lifetime?.epoch === epoch) this.expireSession(false);
    });
  }

  get sessionGeneration(): number { return this.authVersion; }
  get sessionLifetime(): AccountLifetime | null { return this.lifetime; }
  get accountLifetime(): AccountLifetime | null { return this.lifetime; }

  private assertAccount(version: number, did: string | undefined): void {
    if (version !== this.authVersion || did !== this.currentUser?.did) throw new Error('The active account changed. Please reload this panel.');
  }
  private sessionListeners = new Set<(user: SessionUser | null) => void>();

  subscribeSession(listener: (user: SessionUser | null) => void): () => void {
    this.sessionListeners.add(listener);
    return () => { this.sessionListeners.delete(listener); };
  }

  private notifySession(): void {
    for (const listener of this.sessionListeners) listener(this.currentUser);
  }

  private expireSession(removeStored = true): void {
    this.authVersion++;
    this.volatileSession = null;
    this.lifetime = null;
    this.restoring = null;
    this.credentials = null;
    this.authenticatedAgent = null;
    this.currentUser = null;
    this.moderationOptions = DEFAULT_MODERATION;
    try { if (removeStored) this.storage()?.removeItem(STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
    this.notifySession();
  }

  private toPost(view: AppBskyFeedDefs.PostView): Post { return normalizePost(view, 0, this.moderationOptions); }

  private async cachedRead<T extends object>(key: string, request: () => Promise<T>, accountOnly = false): Promise<T & { offline?: boolean; savedAt?: number }> {
    const account = this.currentUser?.did;
    const version = this.authVersion;
    const lifetime = this.lifetime;
    if (accountOnly && !account) throw new Error('Sign in with a Bluesky app password to do this.');
    const cacheKey = account ? `account:${account}:v1:${key}` : `bluesky-public-v1:${key}`;
    try {
      if (networkUnavailable()) throw new OfflineError();
      if (account && this.currentUser?.connection === 'offline') {
        const restored = await this.reconnect();
        if (restored?.connection !== 'verified') throw new OfflineError();
      }
      this.assertAccount(version, account);
      const data = await request();
      this.assertAccount(version, account);
      await saveOfflineSnapshot(cacheKey, data, lifetime);
      this.assertAccount(version, account);
      return data;
    } catch (error) {
      if (version !== this.authVersion || account !== this.currentUser?.did || !canUseSnapshot(error)) throw error;
      if (account && (error as { status?: number }).status !== 429) this.rememberOffline();
      const snapshot = await readOfflineSnapshot<T>(cacheKey, lifetime);
      this.assertAccount(version, account);
      if (snapshot) return { ...snapshot.data, offline: true, savedAt: snapshot.savedAt };
      throw error;
    }
  }

  private rememberOffline(): void {
    if (!this.currentUser) return;
    // Keep refreshable credentials in memory even when browser storage is unavailable.
    this.authenticatedAgent = null;
    this.currentUser = { ...this.currentUser, connection: 'offline', offline: true };
    this.notifySession();
  }

  private async saveIdentity(): Promise<void> {
    if (this.currentUser?.connection === 'verified') await saveOfflineSnapshot(`account:${this.currentUser.did}:identity`, this.currentUser, this.lifetime);
  }

  async reconnect(): Promise<SessionUser | null> {
    if (networkUnavailable()) return this.currentUser;
    if (this.restoring) return this.restoring;
    // An explicit online transition must verify tokens again even if no read was
    // attempted during the outage, so a stale "verified" flag cannot bypass it.
    if (this.currentUser?.connection === 'verified') this.rememberOffline();
    return this.restoreSession();
  }

  private async verifiedForWrite(): Promise<Agent> {
    const version = this.authVersion;
    const did = this.currentUser?.did;
    if (networkUnavailable()) throw new OfflineError();
    if (this.currentUser?.connection === 'offline') await this.reconnect();
    this.assertAccount(version, did);
    if (this.currentUser?.connection === 'offline') throw new OfflineError();
    return this.requireAuth();
  }

  private async hydrateIdentity(agent: Agent, credentials: CredentialSession, version: number): Promise<void> {
    const did = credentials.did!;
    const current = () => version === this.authVersion && this.credentials === credentials;
    let options: ModerationOpts = { ...DEFAULT_MODERATION, userDid: did };
    try {
      options = await readModerationOptions(agent, did);
      try { options.labelDefs = await agent.getLabelDefinitions(options.prefs); } catch { /* Unknown subscribed labels remain hidden. */ }
    } catch { /* Keep conservative defaults when preferences cannot be read. */ }
    if (!current()) return;
    this.moderationOptions = options;
    try {
      // Hydration uses this verified agent directly: never recurse into reconnect().
      const { data } = await agent.getProfile({ actor: did });
      if (!current()) return;
      this.currentUser = { ...normalizeProfile(data, options), service: credentials.serviceUrl.href,
        connection: this.currentUser?.connection ?? 'verified', offline: this.currentUser?.connection === 'offline' };
    } catch { /* Authentication remains valid when AppView is unavailable. */ }
    if (!current()) return;
    await this.saveIdentity();
    if (current()) this.notifySession();
  }

  get session(): SessionUser | null { return this.currentUser; }
  private get agent(): Agent { return this.authenticatedAgent ?? this.publicAgent; }

  private storage(): Storage | undefined {
    try { return typeof localStorage === 'undefined' ? undefined : localStorage; }
    catch { return undefined; }
  }

  private createCredentials(service: string): CredentialSession {
    const url = new URL(service.includes('://') ? service : `https://${service}`);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('Enter an HTTPS address for your Bluesky server.');
    if (url.username || url.password || url.search || url.hash) throw new Error('Enter only the address of your Bluesky server.');
    const credentials = new CredentialSession(url, timedFetch, (event, session) => {
      // Do not let a replaced session overwrite the new account's credentials.
      if (this.credentials !== credentials) return;
      try {
        if (session && event !== 'expired') {
          this.volatileSession = { service: url.href, session };
          this.storage()?.setItem(STORAGE_KEY, JSON.stringify(this.volatileSession));
        }
        else if (event === 'expired') this.expireSession();
      } catch { /* Private browsing can disable storage; the active session still works. */ }
    });
    return credentials;
  }

  private requireAuth(): Agent {
    if (!this.authenticatedAgent || !this.credentials?.hasSession) throw new Error('Sign in with a Bluesky app password to do this.');
    return this.authenticatedAgent;
  }

  async login(identifier: string, password: string, service = DEFAULT_SERVICE): Promise<SessionUser> {
    if (!identifier.trim() || !password.trim()) throw new Error('Enter your Bluesky handle and app password.');
    const loginVersion = ++this.loginVersion;
    const credentials = this.createCredentials(service.trim() || DEFAULT_SERVICE);
    await credentials.login({ identifier: identifier.trim().replace(/^@/, ''), password });
    if (loginVersion !== this.loginVersion) {
      void credentials.logout().catch(() => {});
      throw new Error('Sign-in was canceled.');
    }
    const lifetime = await activateAccountLifetime(credentials.did!);
    if (loginVersion !== this.loginVersion) {
      void credentials.logout().catch(() => {});
      throw new Error('Sign-in was canceled.');
    }
    const version = ++this.authVersion;
    this.restoring = null;
    this.lifetime = lifetime;
    this.credentials = credentials;
    const agent = this.authenticatedAgent = new Agent(credentials);
    const auth = credentials.session!;
    this.volatileSession = { service: credentials.serviceUrl.href, session: auth };
    try { this.storage()?.setItem(STORAGE_KEY, JSON.stringify(this.volatileSession)); } catch { /* Session-only mode. */ }
    this.moderationOptions = { ...DEFAULT_MODERATION, userDid: auth.did };
    this.currentUser = { did: auth.did, handle: auth.handle, displayName: auth.handle, service: credentials.serviceUrl.href, connection: 'verified' };
    await this.hydrateIdentity(agent, credentials, version);
    this.assertAccount(version, auth.did);
    return this.currentUser!;
  }

  restoreSession(): Promise<SessionUser | null> {
    if (this.restoring) return this.restoring;
    const restoring = this.restore().finally(() => { if (this.restoring === restoring) this.restoring = null; });
    this.restoring = restoring;
    return restoring;
  }

  private async restore(): Promise<SessionUser | null> {
    if (this.currentUser?.connection === 'verified') return this.currentUser;
    const version = this.authVersion;
    let saved = this.volatileSession;
    if (!saved) {
      try {
        const value = this.storage()?.getItem(STORAGE_KEY);
        if (!value) return null;
        saved = JSON.parse(value) as StoredSession;
        if (!saved.service || !saved.session?.refreshJwt || !saved.session?.accessJwt || !saved.session?.did || !saved.session?.handle) throw new Error('Invalid saved session');
      } catch {
        try { this.storage()?.removeItem(STORAGE_KEY); } catch { /* Storage unavailable. */ }
        return null;
      }
    }
    const lifetime = this.lifetime ?? await getAccountLifetime(saved.session.did);
    const identity = await readOfflineSnapshot<SessionUser>(`account:${saved.session.did}:identity`, lifetime);
    if (version !== this.authVersion) return this.currentUser;
    this.lifetime = lifetime;
    this.volatileSession = saved;
    const restoreLocalIdentity = () => {
      this.authenticatedAgent = null;
      this.currentUser = {
        ...(this.currentUser?.did === saved.session.did ? this.currentUser : identity?.data.did === saved.session.did ? identity.data : { did: saved.session.did, handle: saved.session.handle, displayName: saved.session.handle }),
        service: saved.service, connection: 'offline' as const, offline: true, savedAt: identity?.savedAt,
      };
      this.notifySession();
      return this.currentUser;
    };
    if (networkUnavailable()) return restoreLocalIdentity();
    const credentials = this.credentials ?? this.createCredentials(saved.service);
    this.credentials = credentials;
    try { await credentials.resumeSession(credentials.session ?? saved.session); }
    catch (error) {
      if (version !== this.authVersion || this.credentials !== credentials) return this.currentUser;
      // CredentialSession emits expired only for invalid authentication; retain transient failures.
      if (!credentials.hasSession) { this.expireSession(); return null; }
      if (canUseSnapshot(error)) return restoreLocalIdentity();
      throw error;
    }
    if (version !== this.authVersion || this.credentials !== credentials) return this.currentUser;
    const agent = this.authenticatedAgent = new Agent(credentials);
    const auth = credentials.session!;
    this.currentUser = { did: auth.did, handle: auth.handle, displayName: auth.handle, service: credentials.serviceUrl.href, connection: 'verified' };
    await this.hydrateIdentity(agent, credentials, version);
    return this.currentUser;
  }

  async logout(): Promise<void> {
    const credentials = this.credentials;
    const did = this.currentUser?.did;
    ++this.loginVersion;
    this.expireSession();
    // Start revocation immediately; local clearing must not extend the write window.
    const revoke = credentials?.logout().catch(() => {});
    if (did) await clearAccountLocalContent(did);
    await revoke;
  }

  async publicFeed(cursor?: string, feedUri = DEFAULT_DISCOVER_FEED): Promise<FeedPage> {
    const key = feedUri === DEFAULT_DISCOVER_FEED ? `discover:${cursor ?? ''}` : `custom-feed:${JSON.stringify([feedUri, cursor])}`;
    return this.cachedRead(key, async () => {
      const { data } = await this.agent.app.bsky.feed.getFeed({ feed: feedUri, limit: LIMIT, cursor });
      return normalizeFeed(data.feed, data.cursor, this.moderationOptions);
    });
  }

  async feedGenerator(uri: string): Promise<FeedGenerator & { offline?: boolean; savedAt?: number }> {
    const feed = await this.cachedRead(`feed-generator:${uri}`, async () => {
      const { data } = await this.agent.app.bsky.feed.getFeedGenerator({ feed: uri });
      return normalizeGenerator(data.view, this.moderationOptions);
    });
    if (feed.moderation.hidden || feed.moderation.noOverride) throw new Error('This feed is unavailable because of your moderation settings.');
    return feed;
  }

  async discoverFeeds(query = '', cursor?: string): Promise<Page<FeedGenerator>> {
    return this.cachedRead(`feed-directory:${JSON.stringify([query.trim(), cursor])}`, async () => {
      const { data } = await this.agent.app.bsky.unspecced.getPopularFeedGenerators({ query: query.trim() || undefined, cursor, limit: LIMIT });
      return { items: data.feeds.map(feed => normalizeGenerator(feed, this.moderationOptions)).filter(feed => !feed.moderation.hidden && !feed.moderation.noOverride), cursor: data.cursor };
    });
  }

  async savedFeeds(): Promise<Page<FeedGenerator>> {
    return this.cachedRead('saved-feed-generators', async () => {
      const agent = this.requireAuth();
      const { data } = await agent.app.bsky.actor.getPreferences({});
      const modern = data.preferences.find(pref => AppBskyActorDefs.isSavedFeedsPrefV2(pref) && AppBskyActorDefs.validateSavedFeedsPrefV2(pref).success);
      const legacy = data.preferences.find(pref => AppBskyActorDefs.isSavedFeedsPref(pref) && AppBskyActorDefs.validateSavedFeedsPref(pref).success);
      const saved = modern && AppBskyActorDefs.isSavedFeedsPrefV2(modern)
        ? modern.items.filter(item => item.type === 'feed').map(item => ({ uri: item.value, pinned: item.pinned }))
        : legacy && AppBskyActorDefs.isSavedFeedsPref(legacy)
          ? [...new Set([...legacy.pinned, ...legacy.saved])].map(uri => ({ uri, pinned: legacy.pinned.includes(uri) })) : [];
      const entries = [...new Map(saved.filter(item => /^at:\/\/[^/]+\/app\.bsky\.feed\.generator\/[^/]+$/.test(item.uri)).map(item => [item.uri, item])).values()];
      const found = new Map<string, FeedGenerator>();
      // Keep hydration requests bounded for accounts with many saved feeds.
      for (let offset = 0; offset < entries.length; offset += 25) {
        const result = await agent.app.bsky.feed.getFeedGenerators({ feeds: entries.slice(offset, offset + 25).map(item => item.uri) });
        for (const view of result.data.feeds) found.set(view.uri, normalizeGenerator(view, this.moderationOptions));
      }
      return { items: entries.flatMap(entry => {
        const feed = found.get(entry.uri);
        return feed && !feed.moderation.hidden && !feed.moderation.noOverride ? [{ ...feed, pinned: entry.pinned }] : [];
      }).sort((a, b) => Number(b.pinned) - Number(a.pinned)) };
    }, true);
  }

  async homeFeed(cursor?: string): Promise<FeedPage> {
    return this.cachedRead(`home:${cursor ?? ''}`, async () => {
      const { data } = await this.requireAuth().getTimeline({ limit: LIMIT, cursor });
      return normalizeFeed(data.feed, data.cursor, this.moderationOptions);
    }, true);
  }

  async searchPosts(query: string, cursor?: string): Promise<FeedPage> {
    if (!query.trim()) return { items: [] };
    return this.cachedRead(`search:${JSON.stringify([query.trim(), cursor])}`, async () => {
      const { data } = await (this.authenticatedAgent ?? this.searchAgent).app.bsky.feed.searchPosts({ q: query.trim(), sort: 'latest', limit: LIMIT, cursor });
      return { items: data.posts.map(post => this.toPost(post)), cursor: data.cursor };
    });
  }

  async searchActors(query: string, cursor?: string): Promise<Page<Profile>> {
    if (!query.trim()) return { items: [] };
    return this.cachedRead(`actors:${JSON.stringify([query.trim(), cursor])}`, async () => {
      const { data } = await this.agent.searchActors({ q: query.trim().replace(/^@/, ''), limit: LIMIT, cursor });
      return { items: data.actors.map(profile => normalizeProfile(profile, this.moderationOptions)).filter(profile => !profile.moderation?.hidden), cursor: data.cursor };
    });
  }

  async profile(actor: string): Promise<Profile> {
    return this.cachedRead(`profile:${actor}`, async () => {
      const { data } = await this.agent.getProfile({ actor: actor.replace(/^@/, '') });
      return normalizeProfile(data, this.moderationOptions);
    });
  }

  async followers(actor: string, cursor?: string): Promise<Page<Profile>> {
    return this.cachedRead(`followers:${JSON.stringify([actor, cursor])}`, async () => {
      const { data } = await this.agent.getFollowers({ actor, cursor, limit: LIMIT });
      return { items: data.followers.map(profile => normalizeProfile(profile, this.moderationOptions)).filter(profile => !profile.moderation?.hidden), cursor: data.cursor };
    });
  }

  async follows(actor: string, cursor?: string): Promise<Page<Profile>> {
    return this.cachedRead(`follows:${JSON.stringify([actor, cursor])}`, async () => {
      const { data } = await this.agent.getFollows({ actor, cursor, limit: LIMIT });
      return { items: data.follows.map(profile => normalizeProfile(profile, this.moderationOptions)).filter(profile => !profile.moderation?.hidden), cursor: data.cursor };
    });
  }

  async authorFeed(actor: string, cursor?: string): Promise<FeedPage> {
    return this.cachedRead(`author:${JSON.stringify([actor, cursor])}`, async () => {
      const { data } = await this.agent.getAuthorFeed({ actor, limit: LIMIT, cursor });
      return normalizeFeed(data.feed, data.cursor, this.moderationOptions);
    });
  }

  async thread(uri: string): Promise<Thread> {
    return this.cachedRead(`thread:${uri}`, async () => {
      const { data } = await this.agent.getPostThread({ uri, depth: 6, parentHeight: 20 });
      if (!AppBskyFeedDefs.isThreadViewPost(data.thread)) throw new Error(AppBskyFeedDefs.isBlockedPost(data.thread) ? 'This post is blocked.' : 'This post is no longer available.');
      const parents: Post[] = [];
      let parent = data.thread.parent;
      while (AppBskyFeedDefs.isThreadViewPost(parent)) {
        parents.unshift(this.toPost(parent.post));
        parent = parent.parent;
      }
      const replies: Post[] = [];
      const collect = (node: AppBskyFeedDefs.ThreadViewPost) => {
        for (const reply of node.replies ?? []) {
          if (AppBskyFeedDefs.isThreadViewPost(reply)) { replies.push(this.toPost(reply.post)); collect(reply); }
        }
      };
      collect(data.thread);
      return { post: this.toPost(data.thread.post), parents, replies };
    });
  }

  async notifications(cursor?: string): Promise<Page<Notification>> {
    return this.cachedRead(`notifications:${cursor ?? ''}`, async () => {
    const agent = this.requireAuth();
    const { data } = await agent.listNotifications({ limit: LIMIT, cursor });
    const postUris = [...new Set(data.notifications.flatMap(item => {
      if (['reply', 'mention', 'quote'].includes(item.reason)) return [item.uri];
      return item.reasonSubject?.includes('/app.bsky.feed.post/') ? [item.reasonSubject] : [];
    }))];
    const posts = new Map<string, Post>();
    // Hydration is required for useful notification context; failures propagate so
    // the UI can display an honest retry state rather than silently lose content.
    if (postUris.length) {
      const chunks = [];
      for (let offset = 0; offset < postUris.length; offset += 25) chunks.push(postUris.slice(offset, offset + 25));
      const results = await Promise.all(chunks.map(uris => agent.getPosts({ uris })));
      for (const result of results) for (const post of result.data.posts) posts.set(post.uri, this.toPost(post));
    }
    return { items: data.notifications.flatMap(item => {
      const decision = moderateNotification(item, this.moderationOptions).ui('contentList');
      const unknown = unknownSubscribedLabel(item.labels, this.moderationOptions) || unknownSubscribedLabel(item.author.labels, this.moderationOptions);
      if (decision.filter || unknown) return [];
      return [{
      moderation: { hidden: decision.filter, blur: decision.blur, noOverride: decision.noOverride },
      uri: item.uri, cid: item.cid, author: normalizeProfile(item.author, this.moderationOptions), reason: item.reason,
      reasonSubject: item.reasonSubject, isRead: item.isRead, indexedAt: item.indexedAt,
      post: posts.get(['reply', 'mention', 'quote'].includes(item.reason) ? item.uri : item.reasonSubject ?? ''),
    }]; }), cursor: data.cursor };
    }, true);
  }

  async markNotificationsSeen(boundary?: string): Promise<void> {
    if (boundary && !Number.isFinite(Date.parse(boundary))) throw new Error('Invalid notification read boundary.');
    const version = this.authVersion;
    const did = this.currentUser?.did;
    const agent = await this.verifiedForWrite();
    this.assertAccount(version, did);
    await agent.app.bsky.notification.updateSeen({ seenAt: boundary ?? new Date().toISOString() });
  }

  createPublishAttempt(text: string, replyTo?: Post): PublishAttempt {
    if (!this.currentUser) throw new Error('Sign in before posting.');
    if (!text.trim()) throw new Error('Write something before posting.');
    if (new RichText({ text }).graphemeLength > 300) throw new Error('Posts can contain up to 300 characters.');
    return { actorDid: this.currentUser.did, rkey: nextRecordKey(), text,
      replyTo: replyTo ? structuredClone(replyTo) : undefined, createdAt: new Date().toISOString(), dispatched: false };
  }

  async publish(text: string, replyTo?: Post, suppliedAttempt?: PublishAttempt): Promise<Post> {
    const attempt = suppliedAttempt ?? this.createPublishAttempt(text, replyTo);
    if (attempt.text !== text || attempt.replyTo?.uri !== replyTo?.uri) throw new Error('Resolve the previous publication before editing this post.');
    const version = this.authVersion;
    this.assertAccount(version, attempt.actorDid);
    const agent = await this.verifiedForWrite();
    this.assertAccount(version, attempt.actorDid);
    const author = this.currentUser!;
    if (attempt.confirmed) return attempt.confirmed;
    const reply = attempt.replyTo ? {
      root: attempt.replyTo.replyTo?.root ?? { uri: attempt.replyTo.uri, cid: attempt.replyTo.cid },
      parent: { uri: attempt.replyTo.uri, cid: attempt.replyTo.cid },
    } : undefined;
    const complete = (created: { uri: string; cid: string }, record: AppBskyFeedPost.Record): Post => {
      const post: Post = { ...created, author, text: record.text, segments: segments(record),
        createdAt: record.createdAt, indexedAt: record.createdAt, replyCount: 0, repostCount: 0, likeCount: 0,
        images: [], labels: [], moderation: { hidden: false, blur: false, noOverride: false }, replyTo: record.reply };
      // Preserve confirmed outcome for reconciliation, but never commit it to another account's UI.
      attempt.confirmed = post;
      this.assertAccount(version, attempt.actorDid);
      return post;
    };
    if (attempt.dispatched) {
      try {
        const { data } = await agent.com.atproto.repo.getRecord({ repo: attempt.actorDid, collection: 'app.bsky.feed.post', rkey: attempt.rkey });
        this.assertAccount(version, attempt.actorDid);
        const validated = AppBskyFeedPost.validateRecord(data.value);
        if (!validated.success || validated.value.text !== attempt.text || validated.value.createdAt !== attempt.createdAt
          || canonical(validated.value.reply) !== canonical(reply)
          || (attempt.record && canonical(validated.value) !== canonical(attempt.record))) {
          throw new Error('A different record exists at this publication address. Do not retry this attempt.');
        }
        if (!data.cid) throw new PublicationUncertainError(attempt);
        return complete({ uri: data.uri, cid: data.cid }, validated.value);
      } catch (error) {
        this.assertAccount(version, attempt.actorDid);
        if ((error as { error?: string }).error !== 'RecordNotFound') {
          if (canUseSnapshot(error)) throw new PublicationUncertainError(attempt);
          throw error;
        }
        // A user explicitly retried and the authoritative PDS confirms absence.
      }
    }
    if (!attempt.record) {
      const richText = new RichText({ text: attempt.text });
      await richText.detectFacets(agent);
      this.assertAccount(version, attempt.actorDid);
      attempt.record = { $type: 'app.bsky.feed.post', text: richText.text, facets: richText.facets,
        createdAt: attempt.createdAt, ...(reply ? { reply } : {}) };
    }
    this.assertAccount(version, attempt.actorDid);
    attempt.dispatched = true;
    try {
      const { data } = await agent.com.atproto.repo.createRecord({ repo: attempt.actorDid,
        collection: 'app.bsky.feed.post', rkey: attempt.rkey, record: attempt.record });
      return complete(data, attempt.record);
    } catch (error) {
      if (attempt.confirmed) throw error;
      const status = (error as { status?: number }).status;
      if ((error as { error?: string }).error === 'RecordAlreadyExists') throw new PublicationUncertainError(attempt);
      if (status && status >= 400 && status < 500) { attempt.dispatched = false; throw error; }
      throw new PublicationUncertainError(attempt);
    }
  }

  async toggleLike(post: Post): Promise<Post> {
    const version = this.authVersion;
    const did = this.currentUser?.did;
    const agent = await this.verifiedForWrite();
    this.assertAccount(version, did);
    if (post.likeUri) { await agent.deleteLike(post.likeUri); this.assertAccount(version, did); return { ...post, likeUri: undefined, likeCount: Math.max(0, post.likeCount - 1) }; }
    const result = await agent.like(post.uri, post.cid);
    this.assertAccount(version, did);
    return { ...post, likeUri: result.uri, likeCount: post.likeCount + 1 };
  }

  async toggleRepost(post: Post): Promise<Post> {
    const version = this.authVersion;
    const did = this.currentUser?.did;
    const agent = await this.verifiedForWrite();
    this.assertAccount(version, did);
    if (post.repostUri) { await agent.deleteRepost(post.repostUri); this.assertAccount(version, did); return { ...post, repostUri: undefined, repostCount: Math.max(0, post.repostCount - 1) }; }
    const result = await agent.repost(post.uri, post.cid);
    this.assertAccount(version, did);
    return { ...post, repostUri: result.uri, repostCount: post.repostCount + 1 };
  }

  async toggleFollow(profile: Profile): Promise<Profile> {
    const version = this.authVersion;
    const did = this.currentUser?.did;
    const agent = await this.verifiedForWrite();
    this.assertAccount(version, did);
    if (profile.did === this.currentUser?.did) throw new Error('You cannot follow yourself.');
    if (profile.following) { await agent.deleteFollow(profile.following); this.assertAccount(version, did); return { ...profile, following: undefined, followersCount: profile.followersCount === undefined ? undefined : Math.max(0, profile.followersCount - 1) }; }
    const result = await agent.follow(profile.did);
    this.assertAccount(version, did);
    return { ...profile, following: result.uri, followersCount: profile.followersCount === undefined ? undefined : profile.followersCount + 1 };
  }
}

export const bluesky = new BlueskyClient();
