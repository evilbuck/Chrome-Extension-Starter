---
status: pending
date: 2026-09-05
phase: 3
application: outlook-web
target: outlook.office.com / outlook.office365.com
surface: Outlook on the web (mail, calendar)
verdict: unresolved (six-of-six pending live-browser observation)
topics: [outlook, microsoft, entra-id, fastpass, conditional-access]
related:
  - plan-lan-login-handoff.md
  - research-auth-compatibility.md
  - compatibility-gate-summary.md
memory:
  - lan-login-handoff-implementation-2026-09-05.md
  - lan-login-handoff-planning-2026-09-05.md
  - lan-login-handoff-phasing-2026-09-05.md

---

# Outlook on the web — compatibility contract evidence (DRAFT, UNRESOLVED)

> Inherited user goal (from [plan-lan-login-handoff.md](plan-lan-login-handoff.md)):
> enable one person to use Microsoft 365 / Outlook on the web from a Linux client
> using the Mac host's existing Okta session.

## Scope

This record covers **Outlook on the web** — the mail + calendar web app at
`outlook.office.com` and `outlook.office365.com`. Microsoft Teams on the
web, SharePoint on the web, and any native Outlook client are **not** in scope
per the parent plan.

## What this record is — and what it is not

This record is a **public-doc-sourced summary of constraints**, not a contract
or implementation spec. Every concrete cookie name, state value, or
behavioral claim is either:

- cited to a public document already loaded into
  [research-auth-compatibility.md](research-auth-compatibility.md), or
- marked **unresolved — observation required**.

There is no live-browser observation in this session. Every verdict in the
six-row matrix is therefore `unresolved`. Naming cookies, naming storage keys,
naming JWT claims, or asserting specific user-visible behaviors without an
observation is **disallowed** at this stage and will be removed if it
appears.

## Source-derived constraints (cited)

The cited public-doc constraints are summarized in
[research-auth-compatibility.md §Hard limits and conditional blockers](research-auth-compatibility.md).
Each constraint below states the source category and the property the
implementation must respect, without naming cookies or values:

| # | Constraint category | Source | Property a contract must respect |
|---|---|---|---|
| C1 | Okta FastPass is device-bound on the receiving device | Okta FastPass docs | A client lacking the enrolled key cannot complete a FastPass-only flow. Any contract depending on FastPass must pause for explicit human completion or classify `unsupported`. |
| C2 | Microsoft Entra ID issues its own session, distinct from Okta | Okta + Entra docs | Okta success alone does not satisfy the Outlook target. The contract must include the Okta → Outlook round-trip. |
| C3 | Microsoft 365 Continuous Access Evaluation (CAE) re-evaluates policy on receiving IP/device | Entra docs | A successful cookie transfer may still trigger re-auth or device-compliance check on the receiving client. |
| C4 | Microsoft Token Protection browser preview is scoped to specific ARM web apps | Entra Token Protection docs | Do not generalize Token Protection to all Microsoft 365 web apps. Outlook web is not in that preview's coverage. |
| C5 | Outlook web uses both `outlook.office.com` and `outlook.office365.com` | Outlook web docs | A contract that targets only one origin will fail on the other. |
| C6 | Microsoft sign-in frequency and persistent-browser-session policy can re-auth the receiving client | Entra docs | Observed duration is required; the contract must record the actual re-auth interval, not assume infinite lifetime. |

The implementation may NOT add cookie names, header values, or origin-storage
keys here. Those belong in Phase 6 after live observation resolves which of
C1–C6 actually applies to the user's tenant.

## Candidate state categories (general only)

For an authenticated Outlook view to render on a receiving client, the
client must possess **at least one** of:

- **Replayed session**: cookies at `outlook.office.com` and `outlook.office365.com`
  that the server accepts. **No specific cookie names are named here.**
- **Replayed origin storage**: localStorage / sessionStorage / IndexedDB at the
  Outlook origin. **No specific keys are named here.**
- **Refreshed session**: a fresh OAuth round-trip on the receiving client that
  yields a new browser-side token. May require interactive consent.

HttpOnly visibility does not establish portability across machines; same-origin
partitioning can defeat naive cookie transfer; FastPass / device-bound factors
can defeat refresh-token replay.

## Manifest state today

The current extension manifest contains no `cookies` permission. A contract that
relies on `chrome.cookies` API access at Outlook / Entra origins cannot
proceed without manifest changes in a later phase. This is recorded here
because Phase 3 must surface the prerequisite, not silently assume it.

## Verdict (this application, both cases)

- **Case 1** (host has no Outlook session; sign in via app → Okta → app):
  **unresolved**. The compatibility record cannot be authored from public docs
  alone because the user-specific Entra tenant policy (CA policy, FastPass
  availability, sign-in frequency, persistent browser session setting) is
  required to determine whether the contract is `supported` or
  `unsupported`.
- **Case 2** (host already has Outlook session):
  **unresolved**. Same dependency on user-specific policy. Public docs do
  not establish whether a cookie + origin-storage replay is sufficient across
  a Microsoft 365 tenant with default CA + sign-in-frequency policy.

## Live-browser rows (required to resolve)

- [ ] Case 1, disposable tenant: navigate host Chrome to
      `outlook.office.com`, complete Entra sign-in, complete the handoff
      attempt on the client, observe whether the client inbox renders
      after `F5`. Record non-secret before/after states, observed duration
      before any CAE re-auth, and any interactive prompts.
- [ ] Case 2, same disposable tenant, host already signed in: skip the
      Entra prompt path and attempt direct replay; record the same outcomes.
- [ ] Real tenant: separately authorized observation; not extrapolated
      from disposable. Record the same outcomes plus the live CA policy and
      whether FastPass / device compliance blocked the handoff.

## Decision

The six Outlook verdicts are all **unresolved**. No implementation contract
is authored at this stage. Phase 6 is not authorized to begin against
unresolved verdicts; it waits on the live-browser rows above.

This record contains no cookie names, no JWT claim names, no session-storage
key names, and no behavior claims attributed to "observed" — because no
observation has occurred in this session.