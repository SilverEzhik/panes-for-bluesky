import { useCallback, useEffect, useRef, useState } from 'react';
import { bluesky, errorMessage } from '../lib/bluesky';
import type { Post, Profile } from '../lib/types';
import { Avatar } from './PostCard';
import PostView, { type PostViewProps } from './PostView';
import { postStore } from '../lib/postStore';
import './ProfilePanel.css';

export type ProfileActions = Pick<PostViewProps, 'onOpen' | 'onProfile' | 'onReply' | 'onLike' | 'onRepost' | 'onMention' | 'onTag' | 'onExternal' | 'onMedia'>;
export interface ProfilePanelProps extends ProfileActions {
  initialProfile: Profile;
  signedIn: boolean;
  onLogin: () => void;
  onNotice: (message: string) => void;
  onPeople: (profile: Profile, kind: 'followers' | 'following') => void;
}

export default function ProfilePanel({ initialProfile, signedIn, onLogin, onNotice, onPeople, ...actions }: ProfilePanelProps) {
  const [profile, setProfile] = useState(initialProfile);
  const [posts, setPosts] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [busy, setBusy] = useState(true);
  const [following, setFollowing] = useState(false);
  const [error, setError] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [accountEpoch, setAccountEpoch] = useState(0);
  const lifetime = useRef(0);
  const relationshipRevision = useRef(0);
  const pending = useRef(false);
  const retryMore = useRef(false);

  useEffect(() => bluesky.subscribeSession(() => {
    lifetime.current++;
    pending.current = false;
    setFollowing(false);
    setAccountEpoch(value => value + 1);
  }), []);

  const load = useCallback(async (more: boolean, token: number, nextCursor?: string) => {
    if (pending.current) return;
    pending.current = true;
    retryMore.current = more;
    setBusy(true);
    setError('');
    const revision = relationshipRevision.current;
    const ticket = postStore.ticket();
    const generation = bluesky.sessionGeneration;
    const valid = () => token === lifetime.current && generation === bluesky.sessionGeneration && postStore.isCurrent(ticket);
    try {
      // Pagination only fetches posts. It must never restore a captured profile
      // over a follow mutation that completed while the page was in flight.
      const actorRequest = more ? Promise.resolve(null) : bluesky.profile(initialProfile.did);
      const [actor, page] = await Promise.all([actorRequest, bluesky.authorFeed(initialProfile.did, nextCursor)]);
      if (!valid()) return;
      postStore.ingestMany(page.items, ticket, !page.offline);
      if (actor) setProfile(current => relationshipRevision.current === revision ? actor : {
        ...actor, following: current.following, followersCount: current.followersCount,
      });
      setPosts(previous => Array.from(new Map((more ? [...previous, ...page.items] : page.items).map(post => [post.uri, post])).values()));
      setCursor(page.cursor);
    } catch (cause) {
      if (valid()) setError(errorMessage(cause));
    } finally {
      if (valid()) { pending.current = false; setBusy(false); }
    }
  }, [initialProfile.did]);

  useEffect(() => {
    const token = ++lifetime.current;
    pending.current = false;
    relationshipRevision.current = 0;
    setProfile(initialProfile);
    setRevealed(false);
    setPosts([]);
    setCursor(undefined);
    setFollowing(false);
    void load(false, token);
    return () => { lifetime.current++; pending.current = false; };
  // An account change revalidates all viewer-specific profile and feed state.
  // initialProfile identity is seeded only when the represented actor changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProfile.did, accountEpoch, load]);

  async function follow() {
    if (!signedIn) { onLogin(); return; }
    if (following) return;
    const token = lifetime.current;
    const generation = bluesky.sessionGeneration;
    const valid = () => token === lifetime.current && generation === bluesky.sessionGeneration;
    relationshipRevision.current++;
    setFollowing(true);
    try {
      const updated = await bluesky.toggleFollow(profile);
      if (valid()) {
        relationshipRevision.current++;
        setProfile(current => ({ ...current, following: updated.following, followersCount: updated.followersCount }));
      }
    } catch (cause) {
      if (valid()) onNotice(errorMessage(cause));
    } finally {
      if (valid()) setFollowing(false);
    }
  }

  if (profile.moderation?.hidden || (profile.moderation?.blur && !revealed)) return <div className="classic-profile profile-scroll"><p className="classic-profile-notice">{profile.moderation.warning || 'Profile content hidden by your moderation settings.'}</p>{!profile.moderation.hidden && !profile.moderation.noOverride && <button className="metal-button" onClick={() => setRevealed(true)}>Show profile</button>}</div>;

  return <div className="classic-profile profile-scroll">
    {profile.offline && <p className="classic-profile-notice">Saved profile · {profile.savedAt ? new Date(profile.savedAt).toLocaleString() : 'offline'}</p>}
    {(profile.muted || profile.blocked) && <p className="classic-profile-notice">You have {profile.blocked ? 'blocked' : 'muted'} this account.</p>}
    <header className="classic-profile-identity">
      <Avatar profile={profile} size={64} />
      <div><h2>{profile.displayName || profile.handle}</h2><p>@{profile.handle}</p></div>
      <button className="metal-button" disabled={following || profile.did === bluesky.session?.did} onClick={() => void follow()}>
        {profile.did === bluesky.session?.did ? 'Your profile' : following ? 'Saving…' : profile.following ? 'Following' : 'Follow'}
      </button>
    </header>
    <dl className="classic-profile-fields">
      {profile.description && <div><dt>bio</dt><dd className="profile-bio">{profile.description}</dd></div>}
      <div><dt>account</dt><dd><a href={`https://bsky.app/profile/${encodeURIComponent(profile.did)}`} target="_blank" rel="noreferrer">@{profile.handle}</a></dd></div>
      {profile.followedBy && <div><dt>connection</dt><dd>Follows you</dd></div>}
    </dl>
    <div className="classic-profile-people" aria-label="People">
      <button onClick={() => onPeople(profile, 'following')}><strong>Following</strong><span>{profile.followsCount?.toLocaleString() ?? '—'}</span></button>
      <button onClick={() => onPeople(profile, 'followers')}><strong>Followers</strong><span>{profile.followersCount?.toLocaleString() ?? '—'}</span></button>
    </div>
    <h3 className="classic-profile-feed-title">Posts <span>{profile.postsCount?.toLocaleString() ?? ''}</span></h3>
    {busy && !posts.length && <p className="quiet-message" role="status">Loading profile…</p>}
    {posts.map(post => <PostView key={post.uri} post={post} {...actions} />)}
    {error && <div className="inline-error"><p role="alert">{error}</p><button className="metal-button" onClick={() => void load(retryMore.current, lifetime.current, retryMore.current ? cursor : undefined)}>Try again</button></div>}
    {cursor && !error && <button className="load-more" disabled={busy} onClick={() => void load(true, lifetime.current, cursor)}>{busy ? 'Loading…' : 'Load more posts'}</button>}
    {!busy && !posts.length && !error && <p className="quiet-message">This account hasn’t posted yet.</p>}
  </div>;
}
