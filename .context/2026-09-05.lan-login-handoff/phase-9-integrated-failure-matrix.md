---
status: pending
phase: 9
order: 9
plan: plan-lan-login-handoff.md
phases_overview: plan-lan-login-handoff-phases.md
difficulty: hard
model_hint: Strongest reasoning model available — adversarial cross-controller lifecycle, trust, privacy and direct-traffic verification
buck_hint: /b-build-hard
goal: "Re-run the complete six-scenario matrix and prove cross-cutting lifecycle, trust, privacy and direct-traffic failures on the real Mac/Linux build."
omp_execution: none
files:
  - .context/2026-09-05.lan-login-handoff/verification-matrix.md
  - src/background/connection.ts
  - src/background/sync.ts
  - src/background/apps/outlook.ts
  - src/background/apps/slack.ts
  - src/background/apps/zoom.ts
  - __tests__/messaging.test.ts
  - __tests__/storage.test.ts
from_plan_steps: [7]
depends_on: [6, 7, 8]
dependency_type: HARD
acceptance_criteria:
  - "[ ] The full Outlook/Slack/Zoom × Case 1/Case 2 matrix passes on the actual pair, or every unmet row remains explicit and prevents feature-complete status."
  - "[ ] Every row records actual non-secret environment, route, start state, client account after refresh/navigation and host state afterward."
  - "[ ] Popup/worker/offscreen/browser lifecycle, route loss, host unavailability, cancel, expiry and disconnect are truthful and never replay."
  - "[ ] Wrong sender/role/account/tab/origin plus malformed, oversized, duplicate, stale and expired messages cause no sensitive action."
  - "[ ] Provider-required interaction pauses or yields unsupported; no prompt is auto-approved."
  - "[ ] Client application traffic is direct and peer-data categories are bounded without retaining authenticated traffic captures."
completed_at: null
completed_by: null
memory:
  - lan-login-handoff-implementation-2026-09-05.md
  - lan-login-handoff-planning-2026-09-05.md
  - lan-login-handoff-phasing-2026-09-05.md

---

# Phase 9: Integrated Failure Matrix

## Context

Inherited user goal (from [plan-lan-login-handoff.md](plan-lan-login-handoff.md)): enable one person to use Microsoft 365, Zoom and Slack web applications from another computer they own on a shared tailnet or internal LAN without repeated lengthy login/logout flows, using either the host's existing Okta authentication or its existing session in the requested application, while the host remains logged in.

Phases 6–8 have already proved each application's vertical slice. This phase re-runs all six rows on one integrated build and concentrates on cross-cutting failures that individual controllers can mask. It may fix in-plan defects and repeat affected scenarios; it may not soften criteria or relabel ordinary client login/redirect/portal access as success.

## Implementation Details

1. Create `verification-matrix.md` with six required rows and actual OS/Chrome versions, route, aliases, start state, client result after refresh/navigation, host result afterward and observed duration.
2. Re-run Outlook, Slack and Zoom Case 1/Case 2 with the production unpacked build. Slack verification sends no message; Zoom starts no meeting.
3. Close/reopen popup and terminate/revive the worker during a healthy connection/request; UI must recover actual offscreen/request state.
4. Exercise browser/offscreen closure, route loss, host unavailable, expiry, cancel and explicit disconnect. Late packets/callbacks cannot resume work; reconnect is manual.
5. Submit wrong-role/context/sender, duplicate, expired, oversized and malformed envelopes; change client tab/account/workspace during requests. Confirm no unintended action.
6. Exercise explicit human-interaction paths for MFA/consent/device proof.
7. Verify direct client-to-provider traffic and bounded peer data using destination/categories only; retain no HAR, tokens, cookies or raw authenticated payloads.
8. Reproduce/fix/repeat in-scope implementation defects. Keep a regression test only for a plausible behavior boundary. Provider/policy incompatibility remains an unmet result.

## Risks

- Matrix bookkeeping can drift; record each outcome immediately.
- Sensitive packet capture is unnecessary and prohibited.
- An integrated regression may affect a previously passing app; repeat all rows after shared fixes.
- Partial matrix success does not complete the parent plan.

## Verification

- The completed durable matrix plus real browser observations is primary proof.
- After source fixes, run the resolved deterministic contract, `pnpm typecheck`, `pnpm build:prod`, reload the build and repeat affected/all shared scenarios.
- Run `/b-review` against this phase and matrix; mocked tests cannot substitute for the two-machine evidence.

## Per-Phase Execution Loop

If executing this phase inside an OMP execution session:
1. Run `/b-build-hard` for this phase only. (`omp_execution: none` — start a plain first turn.)
2. Run `/b-review` against this phase file.
3. For in-plan findings run `/b-iterate` then `/b-review`; out-of-plan issues use a separate plan/build cycle. Run `/b-docs` if review flags documentation impact.
4. Run `/b-save`.
5. Run `/b-commit`; one phase completion equals one commit.
6. If incomplete, leave `status: in-progress` for resume.
