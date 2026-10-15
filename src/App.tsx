import { useCallback, useEffect, useRef, useState } from 'react';
import { bluesky, errorMessage } from './lib/bluesky';
import { postStore, type ReadTicket } from './lib/postStore';
import type { FeedGenerator, Notification, Post, PostImage, Profile, SessionUser } from './lib/types';
import type { PostActions } from './lib/ui';
import PanelStack, { type PanelDeckLayout } from './components/PanelStack';
import { Avatar } from './components/PostCard';
import PostView from './components/PostView';
import ThreadPanel from './components/ThreadPanel';
import ProfilePanel from './components/ProfilePanel';
import PeoplePanel from './components/PeoplePanel';
import SearchPanel from './components/SearchPanel';
import Icon from './components/Icon';
import DiscoverFeeds from './components/DiscoverFeeds';
import FeedPanel from './components/FeedPanel';
import { Butterfly } from './components/Butterfly';
import { MediaPanel } from './components/LinkPanels';
import { ComposeDialog, LoginDialog } from './components/AccountDialogs';
import { applyPwaUpdate, getPwaStatus, subscribePwaStatus } from './pwa';
import './styles.css';
import './components/DiscoverFeedBar.css';

type Section = 'feeds' | 'home' | 'notifications' | 'search' | 'profile';
type Sheet = ({ sourceUri?: string } & (
  | { id: string; kind: 'thread'; post: Post; context?: { url: string; title?: string } }
  | { id: string; kind: 'profile'; actor: Profile }
  | { id: string; kind: 'people'; actor: Profile; list: 'followers' | 'following' }
  | { id: string; kind: 'search'; query: string }
  | { id: string; kind: 'feed'; feed: FeedGenerator }
  | { id: string; kind: 'media'; images: PostImage[]; initialIndex: number }
));
const uniquePosts = (posts: Post[]) => [...new Map(posts.map(post => [post.uri, post])).values()];
const scope = () => `${bluesky.session?.did ?? 'public'}:${bluesky.accountLifetime?.epoch ?? 'anonymous'}`;

export default function App() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [section, setSection] = useState<Section>('feeds');
  const [feedsRevision, setFeedsRevision] = useState(0);
  const [posts, setPosts] = useState<Post[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [busy, setBusy] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [failedMore, setFailedMore] = useState(false);
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [selectedUri, setSelectedUri] = useState<string>();
  const sourceUri = useRef<string | undefined>(undefined);
  const [loginOpen, setLoginOpen] = useState(false);
  const [compose, setCompose] = useState<{ replyTo?: Post; scope: string; ticket: ReadTicket; origin: number } | null>(null);
  const [navExpanded, setNavExpanded] = useState(false);
  const [revealKey, setRevealKey] = useState(0);
  const [replyRevision, setReplyRevision] = useState(0);
  const [landscape, setLandscape] = useState(() => innerWidth >= innerHeight);
  const [savedAt, setSavedAt] = useState<number>();
  const [pwa, setPwa] = useState(getPwaStatus());
  const generation = useRef(0);
  const loadingPage = useRef(false);
  const currentScope = useRef(scope());
  const feedRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const serial = useRef(0);

  const applyDeckLayout = useCallback((layout: PanelDeckLayout) => {
    const sidebar = sidebarRef.current;
    const timeline = timelineRef.current;
    if (sidebar?.parentElement) sidebar.parentElement.dataset.navigationMode = layout.sidebarWidth > 180 ? 'expanded' : 'compact';
    if (sidebar) { sidebar.style.width = `${layout.sidebarWidth}px`; sidebar.style.flexBasis = `${layout.sidebarWidth}px`; }
    if (timeline) {
      timeline.style.width = `${layout.timelineWidth}px`;
      timeline.style.maxWidth = 'none';
      timeline.style.transform = `translate3d(${layout.timelineOffset}px,0,0)`;
      timeline.style.visibility = layout.timelineHidden ? 'hidden' : '';
      timeline.inert = layout.timelineHidden;
      if (layout.timelineHidden) timeline.setAttribute('aria-hidden', 'true'); else timeline.removeAttribute('aria-hidden');
    }
  }, []);
  const append = useCallback((sheet: Sheet, origin?: number) => {
    serial.current++;
    setRevealKey(value => value + 1);
    const selectedSource = sourceUri.current;
    setSheets(previous => {
      const branch = previous.slice(0, (origin ?? previous.length - 1) + 1);
      const index = branch.findIndex(item => item.id === sheet.id);
      return index >= 0 ? branch.slice(0, index + 1) : [...branch, { ...sheet, sourceUri: selectedSource }];
    });
  }, []);
  const openPost = useCallback((post: Post, origin?: number) => {
    if (!postStore.get(post.uri)) postStore.ingest(post, postStore.ticket());
    append({ id: `post:${post.uri}`, kind: 'thread', post }, origin);
  }, [append]);
  const openProfile = useCallback((actor: Profile, origin?: number) => append({ id: `profile:${actor.did}`, kind: 'profile', actor }, origin), [append]);
  const openPeople = (actor: Profile, list: 'followers' | 'following', origin?: number) => append({ id: `${list}:${actor.did}`, kind: 'people', actor, list }, origin);
  const openFeed = (feed: FeedGenerator, origin: number) =>
    append({ id: `feed:${feed.uri}`, kind: 'feed', feed }, origin);
  const openFeedLink = async (actor: string, rkey: string, origin: number) => {
    const request = ++serial.current;
    const ticket = postStore.ticket();
    try {
      const did = actor.startsWith('did:') ? actor : (await bluesky.profile(actor)).did;
      if (!postStore.isCurrent(ticket) || request !== serial.current) return;
      const feed = await bluesky.feedGenerator(`at://${did}/app.bsky.feed.generator/${rkey}`);
      if (postStore.isCurrent(ticket) && request === serial.current) openFeed(feed, origin);
    } catch (cause) { if (postStore.isCurrent(ticket) && request === serial.current) setNotice(errorMessage(cause)); }
  };
  const openWeb = (url: string, title: string | undefined, source: Post, origin: number) => {
    try {
      const link = new URL(url);
      const match = /^\/profile\/([^/]+)\/feed\/([^/]+)\/?$/.exec(link.pathname);
      if (link.protocol === 'https:' && ['bsky.app', 'www.bsky.app'].includes(link.hostname) && match) {
        void openFeedLink(decodeURIComponent(match[1]), decodeURIComponent(match[2]), origin);
        return;
      }
    } catch { /* Ordinary web links continue to the contextual browser. */ }
    serial.current++;
    setRevealKey(value => value + 1);
    const selectedSource = sourceUri.current;
    setSheets(previous => {
      const sameTweet = origin >= 0 && previous[origin]?.kind === 'thread' && previous[origin].post.uri === source.uri;
      const prefix = previous.slice(0, sameTweet ? origin : origin + 1);
      return [...prefix, { id: `post:${source.uri}`, kind: 'thread', post: source, context: { url, title }, sourceUri: selectedSource }];
    });
  };
  const showConversation = (index: number) => {
    serial.current++;
    setRevealKey(value => value + 1);
    setSheets(previous => previous.slice(0, index + 1).map((sheet, position) =>
      position === index && sheet.kind === 'thread' ? { ...sheet, context: undefined } : sheet));
  };
  const openMedia = (images: PostImage[], initialIndex: number, origin?: number) => append({ id: `media:${++serial.current}`, kind: 'media', images, initialIndex }, origin);
  const openMention = async (actor: string, origin?: number) => {
    const request = ++serial.current;
    const ticket = postStore.ticket();
    try { const profile = await bluesky.profile(actor); if (postStore.isCurrent(ticket) && request === serial.current) openProfile(profile, origin); }
    catch (cause) { if (postStore.isCurrent(ticket)) setNotice(errorMessage(cause)); }
  };
  const searchTag = (tag: string, origin?: number) => append({ id: `search:#${tag}`, kind: 'search', query: `#${tag}` }, origin);

  useEffect(() => subscribePwaStatus(setPwa), []);
  useEffect(() => {
    const resize = () => setLandscape(innerWidth >= innerHeight);
    addEventListener('resize', resize);
    const viewport = visualViewport;
    const updateVisibleBounds = () => {
      const root = document.documentElement.style;
      root.setProperty('--visual-viewport-height', `${viewport?.height ?? innerHeight}px`);
      root.setProperty('--visual-viewport-width', `${viewport?.width ?? innerWidth}px`);
      root.setProperty('--visual-viewport-top', `${viewport?.offsetTop ?? 0}px`);
      root.setProperty('--visual-viewport-left', `${viewport?.offsetLeft ?? 0}px`);
    };
    updateVisibleBounds();
    viewport?.addEventListener('resize', updateVisibleBounds);
    viewport?.addEventListener('scroll', updateVisibleBounds);
    addEventListener('resize', updateVisibleBounds);
    return () => {
      removeEventListener('resize', resize); removeEventListener('resize', updateVisibleBounds);
      viewport?.removeEventListener('resize', updateVisibleBounds); viewport?.removeEventListener('scroll', updateVisibleBounds);
      for (const key of ['height', 'width', 'top', 'left']) document.documentElement.style.removeProperty(`--visual-viewport-${key}`);
    };
  }, []);
  useEffect(() => {
    postStore.reset(currentScope.current);
    return bluesky.subscribeSession(user => {
      const next = scope();
      if (next !== currentScope.current) {
        currentScope.current = next;
        generation.current++;
        loadingPage.current = false;
        postStore.reset(next);
        setCompose(null); setSheets([]); setPosts([]); setNotifications([]); setCursor(undefined); setSavedAt(undefined); setError('');
        sourceUri.current = undefined; setSelectedUri(undefined);
        if (!user) setSection(current => current === 'home' || current === 'notifications' ? 'feeds' : current);
      }
      setSession(user);
    });
  }, []);
  useEffect(() => {
    let active = true;
    bluesky.restoreSession().then(user => { if (active) setSession(user); })
      .catch(cause => { if (active) setNotice(errorMessage(cause)); })
      .finally(() => { if (active) setRestoring(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!pwa.offline && session?.connection === 'offline') void bluesky.reconnect().catch(cause => setNotice(errorMessage(cause)));
  }, [pwa.offline, session?.connection]);
  const load = useCallback(async (more = false) => {
    if (more && loadingPage.current) return;
    const current = ++generation.current;
    if (restoring || section === 'feeds' || (section === 'search' && !search)) {
      if (!restoring) { setBusy(false); setLoadingMore(false); setPosts([]); setError(''); setCursor(undefined); setSavedAt(undefined); }
      return;
    }
    const ticket = postStore.ticket();
    loadingPage.current = more;
    setError(''); setFailedMore(false);
    if (more) setLoadingMore(true); else { setBusy(true); setCursor(undefined); }
    try {
      const nextCursor = more ? cursor : undefined;
      if (section === 'notifications') {
        const page = await bluesky.notifications(nextCursor);
        if (current !== generation.current || !postStore.isCurrent(ticket)) return;
        postStore.ingestMany(page.items.flatMap(item => item.post ? [item.post] : []), ticket, !page.offline);
        setNotifications(previous => [...new Map((more ? [...previous, ...page.items] : page.items).map(item => [item.uri, item])).values()]);
        setCursor(page.cursor); setSavedAt(page.offline ? page.savedAt : undefined);
        const boundary = page.items.map(item => item.indexedAt).sort().at(-1);
        if (!more && !page.offline && boundary) void bluesky.markNotificationsSeen(boundary).then(() => {
          if (current === generation.current && postStore.isCurrent(ticket)) setNotifications(previous => previous.map(item => item.indexedAt <= boundary ? { ...item, isRead: true } : item));
        }).catch(() => {});
      } else {
        const page = section === 'home' ? await bluesky.homeFeed(nextCursor) : await bluesky.searchPosts(search, nextCursor);
        if (current !== generation.current || !postStore.isCurrent(ticket)) return;
        postStore.ingestMany(page.items, ticket, !page.offline);
        setPosts(previous => more ? uniquePosts([...previous, ...page.items]) : page.items);
        setCursor(page.cursor); setSavedAt(page.offline ? page.savedAt : undefined);
      }
    } catch (cause) {
      if (current === generation.current && postStore.isCurrent(ticket)) { setError(errorMessage(cause)); setFailedMore(more); }
    } finally {
      if (current === generation.current) { loadingPage.current = false; setBusy(false); setLoadingMore(false); }
    }
  }, [section, search, restoring, cursor]);
  useEffect(() => { void load(); feedRef.current?.scrollTo({ top: 0 }); }, [section, search, restoring, session?.did, session?.connection]);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 6500); return () => clearTimeout(timer); } }, [notice]);

  const navigate = (next: Section) => {
    serial.current++;
    if (['home', 'notifications', 'profile'].includes(next) && !session) { setLoginOpen(true); return; }
    if (next === 'profile' && session) { openProfile(session); setNavExpanded(false); return; }
    generation.current++; loadingPage.current = false;
    setSection(next); setSheets([]); setNavExpanded(false); setPosts([]); setNotifications([]); setCursor(undefined); setError(''); setSavedAt(undefined);
    sourceUri.current = undefined; setSelectedUri(undefined);
    if (next === section) void load();
  };
  const requireSession = (action: () => void) => { if (bluesky.session) action(); else setLoginOpen(true); };
  const startCompose = (replyTo?: Post, origin = sheets.length - 1) => requireSession(() => setCompose({ replyTo, scope: currentScope.current, ticket: postStore.ticket(), origin }));
  const mutate = async (post: Post, kind: 'like' | 'repost') => {
    if (!bluesky.session) { setLoginOpen(true); return; }
    if (!postStore.get(post.uri)) postStore.ingest(post, postStore.ticket());
    const ticket = postStore.beginReaction(post.uri, kind);
    if (!ticket) return;
    try {
      const current = postStore.get(post.uri) ?? post;
      const result = await (kind === 'like' ? bluesky.toggleLike(current) : bluesky.toggleRepost(current));
      postStore.applyReaction(kind, result, ticket);
    } catch (cause) { if (postStore.isCurrent(ticket)) setNotice(errorMessage(cause)); }
    finally { postStore.endReaction(ticket); }
  };
  const actions: PostActions = {
    onOpen: openPost, onProfile: openProfile, onMention: actor => { void openMention(actor); }, onTag: searchTag,
    onExternal: (url, title, post) => openWeb(url, title, post, sheets.length - 1), onMedia: openMedia, onReply: startCompose,
    onLike: post => { void mutate(post, 'like'); }, onRepost: post => { void mutate(post, 'repost'); },
  };
  const branchActions = (origin: number): PostActions => ({
    ...actions, onOpen: post => openPost(post, origin), onProfile: profile => openProfile(profile, origin),
    onMention: actor => { void openMention(actor, origin); }, onTag: tag => searchTag(tag, origin),
    onExternal: (url, title, post) => openWeb(url, title, post, origin), onMedia: (images, index) => openMedia(images, index, origin),
    onReply: post => startCompose(post, origin),
  });
  const feedActions = (post: Post): PostActions => {
    const select = () => { sourceUri.current = post.uri; setSelectedUri(post.uri); };
    return {
      ...branchActions(-1),
      onOpen: item => { select(); openPost(item, -1); }, onProfile: item => { select(); openProfile(item, -1); },
      onMention: actor => { select(); void openMention(actor, -1); }, onTag: tag => { select(); searchTag(tag, -1); },
      onExternal: (url, label, item) => { select(); openWeb(url, label, item, -1); }, onMedia: (images, index) => { select(); openMedia(images, index, -1); },
    };
  };
  const title =
    section === "home"
      ? "Timeline"
      : section === "search"
        ? "Search"
        : section === "notifications"
          ? "Mentions & activity"
          : "Feeds";
  return (
    <div
      className={`app-shell ${navExpanded ? "nav-expanded" : ""} ${sheets.length ? "sheets-open" : ""}`}
    >
      <aside ref={sidebarRef} id="main-navigation" className="sidebar" aria-label="Main navigation">
        {navExpanded && <button className="nav-dismiss metal-button" aria-label="Close navigation" onClick={() => setNavExpanded(false)}><Icon name="close" /></button>}
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            navigate("feeds");
          }}
          aria-label="Panes, feeds"
        >
          <Butterfly className="brand-butterfly" />
          <span className="brand-word">Panes</span>
        </a>
        <button
          className="account-summary"
          aria-label={
            session
              ? `View ${session.displayName || session.handle} profile`
              : "Sign in"
          }
          onClick={() => (session ? openProfile(session) : setLoginOpen(true))}
        >
          {session ? (
            <Avatar profile={session} />
          ) : (
            <span className="account-placeholder">
              <Icon name="user" size={24} />
            </span>
          )}
          <span className="account-copy">
            <strong>{session?.displayName || "Welcome to Panes"}</strong>
            <small>
              {session ? `@${session.handle}` : "A classic view of Bluesky"}
            </small>
          </span>
          <Icon name="chevron" size={13} />
        </button>
        <nav className="nav-items">
          {(
            [
              ["home", "home", "Timeline"],
              ["notifications", "bell", "Mentions & activity"],
              ["feeds", "globe", "Feeds"],
              ["search", "search", "Search"],
              ["profile", "user", "Profile"],
            ] as const
          ).map(([id, icon, label]) => (
            <button
              key={id}
              className={`nav-item ${section === id ? "active" : ""}`}
              onClick={() => navigate(id)}
              aria-current={section === id ? "page" : undefined}
              title={label}
            >
              <img
                className="nav-original-icon"
                src={`${import.meta.env.BASE_URL}assets/original/${({ home: "clock.png", bell: "at.png", globe: "compass.png", search: "magnifying-glass.png", user: "person.png" } as const)[icon]}`}
                alt=""
              />
              <span>{label}</span>
              <Icon name="chevron" size={12} />
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button
            className="new-post"
            aria-label="New post"
            onClick={() => requireSession(() => startCompose())}
          >
            <img
              src={`${import.meta.env.BASE_URL}assets/original/compose.png`}
              width="26"
              height="22"
              alt=""
            />
            <span>New post</span>
          </button>
          <div className="sidebar-footer">
            {session ? (
              <button
                onClick={() => {
                  setCompose(null);
                  void bluesky.logout();
                  setSession(null);
                  setSection("feeds");
                  setSheets([]);
                }}
                title="Sign out"
                aria-label="Sign out"
              >
                <Icon name="logout" size={18} />
                <span>Sign out</span>
              </button>
            ) : (
              <button aria-label="Sign in" onClick={() => setLoginOpen(true)}>
                <Icon name="user" size={18} />
                <span>Sign in</span>
              </button>
            )}
            <a className="footer-link" href="https://ezhik.jp/panes-for-bluesky" target="_blank" rel="noopener noreferrer">
              ezhik.jp
            </a>
          </div>
        </div>
      </aside>
      {navExpanded && <button className="navigation-backdrop" aria-label="Dismiss navigation" onClick={() => setNavExpanded(false)} />}
      <main className="workspace">
        <section ref={timelineRef} className="timeline" aria-label={title}>
          <header className="timeline-toolbar">
            <button
              className="metal-button mobile-menu"
              aria-label="Toggle navigation"
              aria-expanded={navExpanded}
              aria-controls="main-navigation"
              onClick={() => setNavExpanded(!navExpanded)}
            >
              <Icon name="menu" />
            </button>
            <h1>{title}</h1>
            <button
              className={`metal-button refresh-button ${busy ? "is-refreshing" : ""}`}
              title={section === 'feeds' ? 'Refresh feeds' : 'Refresh timeline'}
              aria-label={section === 'feeds' ? 'Refresh feeds' : 'Refresh timeline'}
              onClick={() => section === 'feeds' ? setFeedsRevision(value => value + 1) : void load()}
              disabled={busy}
            >
              <Icon name="refresh" size={18} />
            </button>
          </header>
          {section === "search" && (
            <form
              className="search-bar"
              onSubmit={(event) => {
                event.preventDefault();
                setSearch(query.trim());
              }}
            >
              <Icon name="search" size={18} />
              <input
                aria-label="Search Bluesky"
                placeholder="Search posts on Bluesky"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button className="metal-button" type="submit">
                Search
              </button>
            </form>
          )}
          <div className="feed-scroll" ref={feedRef}>
            {(pwa.offline || savedAt) && (
              <div className="connection-banner">
                {savedAt
                  ? `Saved posts · ${new Date(savedAt).toLocaleString()}`
                  : "You’re offline. Previously saved public views are available."}
              </div>
            )}
            {pwa.updateReady && (
              <button className="update-banner" onClick={() => void applyPwaUpdate()} disabled={pwa.updateApplying}>
                {pwa.updateApplying ? "Saving drafts and updating…" : "A new version is ready. Update Panes"}{" "}
                <Icon name="refresh" size={14} />
              </button>
            )}
            {section === 'feeds' && !restoring ? (
              <DiscoverFeeds user={session} refreshKey={feedsRevision} selectedUri={sheets[0]?.kind === 'feed' ? sheets[0].feed.uri : undefined} onSelect={feed => openFeed(feed, -1)} />
            ) : busy && !posts.length && !notifications.length ? (
              <Loading
                label={restoring ? "Opening Panes…" : "Loading posts…"}
              />
            ) : (
              <>
                {section === "notifications"
                  ? notifications.map((item, index) => (
                      <button
                        className={`notification ${item.isRead ? "" : "unread"}`}
                        key={`${item.uri}:${index}`}
                        onClick={() =>
                          item.post
                            ? openPost(item.post)
                            : openProfile(item.author)
                        }
                      >
                        <Avatar profile={item.author} />
                        <span>
                          <strong>
                            {item.author.displayName || item.author.handle}
                          </strong>
                          <span className="notification-reason">
                            {" "}
                            {notificationReason(item.reason)}
                          </span>
                          {item.post && (
                            <p>
                              {item.post.moderation.hidden ||
                              item.post.moderation.blur ||
                              item.post.moderation.noOverride
                                ? item.post.moderation.warning ||
                                  "Content warning — open to view"
                                : item.post.text}
                            </p>
                          )}
                          <small>
                            {new Date(item.indexedAt).toLocaleString()}
                          </small>
                        </span>
                        <Icon name="chevron" size={14} />
                      </button>
                    ))
                  : posts.map((post) => (
                      <PostView key={post.uri} post={post} selected={selectedUri === post.uri} {...feedActions(post)} />
                    ))}
                {!error && !posts.length && section !== "notifications" && (
                  <EmptyState
                    icon="search"
                    title={
                      section === "search"
                        ? search
                          ? "No posts found"
                          : "Find your next conversation"
                        : "Your timeline is quiet"
                    }
                    text={
                      section === "search"
                        ? search
                          ? "Try another word, phrase, or handle."
                          : "Search the open sky for people, ideas, and posts."
                        : "Follow a few people, then refresh to see what they’re sharing."
                    }
                  />
                )}
                {!error &&
                  section === "notifications" &&
                  !notifications.length && (
                    <EmptyState
                      icon="bell"
                      title="All caught up"
                      text="Replies, likes, follows, and reposts will appear here."
                    />
                  )}
                {error && (
                  <div className="inline-error" role="alert">
                    <strong>Couldn’t load this view</strong>
                    <p>{error}</p>
                    <button
                      className="metal-button"
                      onClick={() => void load(failedMore)}
                    >
                      Try again
                    </button>
                  </div>
                )}
                {cursor && (
                  <button
                    className="load-more"
                    disabled={loadingMore}
                    onClick={() => void load(true)}
                  >
                    {loadingMore ? "Loading more…" : "Load more posts"}
                    <Icon name="chevron" size={13} />
                  </button>
                )}
                {!cursor && (posts.length > 0 || notifications.length > 0) && (
                  <p className="feed-end">
                    You’ve reached the end of this view.
                  </p>
                )}
              </>
            )}
          </div>
          <footer className="timeline-footer">
            <span
              className={`connection-dot ${pwa.offline || savedAt ? "offline" : ""}`}
            />
            <span>
              {pwa.offline || session?.connection === "offline"
                ? session
                  ? "Offline · saved account"
                  : "Offline · saved reading"
                : savedAt
                  ? "Saved reading · connection unavailable"
                  : session
                    ? `@${session.handle}`
                    : section === "feeds" ? "Bluesky feeds" : "Public Bluesky timeline"}
            </span>
            <span className="timeline-footer-right">
              {posts.length > 0 ? `${posts.length} posts` : "Panes"}
            </span>
          </footer>
        </section>
        <div className="quiet-workspace" aria-hidden="true">
          <Butterfly className="quiet-butterfly" />
        </div>
        <PanelStack
          onLayoutChange={applyDeckLayout}
          navigationExpanded={navExpanded}
          onExpandNavigation={() => setNavExpanded(true)}
          onCollapseNavigation={() => setNavExpanded(false)}
          revealKey={revealKey}
          panels={sheets.map((sheet, index) => ({
            id: sheet.id,
            width: sheet.kind === 'thread' && sheet.context ? (landscape ? 830 : 574) : 476,
            title: sheet.kind === 'thread' ? sheet.context ? sheet.context.title || 'Browser' : 'Conversation' : sheet.kind === 'profile' ? 'Profile' : sheet.kind === 'people' ? sheet.list === 'followers' ? 'Followers' : 'Following' : sheet.kind === 'search' ? sheet.query : sheet.kind === 'feed' ? sheet.feed.displayName : 'Photos',
            content: sheet.kind === 'thread' ? <ThreadPanel initialPost={sheet.post} replyRevision={replyRevision} context={sheet.context} onShowConversation={() => showConversation(index)} {...branchActions(index)} />
              : sheet.kind === 'profile' ? <ProfilePanel initialProfile={sheet.actor} {...branchActions(index)} signedIn={!!session} onLogin={() => setLoginOpen(true)} onNotice={setNotice} onPeople={(actor, list) => openPeople(actor, list, index)} />
              : sheet.kind === 'people' ? <PeoplePanel initialProfile={sheet.actor} kind={sheet.list} onProfile={actor => openProfile(actor, index)} />
              : sheet.kind === 'search' ? <SearchPanel query={sheet.query} {...branchActions(index)} />
              : sheet.kind === 'feed' ? <FeedPanel feed={sheet.feed} {...branchActions(index)} />
              : <MediaPanel images={sheet.images} initialIndex={sheet.initialIndex} />,
          }))}
          onDismiss={index => {
            serial.current++;
            const next = sheets.slice(0, index);
            sourceUri.current = next.at(-1)?.sourceUri;
            setSelectedUri(sourceUri.current);
            setSheets(next);
          }}
        />
      </main>
      {loginOpen && (
        <LoginDialog
          onClose={() => setLoginOpen(false)}
          onLogin={(user) => {
            setSession(user);
            setLoginOpen(false);
            setSection("home");
            setSheets([]);
            setNotice(`Welcome, ${user.displayName || user.handle}.`);
          }}
        />
      )}
      {compose && (
        <ComposeDialog
          replyTo={compose.replyTo}
          onClose={() => setCompose(null)}
          onPublished={(post) => {
            if (!compose || compose.scope !== currentScope.current || post.author.did !== bluesky.session?.did) return;
            setCompose(null);
            postStore.publishReply(post, compose.ticket);
            setReplyRevision(value => value + 1);
            if (section === "home") setPosts(previous => uniquePosts([post, ...previous]));
            openPost(post, compose.origin);
            setNotice("Your post was published.");
          }}
        />
      )}
      {pwa.updateError && <div className="inline-error update-error" role="alert">{pwa.updateError}</div>}
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button aria-label="Dismiss message" onClick={() => setNotice("")}>
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function notificationReason(reason: string) {
  return (
    (
      {
        like: "liked your post",
        repost: "reposted your post",
        follow: "followed you",
        mention: "mentioned you",
        reply: "replied to your post",
        quote: "quoted your post",
        "starterpack-joined": "joined through your starter pack",
      } as Record<string, string>
    )[reason] || "interacted with you"
  );
}
function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <span className="spinner" />
      {label}
    </div>
  );
}
function EmptyState({
  icon,
  title,
  text,
}: {
  icon: "search" | "bell";
  title: string;
  text: string;
}) {
  return (
    <div className="empty-state">
      <Icon name={icon} size={38} />
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}
