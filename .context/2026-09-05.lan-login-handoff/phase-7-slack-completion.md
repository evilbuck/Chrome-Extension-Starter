---
status: pending
phase: 7
order: 7
plan: plan-lan-login-handoff.md
phases_overview: plan-lan-login-handoff-phases.md
difficulty: hard
model_hint: Strongest reasoning model available — workspace/account isolation, Slack-specific auth state and two-machine host-preservation proof
buck_hint: /b-build-hard
goal: "Implement the evidence-backed Slack web controller and prove both host starting cases reach the intended Linux workspace/account while the macOS host remains signed in."
omp_execution: none
files:
  - public/manifest.json
  - src/background/apps/slack.ts
  - src/background/sync.ts
  - src/pages/popup/index.tsx
  - src/pages/options/index.tsx
  - __tests__/slack.test.ts
from_plan_steps: [6, 7]
depends_on: [6]
dependency_type: HARD
acceptance_criteria:
  - "[ ] The Slack controller maps exactly to the supported Phase 3 contract; unresolved/unsupported evidence leaves this phase open and creates no stub."
  - "[ ] Only Slack-workspace-specific origins and optional permissions required by the contract are added; no broad Slack/Okta/profile access."
  - "[ ] Case 2 reuses the exact host Slack workspace/account; Case 1 uses normal host app-to-Okta sign-in with explicit human pauses; both converge on one client path."
  - "[ ] Completion applies only to the original intended client tab/workspace/account after all scope and lifecycle checks."
  - "[ ] The authenticated Slack web workspace/account after Linux refresh/navigation and continued macOS host access are observed before success; no message is sent."
  - "[ ] Auth state remains bounded in memory/transit and never enters durable storage, logs, generic errors or artifacts."
  - "[ ] Wrong workspace/account/tab, permission denial, expiry, cancel, disconnect and required device interaction cause no unintended action."
completed_at: null
completed_by: null
memory:
  - lan-login-handoff-implementation-2026-09-05.md
  - lan-login-handoff-planning-2026-09-05.md
  - lan-login-handoff-phasing-2026-09-05.md

---

# Phase 7: Slack Completion

## Context

Inherited user goal (from [plan-lan-login-handoff.md](plan-lan-login-handoff.md)): enable one person to use Microsoft 365, Zoom and Slack web applications from another computer they own on a shared tailnet or internal LAN without repeated lengthy login/logout flows, using either the host's existing Okta authentication or its existing session in the requested application, while the host remains logged in.

This provider-specific vertical slice follows Outlook because both integrate through shared manifest/registry/UI files; sequencing avoids concurrent ownership. It otherwise uses the same proven transport, Phase 3 contract, scoped control and common host preparation. If Slack compatibility remains unsupported/unresolved, keep the requirement open and do not substitute ordinary client login or an adapter stub.

## Implementation Details

1. Add `src/background/apps/slack.ts` only for a supported Slack contract. Encode exact workspace origins, state categories, account/workspace binding, expiry and final-view checks directly.
2. Add only the optional permissions required by that contract, at point of use where feasible. Reject ambiguous multi-workspace state rather than selecting the first match.
3. Use Phase 5 host preparation: Case 2 verifies the exact existing host workspace/account; Case 1 follows normal Slack → Okta → Slack sign-in with explicit human pauses. Both produce the same Slack preparation result.
4. Before transfer/application, recheck active request/connection, intended workspace/account alias, original Linux tab/current URL, return origin, cancellation and deadline.
5. Apply the exact contract with its ordering/atomicity. Sensitive state exists only in bounded request memory/transit and is cleared at every terminal outcome.
6. Verify the intended authenticated Slack web workspace/account after Linux refresh/navigation using a read-only UI observation; do not send a message. Then verify continued macOS host access before success.
7. Exercise wrong workspace/account/tab, ambiguous profiles, permission denial, malformed/oversized payload, expiry, cancel, disconnect and provider interaction. Add only behavior-level regression tests.

## Risks

- Slack workspace and account identity are separate scope dimensions; both must match.
- A generic Slack landing page or workspace chooser is not success.
- Verification must be side-effect free: no message, reaction or workspace mutation.
- Shared manifest/registry edits can regress Outlook; re-smoke Outlook's already-demonstrated path after integration.

## Verification

- Run the resolved deterministic check contract, `pnpm typecheck` and `pnpm build:prod`; inspect Slack permissions and re-smoke Outlook.
- On the real Mac/Linux pair, execute Slack Case 1 and Case 2, recording only non-secret outcome fields. Verify client workspace/account after refresh/navigation and host access afterward; send no message.
- Exercise all failure boundaries above and confirm no stale/wrong-scope action.
- Run `/b-review` against this phase, focusing on workspace/account isolation, state lifetime, permission minimums and preservation of Phase 6 behavior.

## Per-Phase Execution Loop

If executing this phase inside an OMP execution session:
1. Run `/b-build-hard` for this phase only. (`omp_execution: none` — start a plain first turn.)
2. Run `/b-review` against this phase file.
3. If review creates an `iterate-*.md` artifact (in-plan issues), run `/b-iterate`, then re-run `/b-review`. Out-of-plan issues use a separate `/b-plan` → `/b-build`; they do not block this phase. If review flags documentation impact, run `/b-docs` before `/b-save`.
4. Run `/b-save`.
5. Run `/b-commit`; one phase completion equals one commit.
6. If incomplete, leave `status: in-progress` for resume.
