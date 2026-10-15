# Astra accessibility critique — Panes

Read-only review, 2026-10-15. Scope: App, PostCard, PanelStack, AccountDialogs, LinkPanels, MediaVideo, styles and existing browser tests. No application or dependency changes. Source paths below are relative to the repository. Priorities describe user impact, not a complete WCAG conformance verdict.

I ran isolated Chromium probes against a Vite dev server at port 4191 using the existing deterministic Bluesky fixture. Findings explicitly distinguish rendered evidence from source-derived predictions. I did not run VoiceOver, NVDA, TalkBack, switch hardware, or physical touch devices. The existing 52 passing browser tests are useful behavior evidence; they do not establish assistive-technology compatibility.

## 1. P1 — A visible sheet leaves fully covered timeline controls in the keyboard sequence

**Confirmed in rendered Chromium.** At 390×844, open the first post with Enter. The new sheet occupies x=59–390, y=0–844. Shift+Tab from its initial focus lands on a background timeline `.post-author` button at x=116–204, y=639–658: entirely behind that sheet. Focus can operate a post the user cannot see.

The timeline in `src/App.tsx:414` remains interactive. `src/components/PanelStack.tsx:318-322` only applies inert/hidden to older *panels*, according to `src/lib/panelPhysics.ts:74-82`; it does not manage covered feed controls. Initial focus and restoration at `PanelStack.tsx:129-147` do not prevent later navigation into occluded content. Desktop partially visible sheets also need a visibility-aware focus policy, not merely a check that a section is not wholly hidden.

**Fix:** On narrow screens make the covered timeline inert while a detail sheet is active, with an explicit accessible route back. For side-by-side desktop work, reveal the owning sheet/feed before accepting focus, or exclude fully occluded areas while preserving actually visible panels. Do not turn every desktop sheet into a modal by default.

**Test:** Tab and Shift+Tab throughout one-, two-, and three-sheet states at 390 and 1024 pixels; assert the active control has a visible, unobscured region using hit testing. Verify closing restores focus to a visible origin. The existing keyboard test (`tests/client.spec.ts:75-89`) checks panel counts/positions after Enter, Escape and Alt+arrows, not focus visibility. [WCAG Focus Not Obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html).

## 2. P1 — Each post is exposed as a generic button containing other buttons and content

**Confirmed markup and Chromium accessibility snapshot; actual screen-reader speech remains untested.** `src/components/PostCard.tsx:544-555` replaces the article role with `button`, names it only “Open post by [author],” and supplies `aria-pressed`. The profile buttons at lines 572-594, links, summary, media controls and action buttons sit inside it. The quoted post repeats the pattern at lines 680-745.

The rendered snapshot begins `button "Open post by Panel Tester"` with nested profile buttons and post text. Therefore do **not** claim all descendants disappear in every browser: Chromium preserved them in this probe. The confirmed problem is an inappropriate composite button, repeated non-distinguishing names for posts by one author, lost article navigation semantics, and a pressed state for an open action that does not toggle closed. Browser/AT handling of interactive button descendants needs real-reader testing.

**Fix:** Preserve `<article>` semantics and give opening the conversation a separate named link/button, associated with enough post text to distinguish it. Keep profile, media and post actions as sibling controls. Pointer whole-card activation can remain a convenience without making the content container a button. For Like/Repost, choose a stable toggle label plus `aria-pressed`, or an action label that changes without pressed semantics (`PostCard.tsx:515-530` currently mixes both).

**Test:** Read two posts by the same author using article navigation, buttons/links lists and Tab; the opening target should identify which post and text should remain naturally readable. Test NVDA/Firefox and VoiceOver/Safari as well as DOM snapshots. [WAI-ARIA button role](https://www.w3.org/TR/wai-aria-1.2/#button), [APG button semantics and toggle labels](https://www.w3.org/WAI/ARIA/apg/patterns/button/).

## 3. P1 — Full-size images consume the arrow keys needed to inspect their horizontal overflow

**Confirmed source behavior; a physical keyboard/AT combination was not tested.** `src/components/LinkPanels.tsx:94-100` handles all unmodified left/right keys bubbling from the image viewer, prevents default scrolling, and changes the image. Yet its focusable viewport advertises “Full size image. Scroll to explore.” (`:123`), and zoom deliberately makes the image exceed the scroll viewport (`src/components/LinkPanels.css:65-74`). A keyboard user trying to move across a large diagram instead changes image and resets zoom (`LinkPanels.tsx:81-84`); even a one-image gallery cancels native horizontal arrow scrolling.

**Fix:** Leave native arrow scrolling intact when focus is in a zoomed viewport. Scope gallery shortcuts to fit mode or toolbar controls, retaining explicit Previous/Next buttons. If additional pan controls are needed, make them operable and labeled without requiring pointer gestures.

**Test:** Use an image wider than the viewport, focus the zoomed viewport, press Right and verify scrollLeft increases while image index and zoom remain unchanged. Then verify gallery navigation separately. Current `tests/links.spec.ts:137-140` expects ArrowRight to leave zoom mode, so it currently codifies the conflicting behavior. [WCAG Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html).

## 4. P2 — Timestamp and handle contrast are well below the small-text threshold

**Confirmed computed timestamp style and calculated contrast.** `src/styles.css:421-432` sets handles to #9a9da0 at 11px and timestamps to #a0a3a7 at 10px. The detail probe returned the timestamp color `rgb(160,163,167)` at 10px. Against the panel's #f7f7f7 surface (`src/components/PanelStack.css:19`), these give approximately **2.54:1** and **2.36:1**, respectively. Both are below 4.5:1 for normal text. Timeline handles are hidden by `styles.css:1608-1609`, so that particular handle issue concerns detail/profile contexts, not visible feed handles.

**Impact/fix:** Low-vision readers lose author identity distinctions and chronology. Darken semantic secondary text while keeping its smaller size and restrained styling; validate actual selected/default/hover surfaces rather than a single palette token. Small type can still be a usability problem after contrast passes.

**Test:** Assert computed foreground/background contrast for representative default and selected states and inspect text at 200% zoom. Do not fail decorative emboss artwork or genuinely disabled controls as if they were body text. [WCAG Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

## 5. P2 — The post-actions overlay has modal pointer behavior but non-modal keyboard behavior

**Confirmed source mismatch; end-to-end overlay keyboard probe not performed.** `src/components/PostCard.tsx:776-849` portals a backdrop and dialog, focuses the dialog, and handles Escape only within the overlay's React subtree. There is no Tab boundary or focus-leave dismissal. `src/styles.css:1750-1760` covers the viewport with a button backdrop. Tab can leave the last overlay control for underlying page controls while the backdrop still intercepts pointer interaction; Escape after focus leaves no longer follows the overlay's own handler. Backdrop dismissal (`PostCard.tsx:794`) also omits the explicit focus restoration used by its close button (`:808-810`).

**Fix:** Choose a consistent model: a modal action sheet using the existing dialog focus lifecycle plus modal semantics, or a non-modal popover that closes/restores appropriately when focus leaves and does not block unrelated page interaction. Reuse the already stronger AccountDialogs implementation rather than maintaining another independent focus system.

**Test:** Open through the gesture, Tab/Shift+Tab past both ends, dismiss via Escape and backdrop, and verify visible focus and return target. Keyboard users already have equivalent actions in detail, so the missing gesture shortcut alone is not asserted as a WCAG violation. [APG modal dialog focus and return behavior](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

## 6. P2 — Mobile navigation does not expose whether it is expanded

**Confirmed source omission.** `src/App.tsx:416-420` has a button named “Toggle navigation” that changes `navExpanded` without `aria-expanded` or `aria-controls`. The visual navigation state is not communicated by this control. A screen-reader user must explore the page after each activation to determine what happened.

**Fix:** Add `aria-expanded={navExpanded}` and an `aria-controls` reference to the actual navigation region, with a stable navigation label. Check the collapsed region's actual tab/reading exposure at the same breakpoint; hiding only its text is not equivalent to hiding controls.

**Test:** At the mobile breakpoint activate with Enter and Space, assert expanded state follows the visible region, and confirm focus remains sensible after collapse. [WAI-ARIA aria-expanded](https://www.w3.org/TR/wai-aria-1.2/#aria-expanded).

## 7. P3 — Reduced motion stops the sheet spring but still animates the workspace width

**Confirmed source omission.** PanelStack correctly bypasses its spring when reduced motion is requested (`src/components/PanelStack.tsx:81`). Global reduced-motion CSS (`src/styles.css:1532-1540`) stops spinners and smooth scrolling. However, the later desktop `.sheets-open .sidebar` rule still transitions width and flex-basis for 250ms (`styles.css:1647-1654`), moving the surrounding workspace whenever a sheet opens.

**Fix/test:** Disable these layout transitions under reduced motion too, then emulate that preference and open/close sheets at desktop width. Assert the sidebar's computed transition duration is zero and the workspace settles immediately. This is an implementation consistency/usability recommendation, not a claim that every short transition violates a WCAG AA criterion.

## Areas reviewed that need targeted follow-up, not invented failures

- **Clamped posts:** `styles.css:1576-1580` clips to five lines with no explicit expansion affordance. A synthetic seven-line post with a final link initially exceeded the text box, but Chromium scrolled the clipped text container when the link received focus, bringing the link inside the visible rectangle. Consequently this review does **not** claim a reproduced invisible-link focus defect. Add an explicit “Read full post” affordance and test long posts with multiple links at 200% zoom; verify users retain the start of the post and understand the change in context.
- **Account dialogs:** `AccountDialogs.tsx:15-55` already implements initial focus, Tab wrapping, Escape and focus return; forms have labels and alert errors. These are meaningful strengths. Check pending requests: autofocus lookup can resolve a disabled input, and pending dialogs suppress close. Test delayed/failing responses rather than assuming the normal fixture exercises this state.
- **Loading/errors:** App has loading status, alert errors and toast status (`App.tsx:548`, `:674`, `:702`); media errors are status messages. Successful pagination/search completion and offline banner announcements still deserve screen-reader observation. Do not add multiple competing live regions without testing announcements.
- **Video and embedded pages:** MediaVideo stops every keydown from bubbling (`MediaVideo.tsx:78`), so sheet Escape/Alt+arrow shortcuts do not work from video controls. Cross-origin iframe keyboard events similarly do not bubble to PanelStack. These are discoverability inconsistencies, not proof of a keyboard trap because the explicit sheet close button remains available. Native video/HLS caption exposure and physical iOS/Android behavior are unknown; the absence of a JSX `<track>` alone does not prove an HLS stream has no captions.
- **Targets:** Panel close is 30×29px and coarse-pointer web/media toolbar targets are 40px. The peek close is approximately 20px from its 14px icon plus padding (`styles.css:1774-1785`); inspect its effective target and neighboring overlap before asserting failure, since WCAG 2.5.8 has spacing/other exceptions. A comfortable 40–44px hit area can preserve the visual icon. [WCAG Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

Suggested next acceptance pass: fix occluded focus and post semantics first, then do one complete keyboard-only session (open, read, follow a link, inspect a zoomed image, reply, cancel, return) and the same task in VoiceOver/Safari and NVDA/Firefox. Supplement the existing interaction suite with an accessibility-tree assertion and visibility-aware focus checks; a clean automated scan alone would not catch the workspace's navigation model.
