import type { Post, PostImage, Profile } from './types';

export interface PostActions {
  onOpen: (post: Post) => void;
  onProfile: (profile: Profile) => void;
  onReply: (post: Post) => void;
  onLike: (post: Post) => void;
  onRepost: (post: Post) => void;
  onMention: (actor: string) => void;
  onTag: (tag: string) => void;
  onExternal: (url: string, title: string | undefined, source: Post) => void;
  onMedia: (images: PostImage[], initialIndex: number) => void;
}
