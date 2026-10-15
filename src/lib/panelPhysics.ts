/** Native coordinates include sidebar (index 0), timeline (1), and details (2+). */
export interface PanelGeometry {
  viewportWidth: number;
  feedWidth: number;
  widths: readonly number[];
  sidebarWidth?: number;
  railWidth?: number;
  /** Responsive adaptation below the original 768-point tablet viewport. */
  compactRoot?: boolean;
}
export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
export const PANEL_FRAME_MS = 1000 / 60;
export const PANEL_FRICTION = 0.7;
export const nativeRound = (value: number) =>
  Math.sign(value) * Math.round(Math.abs(value));
export const compactPanelOffset = (g: PanelGeometry) =>
  (g.sidebarWidth ?? 292) - (g.railWidth ?? 72);
export function advancePanelSpring(
  position: number,
  velocity: number,
  destination: number,
) {
  const nextPosition = position + velocity;
  return {
    position: nextPosition,
    velocity: velocity * PANEL_FRICTION + (destination - nextPosition) * 0.05,
  };
}
export function maximumPanelOffset(g: PanelGeometry): number {
  if (!g.widths.length) return g.compactRoot ? compactPanelOffset(g) : 0;
  return Math.max(
    compactPanelOffset(g),
    (g.sidebarWidth ?? 292) +
      g.feedWidth +
      g.widths.reduce((a, b) => a + b, 0) -
      g.viewportWidth,
  );
}
/** Native insertion order matters: nearest-distance ties retain the first candidate. */
export function panelSnapOffsets(
  g: PanelGeometry,
  lastSnapOffset?: number,
): number[] {
  if (!g.widths.length) return g.compactRoot ? [0, compactPanelOffset(g)] : [0];
  const result = [0, compactPanelOffset(g)];
  let prefix = Math.trunc(g.sidebarWidth ?? 292) + Math.trunc(g.feedWidth);
  for (let i = 0; i < g.widths.length; i++) {
    const width = Math.trunc(g.widths[i]);
    // Negative alignments on oversized desktop windows are a responsive adaptation.
    const right = Math.max(0, prefix + width - Math.trunc(g.viewportWidth));
    const left = prefix - (g.railWidth ?? 72);
    if (i === g.widths.length - 1) result.push(right);
    else if (lastSnapOffset === right || lastSnapOffset === left)
      result.push(lastSnapOffset);
    else result.push(right, left);
    prefix += width;
  }
  return [...new Set(result)];
}
export function projectPanelOffset(
  offset: number,
  velocityPixelsPerMs: number,
): number {
  return nativeRound(
    offset + (velocityPixelsPerMs * PANEL_FRAME_MS) / (1 - PANEL_FRICTION),
  );
}
export function nearestPanelSnap(
  proposed: number,
  g: PanelGeometry,
  lastSnapOffset = 0,
  throwing = false,
): number {
  const target = Math.trunc(proposed);
  const candidates = panelSnapOffsets(g, lastSnapOffset).filter(
    (c) =>
      !throwing ||
      (proposed > lastSnapOffset ? c > lastSnapOffset : c < lastSnapOffset),
  );
  return (
    candidates.reduce(
      (best, c) =>
        best === undefined || Math.abs(c - target) < Math.abs(best - target)
          ? c
          : best,
      undefined as number | undefined,
    ) ?? lastSnapOffset
  );
}
export function rubberBand(value: number, min: number, max: number): number {
  return value < min
    ? min + (value - min) * 0.5
    : value > max
      ? max + (value - max) * 0.5
      : value;
}
export interface PanelDeckLayout {
  sidebarWidth: number;
  timelineOffset: number;
  timelineWidth: number;
  timelineHidden: boolean;
  nativeOffset: number;
}
/** One prefix pass and one visibility pass, including the native timeline cutoff. */
export function layoutPanelDeck(offset: number, g: PanelGeometry) {
  const sidebar = g.sidebarWidth ?? 292;
  const rail = g.railWidth ?? 72;
  const sidebarWidth =
    g.widths.length || g.compactRoot
      ? clamp(sidebar - offset, rail, sidebar)
      : sidebar;
  const timelineX =
    g.widths.length || g.compactRoot
      ? Math.max(rail, sidebar - offset)
      : sidebar - offset;
  let prefix = sidebar + g.feedWidth;
  let lastPinned = -1;
  const positions = g.widths.map((width, index) => {
    if (prefix - rail <= offset) lastPinned = index;
    const x = Math.max(rail, prefix - offset) - sidebarWidth;
    prefix += width;
    return x;
  });
  return {
    sidebarWidth,
    timelineWidth: g.feedWidth,
    timelineOffset: timelineX - sidebarWidth,
    timelineHidden: lastPinned >= 0,
    nativeOffset: offset,
    positions,
    hidden: positions.map((_, index) => index < lastPinned),
  };
}
export type PanelAnchor =
  | { kind: "expanded" }
  | { kind: "compact" }
  | { kind: "left" | "right"; index: number };
export function resolvePanelAnchor(
  anchor: PanelAnchor,
  g: PanelGeometry,
): number {
  if (anchor.kind === "expanded") return 0;
  if (!g.widths.length) return g.compactRoot ? compactPanelOffset(g) : 0;
  if (anchor.kind === "compact") return compactPanelOffset(g);
  const index = Math.min(anchor.index, g.widths.length - 1);
  const prefix =
    (g.sidebarWidth ?? 292) +
    g.feedWidth +
    g.widths.slice(0, index).reduce((a, b) => a + b, 0);
  return Math.max(
    0,
    anchor.kind === "left"
      ? prefix - (g.railWidth ?? 72)
      : prefix + g.widths[index] - g.viewportWidth,
  );
}
export function anchorForPanelOffset(
  offset: number,
  g: PanelGeometry,
): PanelAnchor {
  if (offset === 0) return { kind: "expanded" };
  if (offset === compactPanelOffset(g)) return { kind: "compact" };
  for (let index = 0; index < g.widths.length; index++) {
    for (const kind of ["right", "left"] as const)
      if (resolvePanelAnchor({ kind, index }, g) === offset)
        return { kind, index };
  }
  return { kind: "right", index: g.widths.length - 1 };
}
