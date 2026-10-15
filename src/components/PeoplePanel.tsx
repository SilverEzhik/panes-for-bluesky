import { useCallback, useEffect, useRef, useState } from 'react';
import { bluesky, errorMessage } from '../lib/bluesky';
import type { Profile } from '../lib/types';
import { Avatar } from './PostCard';
import './PeoplePanel.css';

export interface PeoplePanelProps {
  initialProfile: Profile;
  kind: 'followers' | 'following';
  onProfile: (profile: Profile) => void;
}

export default function PeoplePanel({ initialProfile, kind, onProfile }: PeoplePanelProps) {
  const [people, setPeople] = useState<Profile[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [accountEpoch, setAccountEpoch] = useState(0);
  const lifetime = useRef(0);
  const pending = useRef(false);
  const retryMore = useRef(false);
  useEffect(() => bluesky.subscribeSession(() => {
    lifetime.current++;
    pending.current = false;
    setAccountEpoch(value => value + 1);
  }), []);

  const load = useCallback(async (more: boolean, token: number, nextCursor?: string) => {
    if (pending.current) return;
    pending.current = true;
    retryMore.current = more;
    setBusy(true);
    setError('');
    const generation = bluesky.sessionGeneration;
    const valid = () => token === lifetime.current && generation === bluesky.sessionGeneration;
    try {
      const page = await (kind === 'followers' ? bluesky.followers(initialProfile.did, nextCursor) : bluesky.follows(initialProfile.did, nextCursor));
      if (!valid()) return;
      setPeople(previous => Array.from(new Map((more ? [...previous, ...page.items] : page.items).map(person => [person.did, person])).values()));
      setCursor(page.cursor);
      setOffline(Boolean(page.offline));
    } catch (cause) {
      if (valid()) setError(errorMessage(cause));
    } finally {
      if (valid()) { pending.current = false; setBusy(false); }
    }
  }, [initialProfile.did, kind]);

  useEffect(() => {
    const token = ++lifetime.current;
    pending.current = false;
    setPeople([]);
    setCursor(undefined);
    setOffline(false);
    void load(false, token);
    return () => { lifetime.current++; pending.current = false; };
  }, [load, accountEpoch]);

  return <div className="classic-people">
    <header className="classic-people-heading"><h2>{kind === 'followers' ? 'Followers' : 'Following'}</h2><p>@{initialProfile.handle}</p></header>
    {offline && <p className="classic-people-notice">Saved people · offline</p>}
    {people.filter(person => !person.moderation?.hidden).map(person => <button className="classic-person" key={person.did} onClick={() => onProfile(person)} aria-label={`View ${person.displayName || person.handle}'s profile`}>
      <Avatar profile={person} />
      <span className="classic-person-copy"><strong>{person.displayName || person.handle}</strong><span>@{person.handle}</span>{person.moderation?.blur ? <small>{person.moderation.warning || 'Profile content warning'}</small> : person.description && <small>{person.description}</small>}</span>
      <span className="classic-person-disclosure" aria-hidden="true">›</span>
    </button>)}
    {busy && <p className="quiet-message" role="status">Loading people…</p>}
    {error && <div className="inline-error"><p role="alert">{error}</p><button className="metal-button" onClick={() => void load(retryMore.current, lifetime.current, retryMore.current ? cursor : undefined)}>Try again</button></div>}
    {!busy && !error && !people.length && <p className="quiet-message">{kind === 'followers' ? 'No followers to show.' : 'No followed accounts to show.'}</p>}
    {cursor && !error && <button className="load-more" disabled={busy} onClick={() => void load(true, lifetime.current, cursor)}>Load more people</button>}
  </div>;
}
