---
status: pending
phase: 6
order: 6
plan: plan-lan-login-handoff.md
phases_overview: plan-lan-login-handoff-phases.md
difficulty: hard
model_hint: Strongest reasoning model available — Outlook-specific auth-state handling, narrow permissions and two-machine host-preservation proof
buck_hint: /b-build-hard
goal: "Implement the evidence-backed Outlook web controller and prove both host starting cases reach the intended Linux mailbox while the macOS host remains signed in."
omp_execution: none
files:
  - public/manifest.json
  - src/background/apps/outlook.ts
  - src/background/sync.ts
  - src/pages/popup/index.tsx
  - src/pages/options/index.tsx
  - __tests__/outlook.test.ts
from_plan_steps: [6, 7]
depends_on: [2, 3, 4, 5]
dependency_type: HARD
acceptance_criteria:
  - "[ ] The Outlook controller maps exactly to the supported Phase 3 contract; unresolved/unsupported evidence leaves this phase open and creates no stub."
  - "[ ] Only Outlook-specific origins and optional permissions required by the contract are added; no whole-profile or unrelated Microsoft/Okta access."
  - "[ ] Case 2 reuses the exact host Outlook account; Case 1 uses normal host app-to-Okta sign-in with explicit human pauses; both converge on one client completion path."
  - "[ ] Completion applies only to the original intended client tab/account after request, connection, origin and deadline revalidation."
  - "[ ] The correct Outlook mailbox/account after Linux refresh/navigation and continued macOS host access are observed before success."
  - "[ ] Auth state remains bounded in memory/transit and never enters durable storage, logs, generic errors or artifacts."
  - "[ ] Wrong account/tab, permission denial, expiry, cancel, disconnect and required device interaction cause no unintended action."
completed_at: null
completed_by: null
memory:
  - lan-login-handoff-implementation-2026-09-05.md
  - lan-login-handoff-planning-2026-09-05.md
  - lan-login-handoff-phasing-2026-09-05.md

---

# Phase 6: Outlook Completion

## Context

Inherited user goal (from [plan-lan-login-handoff.md](plan-lan-login-handoff.md)): enable one person to use Microsoft 365, Zoom and Slack web applications from another computer they own on a shared tailnet or internal LAN without repeated lengthy login/logout flows, using either the host's existing Okta authentication or its existing session in the requested application, while the host remains logged in.

This is the first provider-specific vertical slice. It HARD-depends on the proven peer path, the Phase 3 compatibility contract, scoped request control and common host preparation. Outlook on the web is the only Microsoft 365 acceptance surface; Teams and SharePoint are not substitutes. If Phase 3 did not produce a complete permitted Outlook contract, record the unmet requirement and do not implement a placeholder or ordinary client-login fallback.

## Implementation Details

1. Add `src/background/apps/outlook.ts` only when the compatibility record is supported. Encode exact Outlook origins, state categories, account binding, expiry and final-view checks directly; avoid a generic credential/blob adapter.
2. Add only the optional host/API permissions named by the contract. Request at point of use where feasible. No `<all_urls>`, whole-profile inspection or unrelated Microsoft/Okta origins.
3. Use Phase 5 host preparation: prefer the exact existing Outlook session for Case 2; otherwise guide normal Outlook → Okta → Outlook sign-in in the host Chrome, pausing for explicit MFA/consent/device interaction. Both paths return the same Outlook preparation result.
4. Before sensitive transfer or client application, recheck active request/connection IDs, intended mailbox/account alias, original Linux tab/current URL, allowed return origin, cancellation and deadline.
5. Follow Phase 3 ordering/atomicity exactly. Keep sensitive state only in bounded request memory/transit and clear it on success, failure, cancel, disconnect and expiry. Never send it to logger/error details/storage/artifacts.
6. Verify the consumer-visible outcome: correct Outlook mailbox/account in the intended Linux tab after refresh/navigation. Then verify that the same macOS host Outlook account remains usable. Only then mark success.
7. Exercise wrong-account/tab, permission denial, malformed/oversized payload, expiry, cancellation, disconnect and provider-required interaction. Add behavior tests only where a plausible regression can be deterministically caught.

## Risks

- Microsoft/Okta state can be tenant- or device-bound; visibility is not portability.
- A generic Microsoft 365 success page is not the required Outlook mailbox/account.
- Partial state application must not widen permissions or fall back to a different account.
- Client success without post-refresh host usability fails the core requirement.

## Verification

- Run the resolved deterministic check contract, `pnpm typecheck` and `pnpm build:prod`; inspect final Outlook permissions.
- On the real Mac/Linux pair and authorized profiles, execute Outlook Case 1 and Case 2. Record non-secret start state, route, exact account alias, client result after refresh/navigation and host result afterward.
- Re-run each failure boundary above and confirm no late or wrong-scope action.
- Run `/b-review` against this phase, focusing on state lifetime, account/origin binding, minimum permissions and host preservation.

## Per-Phase Execution Loop

If executing this phase inside an OMP execution session:
1. Run `/b-build-hard` for this phase only. (`omp_execution: none` — start a plain first turn.)
2. Run `/b-review` against this phase file.
3. If review creates an `iterate-*.md` artifact (in-plan issues), run `/b-iterate`, then re-run `/b-review`. Out-of-plan issues use a separate `/b-plan` → `/b-build`; they do not block this phase. If review flags documentation impact, run `/b-docs` before `/b-save`.
4. Run `/b-save`.
5. Run `/b-commit`; one phase completion equals one commit.
6. If incomplete, leave `status: in-progress` for resume.
