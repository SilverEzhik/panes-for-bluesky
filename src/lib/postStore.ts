import { useCallback, useSyncExternalStore } from 'react';
import type { Post } from './types';

export type ReactionKind = 'like' | 'repost';
export interface ReadTicket { readonly epoch: number; readonly revision: number }
export interface ReactionTicket extends ReadTicket {
  readonly uri: string;
  readonly kind: ReactionKind;
  readonly beforeUri?: string;
  readonly beforeCount: number;
}
export interface PostSnapshot { post: Post; pending: Readonly<Record<ReactionKind, boolean>> }
interface Patch { revision: number; uri?: string; count: number }
interface Entry {
  base: Post;
  readRevision: number;
  patches: Partial<Record<ReactionKind, Patch>>;
  pending: Partial<Record<ReactionKind, ReactionTicket>>;
  snapshot: PostSnapshot;
}
interface ConfirmedReply { post: Post; revision: number; countFloor: number }
const emptyReplies: readonly Post[] = Object.freeze([]);

/** Account-scoped entities. Reads own content; successful writes own only their changed fields. */
export class PostStore {
  private epoch = 0;
  private revision = 0;
  private scope: string | undefined;
  private entries = new Map<string, Entry>();
  private listeners = new Map<string, Set<() => void>>();
  private confirmed = new Map<string, Map<string, ConfirmedReply>>();
  private replySnapshots = new Map<string, readonly Post[]>();
  private quoteParents = new Map<string, Set<string>>();

  reset(scope: string): void {
    if (scope === this.scope) return;
    this.scope = scope;
    this.epoch++;
    this.entries.clear();
    this.quoteParents.clear();
    this.confirmed.clear();
    this.replySnapshots.clear();
    for (const callbacks of this.listeners.values()) for (const callback of callbacks) callback();
  }

  ticket(): ReadTicket { return { epoch: this.epoch, revision: ++this.revision }; }
  isCurrent(ticket: ReadTicket): boolean { return ticket.epoch === this.epoch; }
  subscribe(uri: string, callback: () => void): () => void {
    let callbacks = this.listeners.get(uri);
    if (!callbacks) this.listeners.set(uri, callbacks = new Set());
    callbacks.add(callback);
    return () => { callbacks.delete(callback); if (!callbacks.size) this.listeners.delete(uri); };
  }
  private emit(uri: string): void { for (const callback of this.listeners.get(uri) ?? []) callback(); }

  private materialize(base: Post, depth = 0, visited = new Set<string>()): Post {
    const entry = this.entries.get(base.uri);
    const post = { ...(entry?.base ?? base) };
    const like = entry?.patches.like;
    const repost = entry?.patches.repost;
    if (like) { post.likeUri = like.uri; post.likeCount = like.count; }
    if (repost) { post.repostUri = repost.uri; post.repostCount = repost.count; }
    for (const reply of this.confirmed.get(post.uri)?.values() ?? []) post.replyCount = Math.max(post.replyCount, reply.countFloor);
    visited.add(post.uri);
    if (post.quote) {
      post.quote = depth < 2 && !visited.has(post.quote.uri)
        ? this.materialize(post.quote, depth + 1, visited)
        : undefined;
    }
    return post;
  }

  private refresh(...changed: string[]): void {
    const affected = new Set(changed);
    let frontier = changed;
    // Only two quote levels are materialized, matching the API normalizer.
    for (let depth = 0; depth < 2; depth++) {
      const next: string[] = [];
      for (const uri of frontier) for (const parent of this.quoteParents.get(uri) ?? []) {
        if (!affected.has(parent)) { affected.add(parent); next.push(parent); }
      }
      frontier = next;
    }
    // Build all affected snapshots before any subscriber can observe them.
    for (const uri of affected) {
      const entry = this.entries.get(uri);
      if (entry) entry.snapshot = { post: this.materialize(entry.base), pending: { like: !!entry.pending.like, repost: !!entry.pending.repost } };
    }
    for (const uri of affected) this.emit(uri);
  }

  private ingestTree(post: Post, ticket: ReadTicket, authoritative: boolean, changed: Set<string>, visited: Set<string>, depth: number): void {
    if (depth > 2 || visited.has(post.uri)) return;
    visited.add(post.uri);
    let entry = this.entries.get(post.uri);
    if (entry && ticket.revision < entry.readRevision) return;
    const previousQuote = entry?.base.quote?.uri;
    const nextQuote = post.quote?.uri;
    if (previousQuote !== nextQuote) {
      if (previousQuote) {
        const parents = this.quoteParents.get(previousQuote);
        parents?.delete(post.uri);
        if (!parents?.size) this.quoteParents.delete(previousQuote);
      }
      if (nextQuote) {
        let parents = this.quoteParents.get(nextQuote);
        if (!parents) this.quoteParents.set(nextQuote, parents = new Set());
        parents.add(post.uri);
      }
    }
    if (!entry) {
      entry = { base: post, readRevision: ticket.revision, patches: {}, pending: {}, snapshot: { post, pending: { like: false, repost: false } } };
      this.entries.set(post.uri, entry);
    } else {
      entry.base = post;
      entry.readRevision = ticket.revision;
      for (const kind of ['like', 'repost'] as const) {
        if (authoritative && entry.patches[kind] && ticket.revision > entry.patches[kind].revision) delete entry.patches[kind];
      }
    }
    changed.add(post.uri);
    if (post.quote) this.ingestTree(post.quote, ticket, authoritative, changed, visited, depth + 1);
  }
  ingest(post: Post, ticket: ReadTicket, authoritative = true): void {
    this.ingestMany([post], ticket, authoritative);
  }
  ingestMany(posts: readonly Post[], ticket: ReadTicket, authoritative = true): void {
    if (!this.isCurrent(ticket)) return;
    const changed = new Set<string>();
    for (const post of posts) this.ingestTree(post, ticket, authoritative, changed, new Set(), 0);
    this.refresh(...changed);
  }
  get(uri: string): Post | undefined { return this.entries.get(uri)?.snapshot.post; }
  snapshot(uri: string): PostSnapshot | undefined { return this.entries.get(uri)?.snapshot; }

  beginReaction(uri: string, kind: ReactionKind): ReactionTicket | null {
    const entry = this.entries.get(uri);
    if (!entry || entry.pending[kind]) return null;
    const post = entry.snapshot.post;
    const ticket = {
      ...this.ticket(), uri, kind,
      beforeUri: kind === 'like' ? post.likeUri : post.repostUri,
      beforeCount: kind === 'like' ? post.likeCount : post.repostCount,
    };
    entry.pending[kind] = ticket;
    this.refresh(uri);
    return ticket;
  }
  applyReaction(kind: ReactionKind, result: Post, ticket: ReactionTicket): void {
    const entry = this.entries.get(ticket.uri);
    if (!this.isCurrent(ticket) || !entry || kind !== ticket.kind || result.uri !== ticket.uri || entry.pending[kind] !== ticket) return;
    const latest = entry.snapshot.post;
    const currentUri = kind === 'like' ? latest.likeUri : latest.repostUri;
    const currentCount = kind === 'like' ? latest.likeCount : latest.repostCount;
    const desiredUri = kind === 'like' ? result.likeUri : result.repostUri;
    // The API result spreads the post captured before the request. Its count may
    // predate a newer feed read. Apply only the viewer-state delta still missing
    // from the current entity; an indexed reaction needs no second increment.
    const delta = Number(!!desiredUri) - Number(!!currentUri);
    entry.patches[kind] = {
      revision: ++this.revision,
      uri: desiredUri,
      count: Math.max(0, currentCount + delta),
    };
    this.refresh(ticket.uri);
  }
  endReaction(ticket: ReactionTicket): void {
    const entry = this.entries.get(ticket.uri);
    if (!this.isCurrent(ticket) || !entry || entry.pending[ticket.kind] !== ticket) return;
    delete entry.pending[ticket.kind];
    this.refresh(ticket.uri);
  }

  publishReply(reply: Post, ticket: ReadTicket): void {
    if (!this.isCurrent(ticket)) return;
    const parentUri = reply.replyTo?.parent.uri;
    const committed = this.ticket();
    this.ingest(reply, committed);
    if (!parentUri) return;
    let replies = this.confirmed.get(parentUri);
    if (!replies) this.confirmed.set(parentUri, replies = new Map());
    if (replies.has(reply.uri)) return;
    replies.set(reply.uri, { post: reply, revision: committed.revision, countFloor: (this.get(parentUri)?.replyCount ?? 0) + 1 });
    this.updateReplies(parentUri);
  }
  acknowledgeReplies(parentUri: string, serverReplies: readonly Post[], ticket: ReadTicket): void {
    if (!this.isCurrent(ticket)) return;
    const replies = this.confirmed.get(parentUri);
    if (!replies) return;
    let changed = false;
    for (const post of serverReplies) {
      const local = replies.get(post.uri);
      if (local && ticket.revision > local.revision) { replies.delete(post.uri); changed = true; }
    }
    if (changed) this.updateReplies(parentUri);
  }
  private updateReplies(parentUri: string): void {
    this.replySnapshots.set(parentUri, [...(this.confirmed.get(parentUri)?.values() ?? [])].map(reply => reply.post));
    const entry = this.entries.get(parentUri);
    if (entry) this.refresh(parentUri); else this.emit(parentUri);
  }
  replies(parentUri: string): readonly Post[] { return this.replySnapshots.get(parentUri) ?? emptyReplies; }
}

export const postStore = new PostStore();

export function usePost(fallback: Post): PostSnapshot {
  const subscribe = useCallback((callback: () => void) => postStore.subscribe(fallback.uri, callback), [fallback.uri]);
  const snapshot = useSyncExternalStore(subscribe, () => postStore.snapshot(fallback.uri));
  return snapshot ?? { post: fallback, pending: { like: false, repost: false } };
}

export function useConfirmedReplies(parentUri: string): readonly Post[] {
  const subscribe = useCallback((callback: () => void) => postStore.subscribe(parentUri, callback), [parentUri]);
  return useSyncExternalStore(subscribe, () => postStore.replies(parentUri));
}
