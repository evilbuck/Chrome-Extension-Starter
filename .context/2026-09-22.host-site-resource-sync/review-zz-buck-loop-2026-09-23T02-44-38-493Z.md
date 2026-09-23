## Plan Path Review: Phase 3 — Subscriptions and live watches

### Plan Source
- File: `.context/2026-09-22.host-site-resource-sync/phase-3-resource-live-watches.md`
- Goal: Persist host resource subscriptions, push current and changed values, pause localStorage polling without a host tab, and stop pushes after uncheck.
- Baseline: `7d98f38 feat(resources): add host site resource panel`

### Evidence Sources
- Git status: Phase 3 implementation and workflow artifacts are uncommitted.
- Recent relevant commits:
  - `7d98f38` — Phase 2 resource panel
  - `9e32a4e` — Phase 1 wire contract
- Modified implementation:
  - `src/background/apps/resources.ts`
  - `src/background/connection.ts`
  - `src/pages/resources/site-panel.tsx`
  - `src/shared/constants.ts`
  - `src/shared/types.d.ts`
  - `public/manifest.json`
  - locale files
  - `__tests__/resource-sync.test.ts`
  - `__tests__/connection-routing.test.ts`
- Reviewed current source, regressions, phase/parent plan, prior iteration, session memory, Chrome alarms documentation, and deterministic guardrails.

### Completion Matrix

| Deliverable | Status | Evidence |
|---|---|---|
| Persist identity-only subscriptions and restore them after worker revival | 🔄 partial | Persistence and startup loading exist at `resources.ts:261-269,433-445`. Revival does not reliably clear an already-existing durable alarm when every subscription becomes paused. |
| Subscribe snapshots and sends the current value with full cookie fields | ✅ complete | `resources.ts:221-235,463-483`; covered by `resource-sync.test.ts:192-239`. |
| Unsubscribe removes identity without a delete operation | 🔄 partial | No delete frame or browser removal exists at `resources.ts:486-500`, but an already-running localStorage refresh can still send after unsubscribe completes. |
| Cookie changes push subscribed sets and ignore removals | ✅ complete | `resources.ts:392-404`; covered by `resource-sync.test.ts:267-298`. |
| localStorage polling pauses and resumes with tab lifecycle | 🔄 partial | Pause/resume logic exists at `resources.ts:319-375`, but process-local `alarmScheduled` cannot detect and clear an alarm created by the previous worker instance. |
| `RESOURCE_STATUS` exposes checked, paused, and error state in the panel | ✅ complete | Worker status at `resources.ts:503-515`; panel behavior at `site-panel.tsx:190-254,298-345`; UI regressions at `resource-sync.test.ts:450-546,718-767`. |
| Unauthorized sending stops while subscriptions persist; reconnect refreshes | ✅ complete | Authorization boundary at `connection.ts:549-559`; reconnect refresh at `connection.ts:855-868`; regression at `resource-sync.test.ts:348-378`. |
| Required automated verification | ✅ complete | Fresh durable guardrails verdict passed. |
| Manual paired-client confirmation | ⚠️ not-verifiable | Client apply is intentionally Phase 4; the phase contract permits full confirmation to be deferred to Phase 5. |

### Review Axes
- **Spec axis worst finding:** A repeating localStorage alarm created by a previous worker instance remains active when revival finds all subscriptions paused. `alarmScheduled` resets to `false`, so `resources.ts:328-330` skips `chrome.alarms.clear()`.
- **Standards axis worst finding:** `refreshLocalStorage` snapshots subscriptions before asynchronous tab/storage reads and does not revalidate membership before sending. Unsubscribe can complete while the read is pending, followed by a stale upsert at `resources.ts:364-369`.
- Standards pass: sequential portable fallback using TypeScript, universal quality, common-bug, async/concurrency, and diff-relevant code-smell guides.
- Cross-axis ranking: none.

### Verification Status
- Goal achieved: **partial**
- User goal: **partially met** — normal subscribe/watch/status behavior exists, but two lifecycle races violate pause and uncheck semantics.
- Scope adhered: yes; supporting routing, alarm permission, locales, and tests are appropriate despite not all appearing in the phase’s abbreviated `files` list.
- Out-of-scope changes: none identified.

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
- Coverage: `91.20%`, above the `91.07%` ratchet.
- Functional gate is skipped because `functional_test_cmd` is null.

### User Goal Analysis
- Goal: Checking subscribes and pushes current/live values; unchecking stops future pushes without deleting client copies.
- Met: Persistent identities, current-value sends, cookie changes, localStorage normal pause/resume, status UI, and unauthorized retention.
- Partial:
  - Durable alarm reconciliation across worker instances.
  - Cancellation/revalidation of an in-flight localStorage refresh after unsubscribe.
- Missing: No other Phase 3 requirement found missing.
- Verdict: **partially met**

### Documentation Impact
- No immediate documentation impact. Phase 5 owns stabilized end-to-end documentation.
- Recommended: none for this iteration.

### How-to Impact
- No immediate how-to impact; the user-facing workflow cannot be completed until client apply lands.
- Recommended: none.

### Issue Classification
- In-plan issues:
  1. Clear a pre-existing durable polling alarm when worker revival finds every localStorage subscription paused.
  2. Prevent an in-flight localStorage refresh from sending after unsubscribe.
- Out-of-plan issues: none.

### Verdict
**Needs work**

Updated iteration artifact:

`.context/2026-09-22.host-site-resource-sync/iterate-host-site-resource-sync.md`

It is active and contains both defects, concrete fixes, and required regression scenarios.

### Recommended Next Step
`/b-iterate`, then re-run `/b-review` against the same Phase 3 contract.
