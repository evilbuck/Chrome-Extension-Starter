---
status: pending
phase: 5
order: 5
plan: plan-lan-login-handoff.md
phases_overview: plan-lan-login-handoff-phases.md
difficulty: medium
model_hint: Capable general model preferred — cross-file orchestration with provider interaction and host-preservation constraints
buck_hint: /b-build
goal: "Implement common host-side application-first preparation: reuse the exact existing app session or guide normal host sign-in, then verify the requested account without disturbing unrelated host state."
omp_execution: none
files:
  - src/background/index.ts
  - src/background/sync.ts
  - src/background/runtime.ts
  - src/shared/constants.ts
  - src/shared/types.d.ts
  - src/pages/popup/index.tsx
  - src/pages/options/index.tsx
  - __tests__/messaging.test.ts
from_plan_steps: [5]
depends_on: [3, 4]
dependency_type: HARD
acceptance_criteria:
  - "[ ] Case 2 reuses only the exact verified host application/account session selected by the request."
  - "[ ] Case 1 opens the normal allowlisted application sign-in in the host Chrome, pauses visibly for MFA/consent/device proof and resumes only after explicit human completion."
  - "[ ] Both cases converge on the same verified application/account preparation result defined by the Phase 3 contract."
  - "[ ] Ambiguous account/workspace/tenant, wrong origin, changed tab, timeout, cancel or provider requirement produces a visible non-success outcome without broad fallback."
  - "[ ] Existing unrelated host tabs and sessions remain usable; no provider-wide logout, auto-approval or receiving-device-compliance claim occurs."
  - "[ ] Zoom preparation reaches the authenticated Zoom Web App target; portal SSO alone is not reported as prepared."
completed_at: null
completed_by: null
memory:
  - lan-login-handoff-implementation-2026-09-05.md
  - lan-login-handoff-planning-2026-09-05.md
  - lan-login-handoff-phasing-2026-09-05.md

---

# Phase 5: Host Application Preparation

## Context

Inherited user goal (from [plan-lan-login-handoff.md](plan-lan-login-handoff.md)): enable one person to use Microsoft 365, Zoom and Slack web applications from another computer they own on a shared tailnet or internal LAN without repeated lengthy login/logout flows, using either the host's existing Okta authentication or its existing session in the requested application, while the host remains logged in.

Phase 3's supported compatibility contracts and Phase 4's request/trust state machine are HARD dependencies. This phase implements the shared host-side half of the application-first workflow. It ends at a verified, narrowly scoped host preparation result; it does not transmit or apply application state on the client.

## Implementation Details

1. **Consume only supported Phase 3 contracts.** For each application, expose host preparation only if its compatibility record defines a concrete permitted contract. Unsupported/unresolved targets stay disabled or return `unsupported` with a non-sensitive reason category. Do not create placeholder controllers.

2. **Resolve exact request scope.** Before touching a tab, revalidate active request ID, peer connection ID, application key, account/workspace/tenant alias, allowed origins and deadline. Find or open only the allowlisted application surface. Ambiguous multiple accounts/tabs are a visible `account_mismatch`/failure, not a guess.

3. **Implement Case 2 first.** Inspect the exact host application's observable authenticated view/state using only the Phase 3-approved mechanism and permissions. Verify the requested account/workspace/tenant. If the exact application session is usable, produce the application-specific preparation result and continue through the shared boundary.

4. **Implement Case 1 as normal host sign-in.** When the exact application session is absent, open the allowlisted application's normal sign-in surface in the host's Chrome and transition to `preparing_host`. Allow its normal application → Okta → application redirects. On MFA, consent or device proof, transition to `waiting_for_user` and require explicit human completion. Never auto-click approval, copy a device-bound proof or frame this as monitoring evasion.

5. **Verify after sign-in.** Resuming from `waiting_for_user` requires an explicit user action/status check and a fresh verification of exact final application origin/account. An Okta session, a redirect chain or portal landing is insufficient. For Zoom, final preparation must correspond to authenticated Zoom Web App state; portal SSO alone fails the check.

6. **Converge both cases.** Case 1 and Case 2 return the same per-application preparation contract from Phase 3, including freshness/expiry and account binding. The downstream Phase 6 client controller must not care which path produced it, except for user-visible history/status.

7. **Protect host state.** Never close or mutate unrelated tabs. Close only PoC-created transient tabs when safe and only after verifying the user no longer needs them. Never perform provider-wide logout as failure cleanup. Cancel/expiry invalidates downstream use but cannot undo a provider action already completed; report that state accurately.

8. **Test behavioral boundaries.** Add deterministic tests only for orchestration/state behavior: Case 2 preferred when exact session exists; Case 1 pause/resume; ambiguous account rejection; stale callback after cancel/navigation; Zoom portal-not-Web-App rejection. Browser/provider success itself remains a real-browser smoke check.

## Risks

- **Wrong-account action.** Host profiles can contain several tenants/workspaces. Exact verification is mandatory at entry and before returning the preparation result.
- **Provider UI automation.** This phase orchestrates navigation but never approves MFA/consent/device prompts. Human interaction is a first-class paused state.
- **Host disruption.** Cleanup that logs out or clears host state violates the core goal even if client completion later works.
- **Contract drift.** Host code must use Phase 3's state category/origin rules rather than rediscovering a looser mechanism.

## Verification

- Run the resolved deterministic check contract plus `pnpm typecheck` and `pnpm build:prod`.
- In a disposable/authorized host profile, smoke both cases for each Phase 3-supported target. Confirm final exact app/account, pause/resume behavior and unrelated tab/session preservation. Do not claim unsupported Phase 3 targets.
- Exercise cancel, expiry, changed tab, wrong account and required provider interaction; verify no broad logout or late continuation.
- Run `/b-review` against this phase with emphasis on exact account scoping, human-interaction pauses and host preservation.

## Per-Phase Execution Loop

If executing this phase inside an OMP execution session:
1. Run `/b-build` for this phase only. (`omp_execution: none` — no keyword or `/goal set` precondition; start a plain first turn. Escalate to `/b-build-hard` if provider/contract ambiguity appears.)
2. Run `/b-review` against this phase file.
3. If review creates an `iterate-*.md` artifact (in-plan issues), run `/b-iterate`, then re-run `/b-review`. If review surfaces **out-of-plan issues** (new scope beyond this phase), do not iterate — route them to a separate `/b-plan` → `/b-build` follow-up; they do not block this phase. If `/b-review` flags documentation impact, run `/b-docs` before `/b-save`.
4. Run `/b-save` to consolidate memory, draft commits, and phase state.
5. Run `/b-commit` to checkpoint durable state.
6. If the phase is incomplete, leave `status: in-progress` so the session resumes here next turn.
