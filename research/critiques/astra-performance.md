# Astra performance critique — Panes

Reviewed 2026-10-15. Read-only application review; the only repository change is this report. Findings distinguish measured production behavior from source-derived risks. Priority reflects user-visible reading and gesture latency, not bundle-size aesthetics.

## Evidence and limits

Existing production artifacts: `dist/assets/index-g5ZWfpia.js` is **1,110,942 bytes / 237,743 gzip**; `hls-BMtioDMk.js` is **574,410 / 177,360 gzip** (Node gzip default settings, not measured hosting transfer encoding). The SW lists **275 files / 3,162,886 uncompressed bytes**. Its **265 original assets total 1,369,263 bytes**, including two `Default-*` launch images totaling **792,317 bytes**. Filesystem allocation from `du` is larger and should not be reported as network bytes.

Isolated headless Chromium ran the existing dist at localhost:4287, 1024×768, with service workers blocked and deterministic XRPC fixtures. Feed pages contained 30 unique text posts, three nonzero engagement counts, no remote images; no login or real-account writes occurred. Pagination accumulated 30, 300, then 900 posts. At each size, five distinct feed posts opened five sheets; each measurement window included the click, thread response, and 900 ms of settling. Sheets were closed before further pagination. CDP Performance metric differences are aggregate CPU durations over each window, **not INP, React commit time, or frame latency**. This single desktop run establishes scaling, not an iPad performance budget.

| Feed posts | Live DOM elements before sheets | Script duration for five individual opens, ms | Median script duration | Median aggregate task duration |
|---:|---:|---|---:|---:|
| 30 | 688 | 15, 22, 24, 20, 22 | 22 ms | 60 ms |
| 300 | 6,088 | 39, 41, 47, 63, 43 | 43 ms | 110 ms |
| 900 | 18,088 | 102, 100, 109, 137, 85 | 102 ms | 174 ms |

Heap readings were 7.1/24.1/37.1 MB without forced collection; they are deliberately not treated as retained-memory or leak evidence. Tests did not emulate a 120 Hz display. Dynamic import is already used for HLS; timeline attachment rows already avoid embedding full photos/videos until detail is opened. Both are valuable existing choices.

## 1. High — Saved reading waits behind networking; the advertised timeout does not bound response bodies

**Evidence:** `src/lib/bluesky.ts:37–45` clears the 20,000 ms timer when `fetch()` resolves, which is after response headers, before the SDK finishes consuming/parsing the body. A response that sends headers and then stalls can outlive that timer. `cachedRead()` at lines 184–206 only reads IndexedDB after a qualifying network failure. `App.tsx:154–219` gates first feed loading on session restoration; restore serially resumes credentials, loads moderation, loads profile, and persists identity (`bluesky.ts:301–359`). `public/sw.js:35–39` also waits for navigation fetch rejection before returning the cached shell. True browser-offline mode fails quickly; poor connectivity with `navigator.onLine === true` is the problematic case.

**Proposal:** Bound complete read operations through body consumption, and cancel the underlying transport when the read deadline expires. For an already installed version, serve the internally consistent cached shell promptly under an explicit navigation strategy; preserve user-controlled update activation. Paint a correctly account-scoped saved page immediately with its saved timestamp while a bounded refresh runs. Do not expose unmoderated fresh data or enable writes using an offline identity.

**Acceptance measurement:** With a saved feed, separately inject (a) delayed headers, (b) immediate headers plus a stalled body, and (c) stalled document navigation while online. Target saved text within 500 ms on the selected reference device, and a documented maximum fresh-read wait. Log each restore stage. These are proposed targets, not current measurements.

**Tradeoff:** A saved-first display can briefly show stale counts/content and must make that state clear. Changing SW navigation also requires old-shell/new-asset compatibility tests; blindly racing a new HTML document against old cached chunks is unsafe.

## 2. High — Long-feed sheet interactions pay for unrelated feed rendering

**Evidence:** Production measurements above show roughly 4.6× median scripting cost opening a sheet after expanding from 30 to 900 posts. `App.tsx:511` maps all retained posts on App updates; sheet opens, notices, navigation and mutations share App state. `actions` at line 278 recreates callbacks, and PostCard is not memoized. `PostCard.tsx:76` constructs an `Intl.NumberFormat` for every positive rendered count; the fixture has three per post, so 900 rerendered cards can construct 2,700 formatters in one render. Gesture listeners are installed per card (`PostCard.tsx:128–343`), though their effect depends on `enabled`, so they are **not** reattached merely because each callback identity changes.

**Proposal:** First reuse the compact-number formatter and isolate the feed subtree from sheet/navigation state, preserving stable post/action inputs at that boundary. Measure which cards actually rerender before applying selective memoization. Keep relative-time semantics deliberate if fewer renders mean fewer incidental timestamp refreshes. Consider delegated gesture handling only after allocation/listener profiling establishes its value.

**Acceptance measurement:** Repeat 30/300/900-post runs with 1/5/20 sheets and an authenticated like update. Require unchanged post text, native gestures, selection, scroll positions and focus restoration. Aim for sheet-open scripting to stop scaling linearly with unrelated feed length; collect real-device INP and long tasks before adopting a numeric release budget.

**Tradeoff:** A custom equality comparator can conceal changed callbacks or post fields. Virtualization is not the first fix: it risks scroll anchoring, find-in-page, accessibility, and mounted gesture state. React explicitly treats memo as an optimization and warns that newly created objects/functions break shallow equality; profiling should guide the boundary. [React memo](https://react.dev/reference/react/memo), [React Profiler](https://react.dev/reference/react/Profiler).

## 3. High — Installation fetches the entire asset archive and the supposedly lazy HLS chunk

**Evidence:** `scripts/build-sw.mjs:9–20` enumerates essentially every emitted file. `public/sw.js:9–10` passes the whole 275-file list to a single `cache.addAll`. HLS is thus lazy for execution, but not necessarily for first-install transfer. Safari also downloads that precached JavaScript despite native HLS support. The 792,317 bytes of original launch images alone are about 25% of total precached raw bytes. Any failed optional asset rejects installation; requests start after window load (`src/pwa.ts`), but may still compete with feed/media and delay offline readiness.

**Proposal:** Generate an explicit essential shell asset closure, retaining every original texture actually used across orientations and controls. Keep archival assets in the repository while excluding unused files from required installation. Separate optional media-player caching from essential shell installation, with clear expectations for first offline video playback. Preserve scope-specific cache keys and user-requested activation.

**Acceptance measurement:** Count required requests and transferred bytes on cold install; inject a failure into an unused launch image and verify essential reading still installs. Compare install-to-offline-ready time under throttled bandwidth. Require all used native textures to work offline at portrait/landscape and expanded navigation.

**Tradeoff:** Optional caching makes first use of a feature potentially network-dependent. A smaller shell must not silently omit infrequently used native UI assets. Browser HTTP cache may reduce wire bytes, so 3.16 MB is an upper raw payload accounting figure, not a measured repeat-download cost.

## 4. Medium-high — Large initial SDK graph deserves attribution, not unsupported deep imports

**Evidence:** Main JS is 1.11 MB raw. `src/lib/bluesky.ts:1–7` statically imports Agent, CredentialSession, RichText, moderation and lexicon helpers. Installed `@atproto/api@0.27.0` exposes only `"."` in its package exports; its generated client imports the lexicon registry and many namespaces. The built main contains chat/ozone namespace strings. These establish included breadth, but **do not quantify removable bytes**. The official package manifest also shows a root-only export boundary, though the fetched upstream page reports an older version than the local install. [SDK package manifest](https://github.com/bluesky-social/atproto/blob/main/packages/api/package.json).

**Proposal:** Produce a temporary analyzed production build before changing imports. Evaluate lazily loading the entire data/client layer to show an immediately usable shell, and lazily mounting account/compose dialogs; distinguish shell FCP improvement from actual first-feed readiness. Evaluate supported narrower SDK APIs only when available. Moving the eagerly needed SDK into a vendor chunk alone does not remove initial download or parse work. Do not import private `dist/...` modules or remove moderation/validation to hit a byte target.

**Acceptance measurement:** Report module contribution, compressed transfer, parse/evaluation time, first shell paint and first post paint on cold and warm loads. Retain a change only if it improves the relevant user metric, rather than just splitting one large file into several. Vite's current documented production splitting surface is Rolldown options; use documentation matching installed Vite 8, not an old copied `manualChunks` recipe. [Vite production build guidance](https://vite.dev/guide/build.html).

**Tradeoff:** More chunks can add waterfalls and complicate offline/update coherency. The first feed needs the SDK anyway, so shell-first splitting may improve perceived startup while leaving reading latency unchanged.

## 5. Medium — Panel animation has quadratic geometry work and deliberate 60 Hz sample holding

**Evidence:** `PanelStack.tsx:310–322` invokes `panelIsHidden` three times per panel per render; each scans every width. `panelLeft` slices/reduces a prefix (`panelPhysics.ts:67–84`). This is O(n²) work each changed offset, alongside permanent `will-change: transform` on every sheet. The spring accumulator at `PanelStack.tsx:87–108` advances only in 16.67 ms native steps; on a 120 Hz display intermediate callbacks often reuse the preceding position. React can bail out for identical state, so it is inaccurate to claim the entire tree necessarily commits at 120 Hz. Moreover, local offset updates retain the same `panel.content` element references; they do not automatically rerender every PostCard on every frame.

**Proposal:** Compute prefix positions and the last-pinned index once per frame/geometry, preserving identical outputs. Profile whether limiting promotion to moving/visible sheets reduces GPU memory without introducing rasterization hitches. Keep native discrete spring constants and trajectory. If smoother 120 Hz presentation is desired, treat interpolation between fixed simulation samples as a separately validated visual change, not a new spring formula.

**Acceptance measurement:** Capture identical release trajectories for 1/5/20/50 sheets at real 60/120 Hz. Compare position at native sample timestamps, settle time, snap destination, p95 frame duration, and compositor layer memory. No 120 Hz defect was experimentally confirmed in this review.

**Tradeoff:** Interpolation can add a sample of visual lag; changing integration or velocity semantics alters the recovered native feel. Hiding/unmounting underlying sheets to reduce work would destroy retained scroll/focus state.

## 6. Medium — Hidden sheets retain active media and embedded pages

**Evidence:** `PanelStack.tsx:320–322` hides covered sheets using visibility/inert, retaining their contents. `MediaVideo.tsx:40–59` imports HLS and fetches its manifest on mount; segment loading waits for play, which is good. Cleanup pauses video and destroys HLS on unmount/playlist change only (lines 63–72), with no covered-sheet or document-visibility policy. A playing video covered by a later sheet therefore receives no app-directed pause. WebPanel also retains its iframe. Avatars already use lazy loading; timeline attachment rows avoid full media. Do not misdiagnose every timeline video row as an active HLS instance.

**Proposal:** Introduce an explicit sheet-visibility media policy, preserving current time and user intent. Pause covered video and stop segment fetching where appropriate, then resume only according to the selected interaction policy. Delay manifest/player setup until near-visible detail or play if first-play latency remains acceptable. Preserve the native image-sheet controls and full-resolution zoom path; do not eagerly preload every gallery image.

**Acceptance measurement:** Open/play a video, cover it with five other sheets, and measure segment requests, decode CPU and audio continuation for 30 seconds; uncover and check current time, controls and first-frame delay. Open/close 20 media sheets and compare post-GC memory. Profile cross-origin iframe workloads separately because their scripts are not controlled by this app.

**Tradeoff:** Some users expect background audio. Automatically reloading or unmounting iframes destroys page state and may repeat side effects, so it should not be the default performance fix.

## 7. Medium — Abandoned reads continue, and repeated reads are not coalesced

**Evidence:** App's `generation` checks reject stale results but do not abort their requests. ThreadPanel effects start reads with no cleanup cancellation (`App.tsx:744–753`); ProfilePanel launches profile+feed in parallel. `cachedRead` has no in-flight key deduplication. Notification hydration is already bounded sensibly: 30 notifications yield at most two 25-URI hydration batches, followed by an updateSeen write. An actor mention does a profile read before opening ProfilePanel, whose initial load reads that profile again.

**Proposal:** Add caller cancellation for obsolete read work and account/version-scoped in-flight deduplication where multiple consumers request the same resource. Keep page concurrency bounded. Do not automatically retry writes or indiscriminately cancel a shared read while another visible panel still needs it. Reuse a just-resolved profile only with an explicit freshness/account policy.

**Acceptance measurement:** Rapidly switch three searches, open then dismiss ten threads, and follow a mention into a profile. Count started/completed/aborted GETs and received bytes; expect discarded reads to stop promptly and identical concurrent reads to share work. Preserve the existing account-generation guard and notification hydration completeness.

**Tradeoff:** Overaggressive caching hides fresh conversation changes; a dedupe key must include account and moderation context. Query generation guards remain necessary even after cancellation.

## 8. Medium-low — IndexedDB persistence is on the response-to-paint critical path

**Evidence:** `cachedRead` awaits `saveOfflineSnapshot` before returning the successful network result (`bluesky.ts:197`). Every snapshot write calls `getAll` and deserializes/sorts full records to prune to 30 (`offline.ts:53–66`). The cap bounds record count, not bytes: large thread snapshots and paged feeds can make the transaction appreciable. No IndexedDB timing benchmark was run, so this is a source-derived candidate rather than a demonstrated bottleneck.

**Proposal:** Measure network-complete→snapshot-complete→paint separately. Consider displaying confirmed network data immediately while committing persistence through an ordered background queue; expose offline-ready only when persistence actually succeeds. Replace full-value pruning with indexed timestamp/key iteration if measured payload cost warrants a schema migration. Consider a per-account byte/record budget without evicting the current first page unexpectedly.

**Acceptance measurement:** Populate 30 realistic large snapshots, throttle CPU/storage on a representative device, then measure median/p95 write and paint delays. Close/reopen immediately after loading and verify documented persistence guarantees. Verify draft and identity preservation independently from feed eviction.

**Tradeoff:** Asynchronous persistence can lose the newest snapshot on immediate close; the current awaited transaction provides a useful completion guarantee. A count limit of 30 already prevents unbounded storage growth by record count, so replacing the storage layer without measurements is unjustified.

## Recommended order

Implement bounded saved-first reading and measure the feed boundary first; trim required precache assets next. Attribute SDK bytes before selecting a bundle strategy. Optimize panel geometry without changing native physics, then introduce explicit media visibility and shared-read cancellation policies. Gate all work on preserved authentic gestures, native textures, account boundaries, offline reading, retained panel scroll, and truthful update behavior.
