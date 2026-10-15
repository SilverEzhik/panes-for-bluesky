import PostCard, { type PostCardProps } from './PostCard';
import { usePost } from '../lib/postStore';
import type { Post } from '../lib/types';

export interface PostViewProps extends Omit<PostCardProps, 'onExternal'> {
  onExternal?: (url: string, title: string | undefined, source: Post) => void;
}

/** Every visible copy reads the same entity and independent reaction state. */
export default function PostView(props: PostViewProps) {
  const state = usePost(props.post);
  const pendingActions: ('like' | 'repost')[] = [];
  if (state.pending.like) pendingActions.push('like');
  if (state.pending.repost) pendingActions.push('repost');
  return <PostCard {...props} post={state.post} pendingActions={pendingActions}
    onExternal={props.onExternal ? (url, title) => props.onExternal!(url, title, state.post) : undefined} />;
}
