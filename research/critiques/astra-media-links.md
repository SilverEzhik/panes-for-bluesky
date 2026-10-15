# Linked content and media critique

Read-only source review, 2026-10-15. Scope: recursive panel navigation, external pages, images, video, embedded records, and their existing browser tests. No application code or account state changed. Reproduction steps below are proposed deterministic checks derived from source; this review did not execute browsers.

The implementation already has useful foundations: HTTP(S) normalization at ingestion, modifier-click preservation, a permanent external-browser escape, fullsize-image failures, explicit media gestures, moderation around primary and quoted content, and a real HLS decoding test. These findings target gaps in that implementation rather than replacing its compact attachment design.

## 1. High, proposed Bluesky adaptation: hashtag navigation destroys the reading chain, and browser history cannot restore it

**Evidence:** `src/App.tsx:42`, `:61-95`, `:104-109`, `:643-645`. Sheets live only in component state; the source contains no History API/popstate integration. `searchTag` changes the base section and calls `setSheets([])`.

**Reproduce:** Open a post, its author's profile, another post, then a hashtag in that post. The complete stack disappears. Browser Back cannot reconstruct those sheets. Reload any rich-content chain and it also disappears.

**Historical qualification:** Firsthand historical evidence reports that section switching discards stacks; preserving an inline hashtag trail is a proposed Bluesky adaptation, not a demonstrated historical invariant. Browser history integration is likewise a web usability proposal.

**Impact:** A semantic link that could extend the research trail destroys it. Ordinary browser navigation and refresh conflict with the product's recursively layered reading model.

**Remedy:** Give search results a sheet descriptor and append it from hashtags. Serialize stable descriptors (post URI, actor DID, search query, original web URL, image post URI/index), synchronize append/dismiss with browser history, and restore by resolving descriptors. Keep image payloads out of URLs. Test a post → profile → post → hashtag chain, Back/Forward, refresh, and an unavailable restored post.

## 2. High: sliding a playing video out of view leaves it playing and fetching

**Evidence:** `src/components/PanelStack.tsx:310-328` renders every panel and only applies `inert`, `aria-hidden`, and CSS visibility to hidden ones. `src/components/MediaVideo.tsx:63-72` pauses and destroys the player only on unmount or playlist change.

**Reproduce:** Play a video in a conversation, open another profile/conversation, then slide until the video panel is fully hidden. Its component remains mounted, so audio/playback can continue without reachable visible controls. Repeat with another video.

**Impact:** Invisible audio and multiple active streams undermine the layered model on mobile and waste bandwidth. `inert` disables interaction; it does not pause media.

**Remedy:** Pass panel visibility/activity into media contexts and pause when a panel becomes fully hidden; stop HLS fragment loading where appropriate. Preserve time and require explicit playback when revisiting. Add a two-panel playback test asserting paused state and no continuing segment requests after hiding the first panel. Decide explicitly whether a partially exposed panel can continue playing.

## 3. High: valid embedded records silently vanish

**Evidence:** `src/lib/bluesky.ts:108-133` handles images, external, video, record-with-media and selected record variants only. The record branch omits feed-generator/list/labeler/starter-pack views; quoted embeds use only `quoted.embeds?.[0]` at `:125`. At `:122`, hitting the depth limit silently removes the next quote rather than retaining an openable reference. `src/components/TimelineAttachments.tsx:28-36` then returns nothing when no recognized attachment survived.

**Reproduce:** Feed a post with `app.bsky.embed.record#view` whose record is a feed generator or list. Its text renders but its shared target has no attachment. Feed a quoted record with multiple embeds, or a nested quote beyond the depth cap: content beyond the first embed/cap disappears.

**Impact:** Source content is misrepresented as text-only and the recursive browsing path ends silently. These are data-model omissions, not requests for elaborate new screens.

**Remedy:** Normalize a discriminated attachment union. Preserve unsupported but identified records as a compact named link, retain an unresolved quote reference at the recursion bound, and account explicitly for every embed entry. The current upstream record schema also includes gallery embeds: inspect the installed SDK and supported server payloads before adding a gallery adapter. Add fixtures for each known union branch plus unknown future types; keep unknown types visible as unsupported attachments when a safe target is available. The [official record lexicon](https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/embed/record.json) defines non-post record variants and an array of quoted embeds.

## 4. Medium: web toolbar describes the original page after the iframe navigates elsewhere

**Evidence:** `src/components/LinkPanels.tsx:26-55`: address, title, external-open link, and reload key all derive from the initial `url`; reload remounts an iframe at that original URL. There are no page back/forward controls or current-navigation synchronization.

**Reproduce:** Open an allowed page A containing a same-frame link to B. Follow it. The toolbar still names A. “Open in browser” opens A, and “Reload web page” resets to A rather than reloading B.

**Impact:** The visible address is misleading, and the only escape loses the actual current page. This is more serious than merely lacking browser chrome because the labels promise current-page operations.

**Remedy:** For arbitrary cross-origin pages, label the toolbar and escape as the **original link**, and label the remount action “Reopen original page.” Preserve actual browser navigation in a separate window when users need full browsing. Only synchronize current URL/history for controlled cooperating embeds; do not attempt to read cross-origin iframe locations. A and B fixtures should verify truthful toolbar behavior. [MDN's iframe documentation](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe) describes the cross-origin restriction and why iframe load/error events cannot reliably establish successful loading. Keep the existing permanent escape for X-Frame-Options/CSP refusals; a timeout must not claim to diagnose them.

## 5. Medium: gallery arrow keys prevent keyboard panning at full size

**Evidence:** `src/components/LinkPanels.tsx:94-100` always prevents Left/Right and switches images, including when the scrollable viewport at `:123` is focused and zoomed. `src/components/LinkPanels.css:65-81` intentionally makes the fullsize image scrollable. `tests/links.spec.ts:136-142` currently codifies advancing the gallery while zoomed.

**Reproduce:** Open a 1200-pixel-wide image in the 476-pixel photo panel, choose full size, focus its viewport, and press Right to inspect the cropped right side. The viewer jumps to the next image and resets zoom. With one image it prevents horizontal scrolling without moving anywhere.

**Impact:** The advertised “Scroll to explore” interaction is inaccessible through standard horizontal arrow keys; touch and mouse users can pan while keyboard users cannot.

**Remedy:** Let unmodified arrows scroll a zoomed viewport. Reserve gallery arrows for fit mode or explicit previous/next controls; optionally add documented modified shortcuts. Update the test to assert `scrollLeft` changes while the index stays fixed in fullsize mode, and verify gallery navigation still works in fit mode. Retain native pinch behavior and test actual viewport geometry with portrait, panoramic, and long-caption fixtures rather than only checking CSS classes.

## 6. Medium: transient media failures become permanent until the panel is rebuilt

**Evidence:** `src/components/MediaVideo.tsx:47-51` destroys hls.js after every fatal error; its only initialization dependency is `video.playlist` (`:72`). The displayed escape at `:90` is a raw playlist. In `src/components/LinkPanels.tsx:124-130`, an image error removes the image element and there is no retry action; the failure resets only when the collection or image index changes (`:81-84`).

**Reproduce:** Open a single-image post offline, restore connectivity, and remain in the panel: the image stays failed. Interrupt an HLS manifest/segment request until the player emits a fatal error, restore connectivity, and press Play: the destroyed player is never recreated.

**Impact:** Connectivity returning does not make the visible media usable. A raw `.m3u8` escape may download or display text on browsers that needed hls.js in the first place.

**Remedy:** Add an explicit Retry action that resets image failure or recreates the media player, with bounded recovery by error class and no automatic endless loops. Offer the canonical post as an additional fallback when known. The [hls.js recovery API](https://hlsjs.video-dev.org/api-docs/hls.js.hls.recovermediaerror) and [official error design notes](https://github.com/video-dev/hls.js/blob/master/docs/design.md) distinguish recovery paths; do not classify all fatal errors as irrevocable. Extend `tests/video.spec.ts` beyond successful decoding to failure/reconnect/retry, including native HLS.

## 7. Medium: quoted video and external-link content is invisible in the quote preview

**Evidence:** `src/components/PostCard.tsx:710-746` renders quoted text and only `images[0]`, although normalization supports quote video/external content. There is no count or attachment cue for those types. `:750-753` and `src/components/TimelineAttachments.tsx:137-140` also replace the specific normalized blocked/deleted/detached reason (`src/lib/bluesky.ts:129-131`) with one generic unavailable message.

**Reproduce:** Open a post quoting an empty-text video post or an empty-text external card. The quote looks essentially blank except for its author. Compare blocked, deleted and detached quotes: their explanations are identical despite distinct source states.

**Impact:** Users cannot tell what they are opening, and author detachment is indistinguishable from deletion or blocking. The source already provides the missing information.

**Remedy:** Inside the existing quote moderation boundary, reuse compact attachment cues for video/external content and an image count; retain the click-to-open quote behavior. Render `unavailableQuote` itself as escaped text. Add empty-text quote fixtures with media, plus each unavailable reason and no-override moderation, to ensure cues never reveal protected content.

## 8. Medium, conditional security boundary: same-origin URLs get a script-capable, same-origin iframe

**Evidence:** `src/components/LinkPanels.tsx:15-17` accepts all absolute HTTP(S) URLs, including the app's origin; `:52` combines `allow-scripts` with `allow-same-origin`. `src/lib/bluesky.ts:56-60` similarly validates scheme rather than origin or credentials.

**Reproduce:** Link to a controlled HTML fixture hosted on the app origin that attempts to access `parent.document` or same-origin storage. This frame is not isolated from the app by the advertised sandbox combination. This is a conditional boundary weakness, not evidence that arbitrary cross-origin posts can access credentials.

**Impact:** If hosting ever serves user-controlled HTML on the same origin, opening that content grants app-origin access. Linking to the app itself also recursively embeds another running copy instead of opening an internal destination.

**Remedy:** Route recognized app URLs internally; open other same-origin content outside the embedded sandbox, or isolate preview documents on a separate origin / remove same-origin permission where compatible. Reject credential-bearing URLs to avoid confusing address presentation. Keep HTTP(S) scheme checks and `noopener noreferrer`. Add a controlled same-origin fixture and a cross-origin fixture to confirm the intended boundary. [MDN explicitly cautions against this sandbox combination for same-origin documents](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#sandbox).

Existing validation is strongest on successful opening, selected image index, basic zoom toggling, fullsize 404 feedback, and HLS frame decoding. The next highest-value verification is a restored recursive chain, hidden-video lifecycle, unsupported record fixtures, and real zoomed keyboard panning. No claim above depends on reproducing exact historic Twitter browser chrome; each concerns preserving a user's content or reading trail within Panes' chosen interaction model.
