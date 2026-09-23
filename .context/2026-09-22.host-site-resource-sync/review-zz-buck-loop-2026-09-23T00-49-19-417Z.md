## Plan Path Review: Phase 1 resource wire contract

### Plan Source
- File: `.context/2026-09-22.host-site-resource-sync/phase-1-resource-wire-contract.md`
- Goal: Shared wire contract + permission foundation (optional hosts, identities, envelope kinds, authorized offscreen forward)
- Baseline: `HEAD` vs working tree (uncommitted). Last commit `eb0d465` is the phased plan, not this implementation.

### Evidence Sources
- Git status: modified `manifest.json`, `constants.ts`, `envelope.ts`, `offscreen/index.ts`, `envelope.test.ts`, `offscreen-commands.test.ts`, `vitest.config.ts`, phase docs; untracked `resources.ts`, `resources.test.ts`, `setup-promise.ts`
- Recent commits: plan-only at tip; implementation is uncommitted
- `peer.ts` not in the diff; `sendRequest(payload: PeerPayload)` already takes the union that now includes `resource_upsert`
- Guardrails: durable v2 **pass** (unit 0, lint 0, patch pass, ratchet 91.1 ≥ 91.07, complexity pass)
- `pnpm build:prod`: succeeded (web 2.82s, worker 2.85s)

### Completion Matrix

| Step | Status | Evidence |
|------|--------|----------|
| Manifest `*://*/*` in optional_host_permissions only | ✅ complete | `public/manifest.json` L34–35; `host_permissions` still pairing worker only |
| Identities + origin filter + permission builder | ✅ complete | `src/shared/lib/resources.ts` L21–31, L48–59; `__tests__/resources.test.ts` |
| MSG + payload kinds + closed error enum | ✅ complete | `constants.ts` L111, L121–122, L134–150, L183–188 |
| Envelope encode/parse, fail-closed | ✅ complete | `envelope.ts` parse unknown fields / missing origin / connectionId mismatch; tests L878–918 |
| 48 KiB item + 96 KiB envelope | ✅ complete | `RESOURCE_ITEM_MAX_BYTES`, encode L576–577, parse L405–406, `PEER_MAX_BYTES` L620/634; tests L451–454, L921–937 |
| peer `sendRequest` allow-through | ✅ complete | `peer.ts` L255–269 uses `PeerPayload`; no parallel send path |
| Offscreen forward iff authorized | ✅ complete | `offscreen/index.ts` L173–181, L119, L255–310 |
| envelope tests + existing suites | ✅ complete | guardrails `unit_gate: pass` |

### Review Axes
- Spec axis worst finding: none
- Standards axis worst finding (sequential fallback; no `task` tool): host `handleAppRequest` casts `p.item as ResourceUpsertPayload['item']` (`offscreen/index.ts` ~L296) instead of running `parseResourceItem` before send. Receive-side parse still fail-closed.
- Cross-axis ranking: none

### Verification Status
- Goal achieved: yes (contract layer; not user-visible)
- User goal: partially met at product level (inherited host-copy-live); **this phase’s** contract goal: met
- Scope adhered: yes (`peer.ts` unchanged is valid)
- Out-of-scope changes: `vitest.config.ts`, `__tests__/setup-promise.ts`, extra offscreen tests — support, not Slack behavior change

### Guardrails Verdict
- Contract: durable · version 2 · status **pass**
- Gates: unit=pass, functional=skipped, lint=pass (advisory/diff-scoped), patch=pass, global_ratchet=pass, complexity=pass

### User Goal Analysis
- Inherited: host picks site, copies cookies/localStorage live
- Met this phase: typed wire, caps, optional hosts, auth gate
- Missing: UI/worker apply (later phases)
- Verdict: phase met; product goal later

### Documentation Impact
- New domain language and wire kinds (`resource_upsert` / identities / `RESOURCE_*` MSG)
- Recommended: `/b-docs` before `/b-save` if CONTEXT/architecture should name this contract

### How-to Impact
- No how-to impact (nothing user-facing)

### Issue Classification
- In-plan issues → `/b-iterate`: none
- Out-of-plan: none (host outbound parse is polish, not phase AC)

### Verdict
**Pass with warnings** (standards: unparsed item on host send)

### Recommended Next Step
`/b-docs` if you want living docs now, then `/b-save` → `/b-commit`. No `iterate-*.md`.

---

Summary  
In-plan issues: none · Out-of-plan: none  
Warning: host app-request item not re-parsed before `sendRequest`  
Suggested next step: `/b-save` → `/b-commit` (optional `/b-docs` first)
