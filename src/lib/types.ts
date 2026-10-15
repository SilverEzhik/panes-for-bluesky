export interface OfflineMetadata { offline?: boolean; savedAt?: number }

export interface ModerationState { hidden: boolean; blur: boolean; noOverride: boolean; warning?: string }

export interface Profile extends OfflineMetadata {
  moderation?: ModerationState & { avatar: boolean; banner: boolean; displayName: boolean };
  did: string;
  handle: string;
  displayName: string;
  avatar?: string;
  banner?: string;
  description?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
  following?: string;
  followedBy?: string;
  muted?: boolean;
  blocked?: boolean;
}

export interface TextSegment {
  text: string;
  href?: string;
  mention?: string;
  tag?: string;
}

export interface PostImage {
  thumb: string;
  fullsize: string;
  alt: string;
  aspectRatio?: { width: number; height: number };
}

export interface FeedGenerator {
  uri: string;
  cid: string;
  displayName: string;
  description?: string;
  avatar?: string;
  creator: Profile;
  likeCount: number;
  pinned?: boolean;
  moderation: ModerationState;
}

export interface Post {
  uri: string;
  cid: string;
  author: Profile;
  text: string;
  segments: TextSegment[];
  createdAt: string;
  indexedAt: string;
  replyCount: number;
  repostCount: number;
  likeCount: number;
  likeUri?: string;
  repostUri?: string;
  repostedBy?: Profile;
  replyTo?: { root: { uri: string; cid: string }; parent: { uri: string; cid: string } };
  images: PostImage[];
  external?: { uri: string; title: string; description: string; thumb?: string };
  video?: { playlist: string; thumbnail?: string; alt?: string; aspectRatio?: { width: number; height: number } };
  quote?: Post;
  feedGenerator?: FeedGenerator;
  unavailableQuote?: string;
  labels: string[];
  moderation: ModerationState;
}

export interface Page<T> extends OfflineMetadata { items: T[]; cursor?: string }
export type FeedPage = Page<Post>;

export interface Thread extends OfflineMetadata {
  post: Post;
  parents: Post[];
  replies: Post[];
}

export interface Notification {
  moderation?: ModerationState;
  uri: string;
  cid: string;
  author: Profile;
  reason: string;
  reasonSubject?: string;
  isRead: boolean;
  indexedAt: string;
  post?: Post;
}

export interface SessionUser extends Profile {
  service: string;
  /** Offline means remembered local identity; no server authentication is asserted. */
  connection?: 'verified' | 'offline';
}
