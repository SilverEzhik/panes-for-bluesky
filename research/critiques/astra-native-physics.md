# Astra critique: native panel geometry and interaction fidelity

Read-only review, 2026-10-15. No application code or tests changed. This review reads the retained, repaired Ghidra pseudocode directly, checks its JSON target/procedure identities, and checks selected raw Thumb instruction ranges. Existing test results are not native-device equivalence evidence. No native execution was performed.

## Evidence boundary

All native addresses below refer to Twitter 3.1.1 executable SHA-256 `eb02c536eab4b7308eddc4cd8642648ab9e20a2269900f06a0b91f4f29fe53e1`; file offset = VM minus `0x1000` for these methods. These are static observations of that build, not proof of September 2010 launch-build behavior or runtime timing on an iPad.

Primary records inspected:

- `_updateLayout:` `0x9c014`, `mcp-native-fixed-layout.c/json`, Evidence `ev_b6afd1b50ee657fd05a70ca919a9b6c7260961d5d6676294f4e4af725d16f559`.
- `swipePointsForSwipeView:proposedOffset:` `0x9b728`, `mcp-native-fixed-swipe-points.c/json`, Evidence `ev_809c1f3526c0c0de005d338751b09dc18ea11b05eab85c635d4853b29785436e`; nearest/directional methods at `0x9b55c` / `0x9b630` and their fixed pseudocode.
- `touchesMoved:withEvent:` `0x9d0f8`, `mcp-native-fixed-gesture-moved.c/json`, Evidence `ev_45fd2fa6a12c996bdfa815c496dcab6a6969f889689f56ccfe806e50c43c3a34`; raw movement/release/`_didScroll:` instructions in `macho-static-3.1.1-panel-disassembly.txt`.
- `animate` `0x9c8bc`, `mcp-native-fixed-scroll-animate.c/json`, Evidence `ev_e9f331c436f5ce8f47d5dffef85b87f18bf9aedba03494c772523fc22e4f05e5`; animation setup `0x9cb60` and scroll initialization fixed pseudocode.
- Tweet width `0x9e7d4`, `mcp-native-fixed-tweet-width.c/json`, Evidence `ev_b916f6b9a0f35b6581befb0be47199a72285e099f0201da9231666e329305cdd`; web/sidebar width pseudocode. Narrative cross-checks: `research/reverse-engineering.md`, `rea/macho-static-findings.md`, `rea/release-throw-analysis.md`.

## What is already substantially correct

The compact-coordinate geometry is not merely fixed-width paging. With a 72-point rail, native offset `N = compactOffset + 220` and native viewport `V = workspaceWidth + 72`, a detail's native displayed x is `72 + max(0, feedWidth + priorDetailWidths - compactOffset)`. `panelLeft` implements exactly that algebra for the compact desktop state. It correctly preserves the *unclamped cumulative width* for subsequent cards; native saves `nextPrefix` before altering the current frame (`0x9c102–0x9c2ac`). Do not replace this with accumulation of rendered/clamped positions or a 72-pixel gap between every card.

`panelIsHidden` also correctly hides detail indices before the latest clamped detail in that coordinate system (`0x9c33e–0x9c362`). The native two-controller exception concerns sidebar + timeline, not timeline + first detail. The root sidebar remains visible. The web timeline remains mounted underneath a fully covering detail, whereas native hides that non-root view; visual overlap normally conceals this difference, but the timeline can remain in the accessibility/focus tree.

The normal spring recurrence, `.7` friction, `.05` restoring term, 60 Hz step, previous-snap directional filtering, and lack of release speed cutoff match the recovered normal paths. The pause-before-lift denominator is correct in the ordinary case. Web widths 574/830 also match recovered returns. These findings do not establish parity of the complete interaction.

## 1. High: navigation is outside the native coordinate system, losing a real snap and continuous motion

**Implementation:** `PanelStack.tsx:149–178`, `199–213`; `App.tsx:600–607`; `styles.css:1647–1654`, `1704–1707`. All panel candidates are nonnegative compact offsets. Navigation expansion is instead a boolean triggered at more than 110 pixels of right travel beyond the compact origin. Expansion changes sidebar flex width from 72 to 292 and targets panel offset zero. Collapse targets the *maximum* panel offset through the layout effect.

**Native:** candidate zero is an actual native offset; timeline contributes 220 (`0x9b728`, `0x9b8ce–0x9b8da`). Native layout keeps the sidebar frame at the content offset and moves/clamps other views continuously (`0x9c014`). In compact coordinates the expanded-sidebar candidate is **-220**, not another version of zero. Native `_didScroll:` only halves displacement below native zero (`0x9cd0a–0x9cd44`), so the interval compact -220..0 is ordinary travel, not rubber banding.

**Scenario:** from the compact timeline anchor, a recognized, slow rightward gesture with modest post-recognition movement projects below native 220. Native directional selection can select native zero. The web halves negative travel and refuses expansion until its independent 110-pixel threshold. Conversely, collapsing expanded navigation with several sheets springs straight to the newest sheet rather than selecting the next native candidate. The sidebar CSS transition also causes ResizeObserver callbacks and repeated spring restarts, so it is not a mere change of units.

**Fix:** represent sidebar, timeline, and details in one native-coordinate layout/snap model, or maintain an explicit reversible transform that includes compact -220 and derives rail exposure from the same offset. Keep mobile menu behavior a separately documented adaptation. Native pointer gestures are attached to the scroll view (`scroll-init.c`), whereas the current handler also refuses gestures not starting inside a detail (`PanelStack.tsx:245–246`); include the timeline in the intended interaction surface.

**Tests:** at 1024×768, open three details, return to compact timeline anchor, slowly swipe right without exceeding 110 pixels, and compare the selected logical anchor. Assert sidebar/timeline/detail viewport positions throughout the transition, not only after settlement. Collapse expanded navigation and assert the next snap, not newest detail. Test the same operation starting on the timeline. The 74-pixel rail under `styles.css:1245–1248` should be explicitly tested at 768×1024; it is not the exact native 72-pixel conversion.

## 2. High: resize discards the user's selected sheet and snap history

**Implementation:** `PanelStack.tsx:113–124`, `149–153`. Every viewport width or card width change cancels the drag and springs to maximum (or zero when navigation is expanded). `springTo` immediately replaces `lastSnapOffset` (`78–80`). Even a one-pixel desktop resize therefore turns a historical-card view into a newest-card reveal. Sidebar width animation amplifies this by generating successive viewport measurements.

**Native boundary:** the reviewed native snap path explicitly consumes `lastSnapOffset`, suppressing a column's alternative alignment when its existing alignment matches (`0x9b8e8–0x9b966`). The native orientation/resize lifecycle has not been recovered here; claiming that native definitely preserves a specific anchor on rotation would exceed the evidence. The destructive web behavior is certain from source, and preservation of reader context is the proposed adaptation.

**Fix:** separate structure/reveal changes from measurement changes. Track the logical anchor (column identity plus left/right alignment), re-resolve it when widths change, and only intentionally reveal the newest sheet when a sheet is opened/re-requested. Define what to do if the selected sheet disappears. During active drag, either rebase coordinates or cancel to that anchor.

**Tests:** open five mixed-width cards, navigate back to the second, resize by one pixel, then rotate across the web-width breakpoint. The same logical card/alignment should stay selected. Repeat during an active drag and during navigation expansion; assert a bounded number of destination changes and no stale pointer capture. This is more meaningful than checking that the last card eventually becomes visible.

## 3. Medium: gesture recognition and final event sampling differ from recovered native behavior

**Implementation:** `PanelStack.tsx:250–278` applies the entire displacement from pointerdown as soon as its threshold is crossed, requiring `abs(dx) >= 1.15 * abs(dy)`. `finishDrag` at `165–168` substitutes pointerup displacement for the stored last movement delta when the up coordinate differs.

**Native:** `touchesMoved` state-zero branch resets `_firstPoint` to the threshold-crossing location, clears `_dx`, initializes `_dt`, and begins recognition (`0x9d21c–0x9d250`). A subsequent state-one event changes state; state-two calculates delta and calls `_didScroll:`. `_didScroll:` uses the reset first point plus original bounds (`0x9cce8–0x9cd08`). Native rejects vertical-dominant travel above 10, then accepts horizontal travel above 10; there is no recovered 1.15 axis ratio. Release uses the stored movement `_dx` (`0x9d07e–0x9d09e`), not a new displacement reconstructed from the touch-up coordinate.

**Scenario:** a first move of 20 pixels immediately moves the web deck by 20, while the native recognizer establishes its origin there. A dx=11, dy=10.5 gesture is horizontal in the recovered native branch but does not start web dragging. If the last move has a 20-pixel delta and pointerup arrives at a further 1-pixel displacement, the web replaces the release impulse with 1 rather than preserving 20.

**Fix:** decide whether exact native recognition or a deliberate browser adaptation is wanted. For fidelity, implement explicit possible/began/changed stages and rebase on recognition. Preserve the last movement sample separately from the release coordinate. Keep the correct time-since-last-move denominator and minimum 1/60 second. Browser coalesced events require a declared sampling policy; do not call them UIKit-equivalent by assumption.

**Tests:** feed deterministic event traces with timestamps: threshold-crossing only; threshold + one move; diagonal 11/10.5; equal-axis movement; changed pointerup coordinate; 200 ms pause before lift. Assert offset and projected destination at each stage, using an independently transcribed native state-machine oracle.

## 4. Medium: sorting snap candidates changes native tie outcomes for wide cards

**Implementation:** `panelPhysics.ts:39` sorts candidates numerically; nearest selection at `57–58` retains the first candidate on equal distance. Keyboard navigation currently depends on that sorted order (`PanelStack.tsx:301–305`).

**Native:** generation preserves insertion order: right alignment A before left alignment B (`0x9b84e–0x9b892`), with uniqueness but no sorting. Nearest and directional selection retain the first equal-distance winner (`0x9b5d0–0x9b5f6`, `0x9b6cc–0x9b6f2`). When a card is wider than the workspace, A exceeds B.

**Concrete arithmetic:** at an adapted 850×600 desktop, compact workspace is 778. For `[830,476]` detail widths and prior compact snap zero, ordered compact candidates excluding expanded navigation are `[0,528,476,1004]`; current code returns `[0,476,528,1004]`. A proposal of 502 selects **528 natively** and **476 currently**, for both nearest and positive-direction throwing selection from zero. This viewport is a web adaptation, but the native algorithm on those dimensions is unambiguous. No native hardware execution at 850 pixels is claimed.

**Fix:** keep native insertion order for selection. Sort a copy only for keyboard stepping. Apply integer conversion at the native algorithm boundary if fractional CSS dimensions are supported; native candidates and `toOffset` are integer converted.

**Tests:** use this independently derived fixture plus prior anchors at A and B, verifying suppression of the other alignment. Include one-pixel proposals around the midpoint and mixed widths in different orders. Ordinary 476-pixel card tests cannot exercise the reversed ordering.

## 5. Medium: spring coefficients match, but rendering and settlement do not

**Implementation:** `panelPhysics.ts:15–17`; `PanelStack.tsx:78–108`, `322`. The web renders unrounded positions, settles only below .2 pixels and .08 velocity, and has no 200-step bound. It always uses normal spring constants.

**Native:** `animate` rounds the visible working origin (`0x9c94a–0x9c954`), settles when displacement and velocity are each below one, and forces completion at step 200 (`0x9c956–0x9c9b0`). Normal working state remains unrounded. Setup also has a distinct disableSpring branch with friction .8 and initialized `dx = .2*(destination-current)` (`0x9cba4–0x9cbce`); whether particular application transitions activate it is not established by this review. `_endScroll:` reads existing friction rather than a universal .7 constant.

**Impact:** exact frame sequences and stopping time differ despite matching the recurrence. Fractional transforms also change rasterization of the original bitmap edges. Missing disableSpring cannot be assigned a particular visible scenario until its callers are traced; do not manufacture one.

**Fix:** distinguish physical working position from rounded displayed position, adopt native stop conditions/cap for a fidelity mode, and explicitly document reduced motion as an accessibility adaptation. Trace disableSpring setters before claiming complete animation parity or choosing where to implement its alternate branch.

**Tests:** compare full 60 Hz working/displayed trajectories and stopping step for representative distances, initial velocities, and interrupted animation. Include large finite offsets and assert termination by 200 native steps. Retain a separate reduced-motion browser test. The recovered recurrence alone is insufficient as the expected test output.

## 6. Medium, coverage gap: native tweet columns can be wide; application thread widths cannot

**Implementation:** `App.tsx:605–607` grants wide widths exclusively to `kind === "web"`; threads, profiles, and media always receive 476.

**Native:** tweet width at `0x9e7d4` calls `needsWide`; true returns the same 574/830 orientation-dependent widths as web, otherwise the default global width. This branch is directly present in fixed pseudocode. The semantic predicate behind `needsWide` is **not** established by the inspected material, so it would be unjustified to claim every image tweet or every media sheet must be wide.

**Fix/research:** recover `needsWide` and its writers before mapping it onto Bluesky thread/media content. Make column width a content-policy decision independent of “web versus everything else.” Keep mobile width capping an explicit responsive adaptation.

**Tests:** once the predicate is known, exercise narrow and wide tweet equivalents in both orientations, then a wide card followed by a narrow card. Until then, report this as unsupported native coverage, not completed fidelity.

## 7. Lower priority: extreme stacks do repeated quadratic geometry work

**Implementation:** each rendered detail calls `panelIsHidden` three times (`PanelStack.tsx:320–322`), each scanning all widths; `panelLeft` slices/reduces the prefix per detail (`panelPhysics.ts:68`). Every spring frame updates React state and rebuilds those results for all mounted details. `openWeb`/`openMedia` append without a stack bound (`App.tsx:83–97`).

**Native:** `_updateLayout:` computes the cumulative prefix and latest clamped index in one pass, then hides earlier views in a second pass (`0x9c0f0–0x9c362`). The corresponding geometry is linear in controller count. This does not prove native total rendering cost, nor that ordinary short web stacks are slow.

**Fix:** compute positions and the last pinned index once per layout, then reuse visibility for ARIA, inert, and CSS. Preserve hidden component state deliberately; only consider virtualization after measuring memory/content cost and specifying restore behavior.

**Tests:** independently compare positions/visibility at every pin boundary for 0, 1, 2, and 100 mixed-width details. Profile 60 Hz dragging with a deep stack and verify operation growth is linear; avoid machine-specific absolute performance thresholds. Also assert hidden details cannot receive focus and that the fully covered timeline is removed from sequential focus/accessibility navigation while preserving its scroll state.

## Recommended order

Resolve the single-coordinate navigation model first, because it governs geometry, overscroll, candidates, and resize. Then separate resize anchoring from reveal, add deterministic gesture/native-trace fixtures, preserve snap insertion order, and finish animation details. Research `needsWide` and disableSpring callers before assigning unsupported original behavior. Passing browser smoke tests and matching constants should remain separate claims from native interaction fidelity.
