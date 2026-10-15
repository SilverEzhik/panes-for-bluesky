# Architecture critique

Read-only source review, 2026-10-15. Recommendations below replace existing implementations; they do not require a state framework, compatibility wrappers, or parallel old/new paths. No runtime defect reproduction was performed. File references describe the reviewed source.

The most expensive problem is inconsistent ownership of asynchronous work and copies of entities, not the physical length of App.tsx. The pure panel geometry is already a useful boundary. Keep that boundary and make a few equally explicit boundaries around account lifetime, resource loading, and mutation results.

## 1. P0: Give account lifetime authority over every asynchronous commit

Evidence: `src/lib/bluesky.ts:184-205` checks account/version after the request, then awaits snapshot persistence before returning. The fallback checks before awaiting IndexedDB, then returns the snapshot without checking again. `logout()` at `358-369` publishes the anonymous session before asynchronous clearing finishes. UI mutations compare only DID at `src/App.tsx:263-275`; leaving and returning to the same DID is indistinguishable from the original session. Compose publishes and invokes `onPublished` after further awaits without an account/lifetime check (`src/components/AccountDialogs.tsx:146-160`).

Consequence: the code has carefully introduced an auth generation, but it is not the commit boundary. A logout overlapping IndexedDB work can still return an old private result; a queued draft write can also outlive the composer and its logout clear. Same-account reauthentication can accept a mutation from a previous session. These are ordering hazards inferred from source, not claims that ordinary logout always leaks content.

Replacement: expose an immutable account scope `{ did, epoch }` from the client. Capture it at operation start and validate it at each externally visible commit, including after persistence awaits. Pass the scope explicitly to account draft/storage operations. Serialize account clear against writes or reject writes from a retired scope. Keep the existing auth version concept; replace the partial checks rather than introducing a second lifetime mechanism. Make session UI consume one reactive snapshot rather than mixing React `session` with direct singleton reads (`App.tsx:914-917`, `AccountDialogs.tsx:125`).

Proof needed: deferred read resolves after logout; fallback IndexedDB read resolves after logout; draft save queued before logout; sign out then sign in as the same DID while a write is pending. Assert both visible state and stored records.

## 2. P1: Replace three resource loaders with one explicit request-lifetime policy

Evidence: main feed load has a generation guard (`App.tsx:154-220`), thread load has none (`744-753`), and profile load has none (`849-873`). Profile pagination captures the whole profile and writes it back after loading (`855`, `858`), while follow independently writes profile state (`874-885`). A pagination request that started before a successful follow can restore the old `following` value. Main-feed effect deliberately omits its callback dependency because cursor is mixed into that callback (`213-220`).

Replacement: a small resource-loading hook/controller keyed by resource identity and account epoch, with separate `reload` and `loadMore` operations. Cursor belongs to the resource controller, not the effect dependencies. Ignore stale responses on key change/disposal, serialize pagination, and represent initial loading versus page loading explicitly. Keep endpoint-specific result rendering local. In ProfilePanel, pagination updates only feed data; profile details and follow state are a separate resource. Do not make a universal caching/query framework just to share three loaders.

Proof needed: delayed page then follow; reload while a prior load is in flight; account change with an open panel; duplicate pagination clicks. Existing mock feed returns no cursor (`tests/fixtures.ts:43-44`), so normal suite coverage does not exercise the production pagination contract.

## 3. P1: Replace whole-post overlays with a single mutation ownership rule

Evidence: `updatePost` writes the same result to `postUpdates`, feed posts, and thread sheet seeds (`App.tsx:244-255`). Threads and profiles prefer the whole overlay forever (`754`, `768`, `810`, `954`). Client toggles return a spread of the original whole post (`bluesky.ts:493-504`), and neither updates nor invalidates persisted reads. A later fresh thread response cannot replace an old overlay's text, moderation, counts, or embeds. Refreshing data therefore does not reliably make the rendered entity fresh.

Replacement: keep feed/thread response data as the baseline and overlay only the mutation fields that are actually owned locally, scoped to account epoch. Reconcile/retire patches on a newer confirmed fetch, and update or invalidate affected saved snapshots so a reload does not knowingly resurrect pre-mutation viewer state. Alternatively, use one normalized entity map if multiple live views really need shared authoritative records; do not retain both approaches. Avoid copying entire entities into sheet navigation descriptors once a shared entity identity exists.

Proof needed: like from one view, see it in another, refetch a changed moderation/count response, then reload offline. Also verify like then repost preserves both results. This is a concrete consistency contract, not a request to centralize all UI state.

## 4. P1: Extract gesture decisions from browser plumbing and document ownership between layers

Evidence: `PostCard.tsx:116-341` houses pointer, touch, wheel, Safari gesture streams, timers, document wheel continuation, and click suppression inside the rendering module. The post recognizer excludes controls with one selector (`109-110`); PanelStack pointer and wheel paths use different exclusions (`PanelStack.tsx:188`, `244`). PanelStack cancels its drag on a second touch (`238-240`), a critical cross-component agreement with two-finger post launch. Wheel continuation deliberately moves onto `document` when the peek portal retargets events (`PostCard.tsx:253-261`).

Replacement: retain a browser adapter hook but move recognition into explicit pure transition functions accepting points, time, and stream lifecycle. Define the gesture ownership rules once: one-finger vertical remains native, horizontal panel movement owns its captured stream, second touch cancels deck drag, and a recognized launch suppresses exactly its compatibility click. Keep browser-specific adapters because they represent actual differing input pipelines. Do not replace them with one speculative event abstraction.

`src/lib/panelPhysics.ts` already demonstrates the right separation: pure geometry/spring decisions and a DOM adapter in PanelStack. Preserve it. Add focused transition tests for canceled streams, duplicate touch/pointer delivery, third finger, and control-origin movement; keep native Playwright touch/trackpad tests as integration proof.

## 5. P2: Replace accumulated CSS rules with component variants at their actual ownership points

Evidence: global `.post-actions` is defined at `styles.css:440`, styled again for responsive/detail contexts (`1421`, `1450`), and disabled for timeline cards much later (`1573-1575`). `.post-author` is redefined in the late timeline section (`1585`). Stack-header styling lives in global CSS (`647`) alongside `PanelStack.css`. Current structure makes visual changes depend on reading a distant historical cascade, especially at responsive breakpoints.

Replacement: consolidate PostCard base, timeline, detail, and selected declarations into one owned stylesheet; make variants explicit at render time. Move stack-header presentation to the stack stylesheet. Keep genuinely shared tokens, reset, and app shell in global CSS. Delete superseded declarations during the move, and verify the existing screenshots at phone/tablet/desktop sizes. Do not merely append another overriding section or split the same cascade across more files. Preserve intentional variants: the presence of a later rule alone does not prove an earlier one is dead.

## 6. P2: Make the test boundary strict, and remove unused production surface

Evidence: fixtures correctly live in `tests/fixtures.ts` and intercept XRPC rather than bypassing normalization. Preserve this. However, the mock accepts every otherwise-unhandled POST with success (`54`), exposes request body as `any` (`18`), and always returns first-page feed data without cursors (`43-44`). `tsconfig.json` includes only `src`, so tests do not participate in the build's strict check. This can let a broken endpoint or missing pagination behavior pass.

Replacement: explicit write endpoint responses, fail unknown requests, typed SDK-compatible response fixtures with `satisfies`, and a separate test typecheck configuration. Extend fixture controls with deferred responses, two-page cursors, and account identity switching for the lifecycle tests above. Keep deterministic browser fixtures separate from live smoke scripts; there is no evidence of shipped demo data to remove.

Source search found unused API `searchActors` (`bluesky.ts:394-400`) and unused `clearAccountLocalContent` (`offline.ts:118-124`). Remove unused surfaces if there is no immediate feature requirement. The `Section` union's `profile` branch is also unnecessary under current navigation: `navigate('profile')` opens a sheet and returns rather than setting the section (`App.tsx:226-235`), while the loader still handles that unreachable section (`159`). Remove that stale state possibility. Do not mistake reverse-engineering research artifacts for live prototype runtime code.

## Small replacement sequence

1. Add deferred/account-switch fixture scenarios, then repair the account epoch and persistence commit boundary.
2. Replace profile/thread/feed request handling and fix follow-versus-pagination ownership.
3. Replace whole-post overlays and define saved-result reconciliation.
4. Extract pure gesture transitions, preserving current native integration tests and panel physics.
5. Consolidate CSS in place and remove unused API/state branches; typecheck the test boundary.

Keep `Sheet` as a discriminated union, keep local modal/nav/peek state local, retain the SDK normalization boundary, and keep pure panel physics free of React and storage. None of this requires Redux, a router, a plugin system, or blanket component fragmentation.
