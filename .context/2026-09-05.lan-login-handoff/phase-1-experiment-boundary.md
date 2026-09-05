---
status: in-progress
in_progress_at: 2026-09-05T19:42Z
in_progress_reason: "Preflight artifact drafted with `not observed` placeholders for every row the user must fill on the actual macOS host and Linux client; this orchestrator cannot reach the Linux box or a Tailscale-managed tailnet end. Awaiting user-supplied observed values to advance to review. ADR 0001 (docs/adr/0001-extension-only-transport.md) authorizes a Tart VM with bridged networking as the closest faithful Linux-client substitute."
phase: 1
order: 1
plan: plan-lan-login-handoff.md
phases_overview: plan-lan-login-handoff-phases.md
difficulty: easy
model_hint: Smaller/faster general model is sufficient — preflight capture and documentation, no source changes
buck_hint: /b-build
goal: "Record the exact experiment boundary — machines, browser versions, target surfaces, test accounts and route/policy category — so both feasibility gates run against a stated baseline instead of invented values."
omp_execution: none
files:
  - .context/2026-09-05.lan-login-handoff/preflight-experiment-boundary.md
from_plan_steps: [1]
depends_on: []
dependency_type: NONE
acceptance_criteria:
  - "[ ] Host and client rows record actual OS build and actual installed Chrome version for the macOS host and Linux client — observed, not assumed."
  - "[ ] Each of Outlook on the web, Slack web and Zoom Web App has a recorded exact surface URL, account/workspace/tenant identifier (non-secret alias form) and current host sign-in state."
  - "[ ] The route/policy category between host and client is recorded (direct LAN, tailnet, or blocked-unknown) without changing any firewall, Tailscale or browser-policy configuration."
  - "[ ] A disposable test account/profile decision is recorded per application: which gate steps may run against a throwaway profile, and which observation would require separately authorized real-tenant access."
  - "[ ] A Case 1 test-state preparation note states how a signed-out starting state will be produced WITHOUT logging out the persistent host session."
  - "[ ] The record contains no secrets: no cookies, tokens, passwords, full candidate addresses, SDP, or raw tenant credentials."
completed_at: null
completed_by: null
memory:
  - lan-login-handoff-implementation-2026-09-05.md
  - lan-login-handoff-planning-2026-09-05.md
  - lan-login-handoff-phasing-2026-09-05.md

---

# Phase 1: Experiment Boundary

## Context

Inherited user goal (from [plan-lan-login-handoff.md](plan-lan-login-handoff.md)): enable one person to use Microsoft 365, Zoom and Slack web applications from another computer they own on a shared tailnet or internal LAN without repeated lengthy login/logout flows, using either the host's existing Okta authentication or its existing session in the requested application, while the host remains logged in.

This phase exists because both feasibility gates — the transport gate (Phase 2) and the application-compatibility gate (Phase 3) — produce meaningless results without a stated baseline. The plan is explicit at step 1 and at its dependency shape: *"step 1 precedes both feasibility investigations."* Recording the boundary first is also what prevents the later phases from inventing Chrome versions, tenant identifiers or policy claims that were never observed.

This phase writes documentation only. It changes no source, runs no provider interaction, and touches no network or policy configuration.

## Implementation Details

Create `.context/2026-09-05.lan-login-handoff/preflight-experiment-boundary.md` with the following recorded observations.

1. **Machine and browser inventory.** For the macOS host and the Linux client, record OS name/version/build and the exact installed Chrome version string (`chrome://version`, or `google-chrome --version` on Linux). The plan's architecture assumes a Chrome 116+ API floor for `runtime.getContexts()`; state explicitly whether both machines clear that floor. If either does not, that is a finding for Phase 2, not a reason to add a legacy fallback.

2. **Target surface matrix.** One row per required application, from the plan's confirmed verification matrix:

   | Application | Exact surface | Account/workspace identifier (alias) | Host currently signed in? |
   |---|---|---|---|
   | Microsoft 365 | Outlook on the web | | |
   | Slack | Slack web workspace | | |
   | Zoom | Zoom Web App (`app.zoom.us/wc`) | | |

   Teams and SharePoint are **not** Microsoft acceptance targets. Zoom portal-only or anonymous meeting access is **not** equivalent to the Web App. Use non-secret alias forms for tenant/workspace identifiers.

3. **Route and policy category.** Record how the two machines can currently reach each other: direct LAN, shared tailnet, or unknown/blocked. Record the existing Tailscale state at a category level (is the tailnet up, is there an existing Serve mapping such as the user's OpenSSH forwarding). **Do not modify** any Tailscale, firewall or browser-policy setting to improve this answer — the point is to record the environment as it actually is, because Phase 2 must test the real route under existing policy.

4. **Test account and profile decisions.** Per application, record which of these applies:
   - runnable against a disposable test account / throwaway Chrome profile;
   - requires the real tenant and therefore needs separately authorized observation before any support claim.

   The plan permits disposable test accounts for initial no-pairing checks and requires separate authorization before claiming support in the real tenant. Record which gate steps fall on which side of that line.

5. **Case 1 starting-state preparation.** Write down the concrete method for producing a signed-out application state to exercise Case 1 (normal host SSO). The plan forbids manufacturing Case 1 by logging out the persistent host. Acceptable approaches include a separate Chrome profile or a prepared test-state profile. Record the chosen method.

6. **Non-secret discipline note.** Restate at the top of the file that this artifact holds identifiers and categories only — never cookies, tokens, SDP, ICE credentials, full candidate addresses or credentials.

## Risks

- **Invented values.** The main failure mode is writing plausible-looking versions or tenant names instead of observed ones. Every row must come from an actual command or an actual browser screen. If a value cannot be observed in this session, record it as `not observed` rather than guessing.
- **Scope creep into policy changes.** Discovering that the machines cannot reach each other is a *finding for Phase 2*, not a prompt to change firewall or Tailscale configuration here.
- **Secret leakage.** Preflight capture is where raw identifiers are most tempting to paste. Alias tenant/workspace names; never paste session values.

## Verification

- Read back `preflight-experiment-boundary.md` and confirm every acceptance-criteria row is filled with an observed value or an explicit `not observed`.
- Confirm `git status --porcelain` shows changes only under `.context/`. This phase is **docs-only** under the Deterministic Check Contract, so `guardrails.json` / lint / test gates are skipped — state that in the phase summary rather than running them.
- Confirm no secret material appears: grep the new file for `cookie`, `token`, `Bearer`, `sdp`, `candidate` and review any hit.

## Per-Phase Execution Loop

If executing this phase inside an OMP execution session:
1. Run `/b-build` for this phase only. (`omp_execution: none` — no keyword or `/goal set` precondition; start a plain first turn.)
2. Run `/b-review` against this phase file.
3. If review creates an `iterate-*.md` artifact (in-plan issues), run `/b-iterate`, then re-run `/b-review`. If review surfaces **out-of-plan issues** (new scope beyond this phase), do not iterate — route them to a separate `/b-plan` → `/b-build` follow-up; they do not block this phase. If `/b-review` flags documentation impact, run `/b-docs` before `/b-save`.
4. Run `/b-save` to consolidate memory, draft commits, and phase state.
5. Run `/b-commit` to checkpoint durable state.
6. If the phase is incomplete, leave `status: in-progress` so the session resumes here next turn.
