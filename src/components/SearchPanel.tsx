import { useEffect, useRef, useState } from 'react';
import { bluesky, errorMessage } from '../lib/bluesky';
import { postStore } from '../lib/postStore';
import type { Post } from '../lib/types';
import type { PostActions } from '../lib/ui';
import PostView from './PostView';

/** An inline tag search is a reading branch; top-level Search remains navigation. */
export default function SearchPanel({ query, ...actions }: PostActions & { query: string }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<number>();
  const generation = useRef(0);
  const pending = useRef(false);
  const retryMore = useRef(false);
  const load = async (more = false) => {
    if (pending.current) return;
    pending.current = true;
    const current = ++generation.current;
    const ticket = postStore.ticket();
    setBusy(true); setError(''); retryMore.current = more;
    try {
      const page = await bluesky.searchPosts(query, more ? cursor : undefined);
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
    void load();
    return () => { generation.current++; pending.current = false; };
  }, [query]);
  return <div className="detail-scroll search-results" aria-label={`Search results for ${query}`}>
    {savedAt && <div className="connection-banner">Saved search · {new Date(savedAt).toLocaleString()}</div>}
    {busy && !posts.length && <div className="loading-state" role="status"><span className="spinner" />Searching Bluesky…</div>}
    {posts.map(post => <PostView key={post.uri} post={post} {...actions} />)}
    {!busy && !error && !posts.length && <p className="quiet-message">No posts found for {query}.</p>}
    {error && <div className="inline-error" role="alert"><p>{error}</p><button className="metal-button" onClick={() => void load(retryMore.current)}>Try again</button></div>}
    {cursor && <button className="load-more" disabled={busy} onClick={() => void load(true)}>{busy ? 'Loading…' : 'Load more posts'}</button>}
  </div>;
}
