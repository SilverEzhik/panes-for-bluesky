# Safari, macOS and iPad gesture review

Read-only code/research review, 2026-10-15. No application changes or dependency installs; proposed regressions below were not executed. Existing evidence is **52 passed / 8 skipped**, not physical Safari verification (`research/verification/browser-tests.txt:83-93`).

## 1. Mixed control/content touches violate the gesture exclusion policy

**Confirmed code defect; high priority.** `PostCard.tsx:186-193` excludes individual pointer targets, but `208-220` includes every touch that began anywhere inside the post. Put finger A on the author button and finger B on post text: the second touchstart is eligible and `touchPoints` counts both contacts. Their movement can open the post or popup and cancel the control's native interaction. Reversing finger order produces different behavior because the second event's target is ineligible. A third contact outside the post is ignored entirely, so two local contacts can still launch during a three-finger interaction.

**Fix:** track eligible touch identifiers from `changedTouches`; require both original targets to be eligible and the intended total contact count. Once an excluded/third contact appears, cancel recognition until all relevant contacts end. Preserve each stream's identity rather than rebuilding ownership from containment alone. Touch targets remain tied to their starting elements, so this is practical. [W3C Touch Events](https://www.w3.org/TR/touch-events/)

**Tests:** dispatch TouchEvents with different `Touch.target` values in both contact orders; text+button, text+link, two text contacts+one sidebar contact. Assert no launch and no prevention for rejected gestures. Repeat with CDP hit-tested coordinates; current `touch.spec.ts:65-75` places both contacts on text simultaneously and cannot catch this.

## 2. Native scroll takeover can coexist with post launch

**Likely browser-dependent defect; high priority, needs native evidence.** Posts allow `pan-y pinch-zoom` (`styles.css:372`), and single-finger touchstart/move is left native. Adding finger B after finger A has already started scrolling creates a fresh `touchStart` (`PostCard.tsx:216-225`). Even when subsequent touchmoves are **not cancelable**, recognition still runs and may open a panel while native scrolling continues. The synthetic pointer test cannot prove this safe. Pointer cancellation does not itself stop the separate TouchEvent path.

**Fix:** explicitly track whether the recognizer owns a cancellable touch stream. If the browser has taken ownership, abandon recognition for the remainder of that contact sequence; reset on all contacts ending/canceling. Avoid changing `touch-action` after pointerdown as a fix: the Pointer Events standard says that cannot change the ongoing interaction. Preserve one-finger native scrolling and document that two-finger actions must begin before scrolling. [W3C Pointer Events](https://www.w3.org/TR/pointerevents/), [W3C Touch Events](https://www.w3.org/TR/touch-events/)

**Tests:** native A down → vertical move until scrollTop changes → B down → both move down 60px. Expect scrolling only, no panel/popup. Also test B arriving before versus after the first pointercancel and a synthetic noncancelable touchmove. Record cancelable/defaultPrevented, touch IDs, pointercancel, scrollTop and visualViewport.scale on iPad Safari.

## 3. Safari pinch continuation has no owner after popup retargeting

**Confirmed missing handling, hardware-dependent manifestation.** The Ctrl-wheel path explicitly installs document capture continuation because opening the portal retargets subsequent events (`PostCard.tsx:230-261`). Safari's `gesturechange`/`gestureend` remain attached only to the original article (`285-324`); the portal is under `document.body` (`776-849`). If Safari retargets later events to the overlay, those events are neither prevented nor used to clear `safariStartScale`. Continued pinch may therefore zoom the page after opening actions. Safari gesture targeting for this exact mid-gesture DOM change is not established by this review; do not label it a reproduced Safari bug.

**Fix:** an explicitly owned Safari gesture should receive capture-phase continuation through gestureend, with cleanup on cancel/blur/unmount and a bounded recovery timeout. Do not globally consume unrelated future gestures. Safari really does expose gesture events on macOS; adding them is appropriate, but synthetic Event objects only test handler logic. [WebKit Safari gesture support](https://webkit.org/blog/6008/new-web-features-in-safari/), [Apple GestureEvent](https://developer.apple.com/documentation/webkitjs/gestureevent)

**Tests:** gesturestart/change on post → popup appears → gesturechange/end on its backdrop. Assert cancellation for the owned continuation; then a new gesture outside the post must remain uncanceled. On a Mac trackpad assert visualViewport scale/page zoom does not change during the remainder of the opening gesture. Include ending outside the viewport and switching windows mid-pinch.

## 4. Post click suppression rejects a fresh deliberate tap

**Confirmed code behavior; medium priority.** `launch` suppresses every article click for 800ms (`PostCard.tsx:146-151,551-553`), with no new-pointerdown reset. The panel stack already has the better distinction (`PanelStack.tsx:234-237`): an actual new press clears compatibility-click suppression. A user can pinch, immediately dismiss actions, tap the original post, and get no response. Existing tests wait 850ms (`touch.spec.ts:106-107`, `trackpad.spec.ts:20-21`), masking the interval.

**Fix:** tie suppression to the completing gesture, not all clicks inside a time window. Clear on a new deliberate primary press after that gesture has ended; keep keyboard activation available. Retain cancellation of the compatibility click belonging to the gesture itself. Do not clear merely because another finger joins the active gesture.

**Tests:** pinch → Escape/dismiss → fresh touch tap within 100ms opens once; compatibility click with no intervening press opens nothing. Include gesture held longer than 800ms before release, which also tests whether a fixed timer expires before its intended click.

## 5. A different pointer can finish the active panel drag

**Confirmed code defect; medium priority.** Move and lost-capture handlers check pointer identity (`PanelStack.tsx:259,285`), but `onPointerUp` and `onPointerCancel` do not (`280-281`). Mouse/pen drag A can therefore be committed/canceled by a different pointer B bubbling through the stack. Most second-touch starts deliberately cancel first (`238-240`), so ordinary two-touch input is partly protected; mixed pen/mouse/touch and stray cancel sequences are not.

**Fix:** require `event.pointerId === dragRef.current?.pointerId` for terminal pointer events; reserve unqualified cancellation for blur or explicit all-input reset. Keep the existing target check for implicit-capture transfer, which avoids canceling when capture moves from a child to the root.

**Tests:** begin a real mouse/pen-equivalent drag, dispatch unrelated pointerup/cancel with another ID, assert it remains active and no dismiss fires; end the real pointer and assert one settlement. Add same-pointer cancel, blur, lost capture, and resize/panel insertion while captured. The current touch trace records capture events but does not assert these cancellation invariants (`touch.spec.ts:40-48`). [W3C Pointer Events](https://www.w3.org/TR/pointerevents/)

## 6. Wheel ownership needs a native cancellation/edge-navigation regression

**Risk, not a demonstrated Safari failure.** `PanelStack.tsx:185-217` chooses ownership independently for each event based on axis ratio and immediately moves sheets after `preventDefault()`. A burst that begins vertically/diagonally and later becomes horizontal can switch owners mid-scroll. Some wheel sequences expose only the first event as cancelable; later sheet motion can then coexist with native scrolling/navigation. Native non-passive registration (`221`) is correct and should be retained, but is not proof that every received event is cancelable. [MDN wheel cancellation](https://developer.mozilla.org/en-US/docs/Web/API/Event/cancelable)

**Fix/test direction:** define ownership for a wheel burst and verify cancellation before starting custom motion; keep vertical ownership until the idle boundary. Test vertical→horizontal, diagonal threshold crossings, momentum tail, deltaMode lines/pages, Shift-wheel, Ctrl-wheel, and canceled vs noncancelable events. Assert native vertical scroll and sheet transforms never advance together after ownership switches. Avoid “fixing” this with global preventDefault.

For browser back/forward swipes, `.panel-stack { overflow:hidden; overscroll-behavior-x:contain }` is a meaningful boundary policy (`PanelStack.css:1-6`); **overflow:hidden does create a scroll container**, so do not report this declaration as inert. Its behavior with Safari's OS edge gesture still needs a real Mac/iPad test with a prior history entry, at both ends of the stack. Browser-chrome navigation and content scrolling are distinct test surfaces. [W3C Overscroll Behavior](https://www.w3.org/TR/css-overscroll-1/), [MDN overflow-hidden boundaries](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overscroll-behavior)

## 7. WebKit/Firefox touch coverage can improve locally, but native drag/pinch is not available through the installed public Playwright API

**Confirmed verification gap.** Native touchscreen tests skip both engines (`touch.spec.ts:14,56`); native trackpad pinch also skips both (`trackpad.spec.ts:40`). The all-engine test constructs untrusted PointerEvents (`touch.spec.ts:89-95`); the Safari test constructs generic Events and injects `scale` (`trackpad.spec.ts:22-27`). These prove callback/threshold logic, not Safari gesture dispatch, default zoom, capture, scrolling, or navigation. Playwright WebKit is its own build, not installed Safari. [Playwright browsers](https://playwright.dev/docs/browsers), [Playwright synthetic touch events](https://playwright.dev/docs/touch-events)

**Local feasibility inspected:** the installed package's `node_modules/playwright-core/lib/coreBundle.js:46176-46186` implements Firefox raw touch via `Page.dispatchTapEvent`; `47762-47772` uses WebKit `Input.dispatchTapEvent`. Public Touchscreen exposes taps only; public CDP is Chromium-only. There is no supported local WebKit/Firefox equivalent of the current CDP multi-contact sequence through this API. This does not prove every possible external automation stack lacks touch injection; no new driver/dependency was installed or investigated as an implementation. [Playwright Touchscreen](https://playwright.dev/docs/api/class-touchscreen), [Playwright CDP restriction](https://playwright.dev/docs/api/class-browsercontext#browser-context-new-cdp-session)

**Do now:** run `hasTouch:true` contexts and real `.tap()` regressions on all engines, plus synthetic TouchEvent ownership/cancellation cases, capture-state cases and wheel burst tests. Name them accurately. Preserve Chromium CDP tests as browser-input tests, not physical hardware tests. Finish with a physical iPad Safari + installed PWA and macOS Safari trackpad matrix: one-finger vertical scroll, staggered contacts, controls, third finger, pinch continuation, zoom outside posts, browser edge navigation, orientation change, background/foreground and interaction during momentum. Record OS/Safari version and event traces alongside results.
