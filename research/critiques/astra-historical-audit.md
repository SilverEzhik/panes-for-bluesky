# Independent historical and provenance audit

Audited 2026-10-15. Scope: existing IPA packages, extracted resources, reference manifest, selected native evidence, and contemporary sources. No application code changed; no historical runtime executed. Used the reverse-engineer-anything skill to evaluate preserved evidence and its boundaries; reused saved REA outputs without opening a duplicate native session.

The collection is substantially stronger than a screenshot-inspired recreation: real preserved executables, reproducible artwork decoding, contemporary photography/video, and native instruction evidence agree on the central sliding-sheet design. The main remaining risks are conflating versions and treating all sheets or all persistence behavior as equivalent.

## Ranked findings and research suggestions

### 1. High: correct the uniform-width rule before it becomes a fidelity requirement

`research/design-evidence.md:71` groups timeline/content sheets at about 476 points, and line 100 recommends fixed approximately 476-point sheets. That is incomplete. `research/reverse-engineering.md:37` and the literal pseudocode in `research/rea/mcp-native-fixed-web-width.c:9` establish 574-point portrait and 830-point landscape web sheets; wide tweet details use those widths conditionally.

This also has independent visual corroboration: in the inspected `twitteripad_article.PNG`, the front sheet starts around x=162 and ends at x=640, giving approximately 478 image pixels or 574 logical points at the 1.2 scaling factor. It is visibly wider than the 397-image-pixel conversation sheet. The native web method starts at VM `0x87998`; its constants are at `0x879ac` and `0x879b0` in `research/rea/macho-static-3.1.1-panel-disassembly.txt:12`.

Suggested next evidence: a sheet-type/orientation table with screenshot coordinates and matching native getters, then captures for a linked tweet, ordinary tweet, and rotation. Keep 476 as the default, not the universal width.

### 2. High: specify which September build the reconstruction represents

The local primary artifact really declares **3.1.1**, but the firsthand [MacStories launch review](https://www.macstories.net/ipad/twitter-for-ipad-review/) explicitly calls the universal launch update **3.1**. Launch-day screenshots/video do not prove they ran the preserved 3.1.1 binary. `research/ipa.md:19` connects the launch announcement to 3.1.1 without resolving this distinction.

The archive contains `C4iD.nfo`, whose lines 24–32 identify a third-party release of Twitter 3.1.1, name a cracker, and give a release date of **2010-09-08**. This is the packager's statement, not an authenticated Apple release date. The source JSON's `mtime=1677551701` is a later archive timestamp; its `rclone-mtime=2010-09-14T20:22:05Z` is carried metadata. Neither proves original publication. Existing warnings at `research/ipa.md:3,13,17` are appropriate.

Suggested next evidence: locate a version-specific original changelog or independently preserved 3.1 package; compare relevant method bodies/assets to 3.1.1. Until then describe this precisely as a September 2010 reconstruction using preserved 3.1.1 code and launch-era visual references. Do not claim 3.1 and 3.1.1 equivalence, or infer a release date from the NFO.

### 3. High: persistence needs a lifecycle boundary, and web sheets have special navigation

The [MacStories firsthand review](https://www.macstories.net/ipad/twitter-for-ipad-review/) adds behavior missing from the current implementation implications: switching top-level sections discards the earlier section's open panes; selecting a linked tweet automatically loads a wider web pane; that web pane does not offer the same further profile-drilling path. It also describes a long-press Messages popover that permits reading/replying without leaving the timeline. These are useful research targets, not assumptions to copy blindly across versions.

`research/design-evidence.md:57` already observes section selection returning to one timeline, but line 100's recursive author/hashtag/media advice can overgeneralize persistence. Preserve sheets during horizontal exploration while explicitly investigating replacement after a new source selection, top-level navigation, account switching, and web-detail interactions. Trace the corresponding controller insertion/removal call sites in the retained binary; panel geometry alone cannot establish those policies.

### 4. Medium: recover native typography and asset application, not just asset files

All 265 decoded resources match their manifest hashes and reproduce byte-for-byte with the current decoder. That is strong transformation provenance, but reproducibility does not independently prove color/alpha conversion correctness. `decode-assets.py:35–40` unpremultiplies BGRA; integer quantization means decoded edge colors cannot recover arbitrary pre-premultiplication originals exactly.

`research/design-evidence.md:85` correctly labels 18/22-pixel font sizes as visual estimates. `research/reverse-engineering.md:62` correctly limits the recovered 14pt CSS to the embedded web view. Follow actual native cell/header font construction, line spacing, shadow drawing, UIImage cap/stretch rules, and selected-state asset use. Compare decoded semitransparent shadows/icons over both light and dark backgrounds against a second decoder or historical rendering. Native launch images (`Default-Portrait.png`, 768×1004; `Default-Landscape.png`, 1024×748) are useful intrinsic-resolution geometry references, although launch placeholders do not prove populated runtime layout.

### 5. Medium: complete the derivative capture provenance

Every one of the 12 source-manifest files currently matches its recorded SHA-256. The saved MacRumors HTML contains the exact `ehVbbOi-klY` embed, independently tying the retained video ID to the contemporary article. The [article](https://www.macrumors.com/2010/09/02/twitter-for-ipad-offers-a-fresh-new-interface/) displays September 1, 2010, 10:45 p.m. PDT; this is consistent with September 2 UTC, rather than conflicting evidence.

However, `research/references/sources.json` does not record contact-sheet/frame derivation commands, precise frame timestamps/PTS, downloader format ID, capture retrieval timestamp, or hashes of the saved source HTML. Its `published` field describes the associated article/video date, not proof of when today's CDN image bytes first existed. Add a small derivative manifest connecting input hash, command/tool version, frame timebase, output hash, and source-page retrieval date. If stronger chain-of-custody is needed, retain a dated preservation snapshot of the source page. Keep camera-oblique film useful for behavior, not pixel-exact dimensions or measured spring timing.

### 6. Medium: remove stale statements and explicitly gate later-era material

`research/design-evidence.md:102` says the IPA has not been extracted, contradicting the current manifest and `research/ipa.md:14–16`. Update that historical task-status sentence and cross-link the native width findings. Otherwise a later contributor may replace exact assets or privilege stale geometry.

For future reference selection, Twitter's own [March 3, 2011 update announcement](https://blog.x.com/en_us/a/2011/twitter-for-iphone-ipad-even-better) explicitly documents a redesigned compose screen, automatic URL shortening, autocomplete, and a new DM conversation view. Its [September 18, 2012 announcement](https://blog.x.com/en_us/a/2012/expand-your-experience-new-twitter-for-ipad) describes a ground-up rebuild. These provide primary-source exclusion boundaries: a visually similar later screenshot is insufficient evidence for September 2010 compose or message behavior. Keep 3.2.1 isolated until specific changes are compared.

## Strongest verified evidence

- Recomputed both complete IPA SHA-256 digests: 3.1.1 `605d2192d883d1c9f7a44969da827db951d567b783f0d41bbc877412e817b581`; 3.2.1 `49946b30f44242c405c6a5376412ea74049024485fd6cd7ff1245e4c0854412a`. Decoded Info.plist directly from each ZIP: versions, bundle identifier, universal device families, SDK names and minimum OS agree with the notes. This establishes local artifact identity, not Apple signer authenticity.
- Counted 265/298 packaged PNGs respectively. Verified all 265 primary source/output hash pairs and reran decoding in memory: zero mismatches. Verified all 12 retained screenshot/video source hashes: zero mismatches.
- The official [September 2 launch announcement](https://blog.x.com/en_us/a/2010/twitter-for-ipad-sharing-content-in-tweets) directly establishes expandable panes, horizontal navigation, author/action pinch, conversation gesture, and signed-out exploration. Contemporary sources and native code independently support overlapping persistent sheets.
- Selected saved REA/Ghidra width and layout outputs retain meaningful code after the false no-return issue was corrected. `research/reverse-engineering.md:68–85` openly preserves that failure and the corrected profile. The limitations at line 89 are warranted: no historical execution, signer proof, or guarantee of complete native behavior. No new native analysis was needed for this audit.

Remaining uncertainty: exact launch 3.1 versus preserved 3.1.1 differences; original signer/receipt trust; native rendering of semitransparent assets; runtime mutations of width globals; controller lifecycle details beyond observed footage and firsthand reports. None invalidates the core reconstruction evidence, but each limits claims of exact equivalence.
