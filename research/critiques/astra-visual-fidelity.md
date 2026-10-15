# Astra visual fidelity critique

Read-only implementation review, 2026-10-15. Compared `live-desktop.png`, `live-thread.png`, `live-profile.png`, and `chromium-stacked.png` in `research/verification/` with the preserved launch screenshots, `wired-compose.png`, and the design/native evidence reports. Source line numbers refer to this review snapshot. No code or tests changed. Compose and peek findings are source-confirmed, not claims of newly captured browser screenshots.

The fixed paper widths, overlapping sheets, blue source selection and sparse opening composition are convincing. The largest remaining gap is the composition *inside* and *around* those sheets: it still reads as a newer social client wearing original assets.

## 1. High: the conversation sheet has the wrong visual hierarchy

**Evidence:** `twitteripad_replies.PNG` has author/avatar, selected tweet and reply/star/retweet/share controls together in a compact grey top region; ancestry begins directly below. `live-thread.png` instead has a separate “Conversation” title, a large white post block, a large inline image, then actions and metadata near the bottom. `chromium-stacked.png` proves the difference even with a short synthetic post, so this is not solely long Bluesky text. Code: `src/App.tsx:765–798`, `src/components/PostCard.tsx:497–539`, `src/styles.css:673–710`.

**Redesign:** introduce a selected-post header specific to conversation sheets, with controls in its upper right and compact metadata beneath the text; place ancestry immediately beneath it. Keep rich media available as a deliberately expanded content region or pushed media sheet. Restore the source control order (reply, star/like, repost, share) and a share/link affordance. Likes and reposts are valid Bluesky substitutions; a low action bar, extra title, and oversized metadata bands are not required by Bluesky. Do not force 300-character posts into 140-character heights or truncate the full detail text.

## 2. High: opening a sheet unexpectedly adds a toolbar to the timeline

**Evidence:** `live-desktop.png` starts directly with the list; `live-thread.png` moves that same list down 45px under a Discover/menu/refresh toolbar. Original `twitteripad_replies.PNG` and `launch-panes.png` start the source list immediately below the OS status bar even while a sheet is open. Code: `src/App.tsx:415–433`; `src/styles.css:275–285,1859–1882`; generic detail titlebars are `src/components/PanelStack.css:42–61` and `src/App.tsx:608–615`.

**Redesign:** preserve the timeline's vertical origin across open/closed states. Keep navigation/refresh discoverable in compact edge/footer controls, and let the selected-post header serve as the conversation sheet's top surface. Retain a dedicated browser toolbar where the source actually has browser controls. The browser need not recreate the iPad OS status bar; the issue is the extra application chrome and content jump.

## 3. High: compose is a centered modal instead of the characteristic paper reveal

**Evidence:** `twitteripad_composing.PNG` and `wired-compose.png` show white ruled paper above a displaced timeline/navigation group, with a woven toolbar, account name, Close/Send, red vertical margin and blue rules. Current `src/components/AccountDialogs.tsx:165–179` uses the general modal; `src/styles.css:1055–1077` centers a 470px window over a blurred backdrop. The textarea does have horizontal rules (`1184–1202`), but the spatial interaction is entirely different.

**Redesign:** create a composer layer above the workspace and translate the existing sheet group downward to reveal it. Use the original white-paper proportion, margin rule, toolbar and account identity. Keep native mobile keyboard behavior, draft persistence and accessible focus handling. A browser implementation should not draw a fake software keyboard. This is a major signature interaction, not a cosmetic textarea treatment.

## 4. Medium-high: the pinch card is a small context menu rather than the original rich author card

**Evidence:** `twitteripad_flipout.PNG` and `launch-pinch.png` show a substantial floating card with selected post, top action strip, grouped biography fields, tabs, following/follower statistics and full-profile button over visibly dimmed content. Current peek is 280px wide (`src/styles.css:1755–1771`), anchored near the touched row (`src/components/PostCard.tsx:461–471`), and contains author, optional clipped description, actions and “Open conversation” (`795–846`). It omits the actual selected post and most of the card's hierarchy.

**Redesign:** use a sheet-scale responsive author card; include the selected post and fetch full author details when needed; put actions above content and grouped profile information below. Provide explicit View profile and supported profile/feed destinations. Do not invent Twitter-only private favorites access in Bluesky: substitute supported tabs or omit unavailable ones while preserving the grouped structure. Preserve dismiss/focus behavior. The current backdrop is also substantially lighter than the screenshot's dimming.

## 5. Medium-high: the profile is a modern banner profile and does not support the source's recursive people browsing

**Evidence:** `live-profile.png` spends the top 136px on a banner, then free-form biography and three passive count boxes. `launch-panes.png` instead shows compact author/post information followed by grouped profile fields/tabs and people-related rows. The documented launch film sequence at approximately 20–25s shows follower rows and a follower opening a third sheet. Code: `src/App.tsx:903–949`; following/follower counts are plain `span`s at `939–945`, and the only following content is the author feed.

**Redesign:** make the compact grouped profile the default. Banner imagery can be an optional expanded Bluesky enhancement. Turn following/follower cells into navigable people lists that push sheets, with individual people opening another profile sheet. Keep Bluesky handles, follow state and moderation information; those adaptations are useful. Do not confuse the original floating card with every possible full-profile state, but the source clearly supports the missing people-navigation path.

## 6. Medium: rail density and hierarchy are visibly different despite the correct width

**Evidence:** original `twitteripad_replies.PNG` has the account avatar at the top and navigation rows approximately 43 logical points apart; the complete primary menu fits into the upper third. `live-thread.png` puts a bird above the account and uses 64px rows, stretching five choices down to roughly y=470. `twitteripad_flipout.PNG` also demonstrates the much tighter expanded menu. Code: `src/styles.css:83–95,163–178,1656–1677`; the wide compose button is `216–232`.

**Redesign:** for the compact rail remove the extra brand block, lead with the account, use approximately 43–44px menu rhythm, and place the compose control in the bottom corner. Distinguish logged-out discovery navigation from logged-in account navigation rather than stacking both branding and account structures. Discover and “Mentions & activity” are reasonable Bluesky adaptations; their larger vertical spacing is not mandated by that adaptation. Preserve adequate touch targets with invisible hit area where needed.

## 7. Medium: authentic assets are being transformed into the wrong material treatment

**Evidence:** original rail screenshots have a visible fine charcoal weave and recessed/dimensional icons; the active timeline bubble is colored. Current `live-desktop.png`/`live-thread.png` rails are much darker, almost smooth, with uniformly bright silhouette glyphs. Code: `src/styles.css:76–77` stretches the sidebar image across both dimensions; `1739–1748` applies `brightness(0) invert(1)` to original navigation and compose art. The workspace uses a different repeated `NavigationTexture.png` at `1547`. Using authentic files does not establish authentic rendering.

**Redesign:** inspect each extracted image at intrinsic size and determine whether it is a tile, stretchable gradient or complete surface. Tile the fine rail weave at its intended scale, layer gradients separately, and render native glyph tones/colors without the blanket whitening filter. Match a normalized 768×1024 screenshot before tuning to arbitrary desktop widths. Keep the already correct original left-edge shadow treatment (`PanelStack.css:25–34`).

## What already matches

- The initial desktop state has expanded navigation, a single 476px timeline and ample unused charcoal space, matching the launch film's documented 0–4s state; it does not fabricate a selected post.
- The implementation uses 292px expanded navigation / 72px compact desktop rail, and 476px ordinary sheets. Web widths 574/830 in `src/App.tsx:607` match the recovered native constants, not generic equal-width carousel assumptions.
- `chromium-stacked.png` shows persistent overlapping conversation/profile sheets; the native report supports this physical hierarchy. Static screenshots alone do not establish exact spring or drag fidelity.
- Selected source rows are white-on-intense-blue gradients, the list uses square ~48px avatars, Helvetica-like 18px body text and thin separators, and ordinary list rows omit modern action/count bars.
- Bluesky native text, handles, moderation, long posts and rich media deserve preservation; fidelity work should reorganize their presentation rather than rewrite content.

## Evidence caution

`research/references/frames/70s-pinch-card.jpg` itself shows an unobstructed timeline, not a visible floating card. The design document's approximate 69–72s label should be rechecked against actual adjacent frames before citing an exact timestamp. The preserved `twitteripad_flipout.PNG` and `launch-pinch.png` are direct visual evidence for the card finding. Camera footage is oblique and should not supply pixel measurements. No historical runtime was executed for this critique.
