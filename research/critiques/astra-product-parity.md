# Product and interaction parity critique

Reviewed 2026-10-15. Scope: original interaction intent, current React flows, and useful Bluesky adaptations. This is a source/artifact review, not a new physical-device or authenticated-write test run. No application source was changed.

## Evidence and overall judgment

Reviewed `research/design-evidence.md`, `research/reverse-engineering.md`, the original article/composer screenshots, the 94-second film's downloaded contact sheet, current `live-desktop.png` and `chromium-stacked.png`, and `App.tsx`, `PostCard.tsx`, `PanelStack.tsx`, `AccountDialogs.tsx`, `LinkPanels.tsx`, `pwa.ts`, and relevant browser tests. Footage timings below come from the retained observation ledger and contact sheet; I did not independently replay every frame. The existing verification audit reports 52 passing tests and eight native-CDP skips; that is retained evidence, not a newly executed result.

The implementation captures more of the original than a superficial skin: persistent overlapping sheets, sparse landscape workspace, actual assets, independent scroll, selection styling, pinch actions, and wide article panels already exist. The next gains should concern how a reading trail is understood and recovered. Do not expand this into a requirement for every current social-network feature, a trending dashboard, chats, or feed management.

The original's distinctive promise is: inspect something without losing where it came from, then physically uncover the previous context. The film at 11–18s and 28–33s demonstrates this; 20–25s demonstrates recursive people browsing. Today several routes preserve the pixels of old panels but lose the semantic connection or destroy the trail.

Historical boundary: the independent `astra-historical-audit.md` cites the firsthand MacStories review confirming that switching top-level sections discards existing panes, consistent with film 35–40s. Preserving every section's history is therefore **not** an original-parity requirement. This review accepts top-level Search/Discover/Home resets. Its hashtag objection concerns an inline content drill-down being treated as top-level navigation. The retained hashtag screenshot supports a detail-sheet pattern, but exact branch replacement/reopen policy still needs controller-call-site or runtime evidence. Browser-history integration, non-destructive reopen, workspace restoration and source-aware media are proposed web-product improvements, not claims of recovered 2010 behavior. That review also notes linked-tweet web panes had special drilling restrictions; the proposed uniform source-reveal action deliberately adapts them for this client.

## 1. Preserve origin and branching across every drill-down — highest priority

**Evidence.** The original article screenshot keeps the selected source row blue and repeats the source tweet above the page. The film retains selected rows while moving among sheets. `App.tsx` derives `selected` from the latest thread sheet and applies it only to the root feed. `openProfile`, `openWeb`, and `openMedia` carry no originating row identity. Opening a link directly from the feed creates a web sheet without creating a thread; consequently the source row has no thread-derived selection. Posts inside profile/thread sheets do not receive `selected`. `searchTag` changes the root section and clears every sheet; `tests/links.spec.ts` explicitly expects zero panels afterward.

**Consequence.** A source post → article or source post → author route loses the clearest visual explanation of why the front sheet exists. A hashtag click is even more disruptive: an ordinary drill-down unexpectedly replaces the reading workspace.

**Proposed flow.** Give every sheet a source descriptor: parent sheet/root identity, originating post/person, and selected row. Opening a hashtag from content pushes a search sheet; the navigation Search button still opens the root search workspace. Show a compact source-post header in article/media sheets with a reveal-source action. If a user returns to an older source and chooses a different child, use an explicit branch policy rather than blindly appending an unrelated child after the newest sheet. Keep selection per originating list, not one global last-thread selection.

**Acceptance.** Scroll root → open post link directly → drag back: original post remains blue and root scroll unchanged. Profile post → image → back retains selection in that profile. Hashtag → result → author → close returns to the original hashtag source. Test independent branch origins, not merely panel count. Update the existing hashtag test deliberately because it currently codifies the disruptive behavior.

## 2. Separate revealing a sheet from destroying it; integrate platform Back

**Evidence.** Film 28–33s shows revisiting retained layers. `openPost` and `openProfile` truncate `previous.slice(0, existing + 1)` when a matching sheet already exists. `onDismiss` also truncates descendants. Panel dragging/wheel navigation preserves sheets, which is correct, but clicking an already-open destination destroys later sheets. `PanelStack` handles Escape and Alt+Arrow locally; source contains no `popstate` or History API integration.

**Consequence.** Two ways to revisit the same author have different destructive effects. Browser Back, including a browser edge gesture, does not participate in the in-app trail. The desktop keyboard shortcut can mean sheet movement inside the stack and browser navigation outside it.

**Proposed flow.** Treat reveal, push, and close-branch as distinct actions. Clicking an existing sheet target reveals it without deleting descendants. A close affordance may explicitly close that branch. Browser Back should undo a navigation step and Forward restore it, with descriptors sufficient to rebuild the same source relationships. Keep browser navigation separate from a wheel's purely spatial peek; do not create history entries for every animation frame. Consider preserving the last workspace locally on reload, with account boundaries respected.

**Acceptance.** Root → thread → profile → article; reveal thread using its source row; article still exists when moving forward. Browser Back/Forward and visible Back act consistently on phone and desktop. Closing the middle sheet has a defined descendant policy and restores focus to its source. Reload at a nested route and returning from an external browser tab do not silently reset to unrelated Discover content.

## 3. Make author exploration recursive where the original actually demonstrated it

**Evidence.** Film 20–25s moves from author details through follower rows into a third sheet. Current `ProfilePanel` shows following/follower counts as inert spans (`App.tsx`, profile-stats), followed only by the author's posts. `chromium-stacked.png` makes the counts look like three selectable segmented cells even though they are not controls.

**Consequence.** The user reaches a visually promising dead end at precisely the route that best demonstrates why overlapping panels are useful. This is a higher-value parity gap than adding unrelated modern social features.

**Proposed flow.** Make following/followers open a compact people-list sheet; selecting a person pushes their profile. Preserve the parent list's scroll and selected person. Keep post-count behavior explicit rather than making every number decorative pseudo-navigation. For a small first increment, following alone is sufficient to prove the recursive interaction.

**Acceptance.** Author → following → person → their post produces a coherent chain. Returning reveals the same person and list offset. Empty, blocked, offline-unsaved, and failed-list states explain themselves inside that sheet and offer retry. No live follow writes are needed to verify this read-only flow.

## 4. Give pinch and two-finger pull different product purposes, plus discoverable controls

**Evidence.** Launch evidence describes pinch as author/actions and two-finger downward pull as inline ancestry. `PostCard.tsx` correctly distinguishes gestures, but `pull-down` simply calls `onOpen(post)`, the same outcome as a row tap. Pinch opens a small action card; this is useful, but it lacks the selected post and fuller author context shown in `twitteripad_flipout.PNG`/70s film evidence. The row has no explicit control opening that same peek. Current gesture tests establish recognition and panel opening, not original inline-reveal semantics.

**Consequence.** A difficult hidden gesture duplicates the easiest action instead of delivering a quick contextual peek. Users on mouse/keyboard cannot readily discover the lightweight author/action mode.

**Proposed flow.** Pull down temporarily unfolds ancestors in place with a clear collapse control, leaving the main sheet offset and root reading position stable. An explicit “Show preceding posts” control offers equivalent access. Pinch and an unobtrusive “Post actions” control open the same accessible author/post card. Keep full conversation opening as a separate choice. Retain native media/browser zoom outside post gesture targets.

**Acceptance.** Pull on a reply exposes ancestors without increasing sheet count; collapse restores the exact anchor. A root post explains “No earlier posts” rather than creating empty movement. Keyboard-only users reach and dismiss the same peek, focus returns correctly, and long biographies do not place actions offscreen. Existing synthetic/native recognition tests should remain, supplemented by these semantic assertions.

## 5. Make drafting visibly trustworthy and preserve composition context

**Evidence.** The original composing screenshot shows white ruled paper above a displaced reading workspace, with an account identity under the title. `ComposeDialog` uses a conventional modal and correctly persists account/reply-scoped drafts. However “Cancel” closes while retaining text, there is no saved/restored indicator or explicit discard, the composer omits the publishing identity, and unsent replies can only be rediscovered by returning to the same source and choosing Reply. `requireSession` opens login but does not retain the action; successful login always switches to Home and clears sheets.

**Consequence.** Storage correctness does not become user confidence. “Cancel” has surprising semantics. A signed-out reader asking to reply loses the reply context after authenticating. A reply draft can survive technically while being practically lost.

**Proposed flow.** Preserve the pending compose/reply intention through sign-in and reopen it against the same source. Show account identity, “Saved on this device” after successful draft persistence, and “Draft restored” when applicable. Use “Close”/“Keep draft” plus an explicit discard action, and provide a small drafts entry including reply context. On tablet, consider a composer that exposes the underlying source like the original; a compact phone modal remains a sensible adaptation. Visual animation is secondary to recoverable text and context.

**Acceptance.** Signed-out Reply → successful fixture login → composer still quotes that post. Close/reopen, reload, offline edit, failed publish, and account switch retain the correct draft without exposing another account's text. Draft storage failure must not claim “Saved.” Discard removes only that draft. Existing failed-publish/offline tests are a good base but do not cover these affordances.

## 6. Make article panes retain meaning when embedding fails

**Evidence.** `twitteripad_article.PNG` shows the source tweet above the embedded article. Current `WebPanel` takes only URL/title, shows an address bar and iframe, and always supplies a useful external-browser escape. Its comment correctly acknowledges that cross-origin refusal cannot be reliably detected. The test serves a cooperative fixture page; it does not establish that ordinary linked publishers can be read inside the PWA.

**Consequence.** The original native web view and a modern sandboxed iframe have materially different reach. A blank/refused article can occupy the largest sheet while its source context is obscured. This is a platform adaptation problem, not a reason to weaken embedding security or pretend success.

**Proposed flow.** Carry source post and existing external-card metadata into the sheet. Keep source, title, description, domain and “Open in browser” usable even when the frame cannot display content. Add a user-controlled “Hide embedded page”/preview mode rather than claiming automatic cross-origin failure detection. Preserve the source selection when returning from the external tab. No arbitrary scraping/proxy service is required for this improvement.

**Acceptance.** Cooperative iframe, CSP/X-Frame-Options refusal, offline frame, and slow page each retain useful source context and a clear escape. Verify external opening preserves the original workspace. Do not treat iframe load as proof of readable article content.

## 7. Expose local-first and installation as usable choices

**Evidence.** `pwa.ts` tracks installed state and updates; the application displays saved timestamps and a reconnection status. IndexedDB snapshots and drafts already exist, and the audit records actual server-off tests. The UI has no install entry, saved-reading index, or direct draft index; `installed` is not used to present an affordance. The offline banner may say “Previously saved public views” even for a remembered account when `savedAt` is absent.

**Consequence.** A robust offline implementation is hard to discover or deliberately use. On a cold offline visit, a user cannot tell which previously visited profiles or conversations are available without guessing paths. Installation is left to browser knowledge.

**Proposed flow.** Add a small settings/local-data surface: installation instructions appropriate to the browser, current saved-reading status, saved drafts, and locally available recent reading destinations. Distinguish app-shell readiness from saved content and from media availability. Use account-aware wording. Make update activation wait for any pending draft write, then restore the workspace; the existing user-triggered update design is a strong starting point.

**Acceptance.** A novice can find installation guidance from the app, then deliberately revisit a cached thread offline. Unsaved content says it is unavailable offline without implying data loss. Installed mode suppresses redundant install prompts. Production/subpath tests remain the installation/offline evidence; localhost development mode is not sufficient.

## 8. Put failure and progress at the action that caused them

**Evidence.** Login, composer, feed and thread errors already have sensible inline handling and retry. Likes/reposts use `mutationPending` to prevent duplicate requests but do not expose pending state in their buttons; failures become a 6.5-second global toast. Mention resolution awaits a profile before opening any sheet, with errors also in that toast. A slow action therefore produces little local explanation. Follow already has a “Saving…” state worth reusing.

**Consequence.** It can be unclear whether a tap registered, particularly while a user continues dragging sheets. Error text can disappear far from its cause. The issue is not that errors are wholly unhandled; it is weak association with the initiating action.

**Proposed flow.** Give post mutations a visible pending/disabled state and leave a retryable local error by the affected action. Resolve mentions in an immediate profile placeholder sheet with retry, so the tap creates spatial feedback. Preserve undo toggles for successful likes/reposts and keep auth-expired errors connected to sign-in without discarding the current trail. Avoid retrying social writes automatically.

**Acceptance.** Delayed fixture responses show pending state immediately; repeated clicks produce one request. Failure preserves counts and offers an explicit retry. Navigate away during a failed request: returning still explains the affected action. Successful inverse action restores the server-confirmed state. All write-path acceptance can use mocks.

## Suggested sequence and research

First implement origin-aware sheet navigation and a deliberate reveal/close/history model. Then repair sign-in-to-reply/draft recovery and article fallback. Recursive people browsing and meaningful inline ancestry offer the highest remaining original-interaction gains. Installation/local-reading affordances and action-level feedback complete the daily-use loop.

Before further visual polish, run a short read-only task study on a tablet and desktop: find a post, inspect its author, follow a people-list trail, open an article, return to the exact source, compose an unsent reply, close and recover it, then revisit saved reading offline. Record wrong turns, lost context, accidental closes and whether users discover the gesture alternatives. Compare that sequence against film 6–33s and the original compose/pinch screenshots. Test physical Safari edge navigation and real trackpad inertia separately; engine automation already provides a useful baseline but does not prove those devices.

Keep the deliberate empty charcoal workspace and restrained timeline. Do not fill it with fabricated details or a recommendation dashboard. Preserve genuine improvements already present: accessibility alternatives, content moderation, explicit cross-origin escape, account-isolated drafts, safe reconnection, and deterministic browser checks.
