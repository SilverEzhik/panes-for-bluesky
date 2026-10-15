import { useEffect, useId, useRef, useState } from 'react';
import type Hls from 'hls.js';
import type { Post } from '../lib/types';

export interface MediaVideoProps {
  video: NonNullable<Post['video']>;
  authorName?: string;
}

/** Safari plays HLS itself; other MediaSource browsers use a lazy hls.js chunk.
 * Fetch the manifest up front, but leave segment loading to the user's Play action.
 */
export default function MediaVideo({ video, authorName }: MediaVideoProps) {
  const element = useRef<HTMLVideoElement>(null);
  const errorId = useId();
  const [retry, setRetry] = useState(0);
  const resumePosition = useRef(0);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const media = element.current;
    if (!media) return;
    let disposed = false;
    let player: Hls | undefined;
    let requestedPlayback = false;
    let intersectsViewport = true;
    setError(undefined);

    const failed = () => {
      if (media.currentTime > 0) resumePosition.current = media.currentTime;
      if (!disposed) setError('This video could not be played. You can open the video stream below.');
    };
    const isHidden = () => document.hidden || !intersectsViewport || Boolean(media.closest('[inert], [aria-hidden="true"]'));
    const suspendIfHidden = () => {
      if (!isHidden()) return;
      requestedPlayback = false;
      media.pause();
      player?.stopLoad();
    };
    const restorePosition = () => {
      if (resumePosition.current > 0) media.currentTime = resumePosition.current;
    };
    const start = () => {
      if (isHidden()) {
        suspendIfHidden();
        return;
      }
      requestedPlayback = true;
      player?.startLoad();
    };
    // Hidden sheets remain mounted; observe PanelStack's visibility contract.
    const observer = new MutationObserver(suspendIfHidden);
    for (let ancestor = media.parentElement; ancestor; ancestor = ancestor.parentElement) {
      observer.observe(ancestor, { attributes: true, attributeFilter: ['inert', 'aria-hidden'] });
    }
    const viewportObserver = new IntersectionObserver(([entry]) => {
      intersectsViewport = !!entry && entry.intersectionRatio > 0;
      suspendIfHidden();
    });
    viewportObserver.observe(media);
    document.addEventListener('visibilitychange', suspendIfHidden);
    media.addEventListener('loadedmetadata', restorePosition);
    media.addEventListener('error', failed);
    media.addEventListener('play', start);

    const isOrdinaryVideo = /\.(?:mp4|webm|ogg|mov)(?:$|[?#])/i.test(video.playlist);
    if (isOrdinaryVideo || media.canPlayType('application/vnd.apple.mpegurl')) {
      media.src = video.playlist;
    } else {
      void import('hls.js').then(({ default: HlsPlayer }) => {
        if (disposed) return;
        if (!HlsPlayer.isSupported()) {
          failed();
          return;
        }
        player = new HlsPlayer({ autoStartLoad: false, capLevelToPlayerSize: true });
        player.on(HlsPlayer.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          failed();
          player?.destroy();
          player = undefined;
        });
        player.on(HlsPlayer.Events.MEDIA_ATTACHED, () => {
          player?.loadSource(video.playlist);
        });
        player.on(HlsPlayer.Events.MANIFEST_PARSED, () => {
          if (requestedPlayback && !isHidden()) player?.startLoad();
        });
        player.attachMedia(media);
      }).catch(failed);
    }

    return () => {
      disposed = true;
      observer.disconnect();
      viewportObserver.disconnect();
      document.removeEventListener('visibilitychange', suspendIfHidden);
      media.removeEventListener('loadedmetadata', restorePosition);
      media.removeEventListener('error', failed);
      media.removeEventListener('play', start);
      player?.destroy();
      media.pause();
      media.removeAttribute('src');
      media.load();
    };
  }, [video.playlist, retry]);

  useEffect(() => { resumePosition.current = 0; }, [video.playlist]);

  const ratio = video.aspectRatio;
  const aspectRatio = ratio && ratio.width > 0 && ratio.height > 0
    ? `${ratio.width} / ${ratio.height}` : undefined;

  return <div className="post-media post-video" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    <video
      ref={element}
      controls
      playsInline
      preload="none"
      poster={video.thumbnail}
      aria-label={video.alt || (authorName ? `Video attached by ${authorName}` : 'Attached video')}
      aria-describedby={error ? errorId : undefined}
      style={aspectRatio ? { aspectRatio } : undefined}
    />
    {error && <p id={errorId} role="status">{error} <button type="button" onClick={() => {
      if (element.current && element.current.currentTime > 0) resumePosition.current = element.current.currentTime;
      setRetry(value => value + 1);
    }}>Retry video</button></p>}
    <a className="video-source" href={video.playlist} target="_blank" rel="noopener noreferrer">Open video stream</a>
  </div>;
}
