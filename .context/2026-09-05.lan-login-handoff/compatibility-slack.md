---
status: pending
date: 2026-09-05
phase: 3
application: slack-web
target: app.slack.com
surface: Slack web workspace (signed-in)
verdict: unresolved (six-of-six pending live-browser observation)
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

# Slack web — compatibility contract evidence (DRAFT, UNRESOLVED)

> Inherited user goal (from [plan-lan-login-handoff.md](plan-lan-login-handoff.md)):
> enable one person to use Slack web workspace from a Linux client using the Mac
> host's existing Slack workspace session.

## Scope

This record covers **signed-in Slack web** — the workspace UI reachable from
`app.slack.com`. Slack landing pages, the workspace chooser, OAuth/API grants
for third-party apps, Slackbot DMs, and any non-web client are **not** substitute
targets per the parent plan.

## What this record is — and what it is not

This record is a **public-doc-sourced summary of constraints**, not a contract.
No specific cookie names, header values, or origin-storage keys are named
here. Concrete names appear only after live observation in Phase 3's
live-browser rows.

## Source-derived constraints (cited)

| # | Constraint category | Source | Property a contract must respect |
|---|---|---|---|
| C1 | Slack uses SAML SSO plus cookies for browser sessions | Slack SAML docs | The contract must include the Okta → Slack round-trip for Case 1, and cookie transfer for Case 2. |
| C2 | Slack supports Single Logout (SLO) but does not control all session duration via the IdP | Slack docs | The contract must not assume the IdP logout terminates the Slack session; the client side must clear its own cookies. |
| C3 | Slack workspaces support device-session controls visible to the user | Slack admin docs | The contract must not trigger user-visible "sign out other sessions" controls. |
| C4 | Slack renders a workspace chooser on cold start unless a persistent workspace cookie is set | Slack client behavior | The contract must avoid the chooser detour; the precise mechanism is an observation outcome, not a public-doc fact. |

## Manifest state today

The current extension manifest contains no `cookies` permission. A contract
that relies on `chrome.cookies` API access at `slack.com` cannot proceed
without manifest changes in a later phase. This is recorded here because
Phase 3 must surface the prerequisite.

## Verdict (this application, both cases)

- **Case 1**: **unresolved**. Public docs do not establish that the
  receiving client can avoid the workspace chooser or bypass any
  device-session control that the user's workspace enforces.
- **Case 2**: **unresolved**. Same dependency on user-specific workspace
  configuration.

## Live-browser rows (required to resolve)

- [ ] Case 1, disposable Slack workspace: complete the SAML SSO sign-in on
      the host, attempt the handoff on the client, observe whether the
      client renders the workspace UI directly (no chooser detour), record
      non-secret before/after states and observed duration.
- [ ] Case 2, same workspace, host already signed in: skip the SAML prompt
      path and attempt direct replay; record the same outcomes.
- [ ] Real workspace: separately authorized observation. Record whether
      the workspace has device policies that block the handoff.

## Decision

The six Slack verdicts are all **unresolved**. Phase 7 is not authorized to
begin.

This record contains no specific cookie names, no header values, no
storage keys, no behavior claims attributed to "observed" — because no
observation has occurred in this session.