---
status: active
date: 2026-09-05
phase: 3
owner: orchestrator
verdict_set: [supported, unsupported, unresolved]
all_six_verdicts: unresolved
topics: [compatibility-gate-summary, outlook, slack, zoom]
related:
  - compatibility-outlook.md
  - compatibility-slack.md
  - compatibility-zoom.md
memory:
  - lan-login-handoff-implementation-2026-09-05.md
  - lan-login-handoff-planning-2026-09-05.md
  - lan-login-handoff-phasing-2026-09-05.md

---

# Application Compatibility Gate — Summary

> **All six full-case verdicts remain unresolved.** Slack Case 2 now has a verified local mechanism and a successful two-profile extension WebRTC handoff, including client reload/account checks and original-host preservation; physical Mac/Linux is still unverified. Outlook's real-account probe stopped at Microsoft authentication and remains paused. Zoom has no live compatibility proof. See [Slack evidence](slack-session-transport-experiment.json) and [the Outlook report](research-outlook-session-transport.md).

## Verdict matrix

| Application | Case 1 (host has no session → establish via app→Okta→app) | Case 2 (reuse existing host session) |
|---|---|---|
| Outlook on the web (`outlook.office.com`, `outlook.office365.com`, `outlook.cloud.microsoft`) | unresolved | unresolved — stopped at authentication boundary |
| Slack web (`app.slack.com`) | unresolved | unresolved cross-machine — local extension transfer passed |
| Zoom Workplace Web App (`app.zoom.us/wc`) | unresolved | unresolved |

## Why every cell is unresolved

Phase 3's implementation details (in `phase-3-application-compatibility-gate.md`)
make the observation requirement explicit:

- **Case 1** requires the host to actually sign into the target application via
  the app → Okta → app flow, pausing for required human interaction, and then
  the client to attempt the handoff. Whether that attempt succeeds depends
  on the user's tenant policy (Microsoft Entra CA policy for Outlook, Slack
  workspace device policies, Zoom account concurrent-session cap).
- **Case 2** requires the host to already be signed in and the client to
  attempt direct replay. Whether that succeeds depends on the same
  tenant/account configuration.

Neither case can be resolved by reading public docs alone, because the
tenant-specific configuration is the load-bearing factor. The public docs
constrain what a contract may do (no device-bound-factor bypass, no
provider-wide logout, no assertion replay); they do not determine whether
a specific replay is supported in a specific tenant.

## What this record contains — and what it does not

This summary and its per-application records ([compatibility-outlook.md](compatibility-outlook.md),
[compatibility-slack.md](compatibility-slack.md), [compatibility-zoom.md](compatibility-zoom.md))
contain:

- Cited public-doc constraints (sourced from the existing research notes).
- Actual non-secret state observations from bounded Outlook and Slack probes.
- Slack's optional cookies/scripting and exact host permissions, with explicit shared-session consent.
- Unsupported boundaries, including tenant/device policy and unobserved account shapes; no invented state names.
- Live-browser rows the user must fill before any verdict can move to
  `supported` or `unsupported`.

This record does NOT contain:

- Credential values, raw HAR/profile exports, or invented cookie/storage names.
- A claim that the stopped Outlook probe established authenticated client identity, mandatory MFA, or universal incompatibility.
- Generic adapter / stub contracts. Phase 3's phase file explicitly
  forbids them: "Unsupported requirements remain visible; the parent plan
  cannot complete." A `unresolved` row does not authorize a stub Phase 6/7/8.

## Phase 3 → Phase 4 / 5 dependency

Phase 4 (Scoped Control Cutover) depends on `[2, 3]` per the plan. With
Phase 3's six verdicts at `unresolved`, Phase 4's design constraint is
"the control plane must support an application payload that is
application-specific and may be `unsupported` for one or more providers".
Slack now extends the discriminated peer payload contract with bounded,
application-specific requests and replies. Other applications remain unsupported.

The user selected Slack ahead of Outlook. Its exact, explicitly permitted local
mechanism was verified before implementing the Phase 7 controller. This does not
close the physical-pair acceptance gates or justify generic export adapters for
unobserved applications/account shapes.

## Live-browser rows (user must complete to resolve any verdict)

- [ ] Case 1, disposable tenants for Outlook / Slack / Zoom.
- [ ] Case 2, same disposable tenants.
- [ ] Real tenant / workspace / account, separately authorized.
- [ ] Update each per-application record's "Live-browser rows" section
      with observed outcomes.
- [ ] Replace the verdict in this summary accordingly.

## Non-secret discipline

No token or cookie values, raw authenticated traffic exports, or profile dumps are retained. Outlook cookie/cache names are now backed by direct observations, not inference. Source-derived constraints remain distinct from measured behavior.

## Decision recorded by this evidence

Phase 3 remains active. Slack's existing-session local controller and real two-profile transfer are verified; physical Mac/Linux and Case 1 remain open. Outlook is paused and Zoom is untested. The local Slack result is not evidence for either other provider. Detailed scope, checks, review and remaining limits are in `slack-integration-plan.json`.