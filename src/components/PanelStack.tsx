import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  advancePanelSpring,
  anchorForPanelOffset,
  compactPanelOffset,
  layoutPanelDeck,
  maximumPanelOffset,
  nativeRound,
  nearestPanelSnap,
  PANEL_FRAME_MS,
  panelSnapOffsets,
  projectPanelOffset,
  resolvePanelAnchor,
  rubberBand,
  type PanelAnchor,
  type PanelDeckLayout,
  type PanelGeometry,
} from "../lib/panelPhysics";
import "./PanelStack.css";
import { bindGestureSurface, type SurfaceGesture } from "../lib/gestureSurface";
import { DeckGestureContext } from "../lib/deckGesture";
export type { PanelDeckLayout } from "../lib/panelPhysics";
export interface StackPanel {
  id: string;
  title?: string;
  width?: number;
  content: ReactNode;
}
export interface PanelStackProps {
  panels: StackPanel[];
  onDismiss: (index: number) => void;
  feedWidth?: number;
  revealKey?: string | number;
  navigationExpanded?: boolean;
  onExpandNavigation?: () => void;
  onCollapseNavigation?: () => void;
  onLayoutChange?: (layout: PanelDeckLayout) => void;
  className?: string;
}
export function PanelStack({
  panels,
  onDismiss,
  feedWidth = 476,
  revealKey,
  navigationExpanded = false,
  onExpandNavigation,
  onCollapseNavigation,
  onLayoutChange,
  className = "",
}: PanelStackProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [offset, setOffset] = useState(0);
  const [moving, setMoving] = useState(false);
  const offsetRef = useRef(0);
  const animation = useRef<number | null>(null);
  const gestureBinding = useRef<ReturnType<typeof bindGestureSurface> | null>(null);
  const panSession = useRef<{ origin: number; snap: number; moved: boolean } | null>(null);
  const suppressUntil = useRef(0);
  const anchor = useRef<PanelAnchor>({ kind: "expanded" });
  const lastSnap = useRef(0);
  const initialized = useRef(false);
  const previousIds = useRef<string[]>([]);
  const previousReveal = useRef(revealKey);
  const previousNavigation = useRef(navigationExpanded);
  const navigationEcho = useRef<boolean | null>(null);
  const elements = useRef(new Map<string, HTMLElement>());
  const focusOrigins = useRef(new Map<string, HTMLElement>());
  // Fit preferred native widths to the exposed-rail workspace. Phones use the same
  // model with a smaller sidebar; their width cap is a deliberate adaptation.
  const rail = viewportWidth && viewportWidth <= 600 ? 60 : 72;
  const sidebar = viewportWidth
    ? Math.min(292, Math.max(rail, viewportWidth - 48))
    : 292;
  const available = Math.max(1, (viewportWidth || 1024) - rail);
  const geometry: PanelGeometry = {
    viewportWidth: viewportWidth || 1024,
    sidebarWidth: sidebar,
    railWidth: rail,
    compactRoot: viewportWidth > 0 && viewportWidth < 768,
    feedWidth: Math.min(feedWidth, available),
    widths: panels.map((p) => Math.min(p.width ?? 476, available)),
  };
  const geometryRef = useRef(geometry);
  geometryRef.current = geometry;
  const callbacks = useRef({
    onExpandNavigation,
    onCollapseNavigation,
    onLayoutChange,
  });
  callbacks.current = {
    onExpandNavigation,
    onCollapseNavigation,
    onLayoutChange,
  };
  const layout = layoutPanelDeck(offset, geometry);
  const moveTo = useCallback((value: number) => {
    offsetRef.current = value;
    setOffset(value);
  }, []);
  const stop = useCallback(() => {
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
  }, []);
  const syncNavigation = useCallback((destination: number) => {
    const expanded = destination === 0;
    if (previousNavigation.current !== expanded) {
      navigationEcho.current = expanded;
      previousNavigation.current = expanded;
      (expanded
        ? callbacks.current.onExpandNavigation
        : callbacks.current.onCollapseNavigation)?.();
    }
  }, []);
  const springTo = useCallback(
    (destination: number, velocity = 0) => {
      stop();
      lastSnap.current = destination;
      anchor.current = anchorForPanelOffset(destination, geometryRef.current);
      syncNavigation(destination);
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        moveTo(destination);
        setMoving(false);
        return;
      }
      let position = offsetRef.current,
        previousTime = performance.now(),
        accumulator = 0,
        steps = 0;
      setMoving(true);
      const frame = (time: number) => {
        accumulator += Math.min(64, time - previousTime);
        previousTime = time;
        while (accumulator >= PANEL_FRAME_MS) {
          ({ position, velocity } = advancePanelSpring(
            position,
            velocity,
            destination,
          ));
          accumulator -= PANEL_FRAME_MS;
          steps++;
          if (
            steps >= 200 ||
            (Math.abs(position - destination) < 1 && Math.abs(velocity) < 1)
          ) {
            animation.current = null;
            moveTo(destination);
            setMoving(false);
            return;
          }
        }
        moveTo(nativeRound(position));
        animation.current = requestAnimationFrame(frame);
      };
      animation.current = requestAnimationFrame(frame);
    },
    [moveTo, stop, syncNavigation],
  );
  const deckPan = useCallback((gesture: SurfaceGesture) => {
    if (gesture.kind !== 'pan') return false;
    if (gesture.phase === 'start') {
      panSession.current = { origin: offsetRef.current, snap: lastSnap.current, moved: false };
      return false;
    }
    const session = panSession.current;
    if (!session) return false;
    const g = geometryRef.current;
    if (gesture.phase === 'change') {
      if (gesture.axis !== 'x') return false;
      if (!session.moved) {
        session.origin = offsetRef.current; session.snap = lastSnap.current; suppressUntil.current = 0;
      }
      session.moved = true; stop(); setMoving(true);
      const proposed = session.origin - gesture.x;
      moveTo(gesture.source === 'pointer' ? nativeRound(rubberBand(proposed, 0, maximumPanelOffset(g)))
        : Math.max(0, Math.min(maximumPanelOffset(g), proposed)));
      return true;
    }
    panSession.current = null;
    if (!session.moved) return false;
    suppressUntil.current = performance.now() + 400;
    const velocity = gesture.phase === 'cancel' || gesture.source !== 'pointer' ? 0 : -gesture.velocityX;
    const proposed = gesture.phase === 'cancel' ? offsetRef.current : gesture.source === 'pointer'
      ? projectPanelOffset(offsetRef.current, velocity) : offsetRef.current;
    let destination = nearestPanelSnap(proposed, g, session.snap, gesture.source === 'pointer' && gesture.phase !== 'cancel');
    if (gesture.source === 'wheel' && gesture.phase === 'end' && Math.abs(gesture.x) >= 55 && Math.abs(destination - session.snap) < 1) {
      const snaps = panelSnapOffsets(g, session.snap).sort((a, b) => a - b);
      destination = gesture.x < 0 ? snaps.find(value => value > session.snap + 1) ?? destination
        : [...snaps].reverse().find(value => value < session.snap - 1) ?? destination;
    }
    springTo(destination, velocity * PANEL_FRAME_MS);
    return true;
  }, [moveTo, springTo, stop]);
  const releaseCapture = useCallback(() => {
    gestureBinding.current?.cancel(); panSession.current = null;
  }, []);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // The app shell has stable width while the sidebar exposes 72..292 pixels.
    const viewport = root.parentElement?.parentElement ?? root;
    const measure = () => {
      const style = getComputedStyle(viewport);
      setViewportWidth(
        viewport.clientWidth -
          parseFloat(style.paddingLeft || "0") -
          parseFloat(style.paddingRight || "0"),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    callbacks.current.onLayoutChange?.({
      sidebarWidth: layout.sidebarWidth,
      timelineOffset: layout.timelineOffset,
      timelineWidth: geometry.feedWidth,
      timelineHidden: layout.timelineHidden,
      nativeOffset: layout.nativeOffset,
    });
  }, [
    layout.sidebarWidth,
    layout.timelineOffset,
    geometry.feedWidth,
    layout.timelineHidden,
    layout.nativeOffset,
  ]);
  const ids = panels.map((p) => p.id).join("\u0000");
  const widths = geometry.widths.join(",");
  useLayoutEffect(() => {
    if (!viewportWidth) return;
    if (!initialized.current) {
      initialized.current = true;
      if (!panels.length) {
        const initial = geometryRef.current.compactRoot
          ? compactPanelOffset(geometryRef.current)
          : 0;
        anchor.current = initial ? { kind: "compact" } : { kind: "expanded" };
        lastSnap.current = initial;
        moveTo(initial);
        syncNavigation(initial);
        return;
      }
    }
    const newIds = panels.map((p) => p.id),
      old = previousIds.current;
    const structure = newIds.join("\u0000") !== old.join("\u0000");
    const revealed = previousReveal.current !== revealKey;
    releaseCapture();
    if (structure || revealed) {
      const added = newIds.filter((id) => !old.includes(id));
      const removed = old.filter((id) => !newIds.includes(id));
      if (added.length) {
        const id = added[added.length - 1];
        if (document.activeElement instanceof HTMLElement)
          focusOrigins.current.set(id, document.activeElement);
        elements.current.get(id)?.focus({ preventScroll: true });
      } else if (removed.length) {
        const origin = focusOrigins.current.get(removed[0]);
        if (origin?.isConnected) origin.focus({ preventScroll: true });
        else
          elements.current
            .get(newIds[newIds.length - 1])
            ?.focus({ preventScroll: true });
      }
      removed.forEach((id) => focusOrigins.current.delete(id));
      previousIds.current = newIds;
      previousReveal.current = revealKey;
      springTo(
        newIds.length
          ? Math.max(
              compactPanelOffset(geometryRef.current),
              resolvePanelAnchor(
                { kind: "right", index: newIds.length - 1 },
                geometryRef.current,
              ),
            )
          : geometryRef.current.compactRoot
            ? compactPanelOffset(geometryRef.current)
            : 0,
      );
    } else {
      const retained = anchor.current;
      springTo(resolvePanelAnchor(retained, geometryRef.current));
      anchor.current = retained;
    }
  }, [
    ids,
    widths,
    viewportWidth,
    feedWidth,
    revealKey,
    releaseCapture,
    springTo,
    moveTo,
    syncNavigation,
  ]);
  useLayoutEffect(() => {
    if (navigationEcho.current === navigationExpanded) {
      navigationEcho.current = null;
      return;
    }
    if (previousNavigation.current === navigationExpanded) return;
    previousNavigation.current = navigationExpanded;
    releaseCapture();
    springTo(
      navigationExpanded
        ? 0
        : resolvePanelAnchor({ kind: "compact" }, geometryRef.current),
    );
  }, [navigationExpanded, releaseCapture, springTo]);
  useEffect(() => {
    const root = rootRef.current, workspace = root?.parentElement;
    if (!root || !workspace) return;
    const binding = bindGestureSurface(workspace, {
      pointer: event => !(event.target instanceof Element && event.target.closest('button,input,textarea,select,[contenteditable="true"],[data-panel-no-drag]')),
      wheel: event => !(event.ctrlKey || event.metaKey || (event.target instanceof Element && (
        event.target.closest('input,textarea,select,[contenteditable="true"]') ||
        (event.target.closest('[data-panel-no-drag]') && !event.target.closest('[data-panel-scroll]'))
      ))),
      onGesture: deckPan,
    });
    gestureBinding.current = binding;
    const click = (event: MouseEvent) => {
      if (event.detail && performance.now() < suppressUntil.current) { event.preventDefault(); event.stopPropagation(); }
    };
    workspace.addEventListener('click', click, true);
    return () => { binding.dispose(); gestureBinding.current = null; workspace.removeEventListener('click', click, true); };
  }, [deckPan]);
  useEffect(
    () => () => {
      stop();
      releaseCapture();
    },
    [stop, releaseCapture],
  );
  return (
    <DeckGestureContext.Provider value={deckPan}><div
      ref={rootRef}
      className={`panel-stack ${moving ? "panel-stack--moving" : ""} ${className}`}
      role="group"
      aria-label="Sliding panels"
      tabIndex={-1}
      data-panel-count={panels.length}
      data-native-offset={offset}
      onDragStart={(e) => e.preventDefault()}
      onFocusCapture={(event) => {
        if (!(event.target instanceof HTMLElement)) return;
        const panel = event.target.closest<HTMLElement>('.stack-panel');
        const workspace = rootRef.current?.parentElement;
        if (!panel || !workspace) return;
        const bounds = event.target.getBoundingClientRect();
        const visible = workspace.getBoundingClientRect();
        const x = (bounds.left + bounds.right) / 2;
        const y = (bounds.top + bounds.bottom) / 2;
        const covering = y >= visible.top && y < visible.bottom
          ? document.elementFromPoint(x, y)?.closest('.stack-panel') : null;
        if (bounds.left < visible.left || bounds.right > visible.right || (covering && covering !== panel)) {
          springTo(resolvePanelAnchor({ kind: 'right', index: Number(panel.dataset.panelIndex) }, geometryRef.current));
        }
      }}
      onKeyDown={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest('input,textarea,select,[contenteditable="true"]')
        )
          return;
        if (event.key === "Escape" && panels.length) {
          event.preventDefault();
          onDismiss(panels.length - 1);
        } else if (
          event.altKey &&
          (event.key === "ArrowLeft" || event.key === "ArrowRight")
        ) {
          event.preventDefault();
          // Keyboard browsing must not leave focus in a sheet moved offscreen.
          rootRef.current?.focus({ preventScroll: true });
          const snaps = panelSnapOffsets(
            geometryRef.current,
            lastSnap.current,
          ).sort((a, b) => a - b);
          const next =
            event.key === "ArrowLeft"
              ? ([...snaps].reverse().find((x) => x < offsetRef.current - 1) ??
                0)
              : (snaps.find((x) => x > offsetRef.current + 1) ??
                lastSnap.current);
          springTo(next);
        }
      }}
    >
      {panels.map((panel, index) => (
        <section
          key={panel.id}
          ref={(element) => {
            if (element) elements.current.set(panel.id, element);
            else elements.current.delete(panel.id);
          }}
          className="stack-panel"
          data-panel-index={index}
          tabIndex={-1}
          aria-label={panel.title || `Panel ${index + 1}`}
          aria-hidden={layout.hidden[index] || undefined}
          inert={layout.hidden[index]}
          style={{
            width: geometry.widths[index],
            transform: `translate3d(${layout.positions[index]}px,0,0)`,
            visibility: layout.hidden[index] ? "hidden" : undefined,
            zIndex: index + 1,
          }}
        >
          <header
            className="stack-panel__header"
            title="Drag sideways to browse panels"
          >
            <h2 className="stack-panel__title">{panel.title}</h2>
            <button
              className="stack-panel__close"
              type="button"
              aria-label={`Close ${panel.title || "panel"}`}
              onClick={() => onDismiss(index)}
            >
              <span aria-hidden="true">×</span>
            </button>
          </header>
          <div className="stack-panel__body">{panel.content}</div>
        </section>
      ))}
    </div></DeckGestureContext.Provider>
  );
}
export default PanelStack;
