## Plan Path Review: Phase 3 — Subscriptions and live watches

### Plan Source
- File: `.context/2026-09-22.host-site-resource-sync/phase-3-resource-live-watches.md`
- Goal: Persist resource subscriptions, push current and changed host values while checked, pause/resume localStorage watches, and stop all pushes after uncheck.
- Baseline: Uncommitted implementation diff against `7d98f38` (`feat(resources): add host site resource panel`).

### Evidence Sources
- Modified implementation:
  - `src/background/apps/resources.ts`
  - `src/background/connection.ts`
  - `src/pages/resources/site-panel.tsx`
  - `src/shared/constants.ts`
  - `src/shared/types.d.ts`
  - `public/manifest.json`
  - locale messages
  - resource and routing tests
- Current-state inspection of worker lifecycle, routing, panel state, persistence, alarm handling, and tests.
- Durable guardrails run twice at a coherent checkpoint.
- No production `cookies.remove`, `localStorage.removeItem`, Slack `REQUEST_START`, or resource-value logging found.

### Completion Matrix

| Deliverable | Status | Evidence |
|---|---|---|
| Persistent identity-only subscription records and worker revival | 🔄 partial | Schema and startup loading exist at `src/shared/types.d.ts:37-42` and `resources.ts:265-269`; loading retains unknown fields, including possible stored values, rather than normalizing identities. |
| Subscribe persists and sends current full value | ✅ complete | Cookie/localStorage snapshot paths at `resources.ts:297-317,464-485`; behavior covered by resource and routing tests. |
| Uncheck removes identity and never deletes client data | 🔄 partial | No delete operation exists, but `pushCookie` can send an in-flight snapshot after unsubscribe completes at `resources.ts:297-300`. |
| Cookie changes push subscribed sets; removals do not unsubscribe/delete | ✅ complete | `resources.ts:393-405`; covered by cookie-change regression. |
| localStorage polling, pause/resume, completed-load rescan | 🔄 partial | Poll and tab lifecycle exist at `resources.ts:319-423`; revival with zero subscriptions can leave a durable alarm active because `refreshLocalStorage` returns before reconciliation. |
| `RESOURCE_STATUS` and panel checked/paused/error state | ✅ complete | `resources.ts:504-516`, `site-panel.tsx:164-352`; consumer-visible panel regressions pass. |
| Unpaired persistence and authorized reconnect refresh | ✅ complete | Send errors preserve subscriptions; host reconnect calls `resourceSync.refresh()` at `connection.ts:855-868`. |
| Named behavioral tests | ✅ complete | Guardrails unit gate passes with 450 tests. |
| Deterministic verification contract | ❌ missing | Required complexity gate fails on `refreshLocalStorage`, cyclomatic complexity 11 against maximum 10. |

### Review Axes
- **Spec axis worst finding:** An in-flight cookie lookup can emit an upsert after unsubscribe has completed, violating “unchecking stops pushes.”
- **Standards axis worst finding:** Required complexity gate fails for `refreshLocalStorage` at 11. Sequential fallback pass used TypeScript, Preact/React, universal quality, common-bug, async/concurrency, and diff-relevant smell guides.
- **Cross-axis ranking:** None; axes remain independent.

### Guardrails Verdict
- Contract: `durable`
- Contract version: `2`
- Status: `fail`, reproduced twice
- Gates:
  - `unit_test_gate=pass`
  - `functional_test_gate=skipped`
  - `lint_gate=pass`
  - `patch_gate=pass`
  - `global_ratchet=pass` — 91.20% current versus 91.07% baseline
  - `complexity_gate=fail`
- New violation: `src/background/apps/resources.ts::refreshLocalStorage`, complexity 11.

### Issue Classification

**In-plan issues: 4**

1. Revalidate cookie subscription membership after `cookies.getAll` and before sending.
2. Clear the durable poll alarm when revival loads zero localStorage subscriptions.
3. Normalize persisted records through `parseSubscription` so unknown/value fields cannot survive, appear in status, or be persisted again.
4. Refactor `refreshLocalStorage` below the repository complexity ceiling.

**Out-of-plan issues:** None.

Iteration artifact reopened and updated:

`.context/2026-09-22.host-site-resource-sync/iterate-host-site-resource-sync.md`

### Documentation Impact
- Persistent subscriptions, durable alarm polling, and pause/resume lifecycle are architecture/how-to changes.
- Documentation is explicitly assigned to Phase 5; no Phase 3 correctness blocker.

### User Goal Analysis
- Phase 3 outbound live-sync goal: **partially met** because stale cookie sends and durable-alarm cleanup remain incorrect.
- Parent end-to-end client application goal: intentionally deferred to Phases 4–5.

### Verdict

**Needs work** — four in-plan defects, including a reproducible required guardrail failure. The active iteration artifact contains concrete fixes and regression-test requirements for supervisor routing.
