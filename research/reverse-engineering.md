# Twitter for iPad (2010): reverse engineering evidence

The reconstruction uses the **real Twitter 3.1.1 universal iOS package**, not an invented panel mockup. Download/source provenance belongs in `original-app/`; these notes record the analysis performed on its bytes. Version 3.1.1 contains iPad support (`UIDeviceFamily: [1, 2]`), bundle `com.atebits.Tweetie2`, built against iPhoneOS 4.0. Package metadata is an observation, not a guarantee of archive provenance or signer authenticity.

## Reproduce the analysis

REA repository/skill: https://github.com/morluto/rea, installed release **rea-agents 6.5.0**, bundled skill **42**. The skill was read and followed: diagnose, preserve configuration, prepare scoped setup, then apply the user-authorized MCP/skill installation. Plans and applied output are in `rea/setup*.json`. Existing unrelated Codex configuration was preserved, with backup paths recorded in those results. `rea/config-preservation.json` records a structural TOML comparison: the current configuration with only `mcp_servers.rea` removed equals the original backup exactly.

The public launcher is `/home/debian/.local/node-v22.20.0-linux-x64/bin/rea`. It is registered under `mcp_servers.rea` in `/home/debian/.codex/config.toml`. REA tools cannot be hot-added to this already-running agent, so analysis used the actual production MCP server through a small JSON-RPC stdio client (`rea/mcp_probe.py`) and supported CLI commands. `rea/mcp-doctor.json` proves initialization, **207 tools**, matching package/catalog identity, and a successful `binary_session` request. `mcp-open-ipa.json`, `mcp-inspect-ipa.json`, and `mcp-close-ipa.json` retain the actual archive session lifecycle and returned evidence.

For native analysis, official [Ghidra 12.1.4](https://github.com/NationalSecurityAgency/ghidra/releases/tag/Ghidra_12.1.4_build) and [Eclipse Temurin JDK 21](https://github.com/adoptium/temurin21-binaries/releases) were downloaded into `/home/debian/.local/share/rea-tools/`. This isolated install changes no system Java selection. Both downloaded archive SHA-256 values match their official GitHub release asset digests. Exact release asset metadata and archive SHA-256 are in `rea/ghidra-download.json`, `rea/jdk-download.json`, and `rea/tool-archive-sha256.json`. `rea/doctor-ghidra.json` verifies the Linux x64 native decompiler, compatible full JDK, and provider readiness. The MCP registration includes their absolute paths.

## Evidence ledger

| Question | Evidence | Result and boundary |
| --- | --- | --- |
| Is there a real IPA? | `rea/ipa-3.1.1-inventory.json`, Evidence `ev_71cc809076abfec583aa3476160b51e89597fc056e7cb93d487f2ab51cd6e6fc` | REA safe archive inventory; SHA-256 `605d2192d883d1c9f7a44969da827db951d567b783f0d41bbc877412e817b581`. 299 artifact nodes, 300 occurrences. Central-directory scope only. |
| Which app/executable? | `rea/apple-graph-3.1.1.json`, Evidence `ev_fead5d7c5cb21ad5b0e67b7468444a423b60b4c4f53d11d4bd876a8b9ab7db44` | iOS root `Payload/Twitter.app`; executable `Twitter`, SHA-256 `eb02c536eab4b7308eddc4cd8642648ab9e20a2269900f06a0b91f4f29fe53e1`. Bundle-role projection is path based. |
| App identity and iPad support? | `rea/plist-python-3.1.1.json` | Python standard-library plist decoding of the actual `Info.plist`, original hash preserved. This is ordinary static analysis, **not REA Evidence**. |
| Can native code be read? | `rea/macho-static-3.1.1.json` and parser `rea/parse_macho.py` | Thin ARMv6 Mach-O; LC_ENCRYPTION_INFO has `cryptid=0`. No iOS app execution. Custom static decoding is separately labeled. |
| Does the app really have swipe columns? | `rea/macho-static-3.1.1-panels.json`, `rea/macho-static-3.1.1-panel-disassembly.txt` | Actual Objective-C classes, selectors, ivar offsets, method IMPs and annotated Thumb instructions for `ABSwipeColumnViewController` / `ABSwipeColumnScrollView`. |
| What is packaged JavaScript? | `rea/javascript-3.1.1.json`, Evidence `ev_5a7fca12cedc607f63b7e61c06f8af0c03a66db203a30db1261c4e29d672b599` | REA statically analyzed jQuery, `tweet_details.js`, and inline terms-page script. The native swipe system is not implemented in this JS. No claim that the graph observed execution. |

## Native architecture and geometry

Custom Mach-O metadata and Capstone disassembly establish the following method identities (Thumb IMPs carry bit 0; code addresses clear it):

- `ABSwipeColumnViewController::_updateLayout:` — IMP `0x9c015`, code VM `0x9c014`, original file offset `0x9b014`.
- `swipePointsForSwipeView:proposedOffset:` — IMP `0x9b729`.
- `nearestOffsetForPossibleOffsets:fromOffset:toOffset:` — IMP `0x9b55d`.
- `bestOffsetForPossibleOffsets:fromOffset:toOffset:inDirection:` — IMP `0x9b631`.
- `ABSwipeColumnScrollView::animate` — IMP `0x9c8bd`; `_animateToDestinationOffset` — IMP `0x9cb61`.

Instruction-level width observations, with raw instructions/literal addresses retained in `macho-static-3.1.1-panel-disassembly.txt`:

- `TwitterPadSidebarViewController::ab_swipeColumnWidth:` loads **292** (`0x43920000`) from VM `0x81aa4`.
- `TwitterPadWebViewController::ab_swipeColumnWidth:` uses **574** in portrait orientations 1/2, **830** in the other orientations.
- `TwitterPadTweetViewController::ab_swipeColumnWidth:` uses those same wide widths when `needsWide` is true. Otherwise it reads the shared default-column global, whose **initial stored value is 476**.
- `UIViewController`'s `ab_swipeColumnWidth:` category method also references that default-column global (VM `0x19adec`), converting its integer value to floating point in the tablet branch; its other branch uses 248.
- `_updateLayout:` includes **+72/-72** floating-point constants at VM `0x9c454` / `0x9c458` and sets child frames. The instruction-level use is documented below; a literal alone does not prove an overlap rule in every state.

These are static observations. Width globals can be changed during execution; initial bytes alone do not prove every runtime layout.

The custom instruction reading establishes a specific stack model:

1. Compute natural positions from cumulative column widths. The root stays pinned at the content offset, which renders it at viewport x=0.
2. For each non-root column (except the special two-column state), if its natural prefix minus 72 is at or behind the content offset, place it at contentOffset+72 and remember its index. Otherwise retain its natural position.
3. Hide earlier non-root columns behind the last clamped index. This produces one visible 72-point strip; it does **not** add 72 points to every column.
4. Snap candidates begin with zero. Skip the root. For each non-last column, include left alignment `prefix-72`. From the third column onward, also include right-edge alignment `prefix+width-viewportWidth`; the last column uses that right alignment. If a column's candidate matches the previous snapped offset, it retains that match rather than generating both. Dedupe numerical candidates.
5. A non-throwing release picks the candidate nearest the proposed offset. A throwing release chooses the nearest proposed candidate strictly on the requested side of the previous snap; if none exists, retain that previous snap.

The logical native stack includes the **292-point sidebar as index 0**. Fewer than three controllers make the delegate return offset zero: baseline sidebar+timeline is two controllers, adding a detail makes three. For widths `[292,476,476]` in a 768-point viewport, candidates are `[0,220,476]`. A web implementation showing a permanently compact 72-point rail is effectively starting at original offset 220; subtracting 220 from the remaining detail positions yields `[0,256]`. This coordinate conversion must be explicit; dropping the sidebar and reusing original indices changes the algorithm.

Custom disassembly also establishes the scroll update `x += dx; dx *= friction; dx += (destination-x)*springiness` (last term omitted when disableSpring is set). Default animation uses friction .7 and springiness .05, while disableSpring initialization writes .8 and .06. The NSTimer interval is 1/60 second. The gesture recognizer uses a 10-point movement threshold and selects horizontal versus vertical movement before beginning. Apparent .9/.1 smoothing computations are overwritten by raw delta/time values in this build, so smoothing is not inferred from those constants.

## Release projection and directional snapping

The final bounded release audit is in `rea/release-throw-analysis.md`, with exact raw-instruction addresses. Accepted native touch release has **no velocity cutoff**: it passes `lastPointerDelta / (max(timeSinceLastMove, 1/60) * 60)` into `_endScroll:`, which computes `round(bounds.x + dx / (1-currentFriction))`, sets `throwing=true`, and calls animation setup. The delegate chooses the strict candidate side from **projected destination versus previous snap**. Existing `.7` friction corresponds to a roughly 55.556 ms projection at 60 Hz; a fixed 180 ms projection is not the recovered native algorithm. This additional note is ordinary static analysis, not a fabricated REA Evidence record.

## Actual packaged styling

`tweet_details.css` declares Helvetica/sans-serif 14pt body type, white background, 15px body padding, bold links `#236ed8`, muted metadata `#aaa` at 11pt, plus gray WebKit gradients for location disclosure. This CSS applies to the embedded tweet-details web view. It does not establish the native timeline's font or cell metrics.

## Native decompilation

A persistent production-MCP/Ghidra session imports the exact executable and requests focused layout, snap-point, nearest-offset, directional-offset, initialization, animation, and destination-animation pseudocode. Its reproducible client is `rea/mcp_native_probe.py`; complete returned responses are saved as `rea/mcp-native-*.json`. The first pass completed and closed successfully. `mcp-native-scroll-animate.json` provides actual REA/Ghidra Evidence `ev_98d29f513d2110a9ac5817cf3fd8454a70d7948429c8178a4f7fbc28be94748c` corroborating the spring update above. Separate `.c` files are literal readable extractions of each returned `normalized_result`.

That first pass also exposed a material engine limitation: Ghidra's discovered no-return analyzer marked the `_objc_msgSend` thunk as non-returning, truncating most Objective-C method pseudocode at the first message call. Those records explicitly carry the limitation and must not be read as complete implementations. A second pass uses the supported REA `REA_GHIDRA_DISABLED_ANALYZERS=Non-Returning Functions - Discovered` configuration; it commits that changed analyzer profile and preserves results separately in `mcp-native-fixed-*`. No executable or REA package is patched, and the first pass remains available for comparison.

**The second pass completed, and the false no-return problem was resolved.** It returned full method pseudocode, then closed the ephemeral target successfully (`mcp-native-fixed-close.json`). The recorded profile is `ghidra-default+disabled:Non-Returning Functions - Discovered`. Actual REA Evidence corroborates the earlier instruction reading:

| Method | REA Evidence ID | Readable output |
| --- | --- | --- |
| Column frame/visibility layout | `ev_b6afd1b50ee657fd05a70ca919a9b6c7260961d5d6676294f4e4af725d16f559` | `rea/mcp-native-fixed-layout.c` |
| Snap candidate generation | `ev_809c1f3526c0c0de005d338751b09dc18ea11b05eab85c635d4853b29785436e` | `rea/mcp-native-fixed-swipe-points.c` |
| Nearest candidate | `ev_7b4a802efc0398f8ba5bc9cfd6d122f3ecae31675314ec0c037d91b1558b4e6c` | `rea/mcp-native-fixed-nearest-offset.c` |
| Directional candidate | `ev_ca33d6e7be4e428d727b3b2df3ce0b526da48bf7834bcab043f2816940433846` | `rea/mcp-native-fixed-direction-offset.c` |
| Animation update | `ev_e9f331c436f5ce8f47d5dffef85b87f18bf9aedba03494c772523fc22e4f05e5` | `rea/mcp-native-fixed-scroll-animate.c` |
| Animation setup/timer | `ev_dd6eda93d18410efb63bdc850b93c4a2dc475388073dba8d4ff20645240f111a` | `rea/mcp-native-fixed-scroll-destination.c` |
| Sidebar width | `ev_e9eda991b618bea3c744e079828f527dbeca3ba4d15785947d75358439a0ba0a` | `rea/mcp-native-fixed-sidebar-width.c` |
| Web width | `ev_334ca2cc29d443a12986482750c647d71c49810aab056dd57c1c21fd0fcb8153` | `rea/mcp-native-fixed-web-width.c` |
| Tweet width | `ev_b916f6b9a0f35b6581befb0be47199a72285e099f0201da9231666e329305cdd` | `rea/mcp-native-fixed-tweet-width.c` |
| Gesture movement/axis selection | `ev_45fd2fa6a12c996bdfa815c496dcab6a6969f889689f56ccfe806e50c43c3a34` | `rea/mcp-native-fixed-gesture-moved.c` |

These `.c` files are exact extracts of the corresponding `.json` Evidence's `normalized_result`, not hand-edited source reconstructions. Ghidra pseudocode retains helper calls/unknown types and ABI recovery limitations. Read the instruction annotations alongside it when argument recovery is incomplete. The observed output is engine pseudocode, not original source.

## Remaining limits

The bounded follow-up in `rea/native-context-analysis.md` recovers the selected-link/source-sentinel `needsWide` predicate and selection-driven width updates through custom annotated instructions, plus descendant replacement during pushes and sidebar root replacement. Its actual REA/Ghidra attempt timed out before returning new pseudocode; the timeout and successful cleanup are retained. These follow-up observations are not assigned fabricated REA Evidence IDs. The complete selected-content routing and native font metrics remain unresolved.

No historical iPad runtime was executed. Signer trust and original App Store receipt validity were not established. REA's macOS-utility `inspect_macho` and `inspect_plist` operations are unavailable on this Linux host; their explicit error records are retained, and custom portable parsing is not mislabeled as those operations. Static graph bridge candidates are hypotheses, not runtime calls. Browser gestures in the reconstruction must be verified separately on current browser engines.
