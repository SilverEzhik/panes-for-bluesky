import { useEffect, useRef, useState } from 'react';
import { bluesky, errorMessage } from '../lib/bluesky';
import { postStore } from '../lib/postStore';
import type { FeedGenerator, Post } from '../lib/types';
import type { PostActions } from '../lib/ui';
import PostView from './PostView';

/** Each feed is a reading branch, with its own cursor and scroll position. */
export default function FeedPanel({ feed, ...actions }: PostActions & { feed: FeedGenerator }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<number>();
  const generation = useRef(0);
  const pending = useRef(false);
  const retryMore = useRef(false);
  const title = feed.displayName;
  const load = async (more = false) => {
    if (pending.current) return;
    pending.current = true;
    const current = ++generation.current;
    const ticket = postStore.ticket();
    setBusy(true); setError(''); retryMore.current = more;
    try {
      const page = await bluesky.publicFeed(more ? cursor : undefined, feed.uri);
      if (current !== generation.current || !postStore.isCurrent(ticket)) return;
      postStore.ingestMany(page.items, ticket, !page.offline);
      setPosts(previous => [...new Map((more ? [...previous, ...page.items] : page.items).map(post => [post.uri, post])).values()]);
      setCursor(page.cursor); setSavedAt(page.offline ? page.savedAt : undefined);
    } catch (cause) {
      if (current === generation.current && postStore.isCurrent(ticket)) setError(errorMessage(cause));
    } finally {
      if (current === generation.current) { pending.current = false; setBusy(false); }
    }
  };
  useEffect(() => {
    setPosts([]); setCursor(undefined); setSavedAt(undefined);
    void load();
    return () => { generation.current++; pending.current = false; };
  }, [feed.uri]);
  return <div className="detail-scroll feed-results" role="region" aria-label={`${title} posts`}>
    <div className="discover-feed-bar">
      <span>{`by @${feed.creator.handle}`}</span>
      <button className="metal-button" aria-label="Refresh feed" disabled={busy} onClick={() => void load()}>Refresh</button>
    </div>
    {savedAt && <div className="connection-banner">Saved posts · {new Date(savedAt).toLocaleString()}</div>}
    {busy && !posts.length && <div className="loading-state" role="status"><span className="spinner" />Loading posts…</div>}
    {posts.map(post => <PostView key={post.uri} post={post} {...actions} />)}
    {!busy && !error && !posts.length && <p className="quiet-message">No posts in this feed yet.</p>}
    {error && <div className="inline-error" role="alert"><strong>Couldn’t load this feed</strong><p>{error}</p><button className="metal-button" onClick={() => void load(retryMore.current)}>Try again</button></div>}
    {cursor && <button className="load-more" disabled={busy} onClick={() => void load(true)}>{busy ? 'Loading…' : 'Load more posts'}</button>}
  </div>;
}
