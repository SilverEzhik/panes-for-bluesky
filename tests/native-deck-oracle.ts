/** Hand-derived golden values from retained Twitter 3.1.1 ARM methods.
 * No production helper is used to construct expected results.
 * 0x9b728: insert native zero, timeline prefix-72, detail right then left.
 * 0x9c014: save cumulative prefix before frame clamp; hide before last clamp.
 * These fixtures describe native coordinates, including the 292-point sidebar.
 */
export const nativeDeckOracle = {
  portraitOne: {
    viewportWidth: 768,
    feedWidth: 476,
    widths: [476],
    snaps: [0, 220, 476],
  },
  portraitTwo: {
    viewportWidth: 768,
    feedWidth: 476,
    widths: [476, 476],
    snaps: [0, 220, 476, 696, 952],
    atRightAnchor: [0, 220, 476, 952],
    atLeftAnchor: [0, 220, 696, 952],
  },
  wideTie: {
    viewportWidth: 850,
    feedWidth: 476,
    widths: [830, 476],
    snaps: [0, 220, 748, 696, 1224],
    proposed: 722,
    winner: 748,
  },
  // Native positions relative to viewport; implementation reports workspace x.
  layoutAt952: {
    sidebarWidth: 72,
    detailX: [72, 292],
    hidden: [false, false],
    timelineHidden: true,
  },
  layoutAt1172: {
    sidebarWidth: 72,
    detailX: [72, 72],
    hidden: [true, false],
    timelineHidden: true,
  },
  // animate at 0x9c8bc, working x=0, dx=0, destination=100.
  spring: [
    [0, 5],
    [5, 8.25],
    [13.25, 10.1125],
    [23.3625, 10.910625],
  ],
} as const;
