# Verification audit

Broad verification baseline of the local worktree on 2026-10-15, after the [17-agent Astra review](../research/critiques/README.md). The [follow-up ledger](review-followup.md) records the replacements, exact results, artifact links and limits.

The later thumbnail/custom-feed/butterfly changes are covered by the [follow-up record](review-followup.md#gesture-ownership-and-lifting-photos), including focused browser regressions and live public directory/feed reads. The full-suite counts and frozen fingerprint below belong to the earlier build.

| Requirement | Evidence and result |
| --- | --- |
| Real 2010 iPad Twitter app | [IPA provenance](../research/ipa.md); the local universal 3.1.1 preservation IPA matches SHA-256 `605d2192d883d1c9f7a44969da827db951d567b783f0d41bbc877412e817b581`. Third-party repackaging is disclosed. |
| Screenshots and footage | [Design evidence](../research/design-evidence.md); 11 contemporary screenshots, the retained 94-second 720p launch video, frames and provenance manifests. |
| Install and use REA skill/MCP | [Reverse engineering](../research/reverse-engineering.md); REA 6.5.0 and its 207-tool production MCP, configured Ghidra 12.1.4/JDK21, preserved corrected native pseudocode and static disassembly. Successful native evidence is distinguished from failed follow-up startup attempts. |
| Actual artwork and native behavior | All 265 decoded PNG hashes match the [asset manifest](../research/original-app/asset-manifest.json). Native sidebar coordinates, cumulative widths, ordered snaps, release projection, spring and overscroll have independent oracle tests. Explicit URL selection embeds its browser beneath the post header in the same 574/830-wide sheet. |
| React, TypeScript and Vite | Production builds and TypeScript checks pass. The test-owned server's emitted HTML and every JavaScript/CSS file match the [served-build manifest](../research/verification/served-build-functional.json). |
| Real Bluesky client | [Live public smoke](../research/verification/live-smoke.json) verifies real feed, profile, author feed, thread and search responses. Strict mocked XRPC tests exercise actual SDK authentication, refresh, writes, custom moderation, pagination and account races without sending live social writes. |
| Local-first operation | Account-scoped snapshots, revision-checked drafts, cross-tab logout fences, publication reconciliation and explicit storage errors pass. No automatic background social writes are queued. |
| Installable, self-hostable PWA | Six two-release worker tests pass. Six actual-server-stop reloads pass across root/subpath and all three engines, with 35 shell files cached and API responses excluded. [Hosting instructions](local-first.md) cover static serving and container configuration. |
| Browser gestures and access | Complete functional suite: **268 passed, 8 intentional CDP-only skips, zero failures** across Chromium, Firefox and WebKit. Covers shared keyboard/wheel/pointer/synthetic gestures and native Chromium touch/trackpad injection, immediate popup Escape/tap, missed mouse release and keyboard reveal of offscreen sheets. |
| Media and linked content | Image retry/gallery controls and real HLS decoding/retry pass in all three engines. Fully offscreen video pauses, stays paused on reveal and decodes again after explicit resume. Outer deck containers retain exact scroll origins through repeated opening and closing. |

All **337 source/test inputs** stayed unchanged throughout final functional, PWA, offline and live verification. The independently checked fingerprint is `a4363dcefd9b64a42308bed0bed0a9073d0c8272b7ec459dea20c9cf42320d3f`. The earlier 52-test baseline and diagnostic failures are historical evidence; the linked final results supersede them.

The original executable was statically analyzed, not run on historical hardware. Exact launch 3.1 versus preserved 3.1.1 equivalence is unproven. Physical iPad Safari, physical trackpad inertia, native home-screen installation and authenticated production writes remain untested. This is a Bluesky adaptation with documented fidelity limits, not a pixel-identical historical runtime. Docker/nginx configuration was reviewed; its container was not executed because those runtimes are unavailable here.
