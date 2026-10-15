# Astra critique: social actions and state consistency

Read-only source review, 2026-10-15. No live authentication or social writes were performed. Findings below are deterministic control-flow defects or explicitly described failure scenarios; they were not reproduced against a real account. Existing tests cover a mocked successful like/post and a rejected post, but not delayed, reordered, or ambiguous writes (`tests/client.spec.ts:123`, `:150`).

## 1. High — A successful mutation permanently freezes an entire post in sheets, while refreshed feeds show another version

**Evidence:** `src/App.tsx:244–256` stores the complete returned Post in `postUpdates`; feed fetches replace `posts` at `:198–200`, and feed cards render that raw data at `:512`. Thread/profile cards instead always prefer `updates[uri]` at `:754`, `:768`, `:811`, and `:954`. The map is cleared on logout, not on successful revalidation. `src/lib/bluesky.ts:493–504` returns a copy of the pre-request Post with only a reaction field/count changed.

**Reproduction:** Like a post, then let another user reply or unlike the post from another client. Refresh the timeline and reopen the conversation. The feed can show the fresh reply/like counts and viewer state, while the conversation keeps the complete old snapshot. A feed request begun before a like can similarly finish after the mutation and immediately restore an unliked feed card while the sheet shows liked.

**Impact:** The same post contradicts itself across adjacent panes; stale viewer state determines whether the next click creates or deletes a record. Entire stale content/moderation data also wins over new reads, beyond the intended reaction update.

**Fix/test:** Store shared post entities and explicit pending/confirmed mutation fields, reconcile authoritative fetches, and avoid permanent whole-object overlays. Deferred-response tests should complete a pre-like feed fetch after the write, then refresh with changed counts and viewer state; every visible instance must agree without retaining obsolete content.

## 2. High — Follow success is overwritten by an unrelated profile pagination response

**Evidence:** `src/App.tsx:854–858` captures `profile` in `Promise.resolve(profile)` on load-more, waits for the author feed, then writes that old object back with `setProfile(actor)`. Follow remains enabled during feed loading (`:914`), and `:881` separately writes the successful follow result. The initial profile fetch has the same unversioned race.

**Reproduction:** Open an unfollowed account with a next page. Hold the author-feed pagination response, click Load more, then click Follow and complete its write. The button becomes Following. Release the page response: the button reverts to Follow and the follower count rolls back even though the follow exists on the server.

**Impact:** The user cannot undo the successful follow from the falsely unfollowed state; another click takes the create path again. This is normal concurrent reading and writing, with no account switch required.

**Fix/test:** Pagination must only update feed state. Reconcile initial profile requests with relationship mutation versions, or keep relationship state separately. Test both load-more and initial-profile response ordering around a completed follow/unfollow.

## 3. High — A committed post with a lost response can be published again by the advertised retry

**Evidence:** `src/lib/bluesky.ts:32–42` aborts requests at 20 seconds; `:46–50` encourages retry after timeout/network failure. `publish` at `:466–489` invokes `agent.post` anew on every submission, without a retained record key or reconciliation. `src/components/AccountDialogs.tsx:143–161` retains the draft on error and enables another submission.

**Reproduction:** In a mock PDS, persist the first createRecord but abort/drop its response. The composer reports failure and retains the text. Retry; the client submits a second independent createRecord. This differs from the existing test, which rejects the write before any commit.

**Impact:** Duplicate public posts/replies after an ordinary connectivity failure. Avoiding automatic retries does not make a manually encouraged retry safe.

**Fix/test:** Keep a stable valid rkey and record payload for a submission attempt; on ambiguous failure query that exact record and reconcile before retrying. Distinguish “could not confirm publication” from a definite rejection. Test commit-then-disconnect and confirm retry yields one repository record. The official [createRecord schema](https://raw.githubusercontent.com/bluesky-social/atproto/main/lexicons/com/atproto/repo/createRecord.json) exposes an optional `rkey`; the official [Agent implementation](https://raw.githubusercontent.com/bluesky-social/atproto/main/packages/api/src/agent.ts) shows `post` calling create without one. A keyed create/get reconciliation strategy needs protocol-level tests before implementation.

## 4. Medium — A published reply does not appear in its existing parent conversation

**Evidence:** `src/App.tsx:664–670` adds a successful publication only to Home and opens the new post. It does not update/invalidate the parent/root thread or reply count. `ThreadPanel` fetches on URI change only (`:744–753`), so an existing parent pane stays mounted with its earlier reply list. `openPost` at `:62–70` returns an existing sheet rather than remounting it.

**Reproduction:** Open a conversation with no replies, publish a reply, then dismiss the new reply pane or reopen the parent from the feed. The parent still says “Be the first to join the conversation,” and its reply count stays unchanged. Refresh timeline does not refresh that pane.

**Impact:** The app announces publication but the conversation where the action began denies that it happened. The author may repeat the reply to compensate.

**Fix/test:** Insert the confirmed reply into relevant mounted thread state, update parent counts, and revalidate after indexing without replacing confirmed content with a temporarily missing AppView result. Test publishing a first reply, dismissing its pane, and finding exactly one reply in the original parent pane.

## 5. Medium — Enabled reaction buttons silently discard another valid action while a write is pending

**Evidence:** `src/App.tsx:263–275` uses one pending key per post URI for both like and repost and simply returns if it exists. `src/components/PostCard.tsx:512–540` exposes neither pending state nor disabled controls.

**Reproduction:** Hold a Like write open and click Repost on the same card (or another pane containing that post). The second click is discarded; after the like succeeds there is no repost request, queued action, or error. A second click intending to undo a slow like is likewise lost.

**Impact:** Controls appear available but do nothing, particularly on mobile networks. The shared lock prevents collisions but loses explicit user intent.

**Fix/test:** Expose pending state consistently across all copies; either queue the latest desired state or visibly disable unavailable actions. If allowing concurrent independent reactions, merge changed fields rather than replacing entire Posts, which would create a new overwrite race. Test like-then-repost and like-then-unlike with deferred responses.

## 6. Medium — Opening an old notification page marks newer, unseen notifications as seen

**Evidence:** Every notifications page load, including load-more, invokes `markNotificationsSeen` (`src/App.tsx:178–189`). `src/lib/bluesky.ts:462–463` sends the current time after list fetching and post hydration finish, not a boundary attached to the notification snapshot. Read-mark failures are swallowed and displayed `isRead` flags are not reconciled.

**Reproduction:** Load notifications at time T0. While reading, another notification arrives at T1. Click Load more, which fetches older notifications; when hydration finishes at T2, the client advances seenAt to T2 even though the T1 notification never appeared. The same issue exists when an initial page's hydration is delayed and a new notification arrives meanwhile.

**Impact:** Unseen activity loses its unread status across clients. The displayed unread styling can simultaneously remain unchanged after a successful mark, making local and server state disagree.

**Fix/test:** Capture and retain a safe read boundary for the displayed initial snapshot, never advance it merely because older pages were loaded, and reconcile local read flags after acknowledgment. Verify exact boundary semantics against a test server. The official [updateSeen schema](https://raw.githubusercontent.com/bluesky-social/atproto/main/lexicons/app/bsky/notification/updateSeen.json) defines the explicit timestamp; [listNotifications](https://raw.githubusercontent.com/bluesky-social/atproto/main/lexicons/app/bsky/notification/listNotifications.json) returns per-item `isRead`/`indexedAt` and a `seenAt` field. Test a new unseen item arriving during delayed hydration and during older-page pagination.

## Focused research follow-ups

- Use an isolated mock server with a persistent repository, independently controllable AppView lag, and commit-before-response-drop behavior. The current successful-create stub cannot establish write retry correctness.
- Add a response-order matrix for profile initial load/pagination versus follow, and feed refresh versus reaction. Record user-visible state and repository contents, not only whether an HTTP write occurred.
- Exercise expiration during a pending publish. Unlike reaction completion's DID guard (`src/App.tsx:271`), composer `onPublished` has no session generation guard; verify that a completion from an unmounted composer cannot open old-account content after expiration/login. This is a targeted investigation rather than a confirmed everyday reproduction.
- Test notification fixtures with nonempty pages, hydration delay, pagination overlap, and current reason values. The existing default fixture returns no notifications (`tests/fixtures.ts:52`), leaving this flow effectively unexamined.
- Investigate thread shape separately: `src/lib/bluesky.ts:426–432` flattens descendants into one list and discards unavailable nodes; `src/App.tsx:808–815` renders them as equal siblings. A branching thread fixture should establish whether users can reliably identify who is replying to whom before choosing a minimal parent-context presentation.
