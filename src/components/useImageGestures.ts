import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { bindGestureSurface, type SurfaceGesture } from '../lib/gestureSurface';
import { DeckGestureContext } from '../lib/deckGesture';

interface Transform { scale: number; x: number; y: number }
interface Display extends Transform { progress: number }
const fitted = (): Transform => ({ scale: 1, x: 0, y: 0 });
const clamp = (value: number, maximum: number) => Math.max(-maximum, Math.min(maximum, value));

export function useImageGestures({ imageKey, fullscreen, navigate, canNavigate, enterFullscreen, exitFullscreen }: {
  imageKey?: string; fullscreen: boolean; navigate: (delta: number) => void;
  canNavigate: (delta: number) => boolean; enterFullscreen: () => void; exitFullscreen: () => void;
}) {
  const root = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [lift, setLift] = useState<{ box: DOMRect; width: number; height: number } | null>(null);
  const liftLayer = useRef<HTMLDivElement>(null);
  const promotion = useRef<{ width: number; x: number; y: number } | null>(null);
  const deckPan = useContext(DeckGestureContext);
  const [transform, setTransform] = useState<Transform>(fitted);
  const current = useRef<Transform>(fitted());
  const [size, setSize] = useState({ width: 0, height: 0 });
  const fit = useRef(size), natural = useRef(size);
  const callbacks = useRef({ navigate, canNavigate, enterFullscreen, exitFullscreen, fullscreen, deckPan });
  callbacks.current = { navigate, canNavigate, enterFullscreen, exitFullscreen, fullscreen, deckPan };
  const binding = useRef<ReturnType<typeof bindGestureSurface> | null>(null);
  const frame = useRef<number | null>(null);
  const target = useRef<Display>({ ...fitted(), progress: 0 });
  const shown = useRef<Display>(target.current);
  const smoothing = useRef(false);
  const lastFrame = useRef(0);

  // Input updates refs. Only this animation frame writes transforms; React commits
  // toolbar state at gesture end instead of rerendering the viewer for every sample.
  const paint = (time: number) => {
    frame.current = null;
    const node = viewport.current;
    if (!node) return;
    const goal = target.current;
    const alpha = smoothing.current ? 1 - Math.exp(-Math.min(40, time - (lastFrame.current || time - 16)) / 30) : 1;
    lastFrame.current = time;
    const display = {
      scale: shown.current.scale + (goal.scale - shown.current.scale) * alpha,
      x: shown.current.x + (goal.x - shown.current.x) * alpha,
      y: shown.current.y + (goal.y - shown.current.y) * alpha,
      progress: goal.progress,
    };
    const pending = Math.abs(display.scale - goal.scale) > .0003 || Math.abs(display.x - goal.x) > .08 || Math.abs(display.y - goal.y) > .08;
    shown.current = pending ? display : goal;
    const value = shown.current;
    for (const layer of [node, liftLayer.current]) {
      layer?.style.setProperty('--photo-scale', `${value.scale}`);
      layer?.style.setProperty('--photo-x', `${value.x}px`);
      layer?.style.setProperty('--photo-y', `${value.y}px`);
    }
    liftLayer.current?.style.setProperty('--lift-shade', `${Math.min(.35, Math.max(0, value.scale - 1) * .2)}`);
    node.dataset.zoom = current.current.scale.toFixed(3);
    node.dataset.panX = current.current.x.toFixed(1); node.dataset.panY = current.current.y.toFixed(1);
    node.dataset.dismissProgress = value.progress.toFixed(3);
    node.dataset.dismissArmed = String(value.progress >= 1);
    const modal = root.current?.closest<HTMLElement>('.media-fullscreen');
    modal?.style.setProperty('--photo-backdrop-opacity', `${1 - Math.min(1, value.progress) * .65}`);
    if (pending && smoothing.current) frame.current = requestAnimationFrame(paint);
  };
  const draw = (next: Display, smooth = false, settle = false) => {
    target.current = next; smoothing.current = smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (viewport.current) viewport.current.dataset.settling = String(settle && !matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (frame.current === null) frame.current = requestAnimationFrame(paint);
  };
  const bounded = (next: Transform): Transform => {
    const node = viewport.current, scale = Math.max(1, Math.min(6, next.scale));
    return { scale,
      x: clamp(next.x, Math.max(0, (fit.current.width * scale - (node?.clientWidth ?? 0)) / 2)),
      y: clamp(next.y, Math.max(0, (fit.current.height * scale - (node?.clientHeight ?? 0)) / 2)),
    };
  };
  const apply = (next: Transform, smooth = false) => {
    current.current = bounded(next); draw({ ...current.current, progress: 0 }, smooth);
  };
  const publish = () => setTransform({ ...current.current });
  const measured = useRef({ width: 0, height: 0 });
  const measure = () => {
    const node = viewport.current;
    if (!node || !natural.current.width || !natural.current.height) return;
    if (liftLayer.current && (node.clientWidth !== measured.current.width || node.clientHeight !== measured.current.height)) binding.current?.cancel();
    measured.current = { width: node.clientWidth, height: node.clientHeight };
    const ratio = Math.min(node.clientWidth / natural.current.width, node.clientHeight / natural.current.height);
    fit.current = { width: natural.current.width * ratio, height: natural.current.height * ratio };
    setSize(fit.current); apply(current.current);
  };
  const zoom = (value: number, point?: { x: number; y: number }) => {
    binding.current?.cancel();
    const node = viewport.current;
    if (!node) return;
    const before = current.current, scale = Math.max(1, Math.min(6, value));
    const box = node.getBoundingClientRect();
    const at = point ? { x: point.x - box.left - box.width / 2, y: point.y - box.top - box.height / 2 } : { x: 0, y: 0 };
    const ratio = scale / before.scale;
    apply({ scale, x: at.x - (at.x - before.x) * ratio, y: at.y - (at.y - before.y) * ratio }, true); publish();
  };
  const reset = () => { binding.current?.cancel(); apply(fitted(), true); publish(); };

  useLayoutEffect(() => {
    binding.current?.cancel(); natural.current = { width: 0, height: 0 }; fit.current = natural.current;
    setSize(fit.current); current.current = fitted(); shown.current = { ...fitted(), progress: 0 };
    draw(shown.current); publish();
  }, [imageKey]);
  useLayoutEffect(() => {
    binding.current?.cancel();
    const node = viewport.current;
    if (!node) return;
    const observer = new ResizeObserver(measure); observer.observe(node);
    measure();
    const previous = promotion.current;
    if (fullscreen && previous && fit.current.width) {
      promotion.current = null;
      const box = node.getBoundingClientRect();
      const from = { scale: previous.width / fit.current.width, x: previous.x - box.left - box.width / 2, y: previous.y - box.top - box.height / 2 };
      current.current = bounded(from); shown.current = { ...current.current, progress: 0 };
      publish(); setLift(null);
      const css = (value: Transform) => `translate(-50%, -50%) translate3d(${value.x}px, ${value.y}px, 0) scale(${value.scale})`;
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) node.querySelector('img')?.animate([
        { transform: css(from) }, { transform: css(current.current) },
      ], { duration: 180, easing: 'cubic-bezier(.2,.7,.25,1)' });
    }
    draw({ ...current.current, progress: 0 });
    return () => observer.disconnect();
  }, [fullscreen, imageKey]);

  useLayoutEffect(() => { if (lift) draw(target.current, smoothing.current); }, [lift]);

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    let session: { before: Transform; at: { x: number; y: number }; box: DOMRect; route?: 'image' | 'deck' | 'dismiss'; progress: number; allowDismiss: boolean; lifting?: boolean } | undefined;
    const handle = (gesture: SurfaceGesture): boolean => {
      const surface = viewport.current;
      if (!surface) return false;
      if (gesture.phase === 'start') {
        const box = surface.getBoundingClientRect();
        session = { before: bounded(current.current), at: { x: gesture.point.x - box.left - box.width / 2, y: gesture.point.y - box.top - box.height / 2 }, box,
          progress: 0, allowDismiss: callbacks.current.fullscreen && current.current.scale <= 1.01 };
        surface.dataset.gesturing = 'true'; surface.dataset.settling = 'false';
        return true;
      }
      const active = session;
      if (!active) return false;
      if (gesture.phase === 'change') {
        if (gesture.kind === 'pinch') {
          const raw = active.before.scale * gesture.scale;
          const scale = Math.max(1, Math.min(6, raw)), ratio = scale / active.before.scale;
          const at = { x: gesture.point.x - active.box.left - active.box.width / 2, y: gesture.point.y - active.box.top - active.box.height / 2 };
          if (!callbacks.current.fullscreen && gesture.scale > 1.02 && fit.current.width && !active.lifting) {
            active.lifting = true;
            setLift({ box: active.box, width: fit.current.width, height: fit.current.height });
          }
          const next = { scale, x: at.x - (active.at.x - active.before.x) * ratio, y: at.y - (active.at.y - active.before.y) * ratio };
          current.current = active.lifting ? next : bounded(next);
          // Zooming out of a magnified image stops at fit. Returning to the pane
          // requires a fresh, deliberate pinch from fit, released below 58%.
          active.progress = active.allowDismiss ? Math.max(0, (1 - raw) / .42) : 0;
          draw(active.progress ? { scale: Math.max(.4, raw), x: gesture.x, y: gesture.y, progress: active.progress }
            : { ...current.current, progress: 0 }, gesture.source === 'wheel');
          return true;
        }
        if (active.before.scale > 1.01) {
          current.current = bounded({ ...active.before, x: active.before.x + gesture.x, y: active.before.y + gesture.y });
          draw({ ...current.current, progress: 0 }); return true;
        }
        if (!active.route && gesture.axis) {
          if (gesture.axis === 'x') {
            const delta = gesture.x < 0 ? 1 : -1;
            active.route = !callbacks.current.fullscreen && !callbacks.current.canNavigate(delta) ? 'deck' : 'image';
            if (active.route === 'deck') callbacks.current.deckPan({ ...gesture, phase: 'start', x: 0, y: 0 });
          } else if (callbacks.current.fullscreen) active.route = 'dismiss';
        }
        if (active.route === 'deck') { callbacks.current.deckPan(gesture); return true; }
        if (active.route === 'dismiss') {
          const threshold = Math.max(140, Math.min(240, active.box.height * .25));
          active.progress = Math.abs(gesture.y) / threshold;
          draw({ scale: 1 - Math.min(1, active.progress) * .12, x: gesture.x * .2, y: gesture.y * .7, progress: active.progress });
        } else if (active.route === 'image') {
          const possible = callbacks.current.canNavigate(gesture.x < 0 ? 1 : -1);
          draw({ scale: 1, x: gesture.x * (possible ? .75 : .15), y: 0, progress: 0 });
        }
        return true;
      }
      session = undefined; surface.dataset.gesturing = 'false';
      if (active.route === 'deck') callbacks.current.deckPan(gesture);
      const cancelled = gesture.phase === 'cancel';
      if (active.lifting) {
        if (!cancelled && gesture.scale >= 1.08) {
          const visible = shown.current;
          promotion.current = { width: fit.current.width * visible.scale,
            x: active.box.left + active.box.width / 2 + visible.x,
            y: active.box.top + active.box.height / 2 + visible.y };
          callbacks.current.enterFullscreen();
        } else {
          current.current = active.before; setLift(null);
          draw({ ...current.current, progress: 0 }, false, true); publish();
        }
        return true;
      }
      const dismiss = !cancelled && active.allowDismiss && active.progress >= 1;
      if (cancelled) current.current = active.before;
      const delta = gesture.x < 0 ? 1 : -1;
      const advance = !cancelled && active.route === 'image' && Math.abs(gesture.x) >= Math.max(65, Math.min(140, active.box.width * .22)) && callbacks.current.canNavigate(delta);
      current.current = bounded(current.current);
      draw({ ...current.current, progress: 0 }, false, active.progress > 0 || active.route === 'image'); publish();
      if (dismiss) callbacks.current.exitFullscreen();
      else if (advance) callbacks.current.navigate(delta);
      return true;
    };
    const controller = bindGestureSurface(node, {
      pinch: true,
      pointer: event => event.target instanceof Element && !!event.target.closest('.media-panel__viewport') && !event.target.closest('button,a'),
      wheel: event => callbacks.current.fullscreen || (event.target instanceof Element && !!event.target.closest('.media-panel__viewport')),
      onGesture: handle,
    });
    binding.current = controller;
    const resized = () => { if (session?.lifting) controller.cancel(); };
    window.addEventListener('resize', resized);
    return () => { window.removeEventListener('resize', resized); controller.dispose(); binding.current = null; };
  }, [fullscreen]);
  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    // StrictMode replays effects in development; the next draw must schedule again.
    frame.current = null; lastFrame.current = 0;
  }, []);

  return { root, viewport, lift, liftLayer, transform, size, zoom, reset, getTransform: () => current.current,
    pan: (x: number, y: number) => { binding.current?.cancel(); apply({ ...current.current, x: current.current.x + x, y: current.current.y + y }); publish(); },
    loaded: (image: HTMLImageElement) => { natural.current = { width: image.naturalWidth, height: image.naturalHeight }; measure(); },
  };
}
