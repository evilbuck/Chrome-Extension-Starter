## Plan Path Review: Phase 3 — Subscriptions and live watches

### Plan Source
- File: `.context/2026-09-22.host-site-resource-sync/phase-3-resource-live-watches.md`
- Goal: Persist subscriptions, push current and changed host values, pause/resume localStorage watches, and never remotely delete on unsubscribe.
- Baseline: `7d98f38 feat(resources): add host site resource panel`; reviewed current unstaged implementation.

### Evidence Sources
- Git status: Phase 3 implementation and workflow artifacts unstaged; nothing staged.
- Modified implementation: `resources.ts`, `connection.ts`, `site-panel.tsx`, shared constants/types, manifest, and locale files.
- Modified tests: `resource-sync.test.ts`, `connection-routing.test.ts`.
- Current source, regressions, parent plan, and previous iteration inspected directly.

### Completion Matrix

| Step | Status | Evidence |
|---|---|---|
| Persistence and worker revival | ✅ complete | Identity-only normalization and persistence at `src/background/apps/resources.ts:262-275`; startup reload and refresh at lines 461–473. |
| Subscribe/unsubscribe | ✅ complete | Current-value snapshot and identity-only removal at `resources.ts:491-529`; post-read unsubscribe regressions pass. |
| Cookie watch | ✅ complete | Filtered set events and ignored removals at `resources.ts:420-432`; full cookie fields built at lines 221–235. |
| localStorage watch | ✅ complete | Same-origin reads, pause/resume, change detection, durable alarms, and subscription revalidation at `resources.ts:315-418`. |
| Status and panel | ✅ complete | Controlled checkboxes and selection-safe status polling at `src/pages/resources/site-panel.tsx:190-261`; stale cross-origin poll regression present. |
| Disconnect/reconnect lifecycle | ✅ complete | Authorized reconnect refresh at `src/background/connection.ts:855-869`; overlapping requests queue another full pass at `resources.ts:397-418`. |
| Verification/buildability | ❌ missing | Guardrails pass, but `npm run build:prod` fails with TS2345 at `__tests__/resource-sync.test.ts:870`: the new `setInterval` mock returns `number` where merged project typings require `Timeout`. |

### Review Axes
- Spec axis worst finding: Phase 3 cannot produce a production bundle because its new regression test fails project type checking.
- Standards axis worst finding: `__tests__/resource-sync.test.ts:870-873` supplies an invalid mock return type for `window.setInterval`.
- Standards axis: sequential fallback using TypeScript, Preact/React, universal quality, async/concurrency, and diff-relevant code-smell guidance.
- Cross-axis ranking: none.

### Verification Status
- Goal achieved: **partial** — behavior is implemented, but the tree is not production-buildable.
- User goal: Implementation behavior appears met from source and passing regressions.
- Scope adhered: Yes; supporting manifest, connection, constants, and locale changes serve Phase 3.
- Out-of-scope changes: None identified.
- Deferred browser verification: full paired-client confirmation belongs to Phases 4–5 because client apply is not implemented yet.

### Guardrails Verdict
- Contract: `durable`
- Contract version: `2`
- Status: `pass`
- Gates: `unit_test_gate=pass`, `functional_test_gate=skipped`, `lint_gate=pass`, `patch_gate=pass`, `global_ratchet=pass`, `complexity_gate=pass`
- Coverage: `91.40%`, baseline `91.07%`
- Unit tests: 455 passing
- Additional build check: **failed** with TS2345.

### User Goal Analysis
- Met: Persistent identity-only subscriptions, current-value sends, cookie/localStorage watches, pause/resume, reconnect refreshes, status rendering, and no remote deletion.
- Partial: Deliverable verification; production bundle generation fails.
- Missing: Type-correct stale-status-poll regression.
- Verdict: **partially met**

### Documentation Impact
- Living documentation remains explicitly assigned to Phase 5.
- Recommended: none during this phase review.

### How-to Impact
- User procedure remains explicitly assigned to Phase 5.
- Recommended: none during this phase review.

### Issue Classification
- In-plan issues:
  1. The Phase 3 stale-status-poll regression breaks production type checking at `__tests__/resource-sync.test.ts:870`.
- Out-of-plan issues: none.

### Verdict
**Needs work** — one in-plan build-blocking test defect remains.

Iteration artifact updated:

`.context/2026-09-22.host-site-resource-sync/iterate-host-site-resource-sync.md`

It is active and records the exact failure, proposed correction, passing guardrails evidence, and required re-verification.
