## Plan Path Review: Phase 4 client apply

### Plan Source
- File: `.context/2026-09-22.host-site-resource-sync/phase-4-resource-client-apply.md`
- Goal: Client role applies inbound resource upserts (cookie fidelity, localStorage via reused or auto-opened tabs) and acks or errors; host never applies.
- Baseline: uncommitted diff on `c4d9da5` (Phase 3 pause fix). Phase file checkboxes are not evidence.

### Evidence Sources
- Git status: unstaged changes in `resources.ts`, `connection.ts`, `resource-sync.test.ts`, `connection-routing.test.ts`, plus phase/memory docs. Nothing staged.
- Recent commits: Phase 3 `c4d9da5`, Phase 3 feature `7a6067d`. Phase 4 is not committed.
- Modified files: the three phase files, plus `connection-routing.test.ts` for the routing step.
- Plan affected files verified: yes.

### Completion Matrix

| Step | Status | Evidence |
|------|--------|----------|
| 1. Route inbound `resource_upsert` to the client only; do not use the Slack pipeline | ✅ complete | `connection.ts:970-972` dispatches `RESOURCE_UPSERT` to `handleResourceInbound`, not `handleAppInbound`. Host, unauthorized, and mismatched `connectionId` return `resource_error` and do not call `cookies.set` (`connection.ts:793-810`; `__tests__/connection-routing.test.ts:690-741`). |
| 2. Cookie apply with host-only omission, partition, session/expiry | ✅ complete | `cookieDetails` (`resources.ts:733-746`) passes name, value, path, secure, httpOnly, sameSite, partitionKey; domain only if it starts with `.`; no `expirationDate` when absent. Send side `wireCookieDomain` (`resources.ts:229-233`) prefixes non-host-only domains. Tests: `resource-sync.test.ts:667-732`, `867-902`. |
| 3. localStorage reuse or one background tab, wait for complete, `setItem` | ✅ complete | `openDocument` (`resources.ts:815-824`) reuses a tracked tab, else a same-origin non-incognito tab, else `tabs.create({ url: origin + '/', active: false })`. `waitForDocument` (`resources.ts:771-799`) blocks `executeScript` until complete. Test: `resource-sync.test.ts:800-828`. |
| 4. Close only feature-opened tabs, and only after the last applied key is released | ✅ complete | `releaseLocalStorage` (`resources.ts:918-929`) removes only an id in the `opened` map, and only when the held set for that origin is empty. User-tab path never enters `opened`. Tests: `resource-sync.test.ts:823-845`. Phase verification explicitly excludes a host-uncheck close frame. |
| 5. Ack `resource_applied`; errors use the closed enum | ✅ complete | `appliedReply` / `errorReply` (`resources.ts:719-731`). Enum is `permission_denied \| oversized \| no_document \| disconnected \| malformed \| failed` (`constants.ts:134-149`). Authorized client cookie path returns `resource_applied` (`connection-routing.test.ts:744-798`). |
| 6. Oversize or malformed rejects with no partial write | ✅ complete | Size check is before parse/write (`resources.ts:711-713`). Tests assert no `cookies.set`, `tabs.create`, or `executeScript` (`resource-sync.test.ts:735-797`). |
| 7. Required behavior tests, synthetic values only | ✅ complete | The four cases are in `describe('client resource apply')`. Guardrails unit gate passed (exit 0). Fixtures use `syn-*` / `synthetic-*` values. No logger calls in the new apply path. |

### Review Axes
- Spec axis worst finding: none.
- Standards axis worst finding: duplicated fail-closed cookie/item parse. `parseCookieApplyItem` (`resources.ts:678-700`) reimplements `parseCookieItem` (`envelope.ts:357-399`) with a different error style. Drift here changes which cookie gets written. Sequential fallback — this harness has no background `task` tool.
- Cross-axis ranking: none.

### Verification Status
- Goal achieved: yes, against this phase's unit contract.
- User goal: partially met — apply works when the client already has optional `cookies` + `scripting` + origin. A fresh client profile has no grant path. That is outside this phase (see out-of-plan).
- Scope adhered: yes. `wireCookieDomain` is the send half of the host-only rule, not extra scope. No `slack.ts` edits.
- Out-of-scope changes: none.

### Guardrails Verdict
- Contract: durable
- Contract version: 2
- Status: pass
- Gates: unit_test_gate=pass (exit 0), functional_test_gate=skipped, lint_gate=pass (diff-scoped, 50 files, exit 0), patch_gate=pass (patch measurement `null`), global_ratchet=pass (91.4 ≥ 91.07), complexity_gate=pass (hotspots 64 vs baseline 62, `new_violations` empty)

### User Goal Analysis
- Goal: host picks a site and copies chosen cookies/localStorage onto the paired client, live while checked. This phase is only the client receive side.
- Met: authorized client apply, field fidelity, tab reuse, fail-closed role/auth/oversize/malformed, acks.
- Partial: live two-profile copy. Phase 5 owns that smoke.
- Missing: nothing this phase's verification requires.
- Verdict: met for Phase 4. Parent user goal is not closed until Phase 5, and Phase 5 smoke will hit the permission gap below.

### Documentation Impact
- New wire constraint: host-only is "domain does not start with `.`". Chrome's raw `cookie.domain` has no leading dot, so `wireCookieDomain` prefixes domain cookies. That rule is not in the AGENTS.md conventions block. A later sender that forwards `cookie.domain` unchanged will be applied as host-only.
- Recommended: `/b-docs` before `/b-save`.

### How-to Impact
- No how-to impact for this phase. The user-facing how-to is Phase 5's acceptance criterion (`docs/howto/sync-site-resources.md`).

### Issue Classification
- In-plan issues (implementation defects → `/b-iterate`): none.
- Out-of-plan issues (scope discoveries → fresh `/b-plan`):
  1. Client grant. Apply calls `hasPermission` (`resources.ts:913`) for `{ permissions: ['cookies', 'scripting'], origins: [origin/*] }`. That grant is requested only from the host options panel (`site-panel.tsx:73`; options shows the panel only when `role === 'host'`). `permissions.request` needs a user gesture, so an inbound frame cannot grant it. A fresh client fails closed with `permission_denied` and writes nothing. Do not remove the check — without it `cookies.set` / `executeScript` still fail, and the check is what stops a paired host from opening tabs before the user allows that origin. Phase 5 step 4 will not pass until a client grant exists.
  2. Tab close has no production caller. `releaseLocalStorage` is tested and only removes feature-opened tabs, but `connection.ts` never calls it. Phase verification says a host-uncheck close needs a new wire frame and is not this phase. Auto-opened tabs stay open for the life of the client profile.

### Verdict
Pass — no in-plan defects. Out-of-plan findings do not change this verdict.

### Recommended Next Step
Close this phase: `/b-docs` (leading-dot host-only convention) → `/b-save` → `/b-commit`. Then `/b-plan` the client permission grant before treating Phase 5 smoke as viable. Do not `/b-iterate` this phase.

Summary
Documentation impact: flagged — run `/b-docs` before `/b-save`
How-to impact: none for this phase (Phase 5 owns the how-to)
Suggested next step: `/b-docs` → `/b-save` → `/b-commit`, then a follow-up `/b-plan` for the client origin grant before Phase 5 smoke
