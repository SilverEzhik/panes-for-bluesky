import type { FeedGenerator, Post, PostImage } from "../lib/types";
import "./TimelineAttachments.css";

interface TimelineAttachmentsProps {
  post: Post;
  onOpen: (post: Post) => void;
  onExternal?: (url: string, title?: string) => void;
  onMedia?: (images: PostImage[], initialIndex: number) => void;
}

function linkHost(uri: string) {
  try {
    return new URL(uri).hostname.replace(/^www\./, "");
  } catch {
    return uri;
  }
}

export function FeedGeneratorPreview({ feed, onExternal }: {
  feed: FeedGenerator;
  onExternal?: (url: string, title?: string) => void;
}) {
  if (feed.moderation.hidden || feed.moderation.noOverride || feed.moderation.blur) {
    return <div className="timeline-preview-card"><span className="timeline-preview-body">{feed.moderation.warning || 'This feed is unavailable.'}</span></div>;
  }
  const uri = `https://bsky.app/profile/${feed.creator.did}/feed/${feed.uri.split("/").pop()}`;
  return (
    <a
      className="timeline-preview-card timeline-feed-preview"
      href={uri}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => {
        event.stopPropagation();
        if (onExternal && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
          event.preventDefault();
          onExternal(uri, feed.displayName);
        }
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {feed.avatar && <img className="timeline-link-thumbnail" src={feed.avatar} alt="" loading="lazy" decoding="async" />}
      <span className="timeline-preview-body">
        <span className="timeline-preview-host">Custom feed · by @{feed.creator.handle}</span>
        <strong className="timeline-preview-title">{feed.displayName}</strong>
        {feed.description && <span className="timeline-preview-description">{feed.description}</span>}
        <span className="timeline-preview-host">Explore feed →</span>
      </span>
    </a>
  );
}

export default function TimelineAttachments({
  post,
  onOpen,
  onExternal,
  onMedia,
}: TimelineAttachmentsProps) {
  const quote = post.quote;
  const quoteAuthor = quote && (quote.author.displayName || quote.author.handle);
  const quoteProtected = quote && (
    quote.moderation.hidden || quote.moderation.blur || quote.moderation.noOverride
  );
  if (!post.images.length && !post.video && !post.external && !post.feedGenerator && !quote && !post.unavailableQuote)
    return null;

  return (
    <div className="timeline-attachments" onKeyDown={(event) => event.stopPropagation()}>
      {post.images.length > 0 && (
        <div className={`timeline-image-grid timeline-image-grid-${Math.min(post.images.length, 4)}`}>
          {post.images.map((image, index) => (
            <a
              key={`${image.fullsize}-${index}`}
              className="timeline-image-link"
              href={image.fullsize}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={image.alt || `View image ${index + 1} of ${post.images.length}`}
              onClick={(event) => {
                event.stopPropagation();
                if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                  event.preventDefault();
                  if (onMedia) onMedia(post.images, index);
                  else onOpen(post);
                }
              }}
            >
              <img src={image.thumb || image.fullsize} alt={image.alt} loading="lazy" decoding="async" />
              {image.alt && <span className="timeline-alt-badge" aria-hidden="true">ALT</span>}
            </a>
          ))}
        </div>
      )}
      {post.video && (
        <button
          type="button"
          className="timeline-video-preview"
          aria-label="Watch video"
          onClick={(event) => { event.stopPropagation(); onOpen(post); }}
        >
          {post.video.thumbnail && (
            <img src={post.video.thumbnail} alt={post.video.alt || ""} loading="lazy" decoding="async" />
          )}
          <span className="timeline-play-button" aria-hidden="true">▶</span>
          <span className="timeline-video-caption">Watch video</span>
        </button>
      )}
      {post.external && (
        <a
          className="timeline-preview-card timeline-external-preview"
          href={post.external.uri}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => {
            event.stopPropagation();
            if (onExternal && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
              event.preventDefault();
              onExternal(post.external!.uri, post.external!.title);
            }
          }}
        >
          {post.external.thumb && (
            <img className="timeline-link-thumbnail" src={post.external.thumb} alt="" loading="lazy" decoding="async" />
          )}
          <span className="timeline-preview-body">
            <span className="timeline-preview-host">{linkHost(post.external.uri)}</span>
            <strong className="timeline-preview-title">{post.external.title || post.external.uri}</strong>
            {post.external.description && <span className="timeline-preview-description">{post.external.description}</span>}
          </span>
        </a>
      )}
      {post.feedGenerator && <FeedGeneratorPreview feed={post.feedGenerator} onExternal={onExternal} />}
      {quote && (
        <button
          type="button"
          className="timeline-preview-card timeline-quote-preview"
          onClick={(event) => { event.stopPropagation(); onOpen(quote); }}
        >
          <span className="timeline-preview-body">
            <span className="timeline-preview-host">Quoted post by {quoteAuthor}</span>
            {quoteProtected ? (
              <span className="timeline-preview-description">{quote.moderation.warning || "Content warning"}</span>
            ) : (
              <>
                <span className="timeline-quote-text">{quote.text}</span>
                {quote.external && <strong className="timeline-preview-title">{quote.external.title || quote.external.uri}</strong>}
              </>
            )}
          </span>
          {!quoteProtected && (quote.images[0] || quote.video?.thumbnail || quote.external?.thumb) && (
            <img
              className="timeline-quote-thumbnail"
              src={quote.images[0]?.thumb || quote.video?.thumbnail || quote.external?.thumb}
              alt={quote.images[0]?.alt || quote.video?.alt || ""}
              loading="lazy"
              decoding="async"
            />
          )}
        </button>
      )}
      {post.unavailableQuote && <small className="timeline-unavailable-quote">Quoted post is unavailable.</small>}
    </div>
  );
}
