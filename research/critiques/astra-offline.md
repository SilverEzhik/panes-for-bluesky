# Astra review: offline storage and self-hosted PWA

Reviewed 2026-10-15. Read-only source critique; no application code changed. Existing root/subpath server-stop results and the mocked account-offline smoke demonstrate the basic path. The findings below concern failure modes that those tests do not establish. Reproduction instructions are proposed targeted checks, not claims that new browser experiments were run in this review.

## 1. High: signing out in one window does not sign out other windows

**Evidence:** `src/lib/bluesky.ts:155-160,258-264,358-369` keeps credentials and auth generations in each module instance, writes a shared localStorage session, and clears IndexedDB on logout. There is no storage-event or BroadcastChannel listener in `src/`. `src/components/AccountDialogs.tsx:140-143` continues writing from a separate window's composer.

**Scenario:** Open two authenticated tabs. Sign out in A while B has a draft or a pending feed request. B retains authenticated in-memory state and can repopulate the cleared account snapshots/drafts; its next credential event can write session tokens back into localStorage. Server token revocation might reject a later request, but does not clear B's already displayed account content or queued local writes. A second account signing in in A likewise does not invalidate B's generation counter.

**Improve:** Broadcast account-generation/sign-out changes, invalidate in-flight operations in every window, clear account UI immediately, and fence snapshot/draft writes against a durable account epoch. Do not rely solely on server logout.

**Verify:** Two pages in one browser context; defer B's read and draft write, sign out A, release both, assert account stores remain empty, B closes the composer/account views, and tokens do not reappear. Repeat account A-to-B switch.

Browser basis: localStorage is shared across same-origin tabs and its changes emit events in the other documents: [MDN storage event](https://developer.mozilla.org/en-US/docs/Web/API/Window/storage_event).

## 2. High: an offline-ready shell still waits indefinitely for a hanging host, and accepts server error pages

**Evidence:** `public/sw.js:35-39` awaits `fetch(request)` without a timeout and only uses the cached shell on rejection. A fulfilled HTTP 503/404 does not enter that catch. `src/lib/bluesky.ts:37-45,184-203` similarly starts every read on the network before consulting saved data; API requests have a 20-second timeout. `src/App.tsx:136-148,157-169` gates reading on session restoration.

**Scenario:** Previously install and save a feed, then keep the network interface online while the host accepts TCP but stops responding; opening the app does not immediately show its cached shell. Return 503 HTML instead: the outage page replaces an otherwise usable app. If only the PDS stalls, saved reading remains hidden behind request/restore latency.

**Improve:** Serve the versioned cached application document immediately for app navigation, with update discovery separately; alternatively enforce a short explicit navigation budget and reject unsuitable responses. Render eligible saved data immediately, label its timestamp, and revalidate in the background with account-generation checks. Keep publication explicitly network verified.

**Verify:** Installed browser tests with host 503, a never-finishing navigation, and delayed PDS responses while `navigator.onLine` remains true. Assert a small saved-content latency budget, then successful reconciliation when the network completes.

## 3. High: network navigation bypasses the explicit-update version boundary

**Evidence:** `public/sw.js:35-45` returns fresh index HTML but only recognizes the active build's exact asset URLs. `src/pwa.ts:29-34` describes activation as explicit. On activation `public/sw.js:18-19` deletes old caches and claims all clients; `src/pwa.ts:43-44` reloads only the window that requested activation.

**Scenario:** Install version A. Deploy B; reload before accepting the waiting worker. A serves B's index from the network, then B's hashed assets bypass A's cache. If B's install fails or connectivity drops, B's running document is not backed by its own complete offline cache. Conversely, accept B in one tab while another remains on A: old-cache cleanup removes the remaining A document's offline resource backing. This is a version-coherence risk, even though both clean installations pass offline reload tests.

**Improve:** Bind document and resource responses to the active build, and coordinate activation across clients. Retain an old build while live documents still need it, or explicitly save drafts and migrate/reload all clients safely. Avoid treating the requesting tab as the only open client.

**Verify:** Two-tab A-to-B deployment, a failed B asset install, and offline transition at each update phase. Check actual document/asset build IDs and continued old-tab image/resource requests.

Browser basis: worker and document versions can differ, and skipping waiting requires deliberate handling: [Chrome's Workbox lifecycle guidance](https://developer.chrome.com/docs/workbox/modules/workbox-window).

## 4. High: compose saves have no failure state or update-flush contract

**Evidence:** `src/lib/offline.ts:50-71` resolves writes on successful commit, abort, error, and unavailable storage alike. `src/components/AccountDialogs.tsx:127,140-143` queues each edit asynchronously but presents no saved/pending/failed status. `src/pwa.ts:30-34,43-44` can request activation/reload without waiting for that queue. Closing a tab also has no completion guarantee.

**Scenario:** A quota failure silently discards the draft while composing remains apparently normal. Or type quickly with delayed IndexedDB transactions and reload/apply an update before the queued latest value commits. The composer cannot distinguish durable save from discarded write.

**Improve:** Return explicit storage outcomes, show pending/saved/save-failed draft status, and make requested update navigation wait for the latest draft transaction. Coalesce queued edits to the newest value. Add a copy/export escape hatch when saving fails. Consider requesting persistent storage for user-authored drafts, with truthful behavior when unavailable; do not claim browser storage is a backup.

**Verify:** Abort/quota/unavailable-storage injection, slow writes followed by explicit update, and abrupt page close. Verify the newest acknowledged draft survives; an unsuccessful save must remain visibly unsuccessful.

Browser basis: IndexedDB transactions expose distinct completion/abort results and configurable durability: [MDN transaction()](https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/transaction). Privacy-mode storage and storage lifecycle limitations are documented in [MDN Using IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB).

## 5. Medium-high: successful publication can delete another tab's newer draft

**Evidence:** `src/components/AccountDialogs.tsx:152-155` reads the saved string and deletes it in a separate transaction; `src/lib/offline.ts:34-46,74-85` provides separate operations. Draft keys are one DID/reply target (`AccountDialogs.tsx:125`), shared by simultaneous composers, and writes carry no revision or writer identity.

**Scenario:** A publishes text X and reads saved X. B commits newer text Y before A's separate delete transaction begins. A deletes Y. Even without publishing, two composers for the same DID overwrite each other's text with last-writer-wins behavior.

**Improve:** Add draft IDs/revisions and an atomic compare-and-delete transaction after publication. Give concurrent compose sessions separate records, or explicitly surface a revision conflict rather than silently replacing content.

**Verify:** Deterministically interleave read-X/write-Y/delete and assert Y survives. Open two composers for the same account and verify edits stay recoverable after either publishes or closes.

## 6. Medium: deployment paths isolate shell caches but share sessions and authored data

**Evidence:** `scripts/build-sw.mjs:27-29` and `public/sw.js:16-18` namespace caches by scope path. However `src/lib/offline.ts:2` always opens `panels-local`, and `src/lib/bluesky.ts:14` always uses `sliding-panels.bluesky-session`. Logout calls global `clearLocalContent()` at `bluesky.ts:367`. `docs/local-first.md:57` emphasizes separate directory installations' independent caches.

**Scenario:** Host stable `/panels/` and staging `/next/` on one origin. They use independent workers but share credentials, drafts and snapshots. Signing out staging erases stable's local reading/drafts. A future staging schema upgrade can affect stable. This is accidental coupling, not a claim that paths can provide a security boundary: same-origin scripts can access both stores regardless.

**Improve:** Namespace content/session storage by an explicit installation identity or normalized base path, and document that true trust isolation requires separate origins. Provide a deliberate migration for existing storage.

**Verify:** Two subpath builds on the same origin; establish distinct drafts and accounts, clear one installation, assert the other remains intact. Exercise independent schema upgrades.

## 7. Medium: the shared 30-entry cache can evict the home feed and identity during routine browsing

**Evidence:** `src/lib/offline.ts:6-7,41-42,58-64` applies one global count/age policy to every snapshot, including identity. `src/lib/bluesky.ts:217,317` stores/restores identity in that same store. Feed cursors, searches, profiles, and threads all consume separate entries (`bluesky.ts:372-438`). Reading an entry does not refresh its retention timestamp.

**Scenario:** Save the home page, then inspect 30 profiles/threads. The home page can disappear from offline storage despite being the user's main reading surface. After 14 days offline, previously downloaded reading is rejected even when it is the only available copy. A frequently reopened cached item can be evicted before a one-off recent search.

**Improve:** Separate identity and pinned primary reading from opportunistic response cache; budget per account and content type. Distinguish freshness from retention: stale saved content can remain readable with its age visible. Add discoverable saved-content inventory/removal rather than making offline availability surprising.

**Verify:** More than 30 mixed reads, multiple accounts, and clock advancement past 14 days. Assert retained home/identity policy and explicit stale-content labels.

## 8. Medium: immutable HTTP caching includes unversioned artwork

**Evidence:** `nginx.conf:14-16` marks all `/assets/` files immutable for one year. The tree includes stable names under `public/assets/original/`; for example `src/App.tsx:380` requests `assets/original/compose.png`. `scripts/build-sw.mjs:20-25` detects changed bytes in its hash, but `public/sw.js:10` precaches via ordinary `cache.addAll()` URL requests without forcing HTTP revalidation.

**Scenario:** Correct an original artwork file without renaming it. A new worker/build is detected, but the browser's fresh immutable HTTP cache can satisfy that unchanged asset URL with old bytes; those old bytes are then inserted into the new build's Cache Storage. A build digest is not proof that the downloaded responses match the build.

**Improve:** Apply immutable caching only to content-hashed output; revalidate unversioned public artwork, or content-version its URLs. Consider precache requests that explicitly revalidate, while recognizing that deployment atomicity still matters.

**Verify:** Serve two builds through the supplied nginx configuration using the same image filename with changed pixels, preserve the browser HTTP cache, and inspect the new worker cache's response bytes after update.

## Research priorities

The highest-value next experiments are deterministic multi-window sign-out and draft races, A/B worker upgrades with one tab left open, and an online-but-blackholed host. These exercise lifecycle and transactional guarantees that ordinary offline toggles cannot establish. Keep the architecture static-hosted and browser-local: none of these improvements requires a cloud backend, offline social-action queue, or a compatibility layer.
