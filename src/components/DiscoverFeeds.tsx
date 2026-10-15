import { useEffect, useRef, useState } from 'react';
import { bluesky, errorMessage } from '../lib/bluesky';
import type { FeedGenerator, Page, SessionUser } from '../lib/types';
import './DiscoverFeeds.css';

type FeedState = { page: Page<FeedGenerator>; busy: boolean; error: string };
const initialState = (): FeedState => ({ page: { items: [] }, busy: true, error: '' });

export default function DiscoverFeeds({ user, selectedUri, onSelect, refreshKey }: {
  user: SessionUser | null;
  selectedUri?: string;
  refreshKey?: number;
  onSelect: (feed: FeedGenerator) => void;
}) {
  const [saved, setSaved] = useState<FeedState>(initialState);
  const [directory, setDirectory] = useState<FeedState>(initialState);
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [savedRetry, setSavedRetry] = useState(0);
  const [directoryRetry, setDirectoryRetry] = useState(0);
  const savedGeneration = useRef(0);
  const directoryGeneration = useRef(0);
  const loadingMore = useRef(false);
  const did = user?.did;

  useEffect(() => {
    const generation = ++savedGeneration.current;
    const session = bluesky.sessionGeneration;
    setSaved(initialState());
    if (!did) { setSaved({ page: { items: [] }, busy: false, error: '' }); return; }
    void bluesky.savedFeeds().then(page => {
      if (generation === savedGeneration.current && session === bluesky.sessionGeneration) setSaved({ page, busy: false, error: '' });
    }).catch(cause => {
      if (generation === savedGeneration.current && session === bluesky.sessionGeneration) setSaved({ page: { items: [] }, busy: false, error: errorMessage(cause) });
    });
    return () => { savedGeneration.current++; };
  }, [did, savedRetry, refreshKey]);

  useEffect(() => {
    const generation = ++directoryGeneration.current;
    const session = bluesky.sessionGeneration;
    loadingMore.current = false;
    setDirectory(initialState());
    void bluesky.discoverFeeds(query).then(page => {
      if (generation === directoryGeneration.current && session === bluesky.sessionGeneration) setDirectory({ page, busy: false, error: '' });
    }).catch(cause => {
      if (generation === directoryGeneration.current && session === bluesky.sessionGeneration) setDirectory({ page: { items: [] }, busy: false, error: errorMessage(cause) });
    });
    return () => { directoryGeneration.current++; loadingMore.current = false; };
  }, [query, did, directoryRetry, refreshKey]);

  const more = async () => {
    if (loadingMore.current || directory.busy || !directory.page.cursor) return;
    loadingMore.current = true;
    const generation = directoryGeneration.current;
    const session = bluesky.sessionGeneration;
    setDirectory(previous => ({ ...previous, busy: true, error: '' }));
    try {
      const page = await bluesky.discoverFeeds(query, directory.page.cursor);
      if (generation !== directoryGeneration.current || session !== bluesky.sessionGeneration) return;
      setDirectory(previous => ({ busy: false, error: '', page: { ...page,
        items: [...new Map([...previous.page.items, ...page.items].map(feed => [feed.uri, feed])).values()],
        offline: previous.page.offline || page.offline, savedAt: page.savedAt ?? previous.page.savedAt } }));
    } catch (cause) {
      if (generation === directoryGeneration.current && session === bluesky.sessionGeneration) setDirectory(previous => ({ ...previous, busy: false, error: errorMessage(cause) }));
    } finally {
      if (generation === directoryGeneration.current) loadingMore.current = false;
    }
  };

  const rows = (state: FeedState) => <>
    {state.page.offline && <p className="feed-picker-notice">Saved feeds · {state.page.savedAt ? new Date(state.page.savedAt).toLocaleString() : 'offline'}</p>}
    {state.page.items.map(feed => <button type="button" className="feed-picker-row" key={feed.uri}
      aria-pressed={feed.uri === selectedUri} onClick={() => onSelect(feed)}>
      {feed.avatar ? <img src={feed.avatar} alt="" loading="lazy" /> : <span className="feed-picker-avatar" aria-hidden="true">#</span>}
      <span className="feed-picker-copy"><strong>{feed.displayName}</strong><span>by @{feed.creator.handle}{feed.pinned ? ' · Pinned' : ''}</span>
        {feed.description && <small>{feed.description}</small>}</span>
      <span className="feed-picker-disclosure" aria-hidden="true">{feed.uri === selectedUri ? '✓' : '›'}</span>
    </button>)}
    {state.busy && <p className="feed-picker-notice" role="status">Loading feeds…</p>}
  </>;

  return <section className="feed-picker" aria-label="Choose a Bluesky feed">
    <div className="feed-picker-heading"><h2>Your feeds</h2><p>Choose a feed to open in a new pane.</p></div>
    {did ? <>{rows(saved)}
      {saved.error && <div className="inline-error" role="alert"><p>{saved.error}</p><button className="metal-button" onClick={() => setSavedRetry(value => value + 1)}>Retry saved feeds</button></div>}
      {!saved.busy && !saved.error && !saved.page.items.length && <p className="feed-picker-notice">No saved custom feeds on your Bluesky account.</p>}
    </> : <p className="feed-picker-notice">Sign in to see your saved and pinned Bluesky feeds.</p>}
    <div className="feed-picker-heading"><h2>Find feeds</h2>
      <form className="feed-picker-search" onSubmit={event => { event.preventDefault(); const next = draft.trim(); if (next === query) setDirectoryRetry(value => value + 1); else setQuery(next); }}>
        <input type="search" aria-label="Search feeds" placeholder="Search Bluesky feeds" value={draft} onChange={event => setDraft(event.target.value)} />
        <button className="metal-button" type="submit">Search</button>
      </form>
    </div>
    <p className="feed-picker-notice">{query ? `Feeds matching “${query}”` : 'Popular feeds on Bluesky'}</p>
    {rows(directory)}
    {directory.error && <div className="inline-error" role="alert"><p>{directory.error}</p><button className="metal-button" onClick={() => directory.page.cursor ? void more() : setDirectoryRetry(value => value + 1)}>Retry feeds</button></div>}
    {!directory.busy && !directory.error && !directory.page.items.length && <p className="feed-picker-notice">No feeds found. Try another search.</p>}
    {directory.page.cursor && <button className="load-more" disabled={directory.busy} onClick={() => void more()}>{directory.busy ? 'Loading…' : 'Load more feeds'}</button>}
  </section>;
}
