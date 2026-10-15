# Independent synthesis of the Astra critiques

2026-10-15. This report consolidates specialist reviews; it does not implement their suggestions. Application/test source was not changed by this synthesizer. Evidence grades below refer to experiments or analysis recorded in the linked reports, not new experiments performed for this synthesis. All 16 specialist reports are indexed below and incorporated. The coordinating reviewer additionally verified all 314 recorded baseline file hashes unchanged after the critique pass.

Panes has a credible foundation: preserved original artwork and native instruction evidence, meaningful overlapping sheets, real public Bluesky reads, real Chromium gesture input, HLS decoding, and three-engine server-off shell tests. The next work should protect account and authored-data lifetime first, make client results consistent second, and then improve the native interaction model and responsive access. Cosmetic fidelity and optimization should build on those corrected boundaries. There is no demonstrated emergency remote compromise warranting the architecture report's unqualified P0 label.

## Evidence scale

- **B — Browser reproduction:** actual rendered/browser/storage behavior with controlled fixtures. This establishes the stated scenario, not live-server behavior or physical-device equivalence.
- **H — Executed harness:** actual implementation exercised in an isolated deterministic harness. Strong evidence for the reproduced interleaving, with integration limits.
- **C — Code/artifact evidence:** an identified implementation path, installed SDK behavior, native disassembly, or reference comparison; the proposed browser reproduction has not necessarily run.
- **P — Proposal/unknown:** useful design direction or conditional risk needing a specified experiment. Severity describes impact; evidence grade describes certainty and they are independent.

## Nine changes worth prioritizing

### 1. High — Make account lifetime authoritative over credentials, UI, drafts, and storage

**Evidence: B/H, with additional C races.** [Security findings 1–2](astra-security.md) reproduce two-tab logout leaving the other composer active and able to recreate erased text, plus single-tab draft resurrection with delayed transaction completion. The delay is instrumentation, so its everyday frequency is unknown. [Auth findings 1–2](astra-api-auth.md) reproduce a restoration promise waiting on itself and session-only credentials becoming unrecoverable after one transient read failure. Other post-logout cache-return/publish races remain source-derived.

Replace partial lifetime checks with one account epoch checked at every commit boundary, including after storage awaits and immediately before dispatching a deferred write. Retain in-memory refreshable credentials independently of connectivity or localStorage success. Narrow restore single-flight to credential installation; do not let profile hydration re-enter that same promise. Invalidate all windows and fence/drain old draft writers before cleanup. Give draft saves honest pending/saved/failed outcomes and revision-aware deletion after publication.

**Acceptance:** controlled restoration 503; denied localStorage followed by reconnection; delayed draft write across logout; two-tab logout/account replacement; leave and return to the same DID during pending work. Inspect both visible content and persisted rows. A request already sent cannot be retroactively canceled; test the pre-dispatch and completion boundaries separately. [Architecture](astra-architecture.md) and [offline](astra-offline.md) describe the shared replacement boundary; a new state framework is unnecessary.

### 2. High — Reconcile local mutations with fresh resources rather than freezing whole entities

**Evidence: C.** [Social-state findings 1–2, 4–6](astra-social-state.md) and [architecture findings 2–3](astra-architecture.md) identify whole-post overlays that permanently mask newer text/moderation/counts, profile pagination restoring stale follow state, published replies absent from the parent conversation, enabled reaction controls silently dropping intent, and old notification pages advancing read status past unseen activity. Reproduction recipes in these reports are not blanket claims that all were executed.

Use resource/account-scoped request generations; pagination owns feed pages rather than profile relationship state. Overlay only locally owned mutation fields, then reconcile or retire patches on confirmed fresh responses. Update/invalidate mounted parent conversations and saved snapshots. Expose pending actions. Mark only the notification snapshot actually shown as seen.

**Acceptance:** delay pagination across follow success; refetch changed moderation/counts after a reaction; publish a reply and return to its existing parent; like then repost while the first request waits; receive a notification during old-page hydration. Assert user-visible state and exact requests, including offline reopening. This fixes ordinary daily-use correctness before adding more browsing destinations.

### 3. High — Treat ambiguous publication as an unresolved outcome, with one recoverable submission identity

**Evidence: C; protocol strategy P until tested.** [Social-state finding 3](astra-social-state.md) shows each retry starts a new create-record operation. The current error path cannot distinguish a rejected write from a committed write whose response was lost. It preserves the draft, which is good, but encourages a retry that can duplicate publication.

Research a stable valid record key and payload for each submission, followed by exact-record reconciliation after ambiguous failure. Do not introduce an automatic write retry queue. Preserve draft text and distinguish “could not confirm publication” from definite rejection. Include account-epoch checks from item 1.

**Acceptance:** a persistent mock PDS commits then drops the response; confirmation/retry produces exactly one record. Validate create/get/conflict semantics against the installed SDK and protocol before choosing the final mechanism. Live publication is unnecessary for the deterministic proof and remains separately authorized work.

### 4. High — Complete moderation at the profile and custom-label boundaries

**Evidence: C, including installed SDK/official API evidence.** [Auth findings 4–5](astra-api-auth.md) and [security findings 4–6](astra-security.md) agree that profile/avatar/banner decisions are discarded and custom label definitions are never loaded. A generic raw-label warning is not equivalent to the user's hide/no-override decision. Closed overridable warnings also mount media loaders before reveal; this is a network-loading concern, not evidence of visible playback or credential transmission.

Fetch definitions with preferences under the same account epoch; carry profile/notification/avatar/banner decisions to their actual rendering surfaces. Define a deliberate unavailable-definitions state. Mount protected media only at the chosen reveal boundary.

**Acceptance:** built-in and custom labels, account versus profile labels, hidden/no-override posts, follow notifications without posts, and media request counts before reveal. Pin SDK fallback behavior in fixtures rather than increasing severity based on assumed behavior. Preserve the existing moderation and normalization boundary while extending it.

### 5. High — Unify desktop sheet coordinates and make responsive access a separate explicit adaptation

**Evidence: B for responsive access/resize; C for native comparisons.** [Native-physics findings 1–4](astra-native-physics.md) show that compact layout algebra and much of the spring are already correct, but the boolean sidebar expansion omits the native compact-coordinate -220 anchor. Resize springs to the newest sheet, losing the chosen reading position. Recognition sampling and sorted snap tie behavior differ from the retained native paths. Fix these targeted differences without replacing recovered physics with generic paging.

The [mobile review](astra-mobile.md) measured an 830px web sheet ending at x904 in a 667px viewport, putting close/reload/external-open controls offscreen; it also reproduced short-landscape compose/navigation clipping, the expanded rail covering its own dismiss toggle, and a one-pixel resize changing the visible reading sheet. These are concrete access failures, not merely aesthetic breakpoint preferences.

Model navigation exposure, timeline, and sheets in one reversible coordinate system; preserve logical sheet/alignment on measurement changes. Preserve 830/574/476 as preferred native widths when they fit, constraining effective widths only to available space and feeding those same widths into physics. Give short-height navigation a reachable scrolling region and expanded compact navigation a visible dismiss control that preserves the current sheets. Keep the phone layout an intentional adaptation with reachable navigation and controls, not an assertion of original iPad behavior. Use explicit gesture ownership and pointer identities; [Safari review](astra-safari-gestures.md) supplies cancellation, mixed-contact, click-suppression and continuation cases.

**Acceptance:** slow compact-to-expanded navigation, collapse with multiple sheets, resize while reading an older mixed-width sheet, threshold/tie traces, and interruption during motion. Compare native sample positions to an independently transcribed oracle. Separately hit-test toolbar and navigation controls at 600/601/667/768/800/801/844/1024px and short landscape, then test touch ownership and real Safari hardware. Safe-area and virtual-keyboard failures are source-derived risks requiring device validation, not reproduced defects. Native rotation-preservation behavior and Safari portal-retargeting manifestations remain unverified; proposed context preservation is a product policy, not a recovered historical fact.

### 6. High — Keep keyboard focus visible and make posts readable as articles

**Evidence: B/C.** [Accessibility](astra-accessibility.md) reproduced Shift+Tab into a fully covered timeline and inspected the rendered nested-button accessibility structure. It also calculated approximately 2.36:1 timestamp and 2.54:1 handle contrast on the stated detail surface. The image viewer's arrow handler blocks horizontal panning; [media findings 5](astra-media-links.md) reaches the same conclusion. Real screen-reader speech was not tested, and Chromium retained descendants, so “all post text disappears for screen readers” would be unsupported.

Make covered feed content inert on phones and reveal/exclude occluded focus targets appropriately on desktop. Preserve article semantics with a distinct conversation opener and sibling controls. Let arrows pan a zoomed image, give the action overlay one coherent modal/popover focus model, expose navigation expansion state, and darken semantic secondary text. Disable sidebar layout animation under reduced motion too.

**Acceptance:** keyboard-only reading/link/image/reply/return journey with focus hit testing, followed by VoiceOver/Safari and NVDA/Firefox. Do not make every desktop sheet modal. Existing dialog focus handling is a useful implementation to reuse.

### 7. Medium-high — Restore the distinctive content hierarchy and source context, using a bounded historical target

**Evidence: C for visual/reference differences; P for some navigation policies.** [Visual fidelity](astra-visual-fidelity.md) identifies higher-value changes than pixel polishing: compact conversation header/actions, stable timeline vertical origin, paper-reveal compose, a richer pinch card, grouped profile presentation, and recursive follower/following lists. [Product parity](astra-product-parity.md) adds origin-aware selection and source context for articles/media. Preserve actual Bluesky text, moderation and modern media without rewriting it to fit historical tweet lengths.

Use the [historical audit](astra-historical-audit.md) to set the target precisely: a September 2010 reconstruction using preserved 3.1.1 code and launch-era references. Ordinary sheets are 476 points; web and conditional wide tweet sheets have other widths. Top-level section changes deliberately discarded panes in contemporary reporting. Inline-hashtag branch policy, reopen behavior, browser Back integration and reload restoration need separate evidence/design decisions; retaining every stack is not automatically historical fidelity.

**Acceptance/research:** identify 3–5 reference states and source/derivative provenance, compare at fixed dimensions, then trace controller call sites for ambiguous branch lifetimes. Add people-list navigation only after resource/mutation rules are sound. Retain source/card metadata plus an explicit external escape when iframe embedding fails; label the toolbar as the original link because cross-origin navigation cannot be reliably tracked. Do not use later 2011/2012 UI as a September 2010 oracle.

### 8. Medium-high — Make saved reading and updates coherent under partial failure

**Evidence: C; existing clean offline-shell tests are B.** [Offline](astra-offline.md), [deployment](astra-deployment.md), and [performance](astra-performance.md) independently identify network-first shell waiting, accepted HTTP error documents, A/B document/worker mismatch, one-tab update activation, and immutable caching of stable artwork filenames. The API timeout ends when headers arrive, so it does not bound stalled response bodies. These are different failure modes from a fully disconnected browser, which already has useful test coverage.

Bind shell HTML and resources to a coherent active build, serve eligible saved content promptly under correct account/moderation context, bound full reads, and coordinate update activation with draft flush and other clients. Revalidate or version stable artwork. Resolve container root/subpath build configuration explicitly. Preserve user-controlled updates and static hosting.

**Acceptance:** two tabs across A/B deployment, failed optional asset installation, changed same-name artwork through the supplied HTTP cache policy, host 503, hanging navigation, and headers followed by a stalled body. Then cold-reopen a saved nonempty account view and draft offline and reconnect. Avoid conflating independent subpath caches with independent credentials/content stores or with a security boundary.

### 9. Medium — Optimize demonstrated scaling and preserve content/media behavior

**Evidence: B measurement/C paths/P budgets.** [Performance](astra-performance.md) measured median aggregate scripting for a sheet open rising from 22ms at 30 posts to 102ms at 900 posts in one controlled desktop Chromium run. This is not measured INP, retained-memory leakage, or iPad frame latency. It also counted 275 precached files totaling 3.16MB raw, including unused launch art and the execution-lazy HLS chunk. Bundle splitting or virtualization is not yet the demonstrated best fix.

Reuse number formatters and isolate feed rendering from unrelated sheet state; profile before selective memoization. Reduce required precache to the essential asset closure while preserving archival files and all actually used artwork. Compute repeated panel geometry once without changing its results. Pause fully hidden video and stop unnecessary HLS fetching while preserving position; do not unmount all retained sheets or indiscriminately reload iframes. Preserve unsupported record variants as safe named links rather than silently dropping shared content, as [media review](astra-media-links.md) recommends.

**Acceptance:** repeat 30/300/900-post measurements with realistic media and real-device latency; compare 1/5/20-sheet trajectories and visible selection/focus/scroll. Count hidden-video requests and audio, test retry after media failure, and inspect bundle attribution before touching SDK import boundaries. A blanket rewrite, private SDK deep imports, and premature virtualization would add risk without current evidence.

## Replacement sequence and proof

1. Strengthen the existing fixture boundary just enough for deferred responses, two identities, cursors and exact write contracts; fail unknown write endpoints. Then repair account/session/storage lifetime and draft durability.
2. Replace conflicting resource/mutation ownership and prove publication ambiguity and moderation cases. Keep storage/auth checks at the API boundary even when consumers also guard requests.
3. Correct native-coordinate navigation and responsive reachability together, with visible keyboard focus as part of the layout contract. Keep pure physics and browser adapters separate; distinguish exact native behavior from intentional phone adaptations.
4. Restore conversation/compose/profile/source hierarchy, then validate full accessibility journeys. Repair versioned update/saved-reading behavior before claiming robust installed daily use. Profile and optimize measured bottlenecks without weakening retained-sheet behavior.

The [test audit](astra-test-audit.md) records 52 passing project executions and eight intentional skips: 20 scenarios repeated across engines, not 52 independent journeys. Those passes remain valuable. Existing fixtures have immediate responses, no ordinary feed cursors, empty notifications and permissive writes; they cannot establish the new interleavings. Require a test-owned fresh server or served bundle digests in the next evidence run. Source hash stability is not a served-bundle identity proof.

## Claims to avoid and open research

- No demonstrated general XSS, arbitrary cross-origin iframe token theft, or ordinary cross-account draft browsing. The iframe same-origin scripts risk requires hostile same-origin content; initial URL rejection alone also misses redirects/navigation. A dedicated origin/isolated embed policy is worth evaluating, without presenting the condition as a proven remote exploit.
- No historical runtime was executed. Native constants and instruction traces support particular behaviors; footage has perspective and version limitations. Matching coefficients alone does not prove animation equivalence.
- Synthetic WebKit/Firefox events do not establish physical Safari touch, momentum, browser edge navigation or native zoom suppression. The skips are explicit coverage limits, not failed application tests. Physical iPad Safari/installed PWA, macOS trackpad and assistive-technology checks remain open.
- No live authenticated writes were performed for these critiques. Any future live-write test requires explicit scope and an authorized account; deterministic repository-backed mocks can establish most ordering/retry guarantees first.
- Preserve strengths: HTTP(S) normalization, escaped React text, no persisted app password, account-scoped snapshots, worker exclusion of authenticated API/media responses, useful external-link escapes, genuine original assets, pure panel physics, and already substantial browser checks. The review supports targeted replacements, not rebuilding the application around a framework.

## Specialist report index

1. [Accessibility](astra-accessibility.md)
2. [API and authentication](astra-api-auth.md)
3. [Architecture](astra-architecture.md)
4. [Deployment and reproducibility](astra-deployment.md)
5. [Historical/provenance audit](astra-historical-audit.md)
6. [Media and links](astra-media-links.md)
7. [Mobile and responsive ergonomics](astra-mobile.md)
8. [Native geometry and physics](astra-native-physics.md)
9. [Offline/PWA storage](astra-offline.md)
10. [Performance](astra-performance.md)
11. [Product and interaction parity](astra-product-parity.md)
12. [Safari and gesture ownership](astra-safari-gestures.md)
13. [Security/privacy/moderation](astra-security.md)
14. [Social state](astra-social-state.md)
15. [Test evidence audit](astra-test-audit.md)
16. [Visual fidelity](astra-visual-fidelity.md)
