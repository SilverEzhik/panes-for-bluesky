# Responsive and mobile ergonomics critique

Read-only review, 2026-10-15. Source inspected: App, PanelStack, AccountDialogs, PostCard, LinkPanels and their CSS. Runtime checks used isolated Chromium contexts against localhost:5173, blocked service workers, and intercepted XRPC fixtures; no live account writes. Tested portrait 320×568, 390×844, 600×800, 601×800, 768×1024 and landscape 667×375, 844×390, 1024×768. Measurements below are live DOM bounds, not inferred screenshot defects. Actual iOS keyboard, notch, standalone PWA, and Safari browser chrome behavior remain device-verification work.

Preserve the original iPad column widths when space permits, left navigation rail, textured toolbar, and stacked sheets. These findings call for constraint handling and dependable controls, not a replacement mobile navigation design.

## 1. P1 — Web sheets overflow at widths immediately above the phone breakpoint

**Confirmed.** `src/components/PanelStack.tsx:57–61` caps sheet width only when `(max-width: 600px)` matches. `src/App.tsx:607` assigns web sheets 830px in landscape and 574px in portrait. The stack clips overflow (`src/components/PanelStack.css:4`).

At 667×375, the stack occupies x74–667 (593px), but the web sheet occupies x74–904 (830px). At 844×390 its right edge is x902. Even 601×800 fails: its 574px portrait sheet ends at x648. The right-aligned close, reload, and external-browser controls are beyond the visible viewport. This is particularly damaging because the external-browser control is the escape hatch when embedding fails.

**Fix:** cap the rendered width of every sheet by the available stack width, preserving 830/574/476 as preferred widths. Use the same effective width in all physics/visibility calculations. Do not simply hide overflow inside the iframe.

**Acceptance:** at 600, 601, 667, 768, 800, 801, 844, and 1024px viewport widths, assert the latest sheet's right edge and the centers of close/reload/open-browser controls are within the visible stack and hit-test to their buttons. Repeat while navigation expands and while rotating an existing web sheet.

## 2. P1 — Landscape phones lose navigation and compose below the viewport

**Confirmed.** `.app-shell` is viewport-height and overflow-hidden (`src/styles.css:63–68`), while the sidebar has no vertical scrolling or compact-height adaptation. Fixed-height navigation entries and the bottom group exceed short screens (`:211–249`, `:1245–1298`, `:1647–1698`).

At 844×390 without sheets, Profile spans y356–409, New post y427–469, and the footer y485–534. With sheets, New post falls to y488–528 and the footer to y543–588. At 667×375 the latter positions recur. These controls are unreachable through ordinary page scrolling.

**Fix:** retain the sidebar layout but provide a height-constrained scrolling navigation region or whole-rail scrolling; keep compose/account access reachable. A short-height adjustment can reduce decorative spacing without turning iPad navigation into a bottom tab bar.

**Acceptance:** at 667×375 and 844×390, with zero, one, and two sheets, reach each navigation item, New post, and account action by touch. Also test iPad split-view height and browser toolbar expansion.

## 3. P1 — Expanded compact navigation covers its own collapse control

**Confirmed.** At widths <=800px, `.nav-expanded .sidebar` becomes an absolute 292px overlay (`src/styles.css:1306–1312`). The workspace shifts to x0 and the toggle stays inside it (`src/App.tsx:416–422`). At 390px, the toggle is x9–39/y7–37; hit-testing its center returns `.brand-bird`, not the toggle. The dimming pseudo-element explicitly has `pointer-events: none` (`src/styles.css:1343–1350`) and there is no backdrop dismissal handler or separate close control.

Selecting a navigation destination collapses the overlay but also clears sheets (`src/App.tsx:227–239`). Thus a user cannot simply inspect navigation and return through an obvious tappable dismiss control while preserving the current stack. Panel gestures may still provide a less discoverable exit.

**Fix:** expose the same styled toggle/close affordance inside the expanded rail, or implement a real dismissible backdrop. Dismissal must only change navigation expansion, leaving sheets and reading position intact. Add `aria-expanded` and `aria-controls` to the toggle.

**Acceptance:** open navigation while viewing a scrolled two-sheet stack, dismiss it through a visible button and backdrop separately, and assert unchanged sheet IDs and scroll position. Hit-test the dismissal control at 320, 390, and 768px widths.

## 4. P2 — Any width resize returns the deck to its newest sheet

**Confirmed.** `src/components/PanelStack.tsx:149–153` unconditionally springs to `maximumPanelOffset` whenever viewport width, effective panel widths, or feed width changes. This couples geometry maintenance to opening a new sheet.

Runtime reproduction: open Conversation, then Profile at 1024×768; use Alt+Left to browse Conversation without closing Profile. Conversation is at x548 and Profile at x1024. Resize only one pixel to 1023×768: Conversation jumps to x72 and Profile to x547. The selected reading sheet changes despite no navigation action.

**Fix:** track the logical snap anchor (sheet ID plus left/right alignment) and translate that anchor into the new geometry on resize. Only additions/reveal requests should select the newest sheet. Keep keyed bodies mounted.

**Acceptance:** rotate portrait↔landscape and resize split view while reading each earlier sheet; assert the same logical sheet stays selected and its visible content anchor is preserved. Raw scrollTop can legitimately vary with text reflow: in the existing two-sheet rotation check the bodies stayed mounted, with profile scrollTop changing 500→430→453, rather than resetting to zero.

## 5. P2 — Edge-to-edge viewport has no safe-area compensation

**Source-confirmed omission; physical-device impact requires verification.** `index.html:5` opts into `viewport-fit=cover`; no `env(safe-area-inset-*)` use exists in the inspected application styles. The shell and sheet headers start at y0, sidebar at x0, footer at the viewport bottom. This exposes controls to notch/home-indicator regions in edge-to-edge layouts.

WebKit explicitly advises selectively padding important content after enabling cover: [Designing Websites for iPhone X](https://webkit.org/blog/7929/designing-websites-for-iphone-x/). This is a browser behavior concern, not evidence that every Safari display mode currently obscures the UI.

**Fix:** retain full-bleed textures but inset interactive content and scroll padding by the actual safe-area values. Account for left/right landscape insets in stack geometry rather than changing only visual padding.

**Acceptance:** actual notched iPhone Safari and installed PWA, both orientations; actual iPad standalone; browser bars expanded/collapsed. Confirm header controls, sidebar actions, final post actions, and modal footer remain outside unsafe regions without duplicated padding.

## 6. P2 — Dialog sizing follows layout viewport, with no keyboard-aware visible bounds

**Source-confirmed coverage gap; not a claimed reproduced iOS failure.** Dialogs autofocus text fields (`src/components/AccountDialogs.tsx:21–22`), lock body overflow (`:17–18`), center a fixed backdrop, and cap the dialog at `calc(100dvh - 32px)` (`src/styles.css:1055–1077`). No VisualViewport subscription exists. `100dvh` alone does not establish the keyboard-visible rectangle on engines where the keyboard shrinks only the visual viewport. [Chrome's viewport behavior explanation](https://developer.chrome.com/blog/viewport-resize-behavior?hl=en) documents that distinction and its alignment with iOS Safari.

**Fix:** validate on-device first, then size/position the modal's usable scroll region against `visualViewport.height` and offsets when needed, including keyboard resize/scroll events and cleanup. Keep a scrollable form and reachable submit/cancel controls; avoid globally disabling zoom. Check 14px sign-in inputs and 12px phone search input for focus-induced zoom as part of that device pass.

**Acceptance:** sign-in, advanced service field, search, and long compose drafts with virtual keyboard visible; rotate while editing; dismiss keyboard without losing draft/caret or leaving a page offset. Emulating a shorter Playwright viewport is not equivalent to this test.

## 7. P3 — Missing-avatar fallback overrides compact dimensions

**Confirmed; deliberately minor.** `src/components/PostCard.tsx:31–36` gives fallback spans inline width/height of 48px, while actual image avatars use HTML dimensions. Phone CSS expects 38px (`src/styles.css:1401–1406`). At 390px, the avatar button is x69–107 (38px), while its fallback occupies x69–117 (48px), spilling 10px into the adjacent content gap. Actual image avatars honor the CSS size.

**Fix:** express the desired size through a CSS custom property or shared class rule instead of inline width/height that defeat context-specific sizes. Preserve intentionally larger detail/profile avatars.

**Acceptance:** avatar present/absent pairs in compact feed, detail, profile, quote and account rail at phone/iPad widths; fallback bounds must match the intended target without changing iPad typography or spacing.

## Checks that passed / retained behavior

- 320×568 gallery fit mode kept a 1200×900 fixture within a 260px content viewport; image measured 260×195. Gallery toolbar tools remained visible.
- Full-size mode retained the 1200×900 image in an internal overflow viewport. Real Chromium CDP touch swipes moved horizontal scrollLeft to 156 and vertical scrollTop to 156. Do not remove native two-axis panning to fix unrelated sheet behavior.
- Existing Conversation/Profile bodies persisted through 390×844 → 844×390 → 768×1024 → 1024×768 → 667×375 → 390×844. The issue is logical deck selection on resize, not wholesale panel remounting.
- Normal iPad 768×1024 web-sheet geometry fit: the 574px sheet occupied x194–768. Preserve that intentional width when sufficient space exists.
