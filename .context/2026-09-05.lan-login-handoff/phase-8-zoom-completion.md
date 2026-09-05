---
status: pending
phase: 8
order: 8
plan: plan-lan-login-handoff.md
phases_overview: plan-lan-login-handoff-phases.md
difficulty: hard
model_hint: Strongest reasoning model available — Zoom Web App versus portal/guest boundaries, device/session effects and host-preservation proof
buck_hint: /b-build-hard
goal: "Implement the evidence-backed Zoom Web App controller and prove both host starting cases reach the intended signed-in Linux Web App account while the macOS host remains signed in."
omp_execution: none
files:
  - public/manifest.json
  - src/background/apps/zoom.ts
  - src/background/sync.ts
  - src/pages/popup/index.tsx
  - src/pages/options/index.tsx
  - __tests__/zoom.test.ts
from_plan_steps: [6, 7]
depends_on: [7]
dependency_type: HARD
acceptance_criteria:
  - "[ ] The Zoom controller maps exactly to the supported Phase 3 contract; unresolved/unsupported evidence leaves this phase open and creates no stub."
  - "[ ] Only Zoom-Web-App-specific origins and optional permissions required by the contract are added; portal/native/guest access is not generalized."
  - "[ ] Case 2 reuses the exact host Zoom Web App account; Case 1 uses normal host app-to-Okta sign-in with explicit human pauses; both converge on one client path."
  - "[ ] Completion applies only to the original intended client tab/account after all scope and lifecycle checks."
  - "[ ] The signed-in Zoom Web App account after Linux refresh/navigation and continued macOS host access are observed before success; no meeting is started."
  - "[ ] Portal-only, anonymous guest join or native-app state never counts as Web App completion."
  - "[ ] Auth state remains bounded in memory/transit; device/session-limit effects and all non-success boundaries are visible."
completed_at: null
completed_by: null
memory:
  - lan-login-handoff-implementation-2026-09-05.md
  - lan-login-handoff-planning-2026-09-05.md
  - lan-login-handoff-phasing-2026-09-05.md

---

# Phase 8: Zoom Web App Completion

## Context

Inherited user goal (from [plan-lan-login-handoff.md](plan-lan-login-handoff.md)): enable one person to use Microsoft 365, Zoom and Slack web applications from another computer they own on a shared tailnet or internal LAN without repeated lengthy login/logout flows, using either the host's existing Okta authentication or its existing session in the requested application, while the host remains logged in.

This provider-specific vertical slice is intentionally separate because Zoom portal SSO, anonymous guest join, native-app authentication and signed-in Zoom Web App state are different surfaces. It follows Slack to serialize shared manifest/registry/UI integration. Unsupported/unresolved Phase 3 evidence remains an unmet requirement, not a stub or portal substitute.

## Implementation Details

1. Add `src/background/apps/zoom.ts` only for a supported Web App contract. Encode exact Web App origins (`app.zoom.us/wc` as the required surface), state categories, account binding, expiry/device-limit observations and final checks.
2. Add only contract-required optional permissions. Do not generalize portal, native-client or guest-meeting access and do not add unrelated Zoom/Okta origins.
3. Use Phase 5 host preparation: Case 2 verifies the exact host Web App account; Case 1 follows the normal application/tenant portal → Okta → authenticated Web App path with explicit human pauses. Portal landing alone does not complete preparation.
4. Recheck request/connection IDs, intended account/tenant alias, original Linux tab/current URL, allowed return origin, cancellation and deadline before every sensitive boundary.
5. Apply only the concrete contract. Keep state in bounded memory/transit, clear at every terminal outcome and never persist/log it.
6. Verify the signed-in Linux Zoom Web App account after refresh/navigation without starting a meeting. Then verify continued macOS host Web App access. Record any device/session-limit invalidation as failure rather than repairing it through logout.
7. Exercise portal-only landing, anonymous guest path, wrong account/tab, permission denial, expiry, cancel, disconnect and required device interaction. Re-smoke Outlook and Slack after shared integration edits.

## Risks

- Zoom's similarly named surfaces make false success likely; only authenticated Web App account state qualifies.
- Provider session/device limits may invalidate the host independently; observe and report rather than promise preservation.
- Verification must not start or join a meeting.
- Shared integration edits can regress earlier controllers; re-smoke both.

## Verification

- Run the resolved deterministic check contract, `pnpm typecheck` and `pnpm build:prod`; inspect final Zoom permissions.
- On the real pair, execute Zoom Case 1 and Case 2. Verify signed-in Web App account after client refresh/navigation and continued host access, without starting a meeting.
- Exercise portal/guest false-positive and lifecycle/failure boundaries; re-smoke Outlook and Slack.
- Run `/b-review` against this phase, focusing on surface discrimination, device/session effects, state lifetime and earlier-controller regressions.

## Per-Phase Execution Loop

If executing this phase inside an OMP execution session:
1. Run `/b-build-hard` for this phase only. (`omp_execution: none` — start a plain first turn.)
2. Run `/b-review` against this phase file.
3. If review creates an `iterate-*.md` artifact (in-plan issues), run `/b-iterate`, then re-run `/b-review`. Out-of-plan issues use a separate `/b-plan` → `/b-build`; they do not block this phase. If review flags documentation impact, run `/b-docs` before `/b-save`.
4. Run `/b-save`.
5. Run `/b-commit`; one phase completion equals one commit.
6. If incomplete, leave `status: in-progress` for resume.
