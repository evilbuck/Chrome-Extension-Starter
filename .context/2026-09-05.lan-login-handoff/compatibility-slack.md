---
status: active
date: 2026-09-05
phase: 3
application: slack-web
target: app.slack.com
surface: Slack web workspace (signed-in)
verdict: unresolved
topics: [slack, saml, session, cookies, device-binding]
related:
  - plan-lan-login-handoff.md
  - research-auth-compatibility.md
  - compatibility-gate-summary.md
memory:
  - lan-login-handoff-implementation-2026-09-05.md
  - lan-login-handoff-planning-2026-09-05.md
  - lan-login-handoff-phasing-2026-09-05.md

---

# Slack web — locally verified contract; cross-machine verdict unresolved

> Inherited user goal (from [plan-lan-login-handoff.md](plan-lan-login-handoff.md)):
> enable one person to use Slack web workspace from a Linux client using the Mac
> host's existing Slack workspace session.

## Scope

This record covers **signed-in Slack web** — the workspace UI reachable from
`app.slack.com`. Slack landing pages, the workspace chooser, OAuth/API grants
for third-party apps, Slackbot DMs, and any non-web client are **not** substitute
targets per the parent plan.

## What this record is — and what it is not

This record combines public constraints with an explicitly authorized real-workspace
probe and an actual extension WebRTC transfer between two isolated Chromium
profiles on the same Linux machine. It does not establish physical Mac/Linux
compatibility or the normal host-sign-in starting case.

## Source-derived constraints (cited)

| # | Constraint category | Source | Property a contract must respect |
|---|---|---|---|
| C1 | Slack supports SAML SSO for browser sessions | Slack SAML docs | Case 1 follows normal host authentication. The state required for Case 2 must be observed rather than inferred from SAML support. |
| C2 | Slack supports Single Logout (SLO) but does not control all session duration via the IdP | Slack docs | The contract must not assume the IdP logout terminates the Slack session; the client side must clear its own cookies. |
| C3 | Slack workspaces support device-session controls visible to the user | Slack admin docs | The contract must not trigger user-visible "sign out other sessions" controls. |
| C4 | Workspace selection is part of the completion check | Live local probe and extension transfer | The intended account/workspace/enterprise matched after client reload and the original host remained authenticated. A chooser or landing page is not success. |

## Manifest state today

Required permissions remain `storage`, `tabs`, and `offscreen`. Slack adds
optional `cookies` / `scripting` and exact `https://slack.com/*` /
`https://app.slack.com/*` host permissions, requested by an explicit click.
Both browsers require separately recorded shared-session consent.

## Verdict (this application, both cases)

- **Case 1: unresolved.** Normal host SSO/sign-in followed by transfer was not
  exercised. No authentication or device challenge was bypassed.
- **Case 2: unresolved cross-machine; locally demonstrated.** The exact observed
  Enterprise Grid/member-account shape worked through the extension between two
  isolated profiles. Physical macOS-to-Linux identity/refresh/host preservation
  and device-policy effects remain unverified.

## Live-browser rows (required to resolve)

- [ ] Case 1, disposable Slack workspace: complete the SAML SSO sign-in on
      the host, attempt the handoff on the client, observe whether the
      client renders the workspace UI directly (no chooser detour), record
      non-secret before/after states and observed duration.
- [ ] Case 2, same workspace, host already signed in: skip the SAML prompt
      path and attempt direct replay; record the same outcomes.
- [x] Real workspace: separately authorized shared-session probe and local
      two-profile extension transfer; client and original host identities verified.
- [ ] Physical Mac/Linux real-workspace run and device-policy behavior.

## Decision

The user explicitly authorized shared Slack session credentials after the scope
warning. The local mechanism was verified before implementing the exact controller;
this is not a generic adapter or ordinary client-login substitute. Overall phase
acceptance remains open for the physical pair and both starting cases.

## Observed and implemented contract

- Only `d` and `d-s` cookies on `.slack.com`, plus minimal `localConfig_v2`
  entries for one enterprise and one bound member workspace/user. `ui`, IdP
  state, drafts, messages and general profile state are not exported.
- Workspace-only credential isolation is **not** promised: shared credentials
  may authorize broader Slack/Enterprise Grid access, as explicitly approved.
- Empty client profile required; an already-authenticated client is rejected.
  State is staged in an owned inert `app.slack.com/robots.txt` tab, then the
  intended app route is verified, reloaded and verified again. Host identity is
  rechecked before success.
- Peer requests bind source, connection, request ID and deadline. Cancellation
  invalidates delayed work; cleanup completes before another request can start.
- Cleanup uses nonce-salted ownership fingerprints held in extension session
  storage. A replacement cookie/account cache is preserved and reported as
  `cleanup_required`, rather than deleted. Cookie APIs are not atomic:
  concurrent manual Slack sign-ins remain outside this PoC's operating boundary.
- Independent checks after the actual transfer matched account/workspace/
  enterprise on the client and original host. A second transfer returned
  `client_not_empty` without destroying either session. No messages, reactions,
  sign-in/MFA/device checks, or workspace modifications were performed.
- Detailed evidence and remaining limits:
  [experiment checkpoint](slack-session-transport-experiment.json) and
  [implementation contract](slack-integration-plan.json).