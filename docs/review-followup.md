# Astra review follow-up

The [17-agent review](../research/critiques/README.md) found defects outside the earlier 52-test suite. Its reports remain a record of that baseline. The original ledger below describes those replacements and their full-suite baseline on 2026-10-15. Subsequent Bluesky adaptations have a separate verification record.

## Gesture ownership and lifting photos

Wheel and Safari bursts now retain their originating surface until the recognizer ends the gesture. Continuing over a photo cannot start a second recognizer or reset the deck’s displacement. Photo-origin gestures continue when the pointer leaves the image. Modifier changes end the old burst and select a new owner; blur and visibility interruptions cancel it. Browser-owned scrolling stays native.

An outward pinch in a photo pane lifts an unclipped, noninteractive copy above neighboring panes while the original input target remains mounted. Releasing an intentional outward pinch expands the existing photo pane to fullscreen, with image geometry carried into the transition. Reversal, cancellation or blur returns the photo to its pane. Pinching an existing fullscreen photo still zooms normally; the 42% inward dismissal threshold and release-only behavior remain.

Post wheel/Safari scale recognition now uses the same library adapter. Native post contact eligibility remains local so a late second finger, third/outside contacts, or an existing reading scroll cannot become a post action. The live development-mode check uses a public photo and native Chromium touch injection: its image grows from 475px to 855px while held outside a 476px pane, with no fullscreen yet, and releasing opens the 1280×900 fullscreen pane. Small trackpad zoom/pan, return to the original pane width and edge handoff also pass, with no page errors. [Live results](../research/verification/live-photo-ownership-lift.json), [held lift screenshot](../research/verification/live-photo-pinch-lift.png). **132 focused browser checks pass** across Chromium, Firefox and WebKit, with 12 intentional Chromium-only native-input skips. This covers pointer/wheel crossings in both directions, reversal without early snap, modifier handoff, held lift/promotion, blur/resize cancellation, image lifecycle, post actions and native reading scroll. Production builds and worker contract checks pass. [Browser results](../research/verification/gesture-ownership-lift-tests.json), [log](../research/verification/gesture-ownership-lift-tests.txt), [served build](../research/verification/served-build-gesture-ownership-lift.json). Earlier records below describe preceding implementations.

## Gesture library and pinch sensitivity

`@use-gesture/vanilla` now recognizes drag, wheel and pinch input for both panes and photos. It replaces the hand-written contact tracking, distance/scale calculation, Safari event handling, wheel-pinch curve and gesture-end timer. The remaining adapter handles pane/photo ownership, the existing axis rules, click suppression and cancellation. The official `@atproto/api` SDK already supplies Bluesky transport/session handling, rich text and moderation.

Trackpad pinch zoom uses the library’s standard mapping, with an initial gain roughly four times the previous custom conversion. This affects zooming in and out as well as the fitted dismissal preview. The dismissal threshold is restored to 42% shrink, with release-only commit and reversal/cancellation. The helper message and sidebar tagline remain removed. The 18% tuning record below describes the earlier, superseded adjustment.

**106 focused browser checks pass** across Chromium, Firefox and WebKit, with two intentional Chromium-only native-touch skips. A short burst of small wheel-pinch samples produces about 1.77× zoom while remaining frame-smoothed. Live development-mode public photos also verify zoom/pan, held dismissal feedback without a helper panel, release-only exit, pane-width restoration and trackpad edge handoff. Production builds and worker contracts pass. [Browser results](../research/verification/library-gestures-tests.json), [log](../research/verification/library-gestures-tests.txt), [served build](../research/verification/served-build-library-gestures.json), [live photo check](../research/verification/live-photo-library-gestures.json).

## Lighter photo dismissal

Pinch-to-dismiss now needs 18% shrink from fit, reduced from 42%, and still commits only at gesture end with reversal/cancellation supported. The helper panel and progress meter are removed; image movement/shrink and backdrop fade remain as the visual feedback. The sidebar tagline is removed.

**16 focused checks pass** across Chromium, Firefox and WebKit, with two intentional Chromium-only native-touch skips. These cover the lighter pinch, small gestures staying fullscreen, reversal/cancellation, release-only dismissal, trackpad pulls and native touch ownership. [Results](../research/verification/photo-dismiss-tuning-tests.json), [log](../research/verification/photo-dismiss-tuning-tests.txt), [served build](../research/verification/served-build-photo-dismiss-tuning.json). The previous records below describe earlier gesture tuning.

## Shared photo and pane gestures

Photo and pane navigation now use one input lifecycle for pointer drags, wheel/trackpad swipes, Ctrl-wheel pinches and Safari gesture events. At a fitted gallery edge, a sideways swipe hands the same gesture to the pane stack; single-photo panes can therefore be navigated directly over the image. Gallery changes commit at gesture end, after wheel momentum becomes quiet.

Zoom updates run through animation frames without rendering React on every input sample. Wheel zoom has a gentler response and brief interpolation. Fullscreen dismissal previews the image movement, backdrop fade and a progress meter; the cue changes to “Release to return to pane” at the threshold. A vertical pull must travel roughly a quarter of the photo viewport (140–240px), or a fresh pinch from fit must shrink below 58%. Dismissal happens on release, reversals cancel it, and interruption restores the photo. Zooming out from a magnified image stops at fit and cannot dismiss in that same gesture.

The browser regressions cover trackpad input over the actual image, gallery-edge handoff, frame interpolation, zoom-to-pan transitions, visible thresholds, reversal, cancellation and release-only dismissal. Mouse interruption settles the deck at its nearest pane without sampling stale coordinates; vertical reading scroll leaves an opening pane’s animation running. **100 focused browser checks passed** across Chromium, Firefox and WebKit, with two intentional Chromium-only touch-injection skips. After preserving the deck’s interruption and animation behavior, **15 final deck checks passed** across all three engines. Production builds and worker contract checks pass. The local development-mode check also caught and fixed a StrictMode animation-frame cleanup issue; three final fullscreen lifecycle checks pass across all engines ([results](../research/verification/shared-gestures-final-lifecycle-tests.json)). Live public photos now confirm zoom/pan, a visible held dismissal preview, release-only exit, exact pane-width restoration, and trackpad gallery-edge handoff. [Live photo results](../research/verification/live-photo-smoke.json), [held dismissal preview](../research/verification/live-photo-dismiss-preview.png), [worker check](../research/verification/shared-gestures-pwa.txt), [photo/feed/media browser results](../research/verification/shared-gestures-tests.json), [browser log](../research/verification/shared-gestures-tests.txt), [final deck results](../research/verification/shared-gestures-final-deck-tests.json), [final deck log](../research/verification/shared-gestures-final-deck.txt), and [final served build](../research/verification/served-build-shared-gestures-final.json).

The previous photo verification below records the earlier implementation.

## Photo gestures and trackpad navigation

The photo expand control fills the app window with the photo pane, retaining fitted image scale and separate zoom controls. Pinch or Ctrl+scroll zooms around the pointer; double-click, +/− controls and keyboard shortcuts also work. Dragging or scrolling a zoomed image pans it. Fitted images browse with horizontal touch/mouse drags, trackpad swipes or arrow keys, with momentum advancing only once per gesture. Fullscreen returns to its original pane through Escape, the return controls, a fitted vertical swipe, or pinching inward past fitted size. Background UI is inert while fullscreen, focus stays inside the viewer, and Escape still works when the last-image Next button becomes disabled. Toolbar glyphs are charcoal on silver.

Horizontal trackpad input now navigates the deck over buttons and feed rows. Axis locking keeps vertical reading native; shorter intentional swipes settle on a neighboring pane. Shift+wheel provides a mouse equivalent. Media and embedded-page surfaces keep their own gestures.

**55 focused checks passed** across Chromium, Firefox and WebKit, with two intentional CDP-only skips on Firefox/WebKit. Native Chromium touch verifies actual pinch/vertical-swipe ownership and unchanged document scale. Live public photos verify a 476px pane expanding to the full 1280×900 window at fitted scale, Ctrl-wheel zoom/pan and exact-width restoration. Worker checks and six server-stop offline reloads pass at root and `/panels/` (31 shell files, no API caching). All 76 source/test/script inputs remained unchanged during final verification.

[Browser results](../research/verification/photo-trackpad-tests.json), [log](../research/verification/photo-trackpad-tests.txt), [live photo check](../research/verification/live-photo-smoke.json), and [worker check](../research/verification/photo-trackpad-pwa.txt) record the follow-up. Earlier diagnostic failures are retained separately; the earlier review and feature records below describe previous builds.

| Area | Replacement | Verification |
| --- | --- | --- |
| Session recovery | Single-flight credential hydration, separate connectivity state, volatile-session preservation, generation guards, and deadlines through complete JSON response bodies | Ten deterministic tests use the actual SDK with mocked transport, including stalled bodies and expired credentials. |
| Account data and drafts | Atomic account lifetime tombstones, revision comparison for save/delete, cross-tab invalidation, and explicit save/conflict states | Storage cases cover all three engines. A full UI test signs out in another tab while a draft completion and later edit are pending. |
| Publication | Durable record key and payload, explicit reconciliation after an ambiguous response, account guards, and exact-revision draft deletion | Mocked commit-with-response-loss, reload/reconcile, definitive rejection, concurrent draft replacement and logout cases. No live social writes. |
| Shared post state | Account-scoped canonical post entities, field-specific reaction patches, independent pending controls, confirmed reply reconciliation and bounded quote dependencies | Unit tests cover late reads, stale counts, account changes, acknowledgement and quote moderation freshness; browser tests check exact record subjects and visible reply updates. |
| Moderation | Account label definitions and profile/notification decisions, covered profile identity/media and disclosure-gated descendants | SDK moderation regressions and protected-media mounting checks. Reading preferences does not write SDK feed migrations. |
| Native deck | Sidebar included in native coordinates, recovered snap insertion order and ties, native release/spring/overscroll, source-aware branch replacement and resize anchors | Independent arithmetic oracle and browser input/layout checks. Phone width constraints are an adaptation. |
| Contextual links | Article child inside the same widened tweet sheet, retaining its author/text/actions; changing source removes descendants | [Native follow-up](../research/rea/native-context-analysis.md), original article screenshot, and 830/574-width browser cases. “Show conversation” returns to 476. |
| Input and access | Separate semantic conversation buttons, complete multi-contact ownership, missed mouse-release cancellation, inert covered panes, keyboard panel reveal, non-scrollable deck ancestors and popup focus before paint | Keyboard, small/short layouts, repeated exact-origin checks, immediate Escape/tap, native Chromium touch/trackpad and synthetic Firefox/WebKit contracts pass. |
| Profiles and media | Compact grouped profile, working paginated people lists, follow/pagination fencing, image/video retry and pause when a player leaves the viewport | Profile/people, image lifecycle and real HLS decoding pass; revealing a hidden player does not resume it without an explicit Play. |
| Worker and hosting | Coherent active-release shell, tab preparation/commit acknowledgements, guarded draft flush, optional HLS caching, complete-response deadlines and Docker base-path rendering | Worker contract checks, two-release tests, and actual-server-stop reloads at root and `/panels/` pass. |

## Feeds as the first view

**Feeds** replaces Discover in the sidebar and opens directly to saved/pinned account feeds and the searchable public directory. Selecting a feed opens one child pane named for that feed. Closing it returns to the same directory/search. There is no Choose feed button, intermediate picker pane, injected default Discover entry, or automatic public-post request. Discover is an ordinary feed returned by account preferences or the directory.

**27 focused checks pass** across Chromium, Firefox, and WebKit, covering the initial Feeds view, absence of special Discover entries, saved/pinned preferences, search retention, feed and conversation panes, shared feed cards, pagination, stale responses, account clearing, offline feed separation, and phone return navigation. TypeScript and production builds pass. [Results](../research/verification/feeds-first-tests.json), [log](../research/verification/feeds-first-tests.txt), [served build](../research/verification/served-build-feeds-first.json).

Live public checks also pass: Feeds loads the directory with no initial feed pane or injected Discover entry, selecting Science opens 30 records in its own pane, and directory search returns 30 records with no page errors or horizontal overflow on desktop/phone. [Live Feeds results](../research/verification/live-feeds-first.json). The broader live profile/thread/post-search smoke also passes.

The earlier pane correction and preview checks below are historical steps, superseded by this navigation.

## Feed pane navigation correction

**Choose feed** now opens a **Feeds** pane in the existing sliding stack. Selecting a generator opens its posts in the next pane, titled with the feed name; **Bluesky Discover** opens the default feed in a pane too. The original timeline stays in place. Returning to Feeds retains the directory search, and each feed has its own pagination and refresh. Shared feed cards open beside their source, and posts opened from a feed extend that same branch.

**24 focused checks pass** across Chromium, Firefox, and WebKit, including preserved root posts, retained picker search, nested conversation panes, parent retention for shared feeds, pagination, stale reads, account clearing, offline feed separation, and phone back navigation. TypeScript and the production build pass. [Results](../research/verification/feed-pane-tests.json), [log](../research/verification/feed-pane-tests.txt), [served build](../research/verification/served-build-feed-panes.json).

Live public verification confirms **Feeds → Science** as separate panes, 30 Science posts, the unchanged original timeline, working feed search, and no page errors or horizontal overflow on desktop/phone. [Live results](../research/verification/live-rich-smoke.json).

## Bluesky previews and custom feeds follow-up

The timeline now renders lazy image grids, video posters, external thumbnail/title/description cards, quoted posts, and custom-feed embeds. Video posters open the existing player, which loads media fragments only after Play. Moderation gates protected media; hidden feed embeds withhold their artwork and text.

In the initial preview follow-up, Discover’s **Choose feed** read saved/pinned generators from the signed-in account, supports current and legacy preferences without writing migrations, and offers searchable popular feeds to everyone. Feed URI and cursor identify each reading snapshot. At that stage, switching feeds replaced the root timeline. The pane-navigation correction below supersedes that interaction.

People’s avatars are circular throughout the UI; the sidebar and workspace use the official Bluesky butterfly path. Existing installation icons already depicted a butterfly.

**111 focused checks passed** across Chromium, Firefox, and WebKit, with no retries or skips. Coverage includes saved/current and legacy preferences without writes, real generator URIs, feed pagination, stale selection responses, blocked feed embeds, offline feed separation, thumbnail galleries, video posters/HLS decoding, protected media, and phone/deck access.

Live public reads also passed: 30 Science feed records, 30 search-directory records, visible image/video/link previews, circular avatars, and no page errors or horizontal overflow on desktop/phone.

Follow-up evidence: [browser results](../research/verification/rich-preview-tests.json), [focused browser log](../research/verification/rich-preview-tests.txt), [live public verification](../research/verification/live-rich-smoke.json), and [worker contract check](../research/verification/rich-preview-pwa.txt). Actual server-stop offline reloads also pass at root and `/panels/` in all three engines, with 31 essential shell files and no API responses in Cache Storage: [root results](../research/verification/pwa-root-offline.json), [subpath results](../research/verification/pwa-subpath-offline.json). TypeScript and the production build pass. The older 268-check full-suite result below predates these changes and is preserved as baseline evidence.

## Full-suite baseline before the preview and custom-feed changes

TypeScript and production builds pass. The final complete functional run passed **268 checks**, with **8 intentional Chromium-CDP-only skips** on Firefox/WebKit, **zero failures**, and no retries. All three engines execute the shared pointer, wheel, keyboard, synthetic gesture, account, draft and media checks. Native Chromium injection additionally covers touchscreen scrolling/swiping, pinch, pull-down and trackpad pinch.

| Check | Final result | Evidence |
| --- | --- | --- |
| Complete functional suite | 268 passed, 8 intentional skips, 0 failures; 448.96 seconds | [Results](../research/verification/functional-browser-tests.json), [log](../research/verification/functional-browser-tests.txt) |
| Two-release PWA updates | 6 passed: root/subpath in all three engines, including tab preparation/refusal and coordinated activation | [Results](../research/verification/pwa-browser-tests.json) |
| Actual server-stop reload | 6 passed: root/subpath in all three engines; 35 cached shell files, working styles/artwork, no API responses cached | [Root](../research/verification/pwa-root-offline-baseline.json), [subpath](../research/verification/pwa-subpath-offline-baseline.json) |
| Live public Bluesky reads | 24 displayed feed posts, successful profile and thread, 30 author-feed records and 30 search records; no page errors, broken visible images or horizontal overflow | [Live smoke](../research/verification/live-smoke.json) |
| Input integrity | All 337 source/test hashes unchanged throughout functional, PWA, offline and live checks; independently rehashed without mismatches | [All-checks manifest](../research/verification/all-checks-inputs-after.json), [independent check](../research/verification/source-integrity-final.json) |
| Original artifacts | All 265 browser PNG hashes and the primary IPA SHA-256 match their provenance manifest | [Integrity check](../research/verification/artifact-integrity.json) |

The frozen input fingerprint is `a4363dcefd9b64a42308bed0bed0a9073d0c8272b7ec459dea20c9cf42320d3f`. Earlier diagnostic failures remain in the archived `functional-initial-*`, `functional-second-*` and `functional-third-*` evidence. They led to source fixes and corrected test synchronization; they are superseded by the clean complete run.

The browser harness always starts its own production server on port 4187. [The served-build manifest](../research/verification/served-build-functional.json) records hashes of the HTML and all emitted JavaScript/CSS and verifies the served bytes match `dist/`. Ordinary API fixtures block service workers; separate worker tests exercise real installation and stopped-server behavior. The API transport and worker deadline checks cover bodies that stall after headers; removing the worker fix in a temporary copy makes its regression fail.

## Remaining limits

The original app has not been executed on historical hardware. The preserved 3.1.1 binary and launch footage are separate evidence; exact launch 3.1 equivalence is unproven. Physical iPad Safari, physical trackpad inertia and native home-screen installation remain untested. Authenticated behavior uses strict mocked XRPC responses; live checks only read public data.

The reconstruction retains a generic sheet title bar and adapts Twitter features to Bluesky. Native URL autoselection timing and image/video child geometry are not completely recovered. Explicit URL selection follows the recovered embedded-child model; opening a conversation does not automatically load its first third-party URL. No pixel-identical runtime claim is made.

Docker/nginx configuration was reviewed, but no Docker or nginx executable is available here to run the container. Root and subdirectory static hosting were exercised with actual local HTTP servers.
