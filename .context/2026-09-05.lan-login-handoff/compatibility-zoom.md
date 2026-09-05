---
status: pending
date: 2026-09-05
phase: 3
application: zoom-web-app
target: app.zoom.us/wc
surface: Zoom Workplace Web App (signed-in)
verdict: unresolved (six-of-six pending live-browser observation)
topics: [zoom, okta-saml, web-app, session, device-limit, session-cookies]
related:
  - plan-lan-login-handoff.md
  - research-zoom-compatibility.md
  - compatibility-gate-summary.md
memory:
  - lan-login-handoff-implementation-2026-09-05.md
  - lan-login-handoff-planning-2026-09-05.md
  - lan-login-handoff-phasing-2026-09-05.md

---

# Zoom Workplace Web App — compatibility contract evidence (DRAFT, UNRESOLVED)

> Inherited user goal (from [plan-lan-login-handoff.md](plan-lan-login-handoff.md)):
> enable one person to use Zoom Workplace Web App from a Linux client using the
> Mac host's existing Zoom session, while the host remains signed in.

## Scope

This record covers **authenticated Zoom Workplace Web App** at
`https://app.zoom.us/wc`. The Zoom web portal, anonymous meeting join, the
native Workplace client, and OAuth/API grants are **not** substitute
targets per [research-zoom-compatibility.md](research-zoom-compatibility.md).

## What this record is — and what it is not

This record is a **public-doc-sourced summary of constraints**, not a
contract. No specific cookie names, JWT claim names, storage keys, or
URL subdomains are named here without a citation.

## Source-derived constraints (cited)

| # | Constraint category | Source | Property a contract must respect |
|---|---|---|---|
| C1 | Zoom supports SP- and IdP-initiated SAML SSO with Okta, with JIT provisioning | Okta Zoom SAML integration docs | The contract must include the Okta → Zoom round-trip for Case 1. |
| C2 | Zoom account/device management supports configurable concurrent-session limits and "sign out all devices" controls | Zoom admin docs | The contract must not trigger user-visible "sign out all devices" actions. |
| C3 | Zoom WebRTC traffic (in-meeting media) flows through a separate gateway with a separate auth token | Zoom docs | The contract for the Web App UI is **not** sufficient for in-meeting media. Media transport is out of scope. |

The cookie families (`zm_anon_id`, `zm_jsecure`, etc.) and the `app.zoom.us`
subdomain hierarchy are observable via public docs in
[research-zoom-compatibility.md](research-zoom-compatibility.md) but are NOT
named here without an observation that they are actually required for the
specific sign-in flow the user employs.

## Manifest state today

The current extension manifest contains no `cookies` permission. A contract
that relies on `chrome.cookies` API access at `zoom.us` or `app.zoom.us`
cannot proceed without manifest changes in a later phase.

## Verdict (this application, both cases)

- **Case 1**: **unresolved**. Public docs do not establish whether the user's
  account's concurrent-session setting allows the receiving client to
  establish a session without evicting the host.
- **Case 2**: **unresolved**. Same dependency on user-specific account
  configuration.

## Live-browser rows (required to resolve)

- [ ] Case 1, disposable Zoom account: host signs into `app.zoom.us/wc` via
      Okta SP-initiated flow, attempt the handoff on the client, observe
      whether the Web App shell renders without redirecting to
      `zoom.us/signin`, record non-secret before/after states.
- [ ] Case 2, same account, host already signed in: skip the SAML prompt
      path and attempt direct replay; record the same outcomes.
- [ ] Real account: separately authorized observation. Record whether
      the real account's session-cap setting allows the handoff to succeed.

## Out of scope (recorded for completeness)

WebRTC in-meeting audio/video transport. The contract delivers the signed-in
Web App shell; joining a meeting requires a separate media-session handoff
that is not in the parent plan.

## Decision

The six Zoom verdicts are all **unresolved**. Phase 8 is not authorized to
begin.

This record contains no specific cookie names, no JWT claim names, no
storage keys, no behavior claims attributed to "observed" — because no
observation has occurred in this session.