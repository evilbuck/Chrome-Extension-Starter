## Plan Path Review: Phase 3 — Subscriptions and live watches

### Plan Source
- File: `.context/2026-09-22.host-site-resource-sync/phase-3-resource-live-watches.md`
- Goal: Persist selected resources, push current/live values, pause localStorage watches without losing subscriptions, and expose status in the host panel.
- Baseline: `7d98f38` (`feat(resources): add host site resource panel`) plus current unstaged changes.

### Evidence Sources
- Git status: Phase 3 implementation, tests, locales, manifest, and workflow artifacts are unstaged.
- Recent relevant commits: `7d98f38`, `9e32a4e`, `eb0d465`.
- Implementation inspected:
  - `src/background/apps/resources.ts`
  - `src/background/connection.ts`
  - `src/pages/resources/site-panel.tsx`
  - `src/shared/constants.ts`
  - `src/shared/types.d.ts`
  - `public/manifest.json`
  - `__tests__/resource-sync.test.ts`
  - `__tests__/connection-routing.test.ts`
- Previous iteration fixes verified in current source: synchronous listeners, alarm wakeup, persisted revival, and selection-load request identity.

### Completion Matrix

| Deliverable | Status | Evidence |
|---|---|---|
| Persist identity-only subscriptions and restore after worker revival | ✅ complete | Load/persist at `resources.ts:261-269`; synchronous listeners and startup at `resources.ts:417-443`; revival regression at `resource-sync.test.ts:374-394`. |
| Subscribe snapshots and sends the current full value | ✅ complete | `resources.ts:461-480`; cookie field coverage at `resource-sync.test.ts:192-239`. |
| Unsubscribe stops pushes without deleting client copies | ✅ complete | `resources.ts:482-497`; no-delete behavior at `resource-sync.test.ts:241-265`. |
| Cookie changes push subscribed sets and ignore removals | ✅ complete | `resources.ts:389-401`; behavior at `resource-sync.test.ts:267-298`. |
| localStorage polls, pauses, resumes, and rescans | 🔄 partial | Value behavior exists at `resources.ts:319-359`, but the alarm remains scheduled when every item is paused because `updatePollAlarm` checks subscription presence rather than active/unpaused state at `resources.ts:376-387`. |
| `RESOURCE_STATUS` returns and displays checked/paused/error state | 🔄 partial | Worker/UI status exists at `resources.ts:499-511` and `site-panel.tsx:224-250`; a stale failed toggle can set the error after another origin has loaded and hide the current panel. |
| Stop sending while unauthorized and resume on reconnect | ✅ complete | Authorization boundary at `connection.ts:549-559`; reconnect refresh at `connection.ts:855-868`; regression at `resource-sync.test.ts:342-372`. |
| Required verification | 🔄 partial | Durable guardrails and production build pass, but regressions for alarm suspension and stale toggle completion are absent because both defects remain. |

### Review Axes
- **Spec axis worst finding:** Paused localStorage subscriptions continue waking the worker and querying tabs every minute, contrary to the explicit “polling stops” criterion.
- **Standards axis worst finding:** `toggle` has an unguarded asynchronous state write; a response belonging to an old origin can corrupt the newly selected origin’s UI.
- **Standards pass:** Sequential fallback using TypeScript, React, async/concurrency, universal-quality, and diff-relevant long-method/duplicate-code/primitive-obsession/data-clump guidance.
- **Cross-axis ranking:** None.

### Verification Status
- Goal achieved: **Partial**
- User goal: **Partially met** — subscription, send, revival, cookie watch, and localStorage value behavior work; pause lifecycle and one panel race remain incorrect.
- Scope adhered: **Yes**
- Out-of-scope changes: None identified.
- Browser/two-profile smoke: Not performed; client-side apply remains Phase 4/5 scope.
- Production build: `npm run build:prod` passed, including bundled type checking.

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
- Coverage: `91.10%`, baseline `91.07%`
- Complexity: no new or hard-ceiling violations.

### User Goal Analysis
- Goal: Checking persists and sends current values; live host changes continue pushing; unchecking stops pushes without deleting client copies.
- Met: Persistent identities, current-value upserts, cookie events, localStorage changes, uncheck semantics, unauthorized retention, reconnect refresh, and visible status.
- Partial: “Polling stops” while paused; stale asynchronous toggle results must not hide a later selection.
- Missing: Alarm suspension/resumption regression and stale-toggle regression.
- Verdict: **Partially met**

### Documentation Impact
- No immediate documentation impact. Phase 5 owns stabilized end-to-end documentation.
- Recommended: None for this review.

### How-to Impact
- No immediate how-to impact. The user procedure remains assigned to Phase 5.
- Recommended: None for this review.

### Issue Classification
- In-plan issues:
  1. Alarm remains active while all localStorage subscriptions are paused.
  2. A stale toggle failure can hide the newly selected origin.
- Out-of-plan issues: None.

### Verdict
**Needs work**

Iteration artifact updated:

`.context/2026-09-22.host-site-resource-sync/iterate-host-site-resource-sync.md`

### Recommended Next Step
The assigned review result is `/b-iterate`, followed by another review against the same phase. Loop-state selection remains with the supervisor.
