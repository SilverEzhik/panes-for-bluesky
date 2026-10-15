import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, RefObject } from 'react';
import { bluesky, errorMessage, PublicationUncertainError, type PublishAttempt } from '../lib/bluesky';
import { deleteOfflineDraft, readOfflineDraft, saveOfflineDraft } from '../lib/offline';
import type { Post, SessionUser } from '../lib/types';
import Icon from './Icon';
import { registerPwaUpdateGuard } from '../pwa';

const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function useDialog(onClose: () => void): RefObject<HTMLDivElement | null> {
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const elements = () => Array.from(dialog.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])
      .filter((element) => element.getClientRects().length > 0);
    const focusFirst = () => (dialog.current?.querySelector<HTMLElement>('[data-modal-autofocus]:not(:disabled)') ?? elements()[0] ?? dialog.current)?.focus();
    focusFirst();

    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      } else if (event.key === 'Tab') {
        const available = elements();
        const first = available[0];
        const last = available[available.length - 1];
        if (!first) {
          event.preventDefault();
          dialog.current?.focus();
        } else if (event.shiftKey && (document.activeElement === first || !dialog.current?.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog.current?.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    function focusin(event: FocusEvent) {
      if (event.target instanceof Node && !dialog.current?.contains(event.target)) focusFirst();
    }
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('focusin', focusin);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('focusin', focusin);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  return dialog;
}

export function LoginDialog({ onClose, onLogin }: { onClose: () => void; onLogin: (user: SessionUser) => void }) {
  const id = useId();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [service, setService] = useState('https://bsky.social');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const submitting = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const dialog = useDialog(() => { if (!submitting.current) onClose(); });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !identifier.trim() || !password) return;
    submitting.current = true;
    setPending(true);
    setError('');
    try {
      const user = await bluesky.login(identifier.trim(), password, service.trim());
      if (!mounted.current || bluesky.session?.did !== user.did) return;
      setPassword('');
      onLogin(user);
    } catch (reason) {
      if (mounted.current) setError(errorMessage(reason));
    } finally {
      submitting.current = false;
      if (mounted.current) setPending(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div ref={dialog} className="modal-window" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-help`} tabIndex={-1}>
        <form onSubmit={submit} aria-busy={pending}>
          <div className="modal-toolbar">
            <button type="button" className="metal-button" onClick={onClose} disabled={pending} aria-label="Close sign in"><Icon name="close" size={14} /></button>
            <h2 id={`${id}-title`}>Sign in to Bluesky</h2>
          </div>
          <div className="modal-body">
            <p id={`${id}-help`} className="text-secondary">Use your Bluesky handle and an app password. Your session stays in this browser.</p>
            <label className="field-label" htmlFor={`${id}-identifier`}>Handle or email</label>
            <input id={`${id}-identifier`} className="form-field" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="you.bsky.social" autoComplete="username" autoCapitalize="none" spellCheck={false} required disabled={pending} data-modal-autofocus />
            <label className="field-label" htmlFor={`${id}-password`}>App password</label>
            <input id={`${id}-password`} className="form-field" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="xxxx-xxxx-xxxx-xxxx" autoComplete="current-password" required disabled={pending} />
            <p className="text-secondary"><a href="https://bsky.app/settings/app-passwords" target="_blank" rel="noopener noreferrer">Create an app password in Bluesky settings <Icon name="link" size={12} /></a></p>
            <details>
              <summary className="text-secondary">Account service</summary>
              <label className="field-label" htmlFor={`${id}-service`}>Service URL</label>
              <input id={`${id}-service`} className="form-field" type="url" value={service} onChange={(event) => setService(event.target.value)} autoCapitalize="none" spellCheck={false} required disabled={pending} />
            </details>
            {error && <p className="form-error" role="alert">{error}</p>}
          </div>
          <div className="modal-footer">
            <button type="button" className="metal-button" onClick={onClose} disabled={pending}>Cancel</button>
            <button type="submit" className="blue-button" disabled={pending || !identifier.trim() || !password}>{pending ? 'Signing in…' : 'Sign in'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

type DraftData = { text: string; attempt?: PublishAttempt };
type SaveState = 'loading' | 'saving' | 'saved' | 'failed' | 'conflict' | 'invalidated';

export function ComposeDialog({ replyTo, onClose, onPublished }: { replyTo?: Post; onClose: () => void; onPublished: (post: Post) => void }) {
  const id = useId();
  const [owner] = useState(() => ({ did: bluesky.session?.did, generation: bluesky.sessionGeneration, lifetime: bluesky.sessionLifetime }));
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('loading');
  const mounted = useRef(true);
  const busy = useRef(false);
  const state = useRef<SaveState>('loading');
  const value = useRef('');
  const revision = useRef<string | null>(null);
  const attempt = useRef<PublishAttempt | undefined>(undefined);
  const saveSequence = useRef(0);
  const draftWrites = useRef(Promise.resolve());
  const draftKey = `${owner.did}:${replyTo?.uri ?? 'compose'}`;
  const current = () => !!owner.did && owner.did === bluesky.session?.did && owner.generation === bluesky.sessionGeneration;
  const showState = (next: SaveState) => { state.current = next; if (mounted.current) setSaveState(next); };
  const count = Array.from(segmenter.segment(text)).length;
  const bytes = new TextEncoder().encode(text).length;
  const valid = Boolean(text.trim()) && count <= 300 && bytes <= 3000;

  async function readDraft() {
    showState('loading');
    const saved = await readOfflineDraft<string | DraftData>(draftKey, owner.lifetime);
    if (!mounted.current || !current()) return;
    revision.current = saved?.revision ?? null;
    const data = typeof saved?.data === 'string' ? { text: saved.data } : saved?.data;
    value.current = data?.text ?? '';
    setText(value.current);
    const restoredAttempt = data?.attempt;
    attempt.current = restoredAttempt && restoredAttempt.actorDid === owner.did && restoredAttempt.text === value.current ? restoredAttempt : undefined;
    setUncertain(Boolean(attempt.current));
    if (!attempt.current) setError('');
    if (attempt.current) setError('A previous publication is unconfirmed. Check post looks it up and retries the same post only if the server confirms it is missing.');
    showState(owner.lifetime ? 'saved' : 'failed');
  }

  useEffect(() => {
    mounted.current = true;
    draftWrites.current = readDraft();
    return () => { mounted.current = false; };
  }, []);

  async function flushDraftWrites() {
    let queued: Promise<void>;
    do { queued = draftWrites.current; await queued; } while (queued !== draftWrites.current);
  }

  useEffect(() => registerPwaUpdateGuard(async () => {
    await flushDraftWrites();
    return !busy.current && !attempt.current && state.current === 'saved';
  }), []);

  function save(data: DraftData): Promise<void> {
    const sequence = ++saveSequence.current;
    if (state.current !== 'conflict') showState('saving');
    draftWrites.current = draftWrites.current.then(async () => {
      if (!current()) { showState('invalidated'); return; }
      if (state.current === 'conflict') return;
      const result = await saveOfflineDraft(draftKey, data, owner.lifetime, revision.current);
      if (result.ok) { revision.current = result.revision; if (sequence === saveSequence.current) showState('saved'); }
      else showState(result.reason === 'unavailable' ? 'failed' : result.reason);
    }).catch(() => { showState('failed'); });
    return draftWrites.current;
  }

  function changeText(next: string) {
    value.current = next;
    setText(next);
    void save({ text: next });
  }

  async function close() {
    if (busy.current) return;
    await flushDraftWrites();
    if (!mounted.current) return;
    if (state.current === 'saved' || !current()) onClose();
    else setError('Your draft has not been saved. Keep this window open and retry saving, or resolve the draft conflict.');
  }
  const dialog = useDialog(() => { void close(); });
  const focusedComposer = useRef(false);
  useEffect(() => {
    if (saveState !== 'loading' && !focusedComposer.current) {
      focusedComposer.current = true;
      dialog.current?.querySelector<HTMLTextAreaElement>('textarea:not(:disabled)')?.focus();
    }
  }, [saveState, dialog]);

  async function keepMyText() {
    await draftWrites.current;
    const saved = await readOfflineDraft<string | DraftData>(draftKey, owner.lifetime);
    if (!mounted.current || !current()) return;
    revision.current = saved?.revision ?? null;
    showState('saving');
    await save({ text: value.current, attempt: attempt.current });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !valid || !current() || state.current === 'loading') return;
    busy.current = true;
    setPending(true);
    setError('');
    try {
      await draftWrites.current;
      if (!current()) return;
      if (state.current !== 'saved') throw new Error('Save your draft or resolve its conflict before publishing.');
      const held = attempt.current ?? bluesky.createPublishAttempt(value.current, replyTo);
      // Persist an uncertain intent before any request. Reloads reconcile this same record key.
      attempt.current = held;
      await save({ text: value.current, attempt: { ...held, dispatched: true } });
      if (state.current !== 'saved') throw new Error('The publication could not be saved safely. Retry saving before sending.');
      if (!current()) return;
      const post = await bluesky.publish(held.text, held.replyTo, held);
      if (!mounted.current || !current()) return;
      if (revision.current) await deleteOfflineDraft(draftKey, owner.lifetime, revision.current);
      if (!mounted.current || !current()) return;
      attempt.current = undefined;
      onPublished(post);
    } catch (reason) {
      if (!mounted.current || !current()) return;
      const unconfirmed = reason instanceof PublicationUncertainError || Boolean(attempt.current?.dispatched);
      setUncertain(unconfirmed);
      if (unconfirmed && attempt.current) await save({ text: value.current, attempt: attempt.current });
      if (!unconfirmed) {
        attempt.current = undefined;
        await save({ text: value.current });
      }
      if (mounted.current && current()) setError(unconfirmed ? 'Publication is unconfirmed. Your text is preserved. Check post looks it up and retries the same post only if the server confirms it is missing.' : errorMessage(reason));
    } finally {
      busy.current = false;
      if (mounted.current && current()) setPending(false);
    }
  }

  const saveLabel: Record<SaveState, string> = {
    loading: 'Loading draft…', saving: 'Saving draft…', saved: 'Draft saved on this device.',
    failed: 'Draft could not be saved. Keep this window open.',
    conflict: 'This draft changed in another window. Your text has been kept here.',
    invalidated: 'This account changed. This draft can no longer be saved.',
  };
  return (
    <div className="modal-backdrop compose-backdrop">
      <div ref={dialog} className="modal-window compose-window" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} tabIndex={-1}>
        <form onSubmit={submit} aria-busy={pending}>
          <div className="modal-toolbar compose-toolbar">
            <button type="button" className="metal-button" onClick={() => void close()} disabled={pending} aria-label="Close composer">Close</button>
            <div className="compose-heading"><h2 id={`${id}-title`}>{replyTo ? 'Reply' : 'New post'}</h2><span>@{bluesky.session?.handle}</span></div>
            <button type="submit" className="blue-button" disabled={pending || !valid || saveState === 'loading' || saveState === 'conflict'}>{pending ? 'Checking…' : uncertain ? 'Check post' : replyTo ? 'Reply' : 'Post'}</button>
          </div>
          <div className="modal-body compose-paper">
            {replyTo && <div className="compose-reply"><strong>Replying to {replyTo.author.displayName || replyTo.author.handle}</strong><p>{replyTo.text}</p></div>}
            <label className="field-label" htmlFor={`${id}-text`}>{replyTo ? 'Your reply' : 'What’s happening?'}</label>
            <textarea id={`${id}-text`} className="compose-input" rows={7} value={text} onChange={(event) => changeText(event.target.value)} placeholder={replyTo ? 'Write your reply…' : 'What’s happening?'} aria-describedby={`${id}-count ${id}-save`} aria-invalid={count > 300 || bytes > 3000} disabled={pending || uncertain || saveState === 'loading'} data-modal-autofocus />
            <p id={`${id}-save`} className="draft-status" data-save-state={saveState} role="status">{saveLabel[saveState]}</p>
            {saveState === 'failed' && <button type="button" className="metal-button" disabled={pending} onClick={() => void save({ text: value.current, attempt: attempt.current })}>Retry saving</button>}
            {saveState === 'conflict' && <div className="draft-conflict-actions"><button type="button" className="metal-button" disabled={pending} onClick={() => void draftWrites.current.then(readDraft)}>Use saved draft</button><button type="button" className="metal-button" disabled={pending} onClick={() => void keepMyText()}>Replace saved draft with my text</button></div>}
            {bytes > 3000 && <p className="form-error" role="alert">This post is too large. Shorten it before publishing.</p>}
            {error && <p className="form-error" role="alert">{error}</p>}
          </div>
          <div className="modal-footer compose-footer"><span id={`${id}-count`} className={count > 300 ? 'form-error' : 'text-secondary'} aria-live="polite" aria-atomic="true">{300 - count}</span><span className="text-secondary">{uncertain ? 'Waiting for confirmation' : 'Bluesky'}</span></div>
        </form>
      </div>
    </div>
  );
}
