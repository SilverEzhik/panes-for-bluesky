import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useImageGestures } from './useImageGestures';
import type { PostImage } from '../lib/types';
import './LinkPanels.css';

export interface WebPanelProps {
  url: string;
  title?: string;
}

export interface MediaPanelProps {
  images: PostImage[];
  initialIndex?: number;
}

function webAddress(value: string): URL | undefined {
  try {
    const address = new URL(value);
    return /^https?:$/.test(address.protocol) ? address : undefined;
  } catch {
    return undefined;
  }
}

/** The browser enforces a site's embedding policy; its refusal cannot be reliably
 * distinguished from a loaded page across origins. Keep the escape hatch visible.
 */
export function WebPanel({ url, title }: WebPanelProps) {
  const address = webAddress(url);
  const [reload, setReload] = useState(0);
  const headingId = useId();

  if (!address) return <div className="link-panel link-panel--invalid"><p>This link cannot be opened as a web page.</p></div>;

  return <section className="link-panel web-panel" aria-labelledby={headingId}>
    <div className="link-panel__toolbar" data-panel-no-drag>
      <div className="web-panel__address">
        <strong id={headingId}>{title || address.hostname}</strong>
        <span title={address.href}>Original link: {address.href}</span>
      </div>
      <button type="button" className="link-panel__icon-button" onClick={() => setReload(value => value + 1)} aria-label="Reopen original page" title="Reopen original page">
        <img src={`${import.meta.env.BASE_URL}assets/original/iPad-web-reload.png`} alt="" width="13" height="17" />
      </button>
      <a className="link-panel__icon-button" href={address.href} target="_blank" rel="noopener noreferrer" aria-label="Open original page in browser" title="Open original page in browser">
        <img src={`${import.meta.env.BASE_URL}assets/original/action.png`} alt="" width="27" height="20" />
      </a>
    </div>
    <p className="web-panel__notice">Some sites require a separate window. <a href={address.href} target="_blank" rel="noopener noreferrer">Open original page in browser</a></p>
    <iframe
      key={`${address.href}:${reload}`}
      className="web-panel__frame"
      src={address.href}
      title={title ? `${title} — web page` : `Web page at ${address.hostname}`}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      data-panel-no-drag
    />
  </section>;
}

function boundedIndex(index: number, count: number) {
  return Math.max(0, Math.min(Number.isFinite(index) ? Math.floor(index) : 0, count - 1));
}

/** Photo gestures belong to the image surface; the title bar still moves the deck. */
export function MediaPanel({ images, initialIndex = 0 }: MediaPanelProps) {
  const [index, setIndex] = useState(() => boundedIndex(initialIndex, images.length));
  const [fullscreen, setFullscreen] = useState(false);
  const [failedImage, setFailedImage] = useState<string>();
  const captionId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const fullscreenRoot = useRef<HTMLDivElement>(null);
  const collectionKey = images.map(image => image.fullsize).join('\n');
  const currentIndex = boundedIndex(index, images.length);
  const image = images[currentIndex];
  const imageUrl = image && webAddress(image.fullsize)?.href;
  const navigate = (next: number) => setIndex(boundedIndex(next, images.length));
  const gestures = useImageGestures({ imageKey: imageUrl, fullscreen,
    navigate: delta => navigate(currentIndex + delta), canNavigate: delta => currentIndex + delta >= 0 && currentIndex + delta < images.length, enterFullscreen: () => setFullscreen(true), exitFullscreen: () => setFullscreen(false) });

  useEffect(() => { setIndex(boundedIndex(initialIndex, images.length)); }, [initialIndex, collectionKey, images.length]);
  useEffect(() => { setFailedImage(undefined); }, [currentIndex, collectionKey]);
  useLayoutEffect(() => {
    if (!fullscreen) return;
    const app = document.querySelector<HTMLElement>('.app-shell');
    const previousInert = app?.inert, previousHidden = app?.getAttribute('aria-hidden');
    if (app) { app.inert = true; app.setAttribute('aria-hidden', 'true'); }
    gestures.viewport.current?.focus({ preventScroll: true });
    const keyboard = (event: KeyboardEvent) => {
      // Firefox/WebKit can move focus to body when Next becomes disabled.
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setFullscreen(false); }
      else if (event.key === 'Tab' && !fullscreenRoot.current?.contains(document.activeElement)) {
        event.preventDefault(); gestures.viewport.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('keydown', keyboard, true);
    return () => {
      document.removeEventListener('keydown', keyboard, true);
      if (app) {
        app.inert = previousInert ?? false;
        if (previousHidden === null || previousHidden === undefined) app.removeAttribute('aria-hidden'); else app.setAttribute('aria-hidden', previousHidden);
      }
      queueMicrotask(() => toggleRef.current?.focus({ preventScroll: true }));
    };
  }, [fullscreen]);

  useLayoutEffect(() => {
    if (!fullscreen) return;
    const active = document.activeElement;
    if (!fullscreenRoot.current?.contains(active) || (active instanceof HTMLButtonElement && active.disabled)) gestures.viewport.current?.focus({ preventScroll: true });
  }, [fullscreen, currentIndex]);

  if (!image) return <div className="link-panel link-panel--invalid"><p>No images are attached to this post.</p></div>;
  const zoomed = gestures.transform.scale > 1.01;
  const viewer = <section ref={gestures.root}
    className={`link-panel media-panel${zoomed ? ' media-panel--zoomed' : ''}`}
    aria-label="Image viewer"
    onKeyDown={event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const key = event.key;
      const zoomed = gestures.getTransform().scale > 1.01;
      if (key === 'Escape' && (fullscreen || zoomed)) {
        event.preventDefault(); event.stopPropagation();
        if (fullscreen) setFullscreen(false); else gestures.reset();
      } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) {
        if (!zoomed && (key === 'ArrowUp' || key === 'ArrowDown')) return;
        event.preventDefault(); event.stopPropagation();
        if (zoomed) gestures.pan(key === 'ArrowLeft' ? 60 : key === 'ArrowRight' ? -60 : 0, key === 'ArrowUp' ? 60 : key === 'ArrowDown' ? -60 : 0);
        else navigate(currentIndex + (key === 'ArrowLeft' ? -1 : 1));
      } else if (['+', '=', '-', '0', 'f', 'F'].includes(key)) {
        event.preventDefault(); event.stopPropagation();
        if (key === 'f' || key === 'F') setFullscreen(value => !value);
        else if (key === '0') gestures.reset();
        else gestures.zoom(gestures.getTransform().scale * (key === '-' ? 1 / 1.5 : 1.5));
      }
    }}
  >
    <div className="link-panel__toolbar media-panel__toolbar" data-panel-no-drag data-panel-scroll>
      <div className="media-panel__navigation" role="group" aria-label="Browse images">
        <button type="button" className="link-panel__icon-button" aria-label="Previous image" title="Previous image" disabled={currentIndex === 0} onClick={() => navigate(currentIndex - 1)}>
          <img src={`${import.meta.env.BASE_URL}assets/original/iPad-webback.png`} alt="" width="15" height="20" />
        </button>
        <span className="media-panel__count" role="status">{currentIndex + 1} of {images.length}</span>
        <button type="button" className="link-panel__icon-button" aria-label="Next image" title="Next image" disabled={currentIndex === images.length - 1} onClick={() => navigate(currentIndex + 1)}>
          <img src={`${import.meta.env.BASE_URL}assets/original/iPad-webforward.png`} alt="" width="15" height="20" />
        </button>
      </div>
      <div className="media-panel__tools" role="group" aria-label="Photo controls">
        <button type="button" className="link-panel__icon-button media-panel__zoom-button" aria-label="Zoom out" title="Zoom out (−)" disabled={!zoomed || !imageUrl} onClick={() => gestures.zoom(gestures.getTransform().scale / 1.5)}>−</button>
        <button type="button" className="link-panel__icon-button media-panel__zoom-level" aria-label="Reset image zoom" title="Fit image (0)" disabled={!imageUrl} onClick={gestures.reset}>{zoomed ? `${Math.round(gestures.transform.scale * 100)}%` : 'Fit'}</button>
        <button type="button" className="link-panel__icon-button media-panel__zoom-button" aria-label="Zoom in" title="Zoom in (+)" disabled={gestures.transform.scale >= 6 || !imageUrl} onClick={() => gestures.zoom(gestures.getTransform().scale * 1.5)}>+</button>
        <button ref={toggleRef} type="button" className="link-panel__icon-button" disabled={!imageUrl} aria-label={fullscreen ? 'Exit fullscreen' : 'Expand photo pane'} aria-pressed={fullscreen} title={fullscreen ? 'Exit fullscreen (Esc)' : 'Expand photo pane (F)'} onClick={() => setFullscreen(value => !value)}>
          <img src={`${import.meta.env.BASE_URL}assets/original/${fullscreen ? 'shrink.png' : 'iPad-fullscreen.png'}`} alt="" width={fullscreen ? 22 : 19} height="22" />
        </button>
        {imageUrl && <a className="link-panel__icon-button" href={imageUrl} target="_blank" rel="noopener noreferrer" aria-label="Open original image in browser" title="Open original image">
          <img src={`${import.meta.env.BASE_URL}assets/original/action.png`} alt="" width="27" height="20" />
        </a>}
      </div>
    </div>
    <figure className="media-panel__figure">
      <div ref={gestures.viewport} className="media-panel__viewport" data-panel-no-drag data-lifted={!!gestures.lift} tabIndex={0}
        aria-label="Photo. Pinch or Ctrl+scroll to zoom. Drag to pan. Swipe sideways to browse."
        onDoubleClick={event => { event.preventDefault(); gestures.zoom(gestures.getTransform().scale > 1.01 ? 1 : 2.5, { x: event.clientX, y: event.clientY }); }}>
        {!imageUrl || failedImage === imageUrl ? <p className="media-panel__error" role="status">This image could not be loaded.{imageUrl && <> <a href={imageUrl} target="_blank" rel="noopener noreferrer">Open the original image</a> <button type="button" className="metal-button" onClick={() => setFailedImage(undefined)}>Retry image</button></>}</p> : <img
          key={imageUrl} className="media-panel__image" src={imageUrl} alt={image.alt || `Image ${currentIndex + 1} attached to the post`}
          aria-describedby={image.alt ? captionId : undefined} draggable={false}
          style={{ width: gestures.size.width || undefined, height: gestures.size.height || undefined }}
          onLoad={event => gestures.loaded(event.currentTarget)} onError={() => setFailedImage(imageUrl)}
        />}
      </div>
      {image.alt && <figcaption id={captionId} className="media-panel__caption">{image.alt}</figcaption>}
    </figure>
  </section>;
  const lifted = gestures.lift && imageUrl && createPortal(<div ref={gestures.liftLayer} className="photo-lift" aria-hidden="true">
    <img className="media-panel__image" src={imageUrl} alt="" draggable={false}
      style={{ left: gestures.lift.box.left + gestures.lift.box.width / 2, top: gestures.lift.box.top + gestures.lift.box.height / 2,
        width: gestures.lift.width, height: gestures.lift.height }} />
  </div>, document.body);
  if (!fullscreen) return <>{viewer}{lifted}</>;
  return <>{createPortal(<div ref={fullscreenRoot} className="media-fullscreen" role="dialog" aria-modal="true" aria-label="Photos — fullscreen" data-panel-no-drag
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setFullscreen(false); }
      if (event.key === 'Tab') {
        const controls = [...(fullscreenRoot.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],[tabindex="0"]') ?? [])];
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
    <header className="media-fullscreen__header"><h2>Photos</h2><button type="button" className="stack-panel__close" aria-label="Return to photo pane" onClick={() => setFullscreen(false)}>×</button></header>
    {viewer}
  </div>, document.body)}{lifted}</>;
}

export default WebPanel;
