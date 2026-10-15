# Security, privacy, and moderation critique

Reviewed 2026-10-15. Scope: browser-only, self-hosted Panes; source review plus isolated Chromium with `tests/fixtures.ts` XRPC mocks and fake credentials. No real account actions, external scanning, or application edits. Findings below distinguish reproduced failures from conditional risks. Rankings consider likelihood and impact, not just theoretical worst-case severity.

## 1. Sign-out does not reach other tabs (P1, reproduced)

**Evidence:** `src/lib/bluesky.ts:164-180,254-264,358-369`; `src/App.tsx:119-136`. Session subscribers and `authVersion` are per JavaScript instance. There is no `storage` listener or BroadcastChannel. Each tab may persist credentials independently.

**Trigger and effect:** Open two tabs in the same browser context and restore the same account. Open a composer in tab B; sign out in tab A. In a local Chromium run, B still reported `View Signed In Tester profile`, retained its draft in the composer, and editing it recreated `{key: 'did:plc:zyxwvutsrqponmlkjihgfedc:compose', data: 'private draft rewritten after logout'}` in IndexedDB after A's cleanup. Another person using the still-open tab can read the visible account content. B can also overwrite shared session storage on a subsequent refresh callback, though successful server refresh after revocation was **not** tested or assumed.

**Fix:** Broadcast logout/account replacement, invalidate every tab's auth generation, clear account views/composers, and refuse old-generation storage writes. Coordinate cleanup with writers, not merely UI notifications. Treat loss/change of the stored session as an account boundary.

**Test:** Two pages in one Playwright BrowserContext with mocked XRPC; authenticate A, restore B, draft in B, logout A, assert B clears private UI and cannot recreate drafts/session state. Repeat offline and with an account change. This is an actual still-open-tab disclosure and erasure failure; it is not evidence that a different DID can normally read another DID's drafts through the UI.

## 2. Queued draft saves resurrect data after single-tab sign-out (P2, reproduced under delayed completion)

**Evidence:** `src/components/AccountDialogs.tsx:125-143` serializes saves in `draftWrites`; unmount only cancels the draft read. `src/lib/bluesky.ts:358-369` clears storage without coordinating with this queue. `src/lib/offline.ts:50-71,74-86` allows later transactions after clear.

**Trigger and effect:** A backlog of input saves remains when the composer closes and the user signs out. Later queued saves execute after the clear transaction. Chromium reproduction wrapped `IDBTransaction.prototype.oncomplete` callbacks with a 150ms delay, typed `secret delayed draft`, closed the composer, signed out, and waited four seconds. IndexedDB again contained the complete text under the original DID's compose key. This instrumentation establishes the ordering bug; its frequency without induced latency is unmeasured.

**Fix:** Introduce a shared account-storage generation/tombstone checked immediately before each write transaction. On logout invalidate the generation, cancel/drain pending saves, then clear. Debouncing alone does not establish an erasure guarantee.

**Test:** Hold completion of the first draft write, queue further edits, initiate logout, release it, await every queue, and assert no original-account rows exist. Also test two tabs. Remaining rows are readable by same-origin code/local browser inspection and potentially by the same account on later login; anonymous UI access or automatic cross-account draft exposure was not demonstrated.

## 3. Embedded same-origin pages have access to the app's credentials (conditional P2)

**Evidence:** `src/components/LinkPanels.tsx:15-18,48-54` accepts any HTTP(S) origin and combines `allow-scripts` with `allow-same-origin`; `src/lib/bluesky.ts:262,287` stores access and refresh JWTs in origin-wide localStorage.

**Trigger and effect:** A self-hosted deployment shares an origin with an attacker-controlled HTML page or another compromised application. Opening its link inside Panes gives its script same-origin DOM/storage access; the iframe sandbox does not isolate it. Token theft, draft reads, and parent DOM changes are then possible. The HTML Standard explicitly describes the same-origin scripts/sandbox escape. [WHATWG iframe standard](https://html.spec.whatwg.org/multipage/iframe-embed-object.html)

**Fix:** Host Panes on a dedicated trusted origin; remove `allow-same-origin` for untrusted embedded pages or use a deliberately isolated browsing surface. Refusing initial same-origin URLs alone is incomplete because frame navigation/redirects can reach the app origin. Weigh compatibility before loosening sandbox tokens.

**Test:** Use a local same-origin fixture that tries to read a synthetic storage sentinel and parent DOM, plus a cross-origin control and redirect case. Assert denial in the final design. No hostile HTML upload path was found in this repository. This is **not** arbitrary cross-origin iframe access, nor a demonstrated standalone XSS; shared-origin hostile HTML is a necessary precondition, and that hosting arrangement already carries risk outside the iframe.

## 4. Profile labels are discarded, so avatar/banner moderation cannot work (P2, source-confirmed)

**Evidence:** `src/lib/bluesky.ts:63-74` retains profile URLs and viewer block/mute flags but discards profile labels and computes no `moderateProfile` result. `src/App.tsx:903-907` directly displays banner/avatar; `src/components/PostCard.tsx:572-581` displays the avatar outside `ContentWarning`.

**Trigger and effect:** An API profile carries a label requiring its avatar/banner to be covered, including adult imagery. Opening the profile or seeing its avatar displays it without the intended cover. Post-level moderation cannot fix the profile panel, and its content warning does not cover the post avatar. Official guidance defines separate profile/avatar/banner contexts. [Bluesky moderation documentation](https://github.com/bluesky-social/bsky-docs/blob/main/docs/advanced-guides/moderation.md)

**Fix:** Preserve/evaluate profile moderation with current preferences, and render dedicated avatar/banner/name decisions, respecting no-override. Keep profile labels distinct from account-wide labels.

**Test:** Mock adult-labeled profile media with adult content disabled; check search, profile, timeline, notification avatars and banners for both correct covers and absence of premature loads. Runtime reproduction was not performed for this finding.

## 5. Custom label definitions are never loaded (P2, source-confirmed)

**Evidence:** `src/lib/bluesky.ts:236-243` builds ModerationOpts from preferences only; no `labelDefs` or `getLabelDefinitions` call exists in `src`. Installed `node_modules/@atproto/api/dist/agent.js:200` supplies the missing definition-fetch method.

**Trigger and effect:** A subscribed labeler uses a custom label with media/adult/default-hidden behavior. Preferences alone cannot faithfully interpret that behavior. Panes also creates a generic, overridable warning from raw post-label strings (`PostCard.tsx:361-384`), which cannot substitute for label-specific filtering/no-override decisions.

**Fix:** Fetch/cache label definitions and pass them with preferences to moderation. Define a deliberate fallback while definitions are unavailable, and refresh decisions when preferences/definitions change.

**Test:** Mock a subscribed custom labeler with a custom adult/media label and custom hidden default; verify definitions are requested and the expected hiding/no-override applies. **Correction to an initial hypothesis:** labeler request headers are not the missing step: the installed SDK's `getPreferences()` configures them automatically (`dist/agent.js:581`). Official docs explicitly separate automatic headers from custom-definition fetching. [Bluesky SDK moderation guidance](https://github.com/bluesky-social/bsky-docs/blob/main/docs/advanced-guides/moderation.md) Exact missing-definition fallback should be pinned in the installed SDK by a fixture test before assigning a stronger severity.

## 6. A closed content warning still mounts the HLS loader (P3, source-confirmed)

**Evidence:** `src/components/PostCard.tsx:379-385` always mounts warning children inside closed `<details>`; detail videos mount at `:643-645`. `src/components/MediaVideo.tsx:40-59` initializes HLS and calls `loadSource()` on attachment before Play/reveal.

**Trigger and effect:** Open the detail of an overridable warning containing HLS video. Its manifest loader runs even though the user has not chosen Show post. This defeats a reasonable load-on-reveal privacy expectation and spends network resources. An arbitrary-origin media URL can expose a visit to that host, but whether public Bluesky AppView emits attacker-selected media hosts was not established; ordinary deployments primarily hit the media service. This is not a claim that hidden video visually plays or that JWTs accompany media fetches.

**Fix:** Mount protected media only after an explicit reveal; consider deferring manifest retrieval until playback. Set an intentional media referrer policy if deployment-origin disclosure matters.

**Test:** Count mocked manifest requests with the warning closed, after reveal, and after Play in Chromium/Firefox/Safari. Assert zero before the chosen consent boundary. `noOverride` already returns without mounting children, which is good.

## Existing strengths and boundaries

- URL normalization limits post facets, avatars, embeds and video to HTTP(S); React renders text without raw HTML. No direct script-scheme/HTML-injection sink was found.
- Custom PDS entry requires HTTPS except localhost/127.0.0.1, rejects URL credentials/query/hash, and is explicitly user-selected. A malicious server entered by the user receiving that login is an expected trust decision, not an SSRF finding in this browser-only architecture.
- The app password is not persisted. Refresh callbacks check credential identity, and account reads use auth-generation checks and DID-scoped cache keys. These protections are meaningful within one instance.
- Logout deliberately clears offline content; account snapshots are separated from public snapshots, and no tokens belong in IndexedDB. Findings 1–2 concern coordination failures in that intended guarantee.
- The service worker limits caches to enumerated same-origin build assets and navigation fallback; runtime XRPC and cross-origin media bypass CacheStorage. No authenticated-response cache leak was found.
- External browser anchors use `noopener noreferrer`; iframe navigations specify `no-referrer`. Cross-origin iframe content remains subject to the browser same-origin policy.
- Browser-readable localStorage tokens are a deliberate browser-client boundary, not by themselves an exploitable flaw. No supply-chain compromise, vulnerable dependency version, or credential exfiltration was demonstrated. The example nginx configuration supplies no CSP; that is defense-in-depth work, not evidence of a present XSS.

Recommended first work: fix cross-tab invalidation and transactional draft erasure, then add profile/custom-label moderation fixtures. Keep same-origin hosting assumptions explicit. Existing single-tab settled-write logout coverage (`tests/client.spec.ts:174`) does not exercise the reproduced interleavings.
