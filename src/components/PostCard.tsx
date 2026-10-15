import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { bindGestureSurface } from "../lib/gestureSurface";
import type { Post, PostImage, Profile, TextSegment } from "../lib/types";
import Icon from "./Icon";
import MediaVideo from "./MediaVideo";
import TimelineAttachments, { FeedGeneratorPreview } from "./TimelineAttachments";

export interface AvatarProps {
  profile: Profile;
  size?: number;
  className?: string;
}

export function Avatar({ profile, size = 48, className = "" }: AvatarProps) {
  const name = profile.moderation?.displayName ? profile.handle : profile.displayName || profile.handle;
  return profile.avatar && !profile.moderation?.avatar ? (
    <img
      className={`avatar ${className}`}
      src={profile.avatar}
      width={size}
      height={size}
      style={{ "--avatar-size": `${size}px` } as CSSProperties}
      alt=""
      loading="lazy"
    />
  ) : (
    <span
      className={`avatar avatar-placeholder ${className}`}
      aria-hidden="true"
      style={{ "--avatar-size": `${size}px` } as CSSProperties}
    >
      {name.slice(0, 1).toLocaleUpperCase()}
    </span>
  );
}

export interface PostCardProps {
  post: Post;
  onOpen: (post: Post) => void;
  onProfile: (profile: Profile) => void;
  onReply: (post: Post) => void;
  onLike: (post: Post) => void;
  onRepost: (post: Post) => void;
  selected?: boolean;
  detail?: boolean;
  contextHeader?: boolean;
  pendingActions?: readonly ("like" | "repost")[];
  onMention?: (actor: string) => void;
  onTag?: (tag: string) => void;
  onExternal?: (url: string, title?: string) => void;
  onMedia?: (images: PostImage[], initialIndex: number) => void;
}

function shortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== new Date().getFullYear()
      ? { year: "numeric" as const }
      : {}),
  });
}

function count(value: number) {
  return value > 0
    ? new Intl.NumberFormat(undefined, {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value)
    : "";
}

const stop = (event: MouseEvent) => event.stopPropagation();

function navigate(event: MouseEvent, open?: () => void) {
  event.stopPropagation();
  if (
    open &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  ) {
    event.preventDefault();
    open();
  }
}

interface GesturePoint {
  id: number;
  x: number;
  y: number;
}
interface GestureStart {
  points: GesturePoint[];
  time: number;
}
const gestureControls =
  'a, button, input, textarea, select, summary, video, [contenteditable="true"]';

/** One owner per contact sequence. Native touch owns touch recognition when present;
 * Pointer Events provide a fallback for environments that do not dispatch TouchEvents. */
function usePostLaunchGesture(
  open: (kind: "pinch" | "pull-down") => void,
  enabled: boolean,
) {
  const ref = useRef<HTMLElement>(null);
  const openRef = useRef(open);
  const suppressClick = useRef(false);
  openRef.current = open;
  useEffect(() => {
    const root = ref.current;
    if (!root || !enabled) return;
    const pointers = new Map<number, GesturePoint>();
    let pointerStart: GestureStart | null = null;
    let pointerBlocked = false;
    let nativeTouch = false;
    let touchStart: GestureStart | null = null;
    let touchBlocked = false;
    let touchOwned = false;
    let contactFired = false;
    const eligible = (target: EventTarget | null) =>
      target instanceof Element && root.contains(target) && !target.closest(gestureControls);
    const start = (points: GesturePoint[]): GestureStart | null =>
      points.length === 2 ? { points: points.map(point => ({ ...point })), time: performance.now() } : null;
    const launch = (kind: "pinch" | "pull-down", contact = false) => {
      if (contact && contactFired) return;
      if (contact) contactFired = true;
      suppressClick.current = true;
      pointerStart = null;
      touchStart = null;
      openRef.current(kind);
    };
    const recognize = (points: GesturePoint[], initial: GestureStart | null) => {
      if (!initial || contactFired || points.length !== 2 || performance.now() - initial.time > 1800) return;
      const [a, b] = initial.points.map(point => points.find(current => current.id === point.id));
      if (!a || !b) return;
      const [originalA, originalB] = initial.points;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const originalDistance = Math.hypot(originalA.x - originalB.x, originalA.y - originalB.y);
      const dyA = a.y - originalA.y;
      const dyB = b.y - originalB.y;
      const pinchApart = distance - originalDistance >= 42 && distance >= originalDistance * 1.3;
      const pullDown = dyA >= 44 && dyB >= 44 && Math.abs(dyA - dyB) < 50 &&
        Math.abs(a.x - originalA.x) < dyA * 0.7 && Math.abs(b.x - originalB.x) < dyB * 0.7;
      if (pinchApart || pullDown) launch(pinchApart ? "pinch" : "pull-down", true);
    };
    const releasePointers = () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", cancel, true);
    };
    const down = (event: PointerEvent) => {
      if (event.pointerType !== "touch") {
        if (event.isPrimary && event.button === 0 && !pointers.size && !nativeTouch) suppressClick.current = false;
        return;
      }
      if (pointers.has(event.pointerId)) return;
      if (!pointers.size) {
        if (!eligible(event.target)) return;
        suppressClick.current = false;
        contactFired = false;
        pointerBlocked = false;
        document.addEventListener("pointerdown", down, true);
        document.addEventListener("pointermove", move, true);
        document.addEventListener("pointerup", up, true);
        document.addEventListener("pointercancel", cancel, true);
      }
      pointers.set(event.pointerId, { id: event.pointerId, x: event.clientX, y: event.clientY });
      if (!eligible(event.target) || pointers.size > 2) pointerBlocked = true;
      pointerStart = pointerBlocked ? null : start([...pointers.values()]);
    };
    const move = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { id: event.pointerId, x: event.clientX, y: event.clientY });
      if (!nativeTouch && !pointerBlocked) recognize([...pointers.values()], pointerStart);
    };
    const up = (event: PointerEvent) => {
      if (!pointers.delete(event.pointerId)) return;
      pointerStart = null;
      if (!pointers.size) releasePointers();
    };
    const cancel = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      pointerBlocked = true;
      // A native pan that started before two contacts arrived cannot be stolen.
      if (nativeTouch && !touchOwned) touchBlocked = true;
      up(event);
    };
    const releaseTouches = () => {
      document.removeEventListener("touchstart", touchDown, true);
      document.removeEventListener("touchmove", touchMove, true);
      document.removeEventListener("touchend", touchUp, true);
      document.removeEventListener("touchcancel", touchCancel, true);
    };
    const touchPoints = (event: TouchEvent) => Array.from(event.touches).map(touch => ({
      id: touch.identifier, x: touch.clientX, y: touch.clientY,
    }));
    const touchDown = (event: TouchEvent) => {
      if (!nativeTouch) {
        if (!eligible(event.target)) return;
        nativeTouch = true;
        touchBlocked = false;
        touchOwned = false;
        contactFired = false;
        suppressClick.current = false;
        document.addEventListener("touchstart", touchDown, { capture: true, passive: false });
        document.addEventListener("touchmove", touchMove, { capture: true, passive: false });
        document.addEventListener("touchend", touchUp, true);
        document.addEventListener("touchcancel", touchCancel, true);
      }
      if (event.touches.length > 2 || Array.from(event.touches).some(touch => !eligible(touch.target))) {
        touchBlocked = true;
        touchOwned = false;
      }
      if (touchBlocked || contactFired || event.touches.length !== 2) return;
      if (!event.cancelable) { touchBlocked = true; return; }
      event.preventDefault();
      touchOwned = event.defaultPrevented;
      touchStart = touchOwned ? start(touchPoints(event)) : null;
    };
    const touchMove = (event: TouchEvent) => {
      if (!touchOwned) {
        // Let the first single-finger move remain native, and don't steal its pan later.
        if (event.touches.length === 1) touchBlocked = true;
        return;
      }
      if (!event.cancelable) { touchBlocked = true; touchStart = null; return; }
      event.preventDefault();
      if (!touchBlocked) recognize(touchPoints(event), touchStart);
    };
    const touchUp = (event: TouchEvent) => {
      touchStart = null;
      if (!event.touches.length) {
        nativeTouch = false;
        touchOwned = false;
        touchBlocked = false;
        releaseTouches();
      } else touchBlocked = true;
    };
    const touchCancel = (event: TouchEvent) => {
      touchBlocked = true;
      touchUp(event);
    };
    // Native contact eligibility remains local: post actions must not steal a
    // one-finger reading scroll. The shared recognizer owns trackpad/Safari
    // scale and burst routing, including continuation over an opened popup.
    let surfaceFired = false;
    let surfaceTouchGesture = false;
    const surface = bindGestureSurface(root, {
      pinch: true,
      pointer: () => false,
      wheel: event => event.ctrlKey && eligible(event.target),
      safari: event => eligible(event.target) && !(nativeTouch && touchBlocked),
      onGesture: gesture => {
        if (gesture.kind !== "pinch") return false;
        if (gesture.phase === "start") {
          surfaceFired = false;
          surfaceTouchGesture = nativeTouch || pointers.size > 0;
        }
        if (gesture.phase === "change" && !surfaceFired &&
          !(gesture.source === "safari" && (surfaceTouchGesture || nativeTouch || pointers.size >= 2)) &&
          gesture.scale >= 1.3) {
          surfaceFired = true;
          launch("pinch");
        }
        return true;
      },
    });
    const reset = () => {
      pointers.clear(); pointerStart = null; touchStart = null;
      nativeTouch = false; touchOwned = false; touchBlocked = false;
      releasePointers(); releaseTouches(); surface.cancel();
    };
    const visibility = () => { if (document.hidden) reset(); };
    root.addEventListener("pointerdown", down);
    root.addEventListener("touchstart", touchDown, { passive: false });
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      reset();
      root.removeEventListener("pointerdown", down);
      root.removeEventListener("touchstart", touchDown);
      surface.dispose();
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [enabled]);
  return { ref, suppressClick };
}

const labelNames: Record<string, string> = {
  porn: "Adult content",
  sexual: "Sexually suggestive content",
  nudity: "Nudity",
  "graphic-media": "Graphic content",
  "!warn": "Content warning",
  "!hide": "Hidden content",
};

function ContentWarning({
  labels,
  moderation,
  children,
}: {
  labels: string[];
  moderation: Post["moderation"];
  children: ReactNode;
}) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => setRevealed(false), [moderation.hidden, moderation.blur, moderation.noOverride, moderation.warning]);
  const warnings = [...new Set(labels.filter(label => label !== "!no-unauthenticated"))];
  const explanation =
    moderation.warning ||
    warnings
      .map((label) => labelNames[label] || label.replaceAll("-", " "))
      .join(", ") ||
    "Content warning";
  if (moderation.noOverride)
    return (
      <div className="content-warning content-unavailable" role="note">
        {explanation}. This content cannot be displayed.
      </div>
    );
  if (!moderation.hidden && !moderation.blur)
    return children;
  return (
    <details className="content-warning" open={revealed} onToggle={event => setRevealed(event.currentTarget.open)}>
      <summary onClick={stop}>
        Content warning: {explanation}. <span>Show post</span>
      </summary>
      {revealed ? children : null}
    </details>
  );
}

type PostTextProps = Pick<
  PostCardProps,
  "onMention" | "onTag" | "onExternal"
> & { segments: TextSegment[]; text: string };

function PostText({
  segments,
  text,
  onMention,
  onTag,
  onExternal,
}: PostTextProps) {
  return (
    <div className="post-text" dir="auto">
      {segments.length
        ? segments.map((segment, index) => {
            const href =
              segment.href ||
              (segment.mention
                ? `https://bsky.app/profile/${encodeURIComponent(segment.mention)}`
                : segment.tag
                  ? `https://bsky.app/hashtag/${encodeURIComponent(segment.tag)}`
                  : undefined);
            const open =
              segment.mention && onMention
                ? () => onMention(segment.mention!)
                : segment.tag && onTag
                  ? () => onTag(segment.tag!)
                  : segment.href && onExternal
                    ? () => onExternal(segment.href!, segment.text)
                    : undefined;
            return href ? (
              <a
                key={index}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => navigate(event, open)}
              >
                {segment.text}
              </a>
            ) : (
              <span key={index}>{segment.text}</span>
            );
          })
        : text}
    </div>
  );
}

export default function PostCard({
  post,
  onOpen,
  onProfile,
  onReply,
  onLike,
  onRepost,
  selected = false,
  detail = false,
  contextHeader = false,
  pendingActions = [],
  onMention,
  onTag,
  onExternal,
  onMedia,
}: PostCardProps) {
  const authorName = post.author.displayName || post.author.handle;
  const navigation = { onMention, onTag, onExternal };
  const [peek, setPeek] = useState<{ x: number; y: number } | null>(null);
  const peekRef = useRef<HTMLElement>(null);
  const gesture = usePostLaunchGesture(
    (kind) => {
      if (kind === "pull-down") onOpen(post);
      else {
        const bounds = gesture.ref.current?.getBoundingClientRect();
        if (bounds)
          setPeek({
            x: Math.max(
              12,
              Math.min(bounds.left + 60, window.innerWidth - 292),
            ),
            y: Math.max(
              12,
              Math.min(bounds.top + 20, window.innerHeight - 240),
            ),
          });
      }
    },
    !detail && !post.moderation.hidden && !post.moderation.noOverride,
  );
  useLayoutEffect(() => {
    if (!peek) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const popup = peekRef.current;
    popup?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      // A popup action may have focused a newly opened panel already.
      if (document.activeElement !== document.body && !popup?.contains(document.activeElement)) return;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
      else gesture.ref.current?.querySelector<HTMLButtonElement>(".post-conversation-opener")?.focus();
    };
  }, [peek]);
  function action(event: MouseEvent, handler: (post: Post) => void) {
    event.stopPropagation();
    setPeek(null);
    handler(post);
  }

  if (post.moderation.hidden && !detail) return null;

  const actions = (
    <>
      <button
        type="button"
        className="post-action"
        aria-label={`Reply${post.replyCount ? `, ${post.replyCount} replies` : ""}`}
        onClick={(event) => action(event, onReply)}
      >
        <img
          className="original-action original-action-reply"
          src={`${import.meta.env.BASE_URL}assets/original/reply.png`}
          alt=""
        />
        <span>{count(post.replyCount)}</span>
      </button>
      <button
        type="button"
        className={`post-action${post.repostUri ? " active reposted" : ""}`}
        aria-label={`${post.repostUri ? "Undo repost" : "Repost"}${post.repostCount ? `, ${post.repostCount} reposts` : ""}`}
        aria-pressed={Boolean(post.repostUri)}
        disabled={pendingActions.includes("repost")}
        aria-busy={pendingActions.includes("repost") || undefined}
        onClick={(event) => action(event, onRepost)}
      >
        <img
          className="original-action original-action-repost"
          src={`${import.meta.env.BASE_URL}assets/original/retweet-outline-button-item.png`}
          alt=""
        />
        <span>{count(post.repostCount)}</span>
      </button>
      <button
        type="button"
        className={`post-action${post.likeUri ? " active liked" : ""}`}
        aria-label={`${post.likeUri ? "Unlike" : "Like"}${post.likeCount ? `, ${post.likeCount} likes` : ""}`}
        aria-pressed={Boolean(post.likeUri)}
        disabled={pendingActions.includes("like")}
        aria-busy={pendingActions.includes("like") || undefined}
        onClick={(event) => action(event, onLike)}
      >
        <img
          className="original-action original-action-like"
          src={`${import.meta.env.BASE_URL}assets/original/${post.likeUri ? "star.png" : "star-hollow.png"}`}
          alt=""
        />
        <span>{count(post.likeCount)}</span>
      </button>
    </>
  );

  return (
    <article
      ref={gesture.ref}
      className={`post-card${selected ? " selected" : ""}${detail ? " post-detail" : ""}`}
      aria-label={`Post by ${authorName}`}
      onClick={event => {
        if ((event.target as Element).closest(gestureControls)) return;
        if (!gesture.suppressClick.current) onOpen(post);
      }}
    >
      {post.repostedBy && (
        <div className="repost-attribution">
          <Icon name="repost" />
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onProfile(post.repostedBy!);
            }}
          >
            {post.repostedBy.displayName || post.repostedBy.handle}
          </button>{" "}
          reposted
        </div>
      )}
      <button
        type="button"
        className="post-avatar-button"
        aria-label={`View ${authorName}'s profile`}
        onClick={(event) => {
          event.stopPropagation();
          onProfile(post.author);
        }}
      >
        <Avatar profile={post.author} />
      </button>
      <div className="post-body">
        <div className="post-topline">
          <button
            type="button"
            className="post-author"
            onClick={(event) => {
              event.stopPropagation();
              onProfile(post.author);
            }}
          >
            {authorName}
          </button>
          <span className="post-handle">@{post.author.handle}</span>
          <button
            type="button"
            className="post-conversation-opener"
            aria-label={`Open post by ${authorName}`}
            aria-pressed={selected}
            onClick={event => { event.stopPropagation(); onOpen(post); }}
          ><time
            className="post-time"
            dateTime={post.createdAt}
            title={new Date(post.createdAt).toLocaleString()}
          >
            {shortDate(post.createdAt)}
          </time></button>
        </div>
        <ContentWarning labels={post.labels} moderation={post.moderation}>
          <PostText segments={post.segments} text={post.text} {...navigation} />
          {contextHeader ? null : detail ? (
            <>
              {post.images.length > 0 && (
                <div
                  className={`post-media post-images images-${post.images.length}`}
                >
                  {post.images.map((image, index) => (
                    <a
                      key={`${image.fullsize}-${index}`}
                      href={image.fullsize}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) =>
                        navigate(
                          event,
                          onMedia
                            ? () => onMedia(post.images, index)
                            : undefined,
                        )
                      }
                      aria-label={
                        image.alt || `Open image ${index + 1} in full size`
                      }
                    >
                      <img
                        src={image.thumb}
                        alt={
                          image.alt ||
                          `Image ${index + 1} attached by ${authorName}`
                        }
                        loading="lazy"
                      />
                    </a>
                  ))}
                </div>
              )}
              {post.video && (
                <MediaVideo video={post.video} authorName={authorName} />
              )}
              {post.external && (
                <a
                  className="external-card"
                  href={post.external.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) =>
                    navigate(
                      event,
                      onExternal
                        ? () =>
                            onExternal(post.external!.uri, post.external!.title)
                        : undefined,
                    )
                  }
                >
                  {post.external.thumb && (
                    <img src={post.external.thumb} alt="" loading="lazy" />
                  )}
                  <strong>{post.external.title || post.external.uri}</strong>
                  {post.external.description && (
                    <span>{post.external.description}</span>
                  )}
                  <small>
                    {(() => {
                      try {
                        return new URL(post.external.uri).hostname;
                      } catch {
                        return post.external.uri;
                      }
                    })()}
                  </small>
                </a>
              )}
              {post.feedGenerator && <FeedGeneratorPreview feed={post.feedGenerator} onExternal={onExternal} />}
              {post.quote && (
                <div
                  className="quote-card"
                  onClick={event => {
                    event.stopPropagation();
                    if (!(event.target as Element).closest(gestureControls)) onOpen(post.quote!);
                  }}
                >
                  <button type="button" className="quote-conversation-opener" aria-label={`Open quoted post by ${post.quote.author.displayName || post.quote.author.handle}`} onClick={event => { event.stopPropagation(); onOpen(post.quote!); }}>
                  <span className="quote-author">
                    <Avatar profile={post.quote.author} size={24} />
                    <strong>
                      {post.quote.author.displayName ||
                        post.quote.author.handle}
                    </strong>
                    <span className="post-handle">
                      @{post.quote.author.handle}
                    </span>
                  </span>
                  </button>
                  <ContentWarning
                    labels={post.quote.labels}
                    moderation={post.quote.moderation}
                  >
                    <PostText
                      segments={post.quote.segments}
                      text={post.quote.text}
                      {...navigation}
                    />
                    {post.quote.images[0] && (
                      <a
                        href={post.quote.images[0].fullsize}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(event) =>
                          navigate(
                            event,
                            onMedia
                              ? () => onMedia(post.quote!.images, 0)
                              : undefined,
                          )
                        }
                        aria-label={
                          post.quote.images[0].alt ||
                          "Open image in quoted post"
                        }
                      >
                        <img
                          className="quote-image"
                          src={post.quote.images[0].thumb}
                          alt={
                            post.quote.images[0].alt || "Image in quoted post"
                          }
                          loading="lazy"
                        />
                      </a>
                    )}
                  </ContentWarning>
                </div>
              )}
              {post.unavailableQuote && (
                <div className="quote-card unavailable-quote">
                  Quoted post is unavailable.
                </div>
              )}
            </>
          ) : (
            <TimelineAttachments
              post={post}
              onOpen={onOpen}
              onExternal={onExternal}
              onMedia={onMedia}
            />
          )}
        </ContentWarning>
        {detail && (
          <div className="post-detail-time">
            {new Date(post.createdAt).toLocaleString()}
          </div>
        )}
        {!post.moderation.noOverride && (
          <div className="post-actions" aria-label="Post actions">
            {actions}
          </div>
        )}
      </div>
      {peek &&
        createPortal(
          <div
            className="post-peek-layer"
            onClick={stop}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Tab") {
                const controls = Array.from(peekRef.current?.querySelectorAll<HTMLElement>('button, a[href], [tabindex="0"]') ?? []);
                const first = controls[0], last = controls[controls.length - 1];
                if (event.shiftKey && (document.activeElement === first || !peekRef.current?.contains(document.activeElement))) {
                  event.preventDefault(); last?.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault(); first?.focus();
                }
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setPeek(null);
                gesture.ref.current?.querySelector<HTMLButtonElement>(".post-conversation-opener")?.focus();
              }
            }}
          >
            <button
              type="button"
              className="post-peek-backdrop"
              aria-label="Dismiss post actions"
              onClick={() => setPeek(null)}
            />
            <aside
              ref={peekRef}
              className="post-peek"
              role="dialog"
              aria-modal="true"
              aria-label={`Post actions for ${authorName}`}
              tabIndex={-1}
              style={{ left: peek.x, top: peek.y }}
            >
              <button
                type="button"
                className="post-peek-close"
                aria-label="Close post actions"
                onClick={() => {
                  setPeek(null);
                  gesture.ref.current?.querySelector<HTMLButtonElement>(".post-conversation-opener")?.focus();
                }}
              >
                <Icon name="close" />
              </button>
              <button
                type="button"
                className="post-peek-author"
                onClick={() => {
                  setPeek(null);
                  onProfile(post.author);
                }}
              >
                <Avatar profile={post.author} />
                <span>
                  <strong>{authorName}</strong>
                  <span className="post-handle">@{post.author.handle}</span>
                </span>
              </button>
              {post.author.description && (
                <p className="post-peek-description">
                  {post.author.description}
                </p>
              )}
              <div className="post-peek-actions" aria-label="Post actions">
                {actions}
              </div>
              <button
                type="button"
                className="post-peek-conversation"
                onClick={() => {
                  setPeek(null);
                  onOpen(post);
                }}
              >
                Open conversation <Icon name="right" />
              </button>
            </aside>
          </div>,
          document.body,
        )}
    </article>
  );
}
