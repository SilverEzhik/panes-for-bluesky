# Astra review index

Seventeen Astra agents were dispatched on 2026-10-15: sixteen independent specialist reviewers and one cross-review synthesizer. The application was held unchanged while the reviewers inspected source, original references, native evidence, and the running client. Reports distinguish executed browser/harness probes, source-confirmed defects, proposed improvements, and hardware-only uncertainties.

Start with the [consolidated findings and replacement plan](astra-synthesis.md). Implementation and current verification are tracked separately in [the follow-up ledger](../../docs/review-followup.md); these reports preserve the reviewed baseline. Each specialist report contains evidence, source locations, suggested changes, and targeted verification.

| Review | Report |
| --- | --- |
| Historical visual fidelity | [Visual fidelity](astra-visual-fidelity.md) |
| Native layout, snapping, and physics | [Native physics](astra-native-physics.md) |
| Safari, touch, and trackpad ownership | [Safari gestures](astra-safari-gestures.md) |
| Bluesky API and authentication | [API and authentication](astra-api-auth.md) |
| Social action consistency | [Social state](astra-social-state.md) |
| Offline data, drafts, and worker lifecycle | [Offline architecture](astra-offline.md) |
| Keyboard and accessibility | [Accessibility](astra-accessibility.md) |
| Phones, tablets, rotation, and sizing | [Mobile layouts](astra-mobile.md) |
| Security, privacy, and moderation | [Security](astra-security.md) |
| Bundle, rendering, and loading performance | [Performance](astra-performance.md) |
| Test credibility and missing scenarios | [Test audit](astra-test-audit.md) |
| Original artifacts and research provenance | [Historical audit](astra-historical-audit.md) |
| Linked pages, galleries, and video | [Media and links](astra-media-links.md) |
| State ownership and replacement boundaries | [Architecture](astra-architecture.md) |
| Product flows and historical adaptations | [Product parity](astra-product-parity.md) |
| Local operation and self-hosting | [Deployment](astra-deployment.md) |

## Reading the findings

The pre-review browser suite remains useful baseline evidence: 52 passes and 8 explicit Chromium-CDP-only skips across three engines, with all 314 recorded inputs matching fingerprint `21263e47f5913be374c2f1e40465454d1736dfee3affb0248ea520faf612c5dc`. It does not prove the delayed-response, cross-tab, pagination, or native-fidelity cases identified here. Several reviewers independently found defects outside that suite.

The highest-confidence reproduced problems include session restoration waiting on itself, loss of session-only credentials after a transient read failure, draft resurrection after sign-out, covered or clipped mobile navigation, and keyboard focus reaching fully obscured timeline controls. Other important findings are established by source control flow or independently derived native arithmetic; they should receive focused regressions before replacement work is declared complete.

Historical claims and product proposals are separate. Contemporary evidence supports discarding stacks when switching top-level sections. Preserving inline hashtag context, browser history, or restoring old reading chains may be desirable web-client behavior; those proposals are not evidence that the original app universally preserved every stack. The preserved binary is 3.1.1, while a launch review names 3.1; exact equivalence remains unproven.

No reviewer sent real social posts or used real account credentials. Browser automation covers Chromium, Firefox, and WebKit, with native multi-touch/trackpad injection in Chromium; physical iPad Safari remains outside the verified scope.
