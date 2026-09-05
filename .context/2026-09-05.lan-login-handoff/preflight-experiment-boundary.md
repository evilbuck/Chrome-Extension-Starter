---
status: draft
date: 2026-09-05
phase: 1
subject: 2026-09-05.lan-login-handoff
owner: orchestrator
reviewed_by: null
filled_by_user: false
topics: [preflight, machine-inventory, chrome-version, target-surface, account-alias, route-policy, test-account, case-1-prep]
memory:
  - lan-login-handoff-implementation-2026-09-05.md
  - lan-login-handoff-planning-2026-09-05.md
  - lan-login-handoff-phasing-2026-09-05.md

---

# Preflight: Experiment Boundary

> Inherited user goal (from [plan-lan-login-handoff.md](plan-lan-login-handoff.md)):
> enable one person to use Microsoft 365, Zoom and Slack web applications from another computer they own on a shared tailnet or internal LAN without repeated lengthy login/logout flows, using either the host's existing Okta authentication or its existing session in the requested application, while the host remains logged in.

**Non-secret discipline.** This artifact holds identifiers, versions and categories only. It MUST NOT contain cookies, tokens, SDP, full ICE candidate addresses, `Set-Cookie` values, SAML assertions, raw profile exports or credentials. If any value below cannot be observed in this session, it is recorded as `not observed (requires user observation)` rather than guessed.

## 1. Machine and browser inventory

The macOS host row reflects values the orchestrator can observe on this machine directly. The Linux client row requires the user to populate on the actual Linux box because no Linux machine is reachable from this environment.

| Machine | OS name / version / build | Installed Chrome version (from `chrome://version` or `google-chrome --version`) | Chrome ≥ 116 floor for `runtime.getContexts()`? |
|---|---|---|---|
| macOS host (this machine) | macOS 26.6.2 (build 25G83), Darwin 25.6.0 arm64, Apple M4 Pro | `not observed (requires user observation)` — open `chrome://version` on the host Chrome that will run the extension and paste the top "Google Chrome" version line here | not observed |
| Linux client | `not observed (requires user observation)` — paste from the actual Linux box: `cat /etc/os-release`, `uname -r`, `google-chrome --version` | `not observed (requires user observation)` | not observed |

Findings to record once observed:

- Chrome version on the macOS host: `____________`
- Chrome version on the Linux client: `____________`
- If either is below 116: that is a Phase 2 finding (no legacy fallback will be added; the plan and `phase-2-extension-transport-gate.md` lock the floor at 116).
- If either is materially behind the other, the later Phase 2 path accepts that asymmetry — both endpoints must still pass the same floor.

## 2. Target surface matrix

Alias forms only. Tenant IDs, workspace IDs and account names are recorded as aliases, never as their full real value.

| Application | Exact target surface | Account / workspace / tenant alias | Host currently signed in? |
|---|---|---|---|
| Microsoft 365 | Outlook on the web (`outlook.office.com` or `outlook.office365.com`) | alias: `____________` | `yes` / `no` / `not observed` |
| Slack | Slack web workspace (`app.slack.com/client/…` or team subdomain) | alias: `____________` | `yes` / `no` / `not observed` |
| Zoom | Zoom Workplace Web App at `app.zoom.us/wc` | alias: `____________` | `yes` / `no` / `not observed` |

Explicit non-targets (do not substitute these for the row above):

- Microsoft 365: Teams on the web and SharePoint on the web are not this PoC's Microsoft acceptance targets.
- Slack: a generic Slack landing page or workspace chooser is not a signed-in Slack web workspace.
- Zoom: the Zoom web portal, anonymous guest join, native Workplace app, OAuth/API grants, and any meeting-started proof are not the authenticated Zoom Web App target.

## 3. Route and policy category

| Question | Observed category |
|---|---|
| How can the two machines currently reach each other? | `direct LAN` / `shared tailnet (Tailscale)` / `unknown / blocked` — `not observed (requires user observation)` |
| Is a Tailscale tailnet up? | `yes` / `no` / `not observed (requires user observation)` |
| Are there existing Tailscale Serve mappings? (The user mentioned an OpenSSH Serve mapping) | list existing mappings without altering them; do not capture tokens or shared secrets — `not observed (requires user observation)` |
| Chrome WebRTC enterprise policy on the host (`WebRtcIpHandling`, `WebRtcLocalIpsAllowedUrls`) | `not observed (requires user observation on `chrome://policy` and `chrome://flags`)` |

**Hard rule for this section.** Do not modify any Tailscale Serve mapping, firewall rule, browser policy or DNS setting to make this row look better. The plan explicitly forbids force-fitting the route; Phase 2 must record the real environment.

## 4. Test account and profile decisions

Per application, decide which of these applies:

- **A** = runnable against a disposable test account / throwaway Chrome profile.
- **B** = requires the real tenant and needs separately authorized observation before any support claim.

| Application | Account class for the transport gate (Phase 2) | Account class for the compatibility gate (Phase 3) | Notes |
|---|---|---|---|
| Outlook | A or B — `not observed (requires user observation)` | A or B — `not observed (requires user observation)` | |
| Slack | A or B — `not observed (requires user observation)` | A or B — `not observed (requires user observation)` | |
| Zoom | A or B — `not observed (requires user observation)` | A or B — `not observed (requires user observation)` | |

If class B is chosen for any row, the corresponding Phase 3 evidence record must be separately authorized and clearly labeled as a real-tenant observation rather than extrapolated from a disposable tenant.

## 5. Case 1 starting-state preparation

The plan forbids manufacturing Case 1 by logging out the persistent host. Choose exactly one acceptable approach and record it:

- **Separate Chrome profile** prepared on the host, distinct from the persistent host profile. Preferred.
- **Separate browser / container** running on the host, with no connection to the persistent host session.
- **Prepared test-state profile** stored under a clearly distinguishable name.

Chosen method: `____________ (not observed — requires user observation)`

Confirm the chosen method does NOT sign out or invalidate the persistent host's existing Outlook / Slack / Zoom sessions.

## 6. Cross-cutting observations

| Item | Value |
|---|---|
| Is this Mac host inside a managed firewall / corporate network that constrains outbound UDP? | `yes` / `no` / `not observed` |
| Does the user's Tailscale ACL currently allow direct peer-to-peer (not relayed)? | `not observed` |
| Has the user ever run two Chrome profiles simultaneously and observed Chrome WebRTC behavior between them? | `not observed` — relevant if Phase 2 ever needs a fallback two-profile-on-one-Linux test |

## 7. Hand-off to Phase 2 / Phase 3

Once every row above is filled with an observed value, Phase 2 may run on the macOS host with a Linux container or bare-metal Linux client substituted for the real Linux box (subject to the cross-machine feasibility verdict captured in `docs/adr/0001-extension-only-transport.md`), and Phase 3 may begin its isolated browser experiments under the authorization profile recorded in §4.

Until the user fills the `not observed` rows, Phase 1 cannot advance to `completed`. The phase frontmatter `status:` stays at `draft` and the parent `phase-1-experiment-boundary.md` `status:` stays at `in-progress`.

## 8. Checklist for the user completing this file

- [ ] Filled §1 with actual Chrome versions and OS builds from both machines.
- [ ] Filled §2 with non-secret aliases for Outlook / Slack / Zoom accounts and confirmed the host's sign-in state for each.
- [ ] Recorded §3 route and policy category without changing any Tailscale / firewall / browser policy.
- [ ] Decided §4 class A vs B per row.
- [ ] Chose §5 Case 1 starting-state method that does not log out the persistent host.
- [ ] Reviewed §6 cross-cutting items.
- [ ] Re-grepped this file for `cookie`, `token`, `Bearer`, `sdp`, `candidate`, `Authorization`, `Set-Cookie`, `assertion`, `credential` — every match describes a category or a prohibition, not a value.