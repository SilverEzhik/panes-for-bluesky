# Bounded native release/throw analysis

This note answers the release-projection question from the existing, byte-bound custom ARM/Capstone disassembly. It is **not a new REA Evidence record**. The earlier REA/Ghidra `mcp-native-fixed-*` records independently establish the animation coefficients and nearest/directional candidate algorithms. No new import or application execution was needed.

Source executable SHA-256: `eb02c536eab4b7308eddc4cd8642648ab9e20a2269900f06a0b91f4f29fe53e1`. VM minus `0x1000` equals source file offset for these addresses. The raw instructions are in `macho-static-3.1.1-panel-disassembly.txt`.

## Accepted touch release

`-[ABScrollGestureRecognizer touchesEnded:withEvent:]` (VM `0x9cfb8`, Thumb IMP bit set in metadata) checks that its tracked touch ended and that recognizer state is in 1..4. An unrecognized state zero fails; it does not enter the release path. Movement recognition has the separately established 10-point horizontal threshold.

For the accepted release path:

- VM `0x9d01c–0x9d036` stores `dt = float(CFAbsoluteTimeGetCurrent() - lastTime)`.
- VM `0x9d03c–0x9d06e` clamps `dt` to a minimum of `1/60` second. The comparison uses double literal words `0x11111111, 0x3f911111` (IEEE754 little-endian double `1/60`); the stored float minimum is `0x3c888889`.
- VM `0x9d070–0x9d07a` sets recognizer state 3 (ended).
- VM `0x9d07e–0x9d09e` calls the scroll view `_endScroll:` with `dx / (dt * 60)`. The 60 literal is `0x42700000`.

`dx` is the **previous pointer x minus current pointer x** from the last movement event, established by `mcp-native-fixed-gesture-moved.c`. It is positive when content offset should increase. The release `dt` is elapsed time **from the last movement to lift**, rather than the preceding move-to-move interval. Pausing before lift therefore reduces the release velocity.

The argument passed to `_endScroll:` has units **points per nominal 60 Hz frame**.

## Projection and throwing flag

`-[ABSwipeColumnScrollView _endScroll:]`, VM `0x9ca88`:

```text
scroll.dx = passedPointsPerFrame
workingBounds = bounds
proposedDestination = roundf(bounds.origin.x + scroll.dx / (1 - currentFriction))
flags.throwing = true
_animateToDestinationOffset()
flags.throwing = false
beganInteractionOnItem = nil
```

Evidence:

- `0x9ca90–0x9ca94`: stores the supplied argument into the `dx` ivar.
- `0x9ca96–0x9caae`: reads bounds and copies working bounds.
- `0x9cab2–0x9cabc`: reads the existing friction ivar and calls float subtraction with `1.0 - friction` (`0x7f << 23` is `0x3f800000`).
- `0x9cac0–0x9cac6`: divides the stored `dx` by that result.
- `0x9caca–0x9cada`: adds bounds origin x, rounds using `roundf`, and stores `destinationOffset`.
- `0x9cadc–0x9cae6`: unconditionally ORs bit 1 into `_swipeFlags`.
- `0x9cae8–0x9caee`: calls `_animateToDestinationOffset`.
- `0x9caf2–0x9cafa`: clears that flag afterward.

There is **no speed threshold in this accepted release path**. It always calls the delegate with `throwing=true`. The native 10-point recognizer threshold is a movement/axis threshold, not a velocity cutoff.

The projection reads the **existing** friction field. The animation setup then writes `.7` for normal spring animation or `.8` for the disableSpring branch; do not silently replace a stateful field read with a claimed native 180 ms projection. With friction `.7`, the projection is equivalent to about 55.556 ms at a measured points/ms velocity; with `.8`, about 83.333 ms. If friction has not yet been initialized by animation, its allocation-state value is a separate runtime question.

## Delegate selection

`-[ABSwipeColumnViewController swipeView:willSwipeToOffset:throwing:]`, VM `0x9b494`:

```text
if controllerCount < 3: return 0
candidates = swipePointsForSwipeView(proposedDestination)
if throwing:
    snap = bestOffset(candidates,
                      fromOffset = lastSnapOffset,
                      toOffset = truncateToInt(proposedDestination),
                      direction = proposedDestination > lastSnapOffset)
else:
    snap = nearestOffset(candidates,
                         fromOffset = lastSnapOffset,
                         toOffset = truncateToInt(proposedDestination))
lastSnapOffset = snap
return float(snap)
```

The direction comes from **projected destination relative to the previous snap**, not from velocity sign alone. `bestOffset` only admits candidates strictly on that requested side of the previous snap; if that side is empty, it falls back to the previous snap. The candidate on that side closest to the projected destination wins. The direct REA/Ghidra output for the callee is `mcp-native-fixed-direction-offset.c`; nearest is `mcp-native-fixed-nearest-offset.c`.

This is a bounded static reconstruction of the actual release path. Pointer-event sampling and browser touch cancellation differ from UIKit, so their adaptation needs browser behavior checks; those differences do not justify labeling an arbitrary 180 ms projection as native behavior.
