## Plan Path Review: Phase 3 — Subscriptions and live watches

### Plan Source
- File: `.context/2026-09-22.host-site-resource-sync/phase-3-resource-live-watches.md`
- Goal: Persist selected resource identities and continuously push subscribed host cookie/localStorage changes.
- Baseline: `7d98f38..7a6067d` — Phase 2 through committed Phase 3 implementation.

### Evidence Sources
- Git status at review start: clean.
- Reviewed commit: `7a6067d feat(resources): add persistent live subscriptions`
- Current implementation inspected:
  - `src/background/apps/resources.ts`
  - `src/background/connection.ts`
  - `src/pages/resources/site-panel.tsx`
  - `src/shared/constants.ts`
  - `src/shared/types.d.ts`
  - `public/manifest.json`
  - `__tests__/resource-sync.test.ts`
  - `__tests__/connection-routing.test.ts`
- Existing iteration artifact reopened:
  - `.context/2026-09-22.host-site-resource-sync/iterate-host-site-resource-sync.md`

### Completion Matrix

| Deliverable | Status | Evidence |
|---|---|---|
| Identity-only persistent subscriptions and revival | ✅ complete | Stored records are parsed and normalized at `resources.ts:266-275`; values are excluded. Revival listeners and alarm tests pass. |
| Subscribe snapshots and sends current full value | ✅ complete | Cookie snapshot and complete wire item at `resources.ts:290-313`; localStorage snapshot at `resources.ts:343-372`; routing at `connection.ts:549-604`. |
| Unsubscribe removes identity without remote deletion | ✅ complete | `resources.ts:514-529`; tests assert no `cookies.remove` and no later push. |
| Cookie live watch | ✅ complete | `resources.ts:420-432`; removal ignored, explicit/overwrite updates sent. |
| localStorage pause/resume and polling | 🔄 partial | Normal behavior exists, but independent refresh paths can race and leave an eligible subscription paused with its alarm cleared. |
| Status exposed in panel | ✅ complete | `resources.ts:531-544`; controlled checkbox, pause, and failure rendering at `site-panel.tsx:115-261`. |
| Unauthorized/disconnected persistence and reconnect refresh | ✅ complete | Authorization checked before every send at `connection.ts:549-559`; dirty-queued reconnect refresh at `resources.ts:397-418`. |
| Production bundle and deterministic checks | ✅ complete | Fresh production build succeeded; durable guardrails passed. |
| Real paired-browser observation | ⚠️ not-verifiable | Client apply belongs to Phase 4, so end-to-end observation remains intentionally deferred to Phase 5. |

### Review Axes
- **Spec axis worst finding:** In-plan concurrency defect in localStorage pause/resume.
- **Standards axis worst finding:** Same race, found during the sequential fallback pass using TypeScript, React/Preact, universal quality, async/concurrency, and relevant code-smell guides.
- Cross-axis ranking: none.

#### Blocking finding: overlapping localStorage refreshes can commit stale pause state

`refreshLocalStorage()` is called independently from tab events, alarms, subscription, and the queued reconnect refresh. At `resources.ts:348-369`, an active-tab refresh clears `paused` before awaiting `executeScript`. During that await, another refresh can observe no tab, add `paused`, and clear the alarm. The first refresh then completes without clearing `paused` again; `updatePollAlarm()` sees the stale paused state and leaves polling disabled.

Failure state: a same-origin non-incognito tab is open, but the item remains paused and receives no durable polling.

Recorded with a concrete fix and regression proposal in:

`.context/2026-09-22.host-site-resource-sync/iterate-host-site-resource-sync.md`

### Verification Status
- Goal achieved: **partial**
- User goal: **partially met** — normal subscription, push, persistence, uncheck, and reconnect paths work; concurrent tab lifecycle events can break localStorage resumption.
- Scope adhered: yes.
- Out-of-scope changes: none. Additional routing, alarm permission, locale, and connection test changes support Phase 3 behavior.

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
- Coverage: `91.40%`, baseline `91.07%`
- New complexity violations: none
- Production build: pass; worker and web bundles built with type checking enabled.

### User Goal Analysis
- Goal: Checking persists and pushes; host changes continue pushing; unchecking stops without deleting client copies.
- Met: persistence, cookie live updates, localStorage polling, outbound authorization, unsubscribe semantics, status UI, reconnect refresh.
- Partial: localStorage resume is vulnerable to overlapping refreshes.
- Missing: serialized or generation-safe localStorage lifecycle commits.
- Verdict: **partially met**

### Documentation Impact
- No immediate documentation impact. User-facing and architectural documentation is already assigned to Phase 5.
- Recommended: none for this review.

### How-to Impact
- No immediate how-to impact. End-to-end usage documentation remains Phase 5 scope.
- Recommended: none for this review.

### Issue Classification
- In-plan issues:
  1. Serialize or generation-guard localStorage refresh state and add the concurrent tab-transition regression.
- Out-of-plan issues: none.

### Verdict
**Needs work** — one in-plan concurrency defect remains.

### Supervisor Handoff
Run `/b-iterate` against `.context/2026-09-22.host-site-resource-sync/iterate-host-site-resource-sync.md`, then re-run this Phase 3 review.
