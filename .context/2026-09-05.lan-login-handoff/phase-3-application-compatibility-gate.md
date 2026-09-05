---
status: pending
pending_reason: "Six verdicts recorded as `unresolved`. Live-browser observation rows in each per-app record are empty. Phase 4 (which does not require supported verdicts) can begin independently per the plan's `depends_on: [2, 3]` and Phase 4's scope."
reverted_at: 2026-09-05T19:55Z
phase: 3
order: 3
plan: plan-lan-login-handoff.md
phases_overview: plan-lan-login-handoff-phases.md
difficulty: hard
model_hint: Strongest reasoning model available — auth-sensitive browser experiments, per-provider differences and strict unsupported boundaries
buck_hint: /b-build-hard
goal: "Determine, for Outlook web, Slack web and Zoom Web App, a permitted concrete client-completion contract or a precise unsupported/unresolved verdict while proving host preservation."
omp_execution: none
files:
  - .context/2026-09-05.lan-login-handoff/compatibility-outlook.md
  - .context/2026-09-05.lan-login-handoff/compatibility-slack.md
  - .context/2026-09-05.lan-login-handoff/compatibility-zoom.md
  - .context/2026-09-05.lan-login-handoff/compatibility-gate-summary.md
from_plan_steps: [3]
depends_on: [1]
dependency_type: HARD
acceptance_criteria:
  - "[ ] Outlook web has a concrete permitted completion contract or a specific unsupported/unresolved boundary covering both starting cases."
  - "[ ] Slack web has a concrete permitted completion contract or a specific unsupported/unresolved boundary covering both starting cases."
  - "[ ] Zoom Web App has a concrete permitted completion contract or a specific unsupported/unresolved boundary covering both starting cases."
  - "[ ] Every application record states required state category, minimal origins/permissions, account isolation, expiry/refresh observations and host before/after effects."
  - "[ ] Success is established only by the authenticated client application/account view after refresh/navigation while the host remains signed in; redirects, token visibility or ordinary client login do not count."
  - "[ ] No experiment replays one-time assertions, fakes device proof, defeats mandatory MFA/consent, logs credentials or logs out the persistent host."
  - "[ ] Unsupported requirements remain visible; no application is dropped, substituted or represented by a generic adapter stub."
completed_at: null
completed_by: null
memory:
  - lan-login-handoff-implementation-2026-09-05.md
  - lan-login-handoff-planning-2026-09-05.md
  - lan-login-handoff-phasing-2026-09-05.md

---

# Phase 3: Application Compatibility Gate

## Context

Inherited user goal (from [plan-lan-login-handoff.md](plan-lan-login-handoff.md)): enable one person to use Microsoft 365, Zoom and Slack web applications from another computer they own on a shared tailnet or internal LAN without repeated lengthy login/logout flows, using either the host's existing Okta authentication or its existing session in the requested application, while the host remains logged in.

This is the plan's decisive product-feasibility gate. Public documentation establishes normal SSO flows and browser constraints, but it does not establish that a usable Outlook, Slack or Zoom application session can be completed on another machine without a normal client login. This phase closes that evidence gap through isolated, explicitly authorized, non-secret observation. It writes compatibility contracts; it does not build application controllers.

Phase 1 is a HARD dependency because the application surfaces, test profiles and authorization boundary must be explicit first. This phase has no dependency on Phase 2 for mechanism discovery and can execute in parallel with it. Any later live handoff across the peer channel waits for Phase 2.

## Implementation Details

1. **Create one evidence record per application.** Write `compatibility-outlook.md`, `compatibility-slack.md` and `compatibility-zoom.md`. Each must use the exact target from the parent plan: Outlook on the web, a signed-in Slack web workspace, and authenticated Zoom Web App at `app.zoom.us/wc` (not portal-only and not anonymous meeting access).

2. **Define the two starting cases without disturbing the persistent host.**
   - Case 2: host already has the exact target application/account session.
   - Case 1: a separately prepared host test profile/state starts without the application session and follows the application's normal app → Okta → app flow, pausing for required human interaction.

   Never create Case 1 by logging out the persistent host profile. Never invoke provider-wide logout as setup or rollback.

3. **Identify candidate state categories — do not assume cookies.** For each application, determine what the receiving browser must possess for the authenticated application view to work: cookies, origin storage, server-mediated one-time continuation, extension/API-mediated state, or a combination. HttpOnly visibility does not establish portability. Reject any candidate that requires replay of a one-time assertion, forged device proof, bypass of mandatory provider checks or arbitrary whole-profile export.

4. **Bound the concrete completion contract.** A supported contract must name:
   - exact host and client origins;
   - exact state categories and transfer direction;
   - minimal Chrome permissions/APIs needed;
   - account/workspace/tenant binding and mismatch detection;
   - ordering/atomicity needs;
   - expiry/refresh behavior actually observed;
   - expected host-side effect;
   - client completion check after refresh/navigation;
   - cleanup limits.

   It must be specific enough that Phase 6 can implement it without inventing a generic blob API. If any element cannot be established, record `unresolved` with the missing observation rather than pretending the contract is complete.

5. **Run isolated authorized observations.** Follow the Phase 1 account/profile authorization matrix. Begin with disposable accounts/profiles. A real-tenant observation is separately gated and must not be inferred from a throwaway tenant. Provider-required MFA, consent or receiving-device proof is completed by the user or recorded as unsupported; the experiment never auto-clicks or represents host trust as device compliance.

6. **Verify host preservation and client success.** For each case/application, record non-secret before/after facts: host exact app/account view usable; client exact app/account view usable; client refresh/navigation outcome; host refresh/navigation outcome; observed duration only. A redirect, an Okta page, a token/cookie listing, transport delivery, API grant or ordinary manual client login does not count as success.

7. **Write the gate summary.** `compatibility-gate-summary.md` lists each application/case as `supported`, `unsupported` or `unresolved`, links to evidence records, and states the exact blockers. All three applications and both cases must be `supported` before Phase 6 can claim the feature's requested acceptance. Negative findings remain first-class output and must not be hidden by dropping a target.

## Risks

- **Credential handling.** Raw cookies, tokens, HAR files, browser-profile exports and authenticated request bodies are prohibited in source, logs and `.context/`. Record only state categories, origins, timestamps/durations and observable outcomes.
- **False success.** Ordinary SSO on the client proves only that login works, not that the host session helped. Success must use the identified completion mechanism and preserve host access.
- **Provider/device binding.** Okta FastPass and other device-bound proofs cannot be copied. Required receiving-device interaction is not a defect to bypass; it is either an explicit human step or an unsupported boundary.
- **Cross-tenant extrapolation.** A disposable environment does not prove the user's real tenant. Label evidence scope precisely.
- **Accidental host logout.** Cleanup must remove only PoC-created client/test-profile state. Never clear the persistent host session.

## Verification

- Review each application record against every acceptance field: both cases, required state, origin/permission scope, account binding, expiry, host effect and final client view.
- Confirm the summary has six explicit verdicts (three applications × two cases) and no omitted requirement.
- Confirm no raw auth material is present. Review any occurrence of `cookie`, `token`, `assertion`, `credential`, `Authorization`, `Set-Cookie`, `sdp` or `candidate` to ensure it describes only a category/prohibition.
- This phase is expected to be `.context/`-only. If it remains docs-only, skip code checks under the Deterministic Check Contract and state that. The proof is the authorized browser experiment and evidence record, not unit tests.
- Run `/b-review` against this file with explicit attention to false-positive success, authorization scope and host preservation.

## Per-Phase Execution Loop

If executing this phase inside an OMP execution session:
1. Run `/b-build-hard` for this phase only. (`omp_execution: none` — no keyword or `/goal set` precondition; start a plain first turn.)
2. Run `/b-review` against this phase file.
3. If review creates an `iterate-*.md` artifact (in-plan issues), run `/b-iterate`, then re-run `/b-review`. If review surfaces **out-of-plan issues** (new scope beyond this phase), do not iterate — route them to a separate `/b-plan` → `/b-build` follow-up; they do not block this phase. If `/b-review` flags documentation impact, run `/b-docs` before `/b-save`.
4. Run `/b-save` to consolidate memory, draft commits, and phase state.
5. Run `/b-commit` to checkpoint durable state.
6. If the phase is incomplete, leave `status: in-progress` so the session resumes here next turn.
