import { expect, test } from '@playwright/test';
import { PostStore } from '../src/lib/postStore';
import type { Post } from '../src/lib/types';

function post(overrides: Partial<Post> = {}): Post {
  return {
    uri: 'at://did:plc:author/app.bsky.feed.post/one', cid: 'cid',
    author: { did: 'did:plc:author', handle: 'author.test', displayName: 'Author' },
    text: 'Original', segments: [], createdAt: '2026-10-15T00:00:00Z', indexedAt: '2026-10-15T00:00:00Z',
    likeCount: 3, repostCount: 2, replyCount: 0, images: [], labels: [],
    moderation: { hidden: false, blur: false, noOverride: false }, ...overrides,
  };
}

function setup() {
  const store = new PostStore();
  store.reset('account:1');
  const original = post();
  store.ingest(original, store.ticket());
  return { store, original };
}

test('a read started before a reaction updates content without undoing the reaction; later authoritative read retires it', () => {
  const { store, original } = setup();
  const read = store.ticket();
  const mutation = store.beginReaction(original.uri, 'like')!;
  store.applyReaction('like', { ...original, likeUri: 'like', likeCount: 4 }, mutation);
  store.endReaction(mutation);
  store.ingest({ ...original, text: 'Edited', moderation: { hidden: true, blur: true, noOverride: true } }, read);
  expect(store.get(original.uri)).toMatchObject({ text: 'Edited', likeCount: 4, likeUri: 'like', moderation: { hidden: true } });
  store.ingest(original, store.ticket(), false);
  expect(store.get(original.uri)?.likeUri).toBe('like');
  store.ingest({ ...original, text: 'Fresh', likeCount: 15 }, store.ticket());
  expect(store.get(original.uri)).toMatchObject({ text: 'Fresh', likeCount: 15 });
  expect(store.get(original.uri)?.likeUri).toBeUndefined();
});

test('parallel like and repost merge only their own fields and expose independent pending state', () => {
  const { store, original } = setup();
  const like = store.beginReaction(original.uri, 'like')!;
  const repost = store.beginReaction(original.uri, 'repost')!;
  expect(store.beginReaction(original.uri, 'like')).toBeNull();
  expect(store.snapshot(original.uri)?.pending).toEqual({ like: true, repost: true });
  store.applyReaction('repost', { ...original, repostUri: 'repost', repostCount: 3 }, repost);
  store.endReaction(repost);
  expect(store.snapshot(original.uri)?.pending).toEqual({ like: true, repost: false });
  store.applyReaction('like', { ...original, likeUri: 'like', likeCount: 4 }, like);
  store.endReaction(like);
  expect(store.get(original.uri)).toMatchObject({ likeUri: 'like', likeCount: 4, repostUri: 'repost', repostCount: 3 });
});

test('a late reaction merges its viewer delta into newer server counts without double counting an indexed reaction', () => {
  for (const alreadyIndexed of [false, true]) {
    const { store, original } = setup();
    const like = store.beginReaction(original.uri, 'like')!;
    expect(like.beforeCount).toBe(3);
    expect(like.beforeUri).toBeUndefined();
    store.ingest({ ...original, likeCount: 8, likeUri: alreadyIndexed ? 'like' : undefined }, store.ticket());
    store.applyReaction('like', { ...original, likeCount: 4, likeUri: 'like' }, like);
    store.endReaction(like);
    expect(store.get(original.uri)?.likeCount).toBe(alreadyIndexed ? 8 : 9);
    expect(store.get(original.uri)?.likeUri).toBe('like');
  }
});

test('a late unlike decrements the newest count only when the fresh read still includes the viewer reaction', () => {
  for (const alreadyIndexed of [false, true]) {
    const { store, original } = setup();
    const liked = { ...original, likeUri: 'like' };
    store.ingest(liked, store.ticket());
    const unlike = store.beginReaction(original.uri, 'like')!;
    store.ingest({ ...original, likeCount: 8, likeUri: alreadyIndexed ? undefined : 'like' }, store.ticket());
    store.applyReaction('like', { ...liked, likeUri: undefined, likeCount: 2 }, unlike);
    store.endReaction(unlike);
    expect(store.get(original.uri)?.likeCount).toBe(alreadyIndexed ? 8 : 7);
    expect(store.get(original.uri)?.likeUri).toBeUndefined();
  }
});

test('a failed mutation clears pending without replacing the post and old reads cannot overwrite newer reads', () => {
  const { store, original } = setup();
  const stale = store.ticket();
  const recent = store.ticket();
  const mutation = store.beginReaction(original.uri, 'like')!;
  store.endReaction(mutation);
  store.ingest({ ...original, text: 'New server text' }, recent);
  store.ingest(original, stale);
  expect(store.get(original.uri)?.text).toBe('New server text');
  expect(store.snapshot(original.uri)?.pending.like).toBe(false);
});

test('reset rejects reads, writes, and reply publications from an earlier account epoch', () => {
  const { store, original } = setup();
  const oldRead = store.ticket();
  const oldMutation = store.beginReaction(original.uri, 'like')!;
  store.reset('anonymous:2');
  store.reset('account:3');
  store.ingest(original, store.ticket());
  const newMutation = store.beginReaction(original.uri, 'like')!;
  store.ingest({ ...original, text: 'Old account' }, oldRead);
  store.applyReaction('like', { ...original, likeUri: 'old', likeCount: 4 }, oldMutation);
  store.endReaction(oldMutation);
  store.publishReply(post({ uri: 'reply', replyTo: { root: original, parent: original } }), oldRead);
  expect(store.isCurrent(oldRead)).toBe(false);
  expect(store.get(original.uri)?.text).toBe('Original');
  expect(store.get(original.uri)?.likeUri).toBeUndefined();
  expect(store.snapshot(original.uri)?.pending.like).toBe(true);
  expect(store.get('reply')).toBeUndefined();
  store.endReaction(newMutation);
});

test('confirmed replies survive indexing lag, increment once, and retire when a later listing acknowledges them', () => {
  const { store, original } = setup();
  const publication = store.ticket();
  const oldRead = store.ticket();
  const reply = post({ uri: 'reply', replyTo: { root: original, parent: original } });
  store.publishReply(reply, publication);
  store.publishReply(reply, publication);
  expect(store.replies(original.uri)).toEqual([reply]);
  expect(store.get(original.uri)?.replyCount).toBe(1);
  store.ingest(original, oldRead);
  store.acknowledgeReplies(original.uri, [reply], oldRead);
  expect(store.replies(original.uri)).toHaveLength(1);
  const indexed = store.ticket();
  store.ingest({ ...original, replyCount: 1 }, indexed);
  expect(store.get(original.uri)?.replyCount).toBe(1);
  store.acknowledgeReplies(original.uri, [reply], indexed);
  expect(store.replies(original.uri)).toEqual([]);
  expect(store.get(original.uri)?.replyCount).toBe(1);
});

test('snapshots remain referentially stable and notifications are isolated by URI', () => {
  const { store, original } = setup();
  const unrelated = post({ uri: 'other' });
  store.ingest(unrelated, store.ticket());
  let firstChanges = 0;
  let otherChanges = 0;
  const unsubscribe = store.subscribe(original.uri, () => firstChanges++);
  store.subscribe(unrelated.uri, () => otherChanges++);
  const snapshot = store.snapshot(original.uri);
  expect(store.snapshot(original.uri)).toBe(snapshot);
  store.ingest({ ...unrelated, text: 'Changed' }, store.ticket());
  expect(store.snapshot(original.uri)).toBe(snapshot);
  expect(firstChanges).toBe(0);
  expect(otherChanges).toBe(1);
  unsubscribe();
  store.beginReaction(original.uri, 'like');
  expect(firstChanges).toBe(0);
});

test('fresh quote moderation updates every parent teaser without notifying unrelated posts', () => {
  const { store } = setup();
  const quote = post({ uri: 'quote' });
  const a = post({ uri: 'a', quote });
  const b = post({ uri: 'b', quote });
  const unrelated = post({ uri: 'unrelated' });
  store.ingestMany([a, b, unrelated], store.ticket());
  const stale = store.ticket();
  const unrelatedSnapshot = store.snapshot('unrelated');
  const notifications = { a: 0, b: 0, unrelated: 0 };
  for (const uri of ['a', 'b', 'unrelated'] as const) store.subscribe(uri, () => notifications[uri]++);
  store.ingest({ ...quote, text: 'New text', moderation: { hidden: true, blur: true, noOverride: true } }, store.ticket());
  for (const uri of ['a', 'b']) expect(store.get(uri)?.quote).toMatchObject({ text: 'New text', moderation: { hidden: true, noOverride: true } });
  expect(notifications).toEqual({ a: 1, b: 1, unrelated: 0 });
  expect(store.snapshot('unrelated')).toBe(unrelatedSnapshot);
  store.ingest(quote, stale);
  expect(store.get('a')?.quote?.moderation.hidden).toBe(true);
  expect(notifications).toEqual({ a: 1, b: 1, unrelated: 0 });
});

test('replacing and removing a quote disconnects its old dependency', () => {
  const { store } = setup();
  const q = post({ uri: 'q' });
  const r = post({ uri: 'r' });
  store.ingest(post({ uri: 'parent', quote: q }), store.ticket());
  store.ingest(post({ uri: 'parent', quote: r }), store.ticket());
  let changes = 0;
  store.subscribe('parent', () => changes++);
  store.ingest({ ...q, text: 'Old quote changed' }, store.ticket());
  expect(changes).toBe(0);
  store.ingest({ ...r, text: 'New quote changed' }, store.ticket());
  expect(changes).toBe(1);
  expect(store.get('parent')?.quote?.text).toBe('New quote changed');
  store.ingest(post({ uri: 'parent' }), store.ticket());
  const snapshot = store.snapshot('parent');
  store.ingest({ ...r, text: 'Detached quote changed' }, store.ticket());
  expect(store.snapshot('parent')).toBe(snapshot);
  expect(changes).toBe(2);
});

test('canonical quote chains and notifications stop at two levels and cyclic graphs terminate', () => {
  const { store } = setup();
  const d = post({ uri: 'd' });
  const c = post({ uri: 'c', quote: d });
  const b = post({ uri: 'b', quote: c });
  const a = post({ uri: 'a', quote: b });
  store.ingestMany([a, b, c, d], store.ticket());
  expect(store.get('a')?.quote?.quote?.uri).toBe('c');
  expect(store.get('a')?.quote?.quote?.quote).toBeUndefined();
  const snapshotA = store.snapshot('a');
  let changesB = 0;
  store.subscribe('b', () => changesB++);
  store.ingest({ ...d, text: 'Changed deep quote' }, store.ticket());
  expect(store.get('b')?.quote?.quote?.text).toBe('Changed deep quote');
  expect(changesB).toBe(1);
  expect(store.snapshot('a')).toBe(snapshotA);
  const cycleA = post({ uri: 'cycle-a' });
  const cycleB = post({ uri: 'cycle-b', quote: cycleA });
  cycleA.quote = cycleB;
  store.ingest(cycleA, store.ticket());
  expect(store.get('cycle-a')?.quote?.uri).toBe('cycle-b');
  expect(store.get('cycle-a')?.quote?.quote).toBeUndefined();
  expect(() => JSON.stringify(store.get('cycle-a'))).not.toThrow();
});

test('account reset removes quote dependencies and rejects stale quote responses', () => {
  const { store } = setup();
  const quote = post({ uri: 'q' });
  store.ingest(post({ uri: 'parent', quote }), store.ticket());
  const oldRead = store.ticket();
  store.reset('other-account');
  store.ingest(post({ uri: 'parent' }), store.ticket());
  let changes = 0;
  store.subscribe('parent', () => changes++);
  store.ingest(quote, oldRead);
  store.ingest(quote, store.ticket());
  expect(changes).toBe(0);
  expect(store.get('parent')?.quote).toBeUndefined();
});
