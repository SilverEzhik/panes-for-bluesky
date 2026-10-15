# Twitter for iPad, September 2010: visual and interaction evidence

This document describes the original Loren Brichter sliding-sheet iPad interface released September 1 US / September 2 UTC, 2010. It intentionally excludes the September 2012 redesign. All reference images and footage below are downloaded into `research/references/`; `sources.json` records provenance, intrinsic dimensions, file sizes, and SHA-256 hashes. These are research reference copies, not newly licensed assets. Launch-era screenshots and footage are not proven to run the preserved 3.1.1 binary: the firsthand [MacStories launch review](https://www.macstories.net/ipad/twitter-for-ipad-review/) names version 3.1. The reconstruction combines launch-era visual evidence with preserved 3.1.1 native code; exact differences between those builds remain unresolved.

## Primary source and date

[Twitter's launch announcement, September 2, 2010](https://blog.x.com/en_us/a/2010/twitter-for-ipad-sharing-content-in-tweets) explicitly describes tapping a tweet to open a pane to its right, continuing to open more panes, and swiping left/right between them. It also describes pinch to expose author/actions; two fingers together and a downward pull to expose conversation ancestry; inline video and pinch to fullscreen; and browsing curated categories/search without signing in.

The announcement's three actual image files are preserved:

| File | Intrinsic size | What it proves |
| --- | --- | --- |
| `launch-panes.png` | 800×600 | Landscape expanded category navigation, timeline, selected blue tweet, right profile sheet |
| `launch-pinch.png` | 450×600 | Portrait compact icon rail, source timeline, underlying right sheet, centered floating author/action card |
| `launch-conversation.png` | 800×600 | Expanded navigation; conversation rows revealed inline over dimmed timeline |

The files are intrinsically blurry; their `1280.1280` URL suffix does not mean the images contain 1280px detail. Use sharper launch-day hands-on screenshots for pixel inspection.

## Sharper screenshots

[Ars Technica launch-day hands-on](https://arstechnica.com/gadgets/2010/09/hands-on-with-twitter-for-ipad-half-cool-half-wtf/) supplies seven downloaded screenshots with original filenames. Main full portrait screenshots are 640×853, which corresponds to a 5/6 reduction from 768×1024 iPad logical coordinates.

| File | Useful evidence |
| --- | --- |
| `twitteripad_replies.PNG` | Compact rail, selected source row, full right conversation sheet, action icon ordering, separators |
| `twitteripad_article.PNG` | Source timeline and web article sheet |
| `twitteripad_flipout.PNG` | Floating author/action card with dimmed underlying content |
| `twitteripad_tags.PNG` | Hashtag navigation/detail sheet |
| `twitteripad_composing.PNG` | Compose animation resting state: timeline shifts down to reveal ruled paper above it, with keyboard at bottom |
| `twitteripad_shrinkurl.PNG` | Toolbar/settings controls, 768×217 crop |
| `twitteripad_switchaccounts.PNG` | Compose account switcher, 640×339 crop |

[WIRED's September 2 hands-on](https://www.wired.com/2010/09/twitter-ipad-app/) supplies `wired-compose.png`, preserved at 768×1024. Its old pane/pinch image URLs now return HTTP 403, so those were not falsely recorded as downloaded.

## Downloaded footage, inspected locally

`macrumors-2010-demo.mp4`: 94 seconds, 1280×720 H.264 with audio, uploaded **2010-09-02**, title **Twitter for iPad**, uploader **Shark**. Description identifies `twitter.com/jarques`.

- [Actual video](https://www.youtube.com/watch?v=ehVbbOi-klY)
- [Launch-day MacRumors article embedding this exact video](https://www.macrumors.com/2010/09/02/twitter-for-ipad-offers-a-fresh-new-interface/)
- `macrumors-2010-demo.metadata.json`: compact original upload metadata.
- `demo-contact-sheet.jpg`: frames every five seconds, ordered left to right and top to bottom, beginning 0s.
- `demo-sliding-contact-sheet.jpg`: frames every second of first 37 seconds, left to right then top to bottom.
- `frames/10s-panes-landscape.jpg`, `frames/23s-three-panels.jpg`, `frames/70s-pinch-card.jpg`: individual full video frames.

Observed sequence:

| Approx. time | Observation |
| --- | --- |
| 0–4s | Expanded navigation at left, narrow fixed-width timeline, substantial empty charcoal space at right |
| 6–8s | Tap a link: new sheet moves in from right; navigation contracts to icon rail, source timeline slides left under front sheet |
| 11–13s | Rightward drag of detail sheet reveals source timeline; navigation text expands back into view; detail remains partially visible at right |
| 15–18s | Another selected source tweet supplies another right sheet; old timeline position is retained |
| 20–23s | Author detail sheet contains user details and follower rows |
| 23–25s | Tapping a follower opens a third sheet, moving earlier author sheet left beside the new sheet |
| 28–33s | Horizontal drags move among persistent sheets, revealing different prior layers; selected blue rows remain visible in their originating lists |
| 35–40s | Choosing a top-level navigation item returns to the expanded navigation and single timeline state |
| 69–72s | Spread/pinch gesture on a tweet exposes a centered floating author/actions card; underlying content is dimmed |
| 73–76s | Closing gesture dismisses that card and restores timeline |

The camera view is oblique, so use the screenshots rather than film coordinates to measure layout. Footage clearly proves persistent overlapping windows, not replacement-page navigation or equal screen-width carousel slides. Exact spring constants and velocity thresholds cannot be recovered from this film alone.

## Measured geometry and sampled palette

Measurements below distinguish direct image coordinates from inferred original iPad points. Scaling 640px portrait screenshots by 1.2 recovers approximate 768px logical widths; vertical screenshots are rounded by the publisher to 853 rather than 853.333.

| Element | Direct screenshot measurement | Approximate original logical points |
| --- | --- | --- |
| Compact navigation rail | 60px in `twitteripad_replies.PNG` | 72px |
| Expanded navigation | 243px in `twitteripad_composing.PNG` | 292px |
| Default timeline / ordinary conversation sheet | 397px in portrait screenshots | 476px |
| Web-content sheet | About 478px, x≈162 to640 in `twitteripad_article.PNG` | 574px portrait; native getter also establishes 830px landscape |
| Front conversation sheet position | x=243 to640 in `twitteripad_replies.PNG` | x≈292 to768 |
| Exposed source timeline under conversation | x=60 to243 | 220px visible, remaining portion occluded |
| Timeline avatar | 40px square | 48px square |
| Timeline avatar inset | ~10px from sheet edge | ~12px |
| Source text start | ~60px from sheet edge | ~72px |
| Compact nav icon rows | ~36px pitch | ~43px pitch |
| Status bar | 16px high | ~20px high |

- Sheet/content empty background sampled exactly `rgb(247,247,247)` / **#f7f7f7** in the large blank conversation area.
- Rail is a fine woven/crosshatch charcoal texture. Most common sampled colors in its blank area: **#303034**, **#2f2f33**, **#2e2e33**. This is not solid black.
- Selected tweet uses an intense vertical blue gradient: observed row colors around **#0088f4** through **#0063e6**, with white text. Do not use modern cyan Twitter blue as a flat substitute.
- Detail header is a subtle pale cool grey gradient, around **#dfe0e6** through **#e3e4e9** in sampled lower regions. It includes the selected tweet/author and action glyphs, rather than a large modern title toolbar.
- Thin separators are low contrast grey; sheets have distinct shadows concentrated on the left edge and lightly rounded outer corners.
- Timeline type visually matches system Helvetica: regular black body, bold author, grey inline links and small light timestamps. Estimated original body/name size is 18px; detail tweet around22px. These are visual estimates, not recovered UIFont declarations.
- Timeline starts immediately below the iOS status bar: the launch UI has **no standalone timeline titlebar** and no modern per-tweet action/count row. Actions appear in detail and floating author cards.
- Expanded nav starts with avatar/account, then Timeline, Mentions, Lists, Messages, Profile, Search. Several rows have a tiny cyan unread indicator at the far left. Compose sits bottom left, settings bottom right.
- Initial landscape composition deliberately leaves a large charcoal region after the single timeline. Preserve this sparse layout instead of automatically opening a fabricated detail panel.

## Compose, profile, and conversation fidelity

Compose is ruled **white paper**, grey woven toolbar, `New Tweet` and account name, dark rounded Close/Send buttons, vertical faint red rule and blue horizontal lines. The entire timeline/navigation group sits below that paper during composition. Do not substitute yellow paper based on generic iOS Notes nostalgia.

Floating author card: narrow light action bar at top; author avatar/name/selected post; grouped white inset biography rows; three tabs for tweets, mentions and favorites; following/followers stats; large full-profile button. Modal card has a shadow and backdrop dimming.

Conversation sheet: selected tweet plus reply/star/retweet/share icons at top; ancestry rows below with small grey curved reply indicators and minute timestamps. The main timeline still exists behind it and retains a selected blue row.

## Implementation implications

Retain the old app's physical hierarchy while adapting content to Bluesky: 72px rail or292px expanded nav, default 476px paper sheets, wider web-content sheets (574px portrait /830px landscape), persistent horizontally draggable stack, independent vertical scroll in each sheet, left edge shadows, blue selection, and grey woven background. The native tweet-detail getter conditionally uses the web widths; see `reverse-engineering.md` for the recovered width evidence. Persistence during horizontal exploration does not establish persistence across top-level section changes. The firsthand [MacStories review](https://www.macstories.net/ipad/twitter-for-ipad-review/) reports discarded prior panes on section changes and special navigation limitations inside web panes. Author/hashtag recursion and media handling must preserve their source-controller context rather than assuming every content type has identical navigation. Touch and trackpad handlers should move the same sheet stack; regular vertical trackpad scroll should remain native. Provide explicit navigation/buttons for pinch and two-finger features so desktop use remains discoverable.

Exact original icon/texture assets come from the preserved 3.1.1 IPA extraction, not crops from press screenshots; screenshots document their placement and appearance. `ipa.md` records package provenance and repackaging limitations; `original-app/asset-manifest.json` records the 265 source and browser-output hashes. CSS approximations are not original assets. The independent audit is retained at `critiques/astra-historical-audit.md`.
