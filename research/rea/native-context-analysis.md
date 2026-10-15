# Bounded width and navigation follow-up

2026-10-15. Target executable SHA-256 `eb02c536eab4b7308eddc4cd8642648ab9e20a2269900f06a0b91f4f29fe53e1`, preserved Twitter 3.1.1. This follow-up is **custom static instruction analysis**, not newly recovered REA pseudocode or historical execution.

## Provider attempt and stopping boundary

The actual production REA MCP was initialized, opened this target with Ghidra, and requested `procedure_pseudo_code` for `needsWide` at `0xa0370`. `mcp-native-context-needs-wide.json` retains the real `provider_timeout`: Ghidra startup exceeded its 600000ms deadline with corrected no-return analyzer profile. The original client was stopped. A CPU-affinity-limited attempt was then interrupted at the parent's stop instruction; its owned Java process was terminated and `mcp-native-context-limited-cleanup-close.json` records successful `close_binary`. Process inspection confirmed no owned Ghidra/client processes remained. There are **no new successful pseudocode Evidence IDs**. Existing successful Evidence in `../reverse-engineering.md` remains separate.

Reproduction of the lightweight findings uses the already-installed Capstone package:

```sh
PYTHONPATH=/tmp/twitter-macho-capstone python3 research/rea/disassemble_context.py
```

The script reads the exact executable and existing Mach-O metadata, preserves the source digest, annotates selector/ivar/symbol references, and writes `native-context-width-disassembly.txt`. Method bounds use the next known Objective-C IMP; literal pools can appear as decoded instructions. Interpret branches before those pools, not every printed mnemonic as executable code.

## Width predicate and mutation: answered statically

`TwitterPadTweetViewController::needsWide`, VM `0xa0370`:

1. Read `selectRange`. Nil returns false (`0xa0376–0xa0386`).
2. Pointer identity with global `_TwitterSelectSource` at `0x1b0c94` returns true (`0xa0388–0xa0392`). This is a special selection object, not a blanket property of every tweet carrying source metadata.
3. Otherwise check `[status.text ab_containsRange:selectRange.rangeValue]`; failure returns false (`0xa0394–0xa03ca`).
4. Extract the selected substring and call `linkNeedsWideDisplay:` (`0xa03cc–0xa040a`). That method at `0x9d5e8` returns exactly `activeStringType == 1`.

The `activeStringType` category method at `0xbe38` compares a whole-string regex match against `_ABLinkRegex` (global `0x19a62c`) and returns 1 on full match (`0xbe4a–0xbe68`). Subsequent regex classes have other enum values; `_ABHashTagRegex` is the second branch. Symbol names come from this executable's nlist table, not invented labels. These observations support wide URL selection and wide source-link selection; they do not justify widening every hashtag, mention, or reply.

The class initializer at `0x9d9ac` creates distinct retained zero-length NSValue range objects for `_TwitterSelectFromUser`, `_TwitterSelectInReplyTo`, `_TwitterSelectPlace`, `_TwitterSelectRetweeter`, and `_TwitterSelectSource`. The source sentinel is stored at `0x9da2c`. Pointer identity matters even though the stored range values coincide.

`selectLink:` at `0xa0208` reads old `needsWide` (`0xa02ac`), retains the new selection/releases the old one, writes `selectRange` at `0xa02d4`, and reads new `needsWide` (`0xa02d6`). If the view is loaded it calls `_goSelected`. When there was a previous nonnil selection and the old/new width predicates differ, it notifies the column controller through `viewControllerNeedsToUpdateWidth:` (`0xa030e–0xa031e`). The nil-old-selection branch compares new width with itself and skips this notification. Thus selection can change the existing detail sheet's width; a once-only width chosen merely from tweet content is incomplete.

`autoselect` at `0x9ec20` reads `status.activeTextRanges.links`. A nonempty list selects its first element (`0x9ec28–0x9ec62`). Later fallback branches exist; this note does not claim all fallback priorities have been recovered.

## Controller lifecycle: partially answered statically

`ABSwipeColumnViewController::pushViewController:afterViewController:animated:` at `0x9aedc` first normalizes the supplied source via `_superestColumn:` (`0x9aef4`). It enumerates the existing controllers and starts collecting entries **after** the matching source (`0x9af60–0x9af84`). Collected descendants receive disappearance callbacks, have their views removed and cleared (`0x9aff6–0x9b028`), and are removed with `removeObjectsInArray:` (`0x9b04c–0x9b05a`). A nonnil destination is then appended (`0x9b088–0x9b094`). This is branch replacement after the source, not unconditional append to the latest end.

`TwitterPadSidebarViewController::_setNewRoot:` at `0x8209c` constructs/configures a fresh controller and pushes it **after the sidebar itself** (`0x820f6–0x8210e`). Combined with the push routine, this corroborates section changes discarding the previous timeline/detail branch.

`TwitterPadStatusListViewController::tableView:didSelectRowAtIndexPath:` at `0x84ab4` updates the selected item and, for a non-dummy status, calls `_viewStatus:linkRange:` with nil range (`0x84b2c–0x84b52`). That callee was not decoded in this bounded pass, so its complete construction/source binding remains unresolved.

`TwitterPadUserViewController::_pushColumn:` at `0x8c6bc` has a pinch-preview branch: set a dismissal callback and dismiss; otherwise call `ab_pushColumn:animated:` on self (`0x8c6f6–0x8c6fe`). Preserve profile source context; do not assume the same immediate push path during a floating preview.

`_goSelected` was retained for future focused reading. It contains both `setSubViewController:animated:` and `ab_pushColumn:animated:` paths, including source-link handling. The full branch classification is unresolved here; the presence of both mechanisms is a warning against equating embedded detail replacement with stack pushes.

### Existing-output follow-up: implementable URL selection policy

A further reading of the already-retained instructions resolves the source-link and URL paths more precisely, without another native tool run. `_TwitterSelectSource` branches at `0xa0674–0xa067a`: call `ab_pushColumn:nil animated:NO` (`0xa067c–0xa0686`), construct a child, load `status.representedStatus.sourceLink`, then call `setSubViewController:child animated:YES` (`0xa06e8–0xa06f2`). The URL case performs the same nil push (`0xa0738–0xa0744`), loads the selected URL, then installs the child (`0xa0778–0xa0782`). The enum switch at `0xa0704–0xa0712` dispatches type 1 to the URL case at `0xa0728`; the first table word at `0xa0714` encodes that target (the linear dump prints table data as Thumb instructions).

`setSubViewController:animated:` sets the child's `_ab_setSuperColumn:` to the tweet controller (`0x9e232–0x9e23e`), forwards the containing column controller, removes/releases the previous child, and stores the replacement at `0x9e2bc`. Thus the evidence supports **one widened tweet sheet containing its header/actions and an embedded URL child**. It does not support a widened tweet sheet plus an additionally appended nonnil web sheet for this operation. The nil `ab_pushColumn:` call is consistent with pruning descendants; exact forwarding through that category helper remains inferred, because its body was not decoded. The underlying push routine's handling of nil destinations is established above.

Implementable mapping for the present Bluesky reconstruction:

| Interaction/state | Supported native behavior | Proposed Bluesky mapping |
| --- | --- | --- |
| Open post with at least one URL | When invoked, `autoselect` chooses first active link; URL selection yields wide detail. Invocation timing is not established by these selected methods. | Initialize detail selection from first explicit link facet in text order, preserving post header and showing its web content below. Initial timing is supported by contemporary visual/firsthand evidence; facet ordering is an adaptation, not recovered Bluesky behavior. |
| Select a different URL within current detail | Mutate selection; replace embedded child; retain tweet identity | Update that existing thread sheet's selected URL and replace its content child; discard descendants after that sheet rather than append another web sheet. |
| URL selected, portrait / landscape | Tweet width getter uses 574 /830 | Set width from selected-content state and orientation, not `sheet.kind === 'web'` alone. |
| Ordinary tweet detail or non-link selection | `needsWide` false, default global initially 476 | Keep 476 unless current selection is a URL/source-link mode. Do not widen merely because some unselected URL appears in the post. |
| Native client/source metadata selected | Source sentinel makes detail wide, loads sourceLink | Implement only if an actual equivalent source/application URL exists. A generic “View on Bluesky” permalink is not historically equivalent; keep it an explicit adaptation if routed internally. |
| External embed with no text URL facet | No exact contemporary equivalent established in this pass | Treat automatic embed selection as a documented product choice; a link facet is the closer evidentiary match. |
| URL selected directly from timeline | Full `_viewStatus:linkRange:` construction path not recovered | Prefer creating the same post detail with selected URL; call this a reconstruction inference until the callee is inspected. |

Current `src/App.tsx:95` appends a standalone web sheet, and line 546 widens only `kind: 'web'`. That is a valid modern browser route but differs from the recovered in-tweet URL path. A faithful change needs thread-sheet selection/content state and a preserved tweet header, not only a wider thread CSS rule. The no-previous-selection branch skips width-change notification in native `selectLink:`; initial layout should derive width directly from initial selection. Later selection changes update existing sheet geometry. Selecting mentions/hashtags and returning from the URL child need their own supported subcontroller policies; this bounded reading does not establish all their routing.

Layout confidence: the inspected `../references/twitteripad_article.PNG` visibly retains the selected tweet's avatar, author name, full tweet text with highlighted URL, timestamp/client source line, and top-right reply/favorite/retweet/share actions **above** the webpage. The header is not merely an author/action toolbar. This is direct screenshot evidence, not recovered header geometry code. The web content starts around image y=123 under that block and browser controls remain at the sheet bottom. Exact responsive header height, text wrapping, and media/video child layout were not recovered in this pass; do not apply this URL finding automatically to image/video content.

Loading timing confidence: `autoselect` calls `selectLink:` on the first link. When the detail view is already loaded, `selectLink:` immediately calls `_goSelected`, whose URL branch sets `loadURL` and installs the child. Thus this path selects content and starts its URL handling, not merely a width flag. The `autoselect` call site and not-yet-loaded-view continuation were not included in the saved disassembly, so exact init/push/viewDidLoad ordering remains unknown. The contemporary MacStories hands-on independently reports automatic webpage loading when selecting a linked tweet; that supports the user-visible initial behavior without establishing its native call order or successful network completion.

## Typography and resources: bounded remaining gap

`TwitterStatusCellView::initialize` at `0xa1524` loads `tinyretweet.png`, `ProfilePlaceholderOverWhite.png`, and `badge-favorite.png`. This corroborates concrete resource use. It does not recover font sizes. Native font construction, text layout metrics, full `_viewStatus:linkRange:` routing, and all `_goSelected` cases remain open. No font estimate was promoted to a recovered fact.
