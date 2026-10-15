/** Latch routed gestures to their starting surface. Recognition remains in use-gesture. */
export interface GestureSurface {
  node: HTMLElement;
  wheel: (event: WheelEvent) => boolean;
  safari: (event: Event) => boolean;
  finish: (cancelled?: boolean) => void;
}
type Kind = 'wheel' | 'pinch' | 'safari';
const surfaces = new Set<GestureSurface>();
const forwarded = new WeakSet<Event>();
let session: { surface?: GestureSurface; kind: Kind; time: number } | undefined;
const deepest = (event: Event, accepts: (surface: GestureSurface) => boolean) => {
  const path = event.composedPath();
  return [...surfaces].filter(surface => path.includes(surface.node) && accepts(surface))
    .sort((a, b) => path.indexOf(a.node) - path.indexOf(b.node))[0];
};
const stop = (cancelled = false) => { const previous = session; session = undefined; previous?.surface?.finish(cancelled); };
const relay = (event: Event, copy: Event) => {
  const destination = session?.surface;
  if (!destination) { event.stopImmediatePropagation(); return; }
  if (event.composedPath().includes(destination.node)) return;
  forwarded.add(copy); destination.node.dispatchEvent(copy);
  if (copy.defaultPrevented && event.cancelable) event.preventDefault();
  event.stopImmediatePropagation();
};
const wheel = (event: WheelEvent) => {
  if (forwarded.has(event)) return;
  const kind = event.ctrlKey || event.metaKey ? 'pinch' : 'wheel';
  // Browser-owned bursts have no recognizer to emit an end; expire them on quiet.
  if (session && (session.kind !== kind || (!session.surface && event.timeStamp - session.time > 140))) stop();
  if (!session) session = { surface: deepest(event, surface => surface.wheel(event)), kind, time: event.timeStamp };
  session.time = event.timeStamp;
  relay(event, new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: event.deltaX, deltaY: event.deltaY,
    deltaZ: event.deltaZ, deltaMode: event.deltaMode, clientX: event.clientX, clientY: event.clientY,
    ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, altKey: event.altKey }));
};
const safari = (event: Event) => {
  if (forwarded.has(event)) return;
  if (event.type === 'gesturestart') {
    stop(true); session = { surface: deepest(event, surface => surface.safari(event)), kind: 'safari', time: event.timeStamp };
  }
  if (session?.kind !== 'safari') return;
  const copy = new Event(event.type, { bubbles: true, cancelable: true });
  for (const key of ['scale', 'rotation', 'clientX', 'clientY']) Object.defineProperty(copy, key, { value: (event as unknown as Record<string, unknown>)[key] });
  const previous = session;
  relay(event, copy);
  if ((event.type === 'gestureend' || event.type === 'gesturecancel') && session === previous) session = undefined;
};
const reset = () => stop();
const cancel = () => stop(true);
const hidden = () => { if (document.hidden) cancel(); };
export function registerGestureSurface(surface: GestureSurface) {
  if (!surfaces.size) {
    window.addEventListener('wheel', wheel, { capture: true, passive: false });
    for (const type of ['gesturestart', 'gesturechange', 'gestureend', 'gesturecancel']) window.addEventListener(type, safari, { capture: true, passive: false });
    window.addEventListener('pointerdown', reset, true);
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', hidden);
  }
  surfaces.add(surface);
  return {
    owns: (kind: Kind) => session?.surface === surface && session.kind === kind,
    release: (kind: Kind) => { if (session?.surface === surface && session.kind === kind) session = undefined; },
    dispose() {
      if (session?.surface === surface) session = undefined;
      surfaces.delete(surface);
      if (!surfaces.size) {
        session = undefined;
        window.removeEventListener('wheel', wheel, true);
        for (const type of ['gesturestart', 'gesturechange', 'gestureend', 'gesturecancel']) window.removeEventListener(type, safari, true);
        window.removeEventListener('pointerdown', reset, true); window.removeEventListener('blur', cancel);
        document.removeEventListener('visibilitychange', hidden);
      }
    },
  };
}
