## Plan Path Review: Phase 3 — Subscriptions and live watches

### Plan Source
- File: `.context/2026-09-22.host-site-resource-sync/phase-3-resource-live-watches.md`
- Goal: Persist resource subscriptions and push live cookie/localStorage changes over the authorized host channel.
- Baseline: commit `7d98f38` (`feat(resources): add host site resource panel`) plus current unstaged changes.

### Evidence Sources
- Git status: Phase 3 implementation, tests, locale copy, and workflow artifacts are unstaged.
- Recent relevant commits: `7d98f38`, `9e32a4e`, `eb0d465`.
- Implementation inspected:
  - `src/background/apps/resources.ts`
  - `src/background/connection.ts`
  - `src/pages/resources/site-panel.tsx`
  - `src/shared/constants.ts`
  - `src/shared/types.d.ts`
  - `__tests__/resource-sync.test.ts`
  - `__tests__/connection-routing.test.ts`
- Chrome MV3 lifecycle contract: asynchronous listener registration is not guaranteed; service-worker timers can be cancelled and should use durable alarms.

### Completion Matrix

| Deliverable | Status | Evidence |
|---|---|---|
| Persist identity-only subscriptions and restore after revival | Partial | Persistence/loading exists at `resources.ts:259-267`, but listeners are registered after asynchronous loading and polling relies on `setInterval` at `resources.ts:374-416`. This is not MV3-revival safe. |
| Subscribe snapshots and sends current full value | Complete | `resources.ts:220-235, 436-454`; cookie fidelity covered by `resource-sync.test.ts:186-233`. |
| Unsubscribe stops pushes without remote deletion | Complete | `resources.ts:457-471`; behavior covered by `resource-sync.test.ts:235-259`. |
| Cookie changes push subscribed sets and ignore removals | Partial | Filtering and push behavior exist at `resources.ts:384-393`, but asynchronous listener registration can miss the event that revives the worker. |
| localStorage poll, pause, resume, and rescan | Partial | Pause/resume logic exists at `resources.ts:317-405`, but the worker timer is not a durable wakeup mechanism after unexpected termination. |
| Status returned and displayed | Partial | Status exists at `resources.ts:474-486` and panel rendering at `site-panel.tsx:115-159`; stale selection responses can display resources for the wrong selected origin, and prior errors are never cleared. |
| Stop sending while unauthorized; retry on reconnect | Complete | Authorization gate at `connection.ts:549-559`; reconnect refresh at `connection.ts:855-868`; direct behavior covered by `resource-sync.test.ts:336-366`. |
| Required tests pass | Partial | Guardrails unit suite passes, but no regression covers MV3 revival, stale site-load ordering, or recovery after a failed selection. |

### Review Axes
- **Spec axis worst finding:** live watches are not MV3 service-worker safe. `setInterval` can disappear on termination, while cookie/tab listeners are registered only after `await load()`.
- **Standards axis worst finding:** `selectOrigin` permits an older asynchronous site request to overwrite a newer selection, making stale rows actionable against the wrong origin.
- Standards pass: sequential fallback using the TypeScript, async/concurrency, universal-quality, and relevant code-smell guidance.
- Cross-axis ranking: none.

### Verification Status
- Goal achieved: **Partial**
- User goal: **Partially met** — direct subscribe/watch behavior works under the test process, but worker revival and two panel state transitions are incorrect.
- Scope adhered: Yes; additional routing/constants/locales changes support the phase.
- Out-of-scope changes: None identified.
- Actual extension/browser smoke: not performed; client application remains Phase 4/5 scope.

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
- Complexity: no new violations

### Findings

1. **MV3 lifecycle can lose live watches**
   - `src/background/apps/resources.ts:374-416`
   - Worker timers may be cancelled, and listeners registered after a promise are not guaranteed to receive revival events.
   - Violates the explicit worker-revival acceptance criterion.

2. **Stale site load can persist a subscription under the wrong origin**
   - `src/pages/resources/site-panel.tsx:201-215`
   - Site A can resolve after site B and replace the visible list while `selectedOrigin` remains B. Checking A’s stale row sends it with B’s origin.

3. **A failed selection permanently hides later successful results**
   - `src/pages/resources/site-panel.tsx:201-214`
   - Phase 3 removed `setError(null)`. A successful later load does not clear the prior error, so the render gate remains false.

### Documentation Impact
- No immediate living-documentation action. Phase 5 already owns end-to-end documentation after the implementation stabilizes.

### How-to Impact
- No immediate action. The resource-sync procedure is explicitly assigned to Phase 5.

### Issue Classification
- In-plan issues: 3
- Out-of-plan issues: none

### Verdict
**Needs work**

Iteration artifact written:

`.context/2026-09-22.host-site-resource-sync/iterate-host-site-resource-sync.md`

The artifact contains concrete fixes and required regressions for all three findings. Phase 3 should not advance until `/b-iterate` addresses it and this review is rerun.
