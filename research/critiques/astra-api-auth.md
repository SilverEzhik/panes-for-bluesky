# Astra review: Bluesky API and authentication

Read-only review on 2026-10-15 of `src/lib/bluesky.ts`, `src/lib/types.ts`, the related session UI, and installed `@atproto/api` **0.27.0**. No real credentials or account writes used. Findings below are code-path analysis; findings 1 and 2 were additionally reproduced in an isolated Node harness against the transpiled actual client. Other proposed tests were not run. Existing successful public reads and mocked auth tests do not cover these interleavings.

## 1. P1 — Restoration can deadlock on its own promise

**Location:** `src/lib/bluesky.ts:191-194,220-225,301-304,346-350`.

After refresh succeeds, `restore()` publishes a verified user, awaits preferences, then awaits `profile()`. During the preferences await, a concurrent feed read can fail with a network error/503; `cachedRead()` calls `rememberOffline()`, clearing the authenticated agent. Now the restoration's profile read sees an offline user and calls `reconnect()`. That returns `this.restoring`, the same promise whose completion requires this profile read. This is a genuine promise cycle: startup or reconnect never completes, and every subsequent reconnect joins it. The network timeout cannot break it because no network request remains in the cycle.

**Fix:** Make restoration single-flight only around credential verification/installation. Hydrate profile outside that flight, or use the captured verified agent directly without passing back through reconnecting `cachedRead`. Guard hydration with generation and credential identity.

**Test:** Pause preference loading after refresh, trigger another read returning 503, then finish preferences. Assert restoration settles, retries remain possible, and no profile read joins its own promise. Confidence: high in the interleaving; frequency depends on concurrent panels.

## 2. P1 — One transient read permanently destroys session-only authentication

**Location:** `src/lib/bluesky.ts:200,208-214,287,311-314`.

Login explicitly accepts unavailable localStorage as session-only mode. Any subsequent network failure or 5xx read drops both in-memory credential references in `rememberOffline()`. `restore()` can recover only from localStorage; without a saved value it returns null while the existing user remains offline. Thus one ordinary AppView outage turns a valid in-memory login into an unrecoverable offline identity, requiring another app-password login. `reconnect()` can cause the same loss directly by downgrading a verified session before reading storage.

**Fix:** Keep a private in-memory refreshable session independently of connection status and persistence. Restrict writes while unverified, but retain tokens for verification when connectivity returns. Do not rely on successful localStorage writes for in-session recovery.

**Test:** Make localStorage.setItem throw, log in through mocked transport, fail one feed request, then restore networking. Reconnect must refresh the original in-memory session and restore reads/writes. Confidence: high.

## 3. P1 — Deferred publication can write using a superseded account/session

**Location:** `src/lib/bluesky.ts:466-475`; `src/components/AccountDialogs.tsx:152-156`.

`publish()` captures the agent and author, then awaits asynchronous mention resolution in `detectFacets()`. It never checks `authVersion` again before `agent.post()`. A logout or account replacement during that wait does not cancel the captured agent. In particular logout awaits local content clearing before server revocation, while account replacement never revokes the previous agent. Releasing facet resolution can therefore submit a post to the old account after the active identity has changed. The completion callback also lacks an identity guard.

**Fix:** Capture generation and DID; immediately before dispatch reject if either changed. Add the same completion guard before mutating account UI/drafts. Cancellation cannot undo an already-dispatched write, so state that boundary explicitly in tests.

**Test:** Hold resolveHandle, start publish, log out or replace account, then release resolution. Assert no createRecord request is sent. Confidence: high for library behavior; the ordinary modal constrains manual account switching, so exercise expiry and programmatic lifecycle transitions too.

## 4. P1 — Custom labeler hide rules silently degrade to overridable warnings

**Location:** `src/lib/bluesky.ts:236-243,87-105`; `src/components/PostCard.tsx:362-384`.

`loadModeration()` supplies preferences but never fetches/passes `labelDefs`. The SDK ignores unrecognized custom label values without definitions. A subscribed labeler's custom label configured to hide a post consequently cannot set the normalized `hidden`/`noOverride` behavior. Raw post labels produce a generic expandable warning instead; labels attached to the author can be omitted altogether from this fallback.

**Fix:** Fetch `agent.getLabelDefinitions(prefs)` and install definitions alongside moderation preferences for the same credential generation. Decide explicitly how to present content when required definitions fail to load, and cache definitions/preferences for offline normalization if that is supported.

**Test:** Custom labeler with custom content label, explicit user preference `hide`, and matching definition: assert post excluded from feeds. Repeat with a custom account label and ensure profile/avatar presentation follows the decision. Confidence: high; standard built-in labels are unaffected.

**Official evidence:** The [0.27.0 moderation decision implementation](https://github.com/bluesky-social/atproto/blob/%40atproto%2Fapi%400.27.0/packages/api/src/moderation/decision.ts) looks up custom definitions in `opts.labelDefs`; the [Agent implementation](https://github.com/bluesky-social/atproto/blob/%40atproto%2Fapi%400.27.0/packages/api/src/agent.ts) exposes `getLabelDefinitions`. Verified against installed distribution as well.

## 5. P2 — Notifications and profile results bypass account/profile moderation

**Location:** `src/lib/bluesky.ts:62-73,394-405,437-458`; `src/lib/types.ts:3-16,68-77`.

Only post normalization calls a moderation function. Notification authors and profile/search results go through `normalizeProfile()`, which discards labels and offers no avatar/display-name moderation decisions. A labeled follow notification has no hydrated post, so the post-level gate never runs. Users can therefore see profile imagery and names that their moderation rules would suppress or blur, even when post bodies are gated correctly.

**Fix:** Normalize profile and notification moderation using SDK `moderateProfile`/`moderateNotification`, carry the appropriate UI decisions in types, and enforce them at author/avatar/profile surfaces. Keep text/profile/media decisions distinct.

**Test:** A follow notification and direct profile lookup from an account with a supported hide/blur label must enforce account/profile/avatar decisions without depending on an attached post. Confidence: high for omission; exact visual severity depends on label definition and UI surface.

**Official evidence:** The SDK provides a dedicated [notification moderation implementation](https://github.com/bluesky-social/atproto/blob/%40atproto%2Fapi%400.27.0/packages/api/src/moderation/subjects/notification.ts) combining notification, account, and profile decisions; `moderatePost` alone does not cover standalone notifications/profiles.

## 6. P2 — Account guards stop before asynchronous cache completion

**Location:** `src/lib/bluesky.ts:196-204`.

`cachedRead()` checks identity before awaiting `saveOfflineSnapshot()`, and checks once before awaiting `readOfflineSnapshot()` in its failure branch. If logout/account replacement happens during either IndexedDB await, the function still returns account A's result after B or anonymous state is active. A fallback may even return A's content after sign-out cleared the database, because its already-started readonly transaction completed first. Some root feed consumers guard their own requests, but the API's asserted account boundary is not actually guaranteed and auxiliary profile/thread callers can receive stale data.

**Fix:** Recheck generation/DID after each storage await and before returning. For strong sign-out erasure guarantees, also prevent late cache writes from repopulating cleared account content, using account epochs or coordinated cancellation/clear sequencing.

**Test:** Delay snapshot read completion, log out, then release it; reject rather than return the old account's snapshot. Repeat for save completion and account replacement. Confidence: high for returned-result race; post-logout cache resurrection depends on transaction scheduling and should be verified separately.

## SDK/auth details checked and not flagged

- The installed SDK's CredentialSession supports the constructor usage here. It follows a PDS endpoint supplied by the session DID document; using `bsky.social` as the default service is not itself evidence of broken hosted-account routing.
- Session callbacks are identity-guarded, and concurrent login results are generation-guarded. These are valuable protections, but do not cover the await boundaries above.
- `resumeSession()` forces refresh in this version. A failed refresh can leave reusable session data; the SDK treats invalid-token/401 conditions differently from transient failures. Source: [version-pinned CredentialSession](https://raw.githubusercontent.com/bluesky-social/atproto/%40atproto%2Fapi%400.27.0/packages/api/src/atp-agent.ts), also read from installed package. Therefore storing refreshable credentials is essential to outage recovery.
- Search endpoint selection, 25-item getPosts hydration chunks, reply root/parent construction, and per-page deduplication did not yield a high-confidence severe API defect in this pass. Thread truncation and pagination UX warrant separate product review, but are not elevated here without a specific failed user flow.

## Deterministic reproduction evidence (executed)

Executed an ephemeral Node ESM harness using installed TypeScript `transpileModule` on the actual `src/lib/bluesky.ts`. The harness replaced only the offline module import with no-op save/clear and null read functions, loaded the actual installed SDK, and supplied fake localStorage and fake credentials. No filesystem source edits or network requests were made. TypeScript-private fields remain accessible in transpiled JS.

Deadlock setup: localStorage contains a synthetic saved session; `createCredentials()` returns `{ resumeSession: async () => {}, session, serviceUrl, hasSession: true }`; `loadModeration = async () => client.rememberOffline()`. That last substitution deterministically injects the state transition caused by a concurrent failed cached read during the real preference-loading await. The actual restore/profile/cachedRead/reconnect logic remains intact. Race `restoreSession()` against 100 ms; there are no network or database operations to explain the pending promise.

Session-only setup: localStorage returns null and throws on setItem; initialize a verified synthetic currentUser plus credentials/authenticatedAgent, representing successful session-only login. Invoke actual `cachedRead('feed', async () => { throw Object.assign(Error('503'), { status: 503 }) })`, catch its expected failure, then invoke actual `reconnect()`.

Observed output:

```text
restore self-cycle: still pending after 100ms with no network or IDB operations | state: offline | restoring still exists: true
session-only after 503: offline credentials: null
reconnect result: null remaining state: offline
```

These reproduce the local state-machine failures, not an integration login with a live PDS. Publication finding 3 specifically concerns the **old bound agent writing as the old account after UI logout/replacement**; the captured agent does not silently become the newly switched account. An in-flight request already dispatched before logout cannot be retroactively canceled by a generation check.
