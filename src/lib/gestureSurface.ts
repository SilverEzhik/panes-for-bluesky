import { Gesture, type Handler } from '@use-gesture/vanilla';
import { registerGestureSurface } from './gestureOwnership';

export interface SurfaceGesture {
  phase: 'start' | 'change' | 'end' | 'cancel';
  kind: 'pan' | 'pinch';
  source: 'pointer' | 'wheel' | 'safari';
  x: number; y: number; scale: number;
  point: { x: number; y: number };
  axis?: 'x' | 'y';
  velocityX: number;
}
interface Options {
  pinch?: boolean;
  pointer?: (event: PointerEvent) => boolean;
  wheel?: (event: WheelEvent) => boolean;
  safari?: (event: Event) => boolean;
  onGesture: (gesture: SurfaceGesture) => boolean;
}

/** Library-owned recognition; this adapter only routes ownership to photo/deck UI. */
export function bindGestureSurface(node: HTMLElement, options: Options) {
  let active: SurfaceGesture | undefined;
  let owner: 'drag' | 'wheel' | 'pinch' | undefined;
  let origin = { x: 0, y: 0 };
  let wheelOrigin = [0, 0];
  let suppressClick = false;
  const claim = (event: Event) => { if (event.cancelable) event.preventDefault(); event.stopPropagation(); };
  const finish = (cancelled = false) => {
    const previous = active; active = undefined; owner = undefined;
    if (previous?.source === 'wheel') routing.release(previous.kind === 'pinch' ? 'pinch' : 'wheel');
    else if (previous?.source === 'safari') routing.release('safari');
    if (previous) options.onGesture({ ...previous, phase: cancelled ? 'cancel' : 'end' });
  };
  const cancel = () => { finish(true); gestures.destroy(); gestures = recognize(); };
  const point = (event: UIEvent, coordinates?: number[]) => {
    const box = node.getBoundingClientRect(), mouse = event as MouseEvent;
    return { x: coordinates?.[0] ?? mouse.clientX ?? box.left + box.width / 2,
      y: coordinates?.[1] ?? mouse.clientY ?? box.top + box.height / 2 };
  };
  const begin = (key: typeof owner, source: SurfaceGesture['source'], at: SurfaceGesture['point']) => {
    if (active) finish(source === 'pointer' && active.source === 'pointer');
    owner = key; origin = at;
    active = { phase: 'start', kind: key === 'pinch' ? 'pinch' : 'pan', source, point: at, x: 0, y: 0, scale: 1, velocityX: 0 };
    options.onGesture(active);
  };
  const change = (event: UIEvent, value: Partial<SurfaceGesture>, last: boolean, cancelled = false) => {
    if (!active) return;
    Object.assign(active, value, { phase: 'change' });
    if (active.kind === 'pan' && !active.axis) {
      const [x, y] = [Math.abs(active.x), Math.abs(active.y)];
      if (x > 6 && x > y * 1.15) active.axis = 'x';
      else if (y > 6 && y > x * 1.15) active.axis = 'y';
    }
    if (options.onGesture(active)) {
      claim(event);
      suppressClick ||= active.kind === 'pinch' || Math.hypot(active.x, active.y) > 5;
    }
    if (last) finish(cancelled);
  };
  const drag: Handler<'drag'> = state => {
    const event = state.event as PointerEvent;
    if (state.first) {
      if (options.pointer?.(event) === false || state.touches > 1) { state.cancel(); return; }
      begin('drag', 'pointer', point(event, state.initial));
    }
    if (owner !== 'drag') return;
    change(event, { x: state.movement[0], y: state.movement[1], point: point(event, state.xy),
      velocityX: state.velocity[0] * state.direction[0] }, state.last, state.canceled || event.type === 'pointercancel');
  };
  const wheel: Handler<'wheel'> = state => {
    const event = state.event;
    if (event.ctrlKey || event.metaKey || !routing.owns('wheel')) return;
    if (!state.last && owner !== 'wheel') {
      wheelOrigin = state.movement.map((value, axis) => value - state.delta[axis]);
      begin('wheel', 'wheel', point(event));
    }
    if (owner !== 'wheel') return;
    const [x, y] = state.movement.map((value, axis) => value - wheelOrigin[axis]);
    change(event, { x: -(event.shiftKey ? y || x : x), y: event.shiftKey ? 0 : -y }, state.last);
  };
  const pinch: Handler<'pinch'> = state => {
    const event = state.event;
    const source = event.type === 'wheel' ? 'wheel' : event.type.startsWith('gesture') ? 'safari' : 'pointer';
    if (state.first) {
      const accepted = source === 'wheel' ? routing.owns('pinch') : source === 'safari' ? routing.owns('safari') : options.pointer?.(event as PointerEvent) !== false;
      if (!accepted) { state.cancel(); return; }
      begin('pinch', source, point(event, state.origin));
    }
    if (owner !== 'pinch') return;
    const at = point(event, state.origin);
    change(event, { scale: state.offset[0], x: at.x - origin.x, y: at.y - origin.y, point: at }, state.last,
      state.canceled || event.type === 'pointercancel' || event.type === 'gesturecancel');
  };
  const recognize = () => new Gesture(node, { onDrag: drag, onWheel: wheel, onPinch: pinch }, {
    eventOptions: { passive: false },
    drag: { threshold: 0, axisThreshold: { mouse: 6, touch: 6, pen: 6 }, pointer: { capture: false, keys: false } },
    wheel: { axisThreshold: 6 },
    pinch: { enabled: !!options.pinch, modifierKey: ['ctrlKey', 'metaKey'], from: () => [1, 0], scaleBounds: { min: .2, max: 12 } },
  });
  const routing = registerGestureSurface({ node,
    wheel: event => (!(event.ctrlKey || event.metaKey) || !!options.pinch) && options.wheel?.(event) !== false,
    safari: event => !!options.pinch && (options.safari ? options.safari(event) : options.pointer?.(event as PointerEvent) !== false),
    finish: cancelled => { finish(cancelled); gestures.destroy(); gestures = recognize(); },
  });
  let gestures = recognize();
  // Cancellation must happen before the library samples a missed mouse release.
  const interrupted = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && !event.buttons && active?.source === 'pointer') cancel();
  };
  const down = () => { suppressClick = false; };
  const click = (event: MouseEvent) => { if (suppressClick && event.detail) claim(event); };
  const hidden = () => { if (document.hidden) cancel(); };
  window.addEventListener('pointermove', interrupted, true);
  window.addEventListener('blur', cancel);
  document.addEventListener('visibilitychange', hidden);
  node.addEventListener('pointerdown', down, true);
  node.addEventListener('click', click, true);
  return { cancel, dispose() {
    active = undefined; owner = undefined; routing.dispose(); gestures.destroy();
    window.removeEventListener('pointermove', interrupted, true); window.removeEventListener('blur', cancel);
    document.removeEventListener('visibilitychange', hidden);
    node.removeEventListener('pointerdown', down, true); node.removeEventListener('click', click, true);
  } };
}
