# Twitter 3.1.1 static Mach-O evidence

This is custom Python and Capstone analysis of the original executable. It is
**not** a REA Evidence record. REA's `inspect_macho` returned
`capability_unavailable` because its native macOS utilities require macOS;
that result is retained separately in `macho-3.1.1.json`. No application code
was executed during this analysis.

## Identity and coverage

- Input: `research/original-app/Twitter-3.1.1/Payload/Twitter.app/Twitter`.
- SHA-256: `eb02c536eab4b7308eddc4cd8642648ab9e20a2269900f06a0b91f4f29fe53e1`.
- Size: 3,082,480 bytes. Thin, little-endian 32-bit Mach-O; no fat slices.
- Header CPU type 12 (`ARM`), subtype 6 (`ARMv6`), executable filetype 2.
- `LC_ENCRYPTION_INFO` at file offset `0x904`: `cryptoff=0x1000`,
  `cryptsize=0x162000`, **`cryptid=0`**. The declared encrypted range is not
  marked encrypted in this file. This does not establish the artifact's
  provenance by itself.
- Parsed all 391 pointers from `__objc_classlist`, all 136 pointers from
  `__objc_catlist`, and 5,486 instance/class method entries. Each selector
  string and method implementation file offset was checked against the bytes.
- For all executable/metadata locations discussed below, VM address minus
  `0x1000` gives the absolute file offset. The JSON records explicit offsets.
- Symbols, selector references and CFStrings supply annotations. Imported
  superclass references can be zero before dyld binding; they remain unknown.

## Sliding panel declarations

| Class | Class file offset | Relevant declarations |
| --- | --- | --- |
| `ABSwipeColumnViewController` | `0x16f3f8` | `pushViewController:afterViewController:animated:`, `popToRootViewControllerAnimated:`, `swipePointsForSwipeView:proposedOffset:`, `nearestOffsetForPossibleOffsets:fromOffset:toOffset:`, `bestOffsetForPossibleOffsets:fromOffset:toOffset:inDirection:`, `_updateLayout:` |
| `ABSwipeColumnScrollView` | `0x16f448` | `animate`, `_animateToDestinationOffset`, `_didScroll:`, `_endScroll:`, `disableSpring`; ivars `dx`, `steps`, `friction`, `springiness`, `workingBounds`, `destinationOffset`, `beganInteractionOnItem` |
| `ABScrollGestureRecognizer` | `0x16f470` | touch begin/move/end/cancel methods; ivars `_firstPoint`, `_lastPoint`, `_lastTime`, `_dx`, `_dt`, `_originalBounds` |
| `ABTableViewPinchPreviewController` | `0x16f6a0` | `_startPinch:`, `_continuePinch:`, `_endPinch:`, `twoFingerGesture:`, window-shade start/continue/end methods; preview/flap/shadow ivars |
| `ABTwoFingerDragDownGestureRecognizer` | `0x16f718` | touch methods and `twoFingerState`; touch-start pairs `aStart`, `bStart` |

These declarations establish named interfaces and state fields. They do not
alone prove gesture behavior or layout.

## Instruction-backed dimensions

The following values have direct load/return or field-assignment evidence,
rather than merely appearing as arbitrary nearby strings or constants.

| Finding | Code and data evidence |
| --- | --- |
| Sidebar width is 292 points | `-[TwitterPadSidebarViewController ab_swipeColumnWidth:]` code VM `0x81aa0` loads literal VM `0x81aa4`, bits `0x43920000`, and returns. |
| Default tablet column width initially 476 points | `_ABSwipeColumnDefaultWidth` VM `0x19adec` / file `0x199dec` holds integer `0x1dc` = 476. The UIViewController category method at VM `0x9a458` loads this global in its tablet branch and calls integer-to-float conversion. Runtime mutation of the global has not been excluded. |
| Web column width 574 in orientations 1/2, 830 otherwise | `-[TwitterPadWebViewController ab_swipeColumnWidth:]` VM `0x87998` subtracts 1 from orientation, unsigned-compares with 2, and selects literals `574.0` (`0x879ac`) or `830.0` (`0x879b0`). These correspond to portrait and landscape UIKit orientation values. |
| Wide tweet column uses the same 574/830 selection | `-[TwitterPadTweetViewController ab_swipeColumnWidth:]` VM `0x9e7d4` calls `needsWide`, then selects those literals; the other branch dereferences a pointer to the default-width global and converts its integer value to float. |
| Panel stacking uses 72-point arithmetic | `-[ABSwipeColumnViewController _updateLayout:]` reads each controller's `ab_swipeColumnWidth:` at VM `0x9c102`; instructions `0x9c132–0x9c164` add `-72.0` or `+72.0` around the current horizontal offset before child `setFrame:` at `0x9c282–0x9c298`. This supports a 72-point overlap/remaining strip in that branch; it is not an unconditional gap between every panel. |
| Sidebar shadows use 41-point widths | The same method assigns `sidebarShadow`/`otherSidebarShadow` frames with `41.0` literal VM `0x9c468`, calls at VM `0x9c19c` and `0x9c278`. Horizontal placement includes -5 and -36 adjustments. |

The original layout implementation also handles a first controller, a special
two-controller case, hidden earlier panels, current scroll offset, and the
pull-tab state. Those branches must be preserved when reconstructing the full
layout; a single constant-width translation is insufficient evidence of parity.

The bounded instruction path gives this frame/visibility reconstruction
(`0x9c0f0–0x9c2ac`, then `0x9c33e–0x9c362`):

```text
prefix = 0
lastClampedIndex = 0
for i, controller in order:
    width = controller.ab_swipeColumnWidth(currentOrientation)
    nextPrefix = prefix + width  // saved before clamping the rendered frame
    x = prefix
    if i == 0:
        x = contentOffset.x
    else if !(count == 2 && i == 1) && prefix - 72 <= contentOffset.x:
        x = contentOffset.x + 72
        lastClampedIndex = i
    controller.view.frame = (x, 0, width, scrollView.frame.height)
    prefix = nextPrefix
for i > 0:
    controller[i].view.hidden = i < lastClampedIndex
```

Consequently, after subtracting the scroll-view offset, the first panel stays
at viewport x=0; the most recent clamped panel stays at x=72, earlier non-root
panels are hidden, and later panels retain their natural positions. The 72
points represent the exposed strip of a covered panel. This reconstruction
comes from static instructions, not an original-device trace.

## Instruction-backed snap geometry

`swipePointsForSwipeView:proposedOffset:` VM `0x9b728` begins with candidate
`0`. It integer-converts the viewport width and each controller width. For each
non-root controller at index `i`, with `prefix = sum(widths before i)`:

```text
A = i >= 2 ? prefix + width[i] - viewportWidth : absent
if i is the final controller:
    addUnique(A) if present
else:
    B = prefix - 72
    if A absent:
        addUnique(B)
    else if lastSnapOffset == A:
        addUnique(A)
    else if lastSnapOffset == B:
        addUnique(B)
    else:
        addUnique(A)
        addUnique(B)
```

This is supported by `0x9b822–0x9b892` (index/final-controller branches),
`0x9b82e–0x9b840` (right-edge alignment), `0x9b8ce–0x9b8da`
(`prefix - 72`), and `0x9b8e8–0x9b966` (last-snap preference and uniqueness).
The generation path does not read the `proposedOffset` argument.

`nearestOffsetForPossibleOffsets:fromOffset:toOffset:` VM `0x9b55c` returns
the first candidate minimizing integer `abs(candidate - toOffset)`, falling
back to `fromOffset` if none (`0x9b5d0–0x9b5f6`, `0x9b590–0x9b5a4`).

`bestOffsetForPossibleOffsets:fromOffset:toOffset:inDirection:` VM `0x9b630`
separately selects the candidate strictly below `fromOffset` nearest
`toOffset`, and the candidate strictly above `fromOffset` nearest `toOffset`.
Direction false returns the lower candidate, true the upper; an absent side
falls back to `fromOffset`. Equal candidates are excluded, and equal-distance
ties keep the first encountered value (`0x9b6cc–0x9b6f2`, `0x9b670–0x9b692`).

The delegate `swipeView:willSwipeToOffset:throwing:` VM `0x9b494` returns 0
when fewer than three controllers exist. Otherwise it generates these points,
uses directional selection when `throwing` is true and nearest selection when
false, then stores the result in `lastSnapOffset`. Its `fromOffset` is the
previous `lastSnapOffset`; its `toOffset` is the integer-converted proposed
offset; direction is `proposedOffset > lastSnapOffset`
(`0x9b49a–0x9b53a`).

Index 0 in this geometry is the 292-point sidebar, index 1 the timeline,
and index 2 the first detail. Thus the two-controller special case refers to
sidebar plus timeline, not timeline plus detail. For a 768-point viewport
and widths `[292, 476, 476]`, candidates are `[0, 220, 476]`.

A reconstruction that permanently collapses the sidebar to a 72-point rail
absorbs the initial `292 - 72 = 220` native points into its origin. Its
workspace coordinate is `nativeOffset - 220`; discarding the expanded-sidebar
state gives `[0, 256]` for that example. At viewport 1024, the same compact
representation gives `[0]` with one detail, `[0, 476]` with two details.
These coordinate conversions are reconstruction choices derived from the
native geometry, not additional original-app runtime observations. On narrower
viewports or with wide detail columns, the right-alignment and strip-alignment
candidates differ; snapping only at multiples of 476 loses native states.

## Instruction-backed scrolling

`-[ABSwipeColumnScrollView _animateToDestinationOffset]`, VM `0x9cb60`:

- Calls delegate `swipeView:willSwipeToOffset:throwing:` before animation and
  stores the returned destination (`0x9cb70–0x9cb92`). The `throwing` argument
  comes from bit 1 of `_swipeFlags`.
- Tests bit 0 (`disableSpring`). In that branch it stores friction `0.8`
  (`0x9cba4–0x9cba6`) and springiness `0.06` (`0x9cbac–0x9cbae`), then sets
  `dx = (1 - friction) * (destinationOffset - bounds.origin.x)`.
- The other branch stores friction `0.7` (`0x9cbee–0x9cbf0`) and springiness
  `0.05` (`0x9cbf6–0x9cbf8`).
- Creates a repeating `NSTimer` targeting `animate`. The double at VM
  `0x9ccc8` is exactly `0.016666666666666666` seconds (1/60).

`-[ABSwipeColumnScrollView animate]`, VM `0x9c8bc`, updates:

```text
steps += 1
workingBounds.origin.x += dx
dx *= friction
distance = destinationOffset - workingBounds.origin.x
if !disableSpring:
    dx += distance * springiness
```

Those operations are supported by ivar-pointer loads and imported float helper
calls at `0x9c8c4–0x9c924`. The visible origin is rounded with `roundf`
(`0x9c94a–0x9c954`). A step count over 199, or sufficiently small displacement
and velocity (1-point comparisons), ends the timer and assigns the exact
destination (`0x9c956–0x9c9b0`). Static code establishes this algorithm; timing
and appearance have not been observed on original hardware.

`ABScrollGestureRecognizer` move code VM `0x9d0f8` contains a 10-point
axis-selection threshold. The relevant branch compares absolute movement from
`_firstPoint`; vertical-dominant movement beyond 10 sets state 5 (failed),
while horizontal movement beyond 10 reaches state 1 (began), then state 2
(changed). Review `0x9d190–0x9d25a` for the full branch conditions.

Do **not** infer smoothed gesture velocity from the `0.9/0.1` constants:
although `0x9d25c–0x9d28c` computes a weighted `_dx`, `0x9d28e–0x9d292`
immediately overwrites it with the raw last-point horizontal delta. Likewise,
the calculated weighted `_dt` is overwritten with the raw elapsed interval at
`0x9d2da–0x9d2de`. End-touch code passes `_dx / (_dt * 60)` to `_endScroll:`
at `0x9d07e–0x9d09e`, with a minimum `_dt` of 1/60.

## Asset use established by code

`-[ABSwipeColumnViewController loadView]` passes these CFStrings to
`imageNamed:` in the instruction stream:

- `iPad-pulltab.png` at VM `0x9bcfe`.
- `iPad-pulltab-divider.png` at VM `0x9bdaa`.
- `iPad-sidebar-shadow.png` at VM `0x9be10` and `0x9beb0`.

The sidebar shadow is stretched with top cap height 41; the second copy is
mirrored horizontally using `CGAffineTransformMakeScale(-1, 1)` at VM
`0x9bee0–0x9bee8`. `_updateLayout:` selects between
`iPad-sidebar-shadow.png`, `iPad-sidebar-shadow-1.png`, and
`iPad-sidebar-shadow-2.png` near VM `0x9c3cc–0x9c3dc`.

## Reproduction and limits

Run metadata analysis with the standard library:

```sh
python3 research/rea/parse_macho.py research/original-app/Twitter-3.1.1/Payload/Twitter.app/Twitter --output research/rea/macho-static-3.1.1.json --focus-output research/rea/macho-static-3.1.1-panels.json
```

Add `--disassembly-output research/rea/macho-static-3.1.1-panel-disassembly.txt`
when Capstone is importable. This run used Capstone 5.0.6, wheel
`capstone-5.0.6-py3-none-manylinux_2_17_x86_64.manylinux2014_x86_64.whl`,
wheel SHA-256 `0358855773100bb91ae6681fabce7299df83156945ba943f6211061a592c54a6`.
It was unpacked under `/tmp/twitter-macho-capstone`; no persistent Python or
REA configuration changed.

Disassembly ranges stop at the next metadata-known Objective-C implementation.
They can contain literal pools, jump tables and helper code, so decoded lines
after a return are not automatically executed instructions. Literal annotations
are interpretation candidates until the instruction data flow establishes
their use. This report claims only the bounded paths described above.

Unresolved: original-device corroboration of panel/snapping reconstruction,
all default-width writes, pinch/window-shade behavior, runtime behavior and performance, comparison with
the exact September 2010 launch release, and equivalence to a web implementation.
