## Plan Path Review: Phase 3 — Subscriptions and live watches

### Plan Source
- File: `.context/2026-09-22.host-site-resource-sync/phase-3-resource-live-watches.md`
- Goal: Persist resource subscriptions, push current and changed host values, pause/resume localStorage watches, and never remotely delete on unsubscribe.
- Baseline: `7d98f38 feat(resources): add host site resource panel`; reviewed current unstaged implementation.

### Evidence Sources
- Modified implementation: `resources.ts`, `connection.ts`, `site-panel.tsx`, shared constants/types, manifest, locale files.
- Modified tests: `resource-sync.test.ts`, `connection-routing.test.ts`.
- Current source and tests inspected directly.
- Durable guardrails executed during this review.

### Completion Matrix

| Step | Status | Evidence |
|---|---|---|
| Persistence and worker revival | ✅ complete | Identity-only normalization and persistence at `resources.ts:261-274`; revival starts listeners and refresh at `resources.ts:443-465`. |
| Subscribe/unsubscribe | ✅ complete | Current-value snapshot and identity-only removal at `resources.ts:482-519`; post-read unsubscribe races have regressions. |
| Cookie watch | ✅ complete | Filtered set events and ignored removals at `resources.ts:411-423`; full wire-contract fields are constructed at `resources.ts:221-235`. |
| localStorage watch | ✅ complete | Same-origin reads, pause/resume, change detection, alarms, and post-read membership checks at `resources.ts:314-409`. |
| Status and panel | 🔄 partial | Status exposes paused/error state, but an origin A poll can overwrite origin B status after selection changes at `site-panel.tsx:190-200`. |
| Disconnect/reconnect lifecycle | 🔄 partial | Sending fails closed and subscriptions persist, but overlapping reconnect refreshes are collapsed at `resources.ts:396-409`; a new authorized connection may not receive a retry. |
| Required behavior tests | ✅ complete | Subscribe, unsubscribe/no-delete, cookie change, pause/resume, unpaired persistence, revival, and cancellation cases exist; deterministic unit gate passes. |

### Review Axes
- **Spec axis worst finding:** overlapping refresh coalescing can discard the refresh required for a newly authorized connection.
- **Standards axis worst finding:** the status polling effect permits a stale asynchronous response to overwrite state for a newer selection.
- Standards axis used the sequential fallback with TypeScript, Preact/React, async/concurrency, universal-quality, and diff-relevant code-smell guides.
- Cross-axis ranking: none.

### Verification Status
- Goal achieved: **partial**
- User goal: Core subscription/watch behavior is implemented; reconnect and stale-poll races remain.
- Scope adhered: Yes. Additional manifest, connection, constants, and translated locale changes directly support Phase 3.
- Out-of-scope changes: None identified.

### Guardrails Verdict
- Contract: `durable`
- Contract version: `2`
- Status: `pass`
- Gates:
  - `unit_test_gate=pass`
  - `functional_test_gate=skipped`
  - `lint_gate=pass`
  - `patch_gate=pass`
  - `global_ratchet=pass`
  - `complexity_gate=pass`
- Coverage: `91.30%`, baseline `91.07%`
- New complexity violations: none

### User Goal Analysis
- Met: Persistent subscriptions, current-value sends, live cookie/localStorage watches, pause/resume, and no remote deletion.
- Partial: Reliable refresh after every reconnect; selection-safe status polling.
- Missing: Queued refresh semantics and stale-poll cancellation.
- Verdict: **partially met**

### Documentation Impact
- Living documentation and user how-to remain explicitly assigned to Phase 5.
- Recommended: none during this review cycle.

### How-to Impact
- Deferred by the phased plan to Phase 5.
- Recommended: none during this review cycle.

### Issue Classification
- In-plan issues:
  1. Reconnect refresh requests can be lost while another refresh is active.
  2. An old origin’s status poll can overwrite the newly selected origin’s status.
- Out-of-plan issues: none.

### Verdict
**Needs work** — two in-plan lifecycle/UI race conditions remain.

Iteration artifact updated:

`.context/2026-09-22.host-site-resource-sync/iterate-host-site-resource-sync.md`

The artifact contains concrete fixes and regression-test scenarios for both findings.
