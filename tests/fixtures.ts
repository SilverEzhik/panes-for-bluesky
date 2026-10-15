import type { BrowserContext, Page, Route } from '@playwright/test';

export const author = {
  did: 'did:plc:abcdefghijklmnopqrstuvwx', handle: 'paneltester.bsky.social', displayName: 'Panel Tester',
  description: 'A deterministic profile used by browser tests.', followersCount: 42, followsCount: 12, postsCount: 40,
};
export const me = { ...author, did: 'did:plc:zyxwvutsrqponmlkjihgfedc', handle: 'me.bsky.social', displayName: 'Signed In Tester' };
export const me2 = { ...author, did: 'did:plc:secondaccountabcdefghijk', handle: 'second.bsky.social', displayName: 'Second Tester' };
export const fixtureCid = 'bafyreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku';
export function post(index = 0) {
  return {
    uri: `at://${author.did}/app.bsky.feed.post/post${index}`, cid: fixtureCid, author,
    record: { $type: 'app.bsky.feed.post', text: `Panel test post ${index}. A long enough sentence to check scrolling and readable panel content.`, createdAt: '2026-10-15T12:00:00.000Z' },
    indexedAt: '2026-10-15T12:00:00.000Z', replyCount: 1, repostCount: 2, likeCount: 3,
  };
}
export interface ApiRequest { method: string; endpoint: string; url: string; query: URLSearchParams; body: any; headers: Record<string, string> }
export interface ApiResponse { body: unknown; status?: number }
type Handler = (request: ApiRequest) => ApiResponse | undefined | Promise<ApiResponse | undefined>;
export interface DeferredResponse { started: Promise<ApiRequest>; release: (response?: ApiResponse) => void }
export interface ApiControl {
  requests: ApiRequest[]; violations: string[];
  failLogin: boolean; failWrites: boolean; failFeed: boolean;
  /** Enable two feed pages (with overlap) and a populated notification page. */
  paginated: boolean; populatedNotifications: boolean;
  expireAccess: (did?: string) => void;
  revokeRefresh: (did?: string) => void;
  respond: (endpoint: string, handler: Handler) => void;
  defer: (endpoint: string, predicate?: (request: ApiRequest) => boolean) => DeferredResponse;
}
type Identity = typeof me;
type Token = { identity: Identity; kind: 'access' | 'refresh'; valid: boolean };
type Backend = { tokens: Map<string, Token>; serial: number; records: Map<string, any> };
// Pages in one browser context share the same remote account and token rotations.
const backends = new WeakMap<BrowserContext, Backend>();
const pds = 'https://bsky.social';
const publicHosts = new Set([pds, 'https://public.api.bsky.app', 'https://api.bsky.app']);
const postMethods = new Set(['com.atproto.server.createSession', 'com.atproto.server.refreshSession', 'com.atproto.server.deleteSession', 'com.atproto.repo.createRecord', 'com.atproto.repo.putRecord', 'com.atproto.repo.deleteRecord', 'app.bsky.notification.updateSeen']);
const protectedReads = new Set(['com.atproto.server.getSession', 'app.bsky.actor.getPreferences', 'app.bsky.feed.getTimeline', 'app.bsky.notification.listNotifications', 'com.atproto.repo.getRecord']);

/** Strict transport fixture: SDK serialization remains real; unexpected writes fail. */
export async function mockBluesky(page: Page): Promise<ApiControl> {
  const backend = backends.get(page.context()) ?? { tokens: new Map<string, Token>(), serial: 0, records: new Map<string, any>() };
  backends.set(page.context(), backend);
  const handlers = new Map<string, Handler>();
  const gates: Array<{ endpoint: string; predicate: (request: ApiRequest) => boolean; started: (request: ApiRequest) => void; wait: Promise<ApiResponse | undefined> }> = [];
  const control: ApiControl = {
    requests: [], violations: [], failLogin: false, failWrites: false, failFeed: false, paginated: false, populatedNotifications: false,
    expireAccess: (did) => { for (const value of backend.tokens.values()) if (value.kind === 'access' && (!did || value.identity.did === did)) value.valid = false; },
    revokeRefresh: (did) => { for (const value of backend.tokens.values()) if (value.kind === 'refresh' && (!did || value.identity.did === did)) value.valid = false; },
    respond: (endpoint, handler) => { handlers.set(endpoint, handler); },
    defer: (endpoint, predicate = () => true) => {
      let started!: (request: ApiRequest) => void;
      let release!: (response?: ApiResponse) => void;
      const ready = new Promise<ApiRequest>(resolve => { started = resolve; });
      const wait = new Promise<ApiResponse | undefined>(resolve => { release = resolve; });
      gates.push({ endpoint, predicate, started, wait });
      return { started: ready, release };
    },
  };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const issue = (identity: Identity) => {
    const token = (kind: 'access' | 'refresh') => {
      const jwt = `${encode({ alg: 'HS256' })}.${encode({ scope: `com.atproto.${kind}`, sub: identity.did, exp: Math.floor(Date.now() / 1000) + 3600, jti: ++backend.serial })}.signature`;
      backend.tokens.set(jwt, { identity, kind, valid: true });
      return jwt;
    };
    return { did: identity.did, handle: identity.handle, accessJwt: token('access'), refreshJwt: token('refresh'), active: true };
  };
  await page.route('**/xrpc/**', async route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': '*' } });
    const url = new URL(request.url());
    const endpoint = url.pathname.split('/xrpc/')[1];
    let body: any;
    try { body = request.postData() ? JSON.parse(request.postData()!) : undefined; }
    catch { return json(route, { error: 'InvalidRequest', message: 'Expected JSON request' }, 400); }
    const call: ApiRequest = { method: request.method(), endpoint, url: url.href, query: url.searchParams, body, headers: request.headers() };
    control.requests.push(call);
    const violation = (message: string) => { control.violations.push(message); return json(route, { error: 'InvalidRequest', message }, 400); };
    if (!publicHosts.has(url.origin)) return violation(`Unexpected XRPC origin: ${url.origin}`);
    if (call.method !== (postMethods.has(endpoint) ? 'POST' : 'GET')) return violation(`Unexpected method ${call.method} for ${endpoint}`);
    const credentials = backend.tokens.get(call.headers.authorization?.replace(/^Bearer /, '') ?? '');
    const sessionMutation = ['com.atproto.server.refreshSession', 'com.atproto.server.deleteSession'].includes(endpoint);
    const requiresAuth = protectedReads.has(endpoint) || (postMethods.has(endpoint) && endpoint !== 'com.atproto.server.createSession');
    if (requiresAuth || call.headers.authorization) {
      if (url.origin !== pds) return violation(`Authenticated request sent outside PDS: ${url.origin}`);
      const kind = sessionMutation ? 'refresh' : 'access';
      if (!credentials || !credentials.valid || credentials.kind !== kind) return json(route, { error: kind === 'access' ? 'ExpiredToken' : 'InvalidToken', message: `Invalid ${kind} token` }, 401);
    }
    const gateIndex = gates.findIndex(gate => gate.endpoint === endpoint && gate.predicate(call));
    if (gateIndex >= 0) {
      const [gate] = gates.splice(gateIndex, 1); gate.started(call);
      const response = await gate.wait;
      if (response) return json(route, response.body, response.status);
    }
    const custom = await handlers.get(endpoint)?.(call);
    if (custom) return json(route, custom.body, custom.status);
    if (endpoint === 'com.atproto.server.createSession') {
      if (url.origin !== pds) return violation('Session creation must target PDS');
      const identity = [me, me2].find(person => [person.handle, person.did].includes(body?.identifier));
      if (control.failLogin || !identity || !body?.password) return json(route, { error: 'AuthenticationRequired', message: 'Invalid identifier or password' }, 401);
      return json(route, issue(identity));
    }
    if (endpoint === 'com.atproto.server.refreshSession') {
      if (control.failLogin) return json(route, { error: 'InvalidToken', message: 'Refresh revoked' }, 401);
      credentials!.valid = false;
      return json(route, issue(credentials!.identity));
    }
    if (endpoint === 'com.atproto.server.deleteSession') { credentials!.valid = false; return json(route, {}); }
    if (endpoint === 'com.atproto.server.getSession') return json(route, { did: credentials!.identity.did, handle: credentials!.identity.handle, active: true });
    if (endpoint === 'app.bsky.actor.getProfile') return json(route, [me, me2, author].find(person => [person.did, person.handle].includes(url.searchParams.get('actor') ?? '')) ?? author);
    if (endpoint === 'app.bsky.actor.getPreferences') return json(route, { preferences: [] });
    if (endpoint === 'app.bsky.unspecced.getPopularFeedGenerators' || endpoint === 'app.bsky.feed.getFeedGenerators') return json(route, { feeds: [] });
    if (endpoint === 'app.bsky.labeler.getServices') return json(route, { views: [] });
    if (['app.bsky.feed.getFeed', 'app.bsky.feed.getTimeline', 'app.bsky.feed.getAuthorFeed'].includes(endpoint)) {
      if (control.failFeed) return json(route, { error: 'UpstreamFailure', message: 'Test feed unavailable' }, 503);
      const cursor = url.searchParams.get('cursor');
      if (cursor && cursor !== 'page-2') return violation(`Unknown cursor ${cursor}`);
      return json(route, { feed: Array.from({ length: 30 }, (_, i) => ({ post: post(i + (cursor ? 29 : 0)) })), ...(control.paginated && !cursor ? { cursor: 'page-2' } : {}) });
    }
    if (endpoint === 'app.bsky.feed.getPostThread') {
      const uri = url.searchParams.get('uri') ?? '';
      const created = backend.records.get(uri);
      if (created) {
        const owner = [me, me2, author].find(person => uri.startsWith(`at://${person.did}/`))!;
        const view = { uri, cid: created.cid, author: owner, record: created.value, indexedAt: created.value.createdAt, replyCount: 0, repostCount: 0, likeCount: 0 };
        return json(route, { thread: { $type: 'app.bsky.feed.defs#threadViewPost', post: view, replies: [] } });
      }
      const match = /post(\d+)$/.exec(uri);
      if (!match) return json(route, { thread: { $type: 'app.bsky.feed.defs#notFoundPost', uri, notFound: true } });
      return json(route, { thread: { $type: 'app.bsky.feed.defs#threadViewPost', post: post(Number(match[1])), replies: [{ $type: 'app.bsky.feed.defs#threadViewPost', post: post(90), replies: [] }] } });
    }
    if (endpoint === 'app.bsky.feed.getPosts') return json(route, { posts: url.searchParams.getAll('uris').map(uri => post(Number(/post(\d+)$/.exec(uri)?.[1] || 0))) });
    if (endpoint === 'app.bsky.feed.searchPosts') return json(route, { posts: [post(70)] });
    if (endpoint === 'app.bsky.actor.searchActors') return json(route, { actors: [author] });
    if (endpoint === 'com.atproto.identity.resolveHandle') return json(route, { did: ([me, me2, author].find(person => person.handle === url.searchParams.get('handle')) ?? author).did });
    if (endpoint === 'app.bsky.notification.listNotifications') return json(route, { notifications: control.populatedNotifications ? [{ uri: `at://${author.did}/app.bsky.feed.like/notification1`, cid: fixtureCid, author, reason: 'like', reasonSubject: post(0).uri, record: { $type: 'app.bsky.feed.like', subject: { uri: post(0).uri, cid: fixtureCid }, createdAt: '2026-10-15T12:00:00.000Z' }, isRead: false, indexedAt: '2026-10-15T12:00:00.000Z' }] : [] });
    if (endpoint === 'app.bsky.notification.updateSeen') {
      if (!body?.seenAt || !Number.isFinite(Date.parse(body.seenAt))) return violation('seenAt must be a datetime');
      return json(route, {});
    }
    if (['com.atproto.repo.createRecord', 'com.atproto.repo.putRecord', 'com.atproto.repo.deleteRecord', 'com.atproto.repo.getRecord'].includes(endpoint)) {
      const args = body ?? Object.fromEntries(url.searchParams);
      if (args.repo !== credentials!.identity.did) return violation('Repository does not match authenticated identity');
      if (!['app.bsky.feed.post', 'app.bsky.feed.like', 'app.bsky.feed.repost', 'app.bsky.graph.follow'].includes(args.collection)) return violation(`Unexpected collection ${args.collection}`);
      if (endpoint.endsWith('getRecord')) {
        const record = backend.records.get(`at://${args.repo}/${args.collection}/${args.rkey}`);
        return record ? json(route, record) : json(route, { error: 'RecordNotFound', message: 'Record not found' }, 400);
      }
      if (control.failWrites) return json(route, { error: 'UpstreamFailure', message: 'Test write failed' }, 503);
      if (endpoint.endsWith('deleteRecord')) {
        const uri = `at://${args.repo}/${args.collection}/${args.rkey}`;
        if (!backend.records.has(uri)) return violation('Delete targets a record not created by this account');
        backend.records.delete(uri); return json(route, {});
      }
      const record = args.record;
      if (record?.$type !== args.collection || !Number.isFinite(Date.parse(record?.createdAt))) return violation('Invalid record type or timestamp');
      if (args.collection === 'app.bsky.feed.post') {
        if (typeof record.text !== 'string' || !record.text.trim()) return violation('Post requires text');
        if (record.reply && ![record.reply.root, record.reply.parent].every(ref => ref?.uri?.startsWith('at://') && ref?.cid)) return violation('Reply requires root and parent strong refs');
      } else if (args.collection === 'app.bsky.graph.follow') {
        if (!record.subject?.startsWith('did:') || record.subject === args.repo) return violation('Follow requires another DID');
      } else if (!record.subject?.uri?.startsWith('at://') || !record.subject?.cid) return violation('Reaction requires subject URI and CID');
      const uri = `at://${args.repo}/${args.collection}/${args.rkey ?? `created${++backend.serial}`}`;
      if (endpoint.endsWith('createRecord') && backend.records.has(uri)) return json(route, { error: 'RecordAlreadyExists', message: 'Record already exists' }, 400);
      backend.records.set(uri, { uri, cid: fixtureCid, value: record });
      return json(route, { uri, cid: fixtureCid });
    }
    return violation(`Unmocked endpoint: ${endpoint}`);
  });
  return control;
}
