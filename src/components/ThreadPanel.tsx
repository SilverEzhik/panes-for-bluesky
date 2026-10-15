import { useCallback, useEffect, useRef, useState } from 'react';
import { bluesky, errorMessage } from '../lib/bluesky';
import { postStore, usePost, useConfirmedReplies } from '../lib/postStore';
import type { Post, Thread } from '../lib/types';
import type { PostActions } from '../lib/ui';
import Icon from './Icon';
import PostView from './PostView';
import { WebPanel } from './LinkPanels';
import './ThreadPanel.css';

export interface ThreadPanelProps extends PostActions {
  initialPost: Post;
  replyRevision: number;
  context?: { url: string; title?: string };
  onShowConversation: () => void;
}

export default function ThreadPanel({ initialPost, replyRevision, context, onShowConversation, ...actions }: ThreadPanelProps) {
  const [thread, setThread] = useState<Thread>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const { post: primary } = usePost(thread?.post ?? initialPost);
  const confirmedReplies = useConfirmedReplies(initialPost.uri);
  const load = useCallback(async () => {
    const current = ++generation.current;
    const ticket = postStore.ticket();
    setBusy(true);
    setError('');
    try {
      const next = await bluesky.thread(initialPost.uri);
      if (current !== generation.current || !postStore.isCurrent(ticket)) return;
      postStore.ingestMany([next.post, ...next.parents, ...next.replies], ticket, !next.offline);
      postStore.acknowledgeReplies(initialPost.uri, next.replies, ticket);
      setThread(next);
    } catch (cause) {
      if (current === generation.current && postStore.isCurrent(ticket)) setError(errorMessage(cause));
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }, [initialPost.uri]);
  useEffect(() => {
    void load();
    return () => { generation.current++; };
  }, [load, replyRevision]);
  const replies = [...new Map([...(thread?.replies ?? []), ...confirmedReplies].map(post => [post.uri, post])).values()];
  if (context) return <div className="thread-context">
    <div className="thread-context-header">
      <PostView post={primary} detail contextHeader {...actions} onOpen={onShowConversation} />
      <div className="thread-context-dateline">
        <time dateTime={primary.createdAt}>{new Date(primary.createdAt).toLocaleString()}</time>
        <button onClick={onShowConversation}>Show conversation</button>
      </div>
    </div>
    <div className="thread-context-browser"><WebPanel key={context.url} url={context.url} title={context.title} /></div>
  </div>;
  return <div className="detail-scroll">
    {thread?.offline && <div className="connection-banner">Saved conversation · {thread.savedAt ? new Date(thread.savedAt).toLocaleString() : 'offline'}</div>}
    {thread?.parents.map(post => <PostView key={post.uri} post={post} {...actions} />)}
    <PostView post={primary} detail {...actions} />
    <div className="post-dateline">
      <time dateTime={primary.createdAt}>{new Date(primary.createdAt).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })}</time>
      <a href={`https://bsky.app/profile/${primary.author.did}/post/${primary.uri.split('/').pop()}`} target="_blank" rel="noreferrer">View on Bluesky <Icon name="link" size={12} /></a>
    </div>
    <div className="conversation-divider">
      {primary.replyCount ? `${primary.replyCount.toLocaleString()} ${primary.replyCount === 1 ? 'reply' : 'replies'}` : 'Conversation'}
      <button disabled={primary.moderation.noOverride} onClick={() => actions.onReply(primary)}><Icon name="reply" size={14} /> Reply</button>
    </div>
    {busy && !thread && <div className="loading-state" role="status"><span className="spinner" />Loading conversation…</div>}
    {error && <div className="inline-error" role="alert"><p>{error}</p><button className="metal-button" onClick={() => void load()}>Try again</button></div>}
    {replies.map(post => <div className="thread-reply" key={post.uri}>
      {post.replyTo?.parent.uri !== primary.uri && post.replyTo && <p className="reply-context">Replying within this conversation</p>}
      <PostView post={post} {...actions} />
    </div>)}
    {!busy && !error && !replies.length && <p className="quiet-message">Be the first to join the conversation.</p>}
    <button className="panel-reply-button metal-button" disabled={primary.moderation.noOverride} onClick={() => actions.onReply(primary)}><Icon name="reply" size={17} /> Reply to {primary.author.displayName || primary.author.handle}</button>
  </div>;
}
