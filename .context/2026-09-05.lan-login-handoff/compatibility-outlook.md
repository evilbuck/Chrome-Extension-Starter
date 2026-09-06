---
status: active
date: 2026-09-05
updated: 2026-09-06
phase: 3
application: outlook-web
target: outlook.office365.com / outlook.office.com / outlook.cloud.microsoft
surface: Outlook on the web
verdict: unresolved
topics: [outlook, microsoft, session-portability, canonical-domain, authentication-boundary]
related:
  - plan-lan-login-handoff.md
  - research-auth-compatibility.md
  - real-outlook-transport-experiment.json
  - outlook-read-only-inspection.json
  - compatibility-gate-summary.md
memory:
  - lan-login-handoff-implementation-2026-09-05.md
  - lan-login-handoff-planning-2026-09-05.md
  - lan-login-handoff-phasing-2026-09-05.md
---

# Outlook on the web — unresolved compatibility

## Current outcome

A separately authorized real-account Case 2 probe copied bounded Outlook state into an isolated client. The client then requested authentication at `https://login.microsoftonline.com`. The request was blocked, and the experiment stopped as agreed. No sign-in/MFA flow was completed and no broader identity-provider credentials were copied.

**This does not establish a complete handoff.** The client account was not independently verified, and neither client-refresh success nor host-refresh preservation was demonstrated. The live host still showed its mailbox UI without a visible authentication prompt; it was not refreshed. The isolated client was closed and its temporary browser state removed.

Detailed non-secret evidence: [real-outlook-transport-experiment.json](real-outlook-transport-experiment.json).

## Authorization and environment

- The user identified `outlook.live.com` as a disposable consumer account and the open `outlook.office365.com` tab as the real account.
- The user first authorized passive inspection, then explicitly chose real-account session transport instead of a trial, with an immediate stop on logout or re-authentication.
- The user authorized a corrected probe after an initial guard stopped an unidentified off-origin redirect. No authentication rejection had been established by that first stop.
- Observed browser: Chromium 151.0.7922.173 on Arch Linux. The receiving client was a fresh isolated context in the same browser, not the planned remote Mac/Linux peer.
- No whole-profile export, mailbox-message inspection, IdP-cookie transfer, device-key copying, provider logout, policy change, or MFA completion was performed.
- This was a temporary local DevTools feasibility probe, **not extension/WebRTC authentication transport**.

## Observed application state

The host contained one MSAL account and one client-application ID. One unexpired cached access token had an Outlook audience and no `cnf` claim. That observation alone does not prove portability or rule out server-side conditional access.

Observed source cookies included HttpOnly `OIDC`, `UC`, and `OWAAppIdType`; other selected Outlook cookies were `ClientId`, `x-ocditid`, `DefaultAnchorMailbox`, and `msal.cache.encryption`. Cookie values were never written to artifacts or tool output.

The `OIDC` values on the two legacy Outlook hostnames matched in local memory. The source had no cookies for `outlook.cloud.microsoft` at inspection time. Observed MSAL index names used the `msal.3` namespace; an early probe omitted those indexes and was corrected before the canonical-origin probe.

## Canonical-domain correction

The client navigation actually followed:

`outlook.office365.com` → `outlook.cloud.microsoft`

The first single-origin guard failed to retain the blocked destination. The corrected trace established the canonical Outlook redirect, **not an authentication failure**. [Microsoft's domain-migration documentation](https://learn.microsoft.com/en-us/microsoft-365/enterprise/cloud-microsoft-domain?view=o365-worldwide) confirms that Outlook is moving to `cloud.microsoft`. An Outlook implementation must account for this exact hostname rather than relying only on the legacy `.com` hosts. This is not permission for a wildcard Microsoft-domain grant.

## Final candidate and result

The isolated canonical-origin probe used:

- Nine selected cookie records from the two legacy Outlook origins, preserving their attributes and expiry.
- Three experimental canonical-host mappings: `OIDC`, `ClientId`, and `msal.cache.encryption` from the source Outlook origin to `outlook.cloud.microsoft`.
- Six matching local-storage entries: the Outlook access-token entry, matching ID-token/account/active-account entries, and filtered account/token indexes.
- No refresh token; no Graph, Teams, SharePoint, or Okta credential entries; no IndexedDB/device-key export.

The client reached `outlook.cloud.microsoft`, and the probe's own marker confirmed that the six cache entries were installed. Two selected Outlook service responses returned HTTP 2xx; response semantics and the client account were not independently established by those status codes. The client then made a non-discovery authentication request to `login.microsoftonline.com`. The guard blocked it and disabled further client traffic.

A visible sign-in/MFA prompt, exact tenant policy cause, and ultimate silent-auth outcome were **not** observed because the request was blocked. Do not describe this as a confirmed forced host logout, a proven MFA requirement, a supported handoff, or a universal impossibility.

## Remaining contract gaps

| Requirement | Evidence / gap |
|---|---|
| Case 1: normal host SSO followed by handoff | Not attempted; persistent host was never logged out to manufacture this state. |
| Case 2: existing host application session | Bounded candidate transferred; stopped at identity-provider authentication. Unresolved. |
| Minimum transferable state | Candidate identified, but necessity/sufficiency is not proved. |
| Account isolation | Source token/account/tenant checked in memory; final client identity not independently verified. |
| Host preservation | Existing mailbox UI remained present without a prompt; refresh and longer-term preservation not tested. |
| Expiry and renewal | Not tested. No refresh token was copied. |
| Cross-machine operation | Not tested for authentication. Earlier synthetic peer transport is separate evidence. |
| Chrome extension permissions/APIs | Temporary probe used CDP. Manifest remains `storage`, `tabs`, `offscreen`; no application controller or cookie permission was added. |

## Source constraints retained

Existing [authentication research](research-auth-compatibility.md) records that Okta device-bound factors cannot be copied, Entra sessions are distinct from Okta sessions, and conditional access/CAE or sign-in-frequency policies may require receiving-device authentication. The probe did not identify which policy, if any, caused the observed request.

[MSAL caching documentation](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/caching) explains the session encryption cookie, cache-version coexistence, and IndexedDB/memory storage of proof-of-possession keys. It recommends MSAL APIs rather than application logic coupled to internal cache entities. The temporary cache manipulation is therefore an experiment, not a supported permanent integration contract.

## Decision

Both Outlook cases remain **unresolved**. The bounded experiment is finished at the user's stop boundary. Do not retry this real account, complete identity-provider authentication, widen credential scope, or implement a permanent controller on the strength of this partial result without a new user decision and a complete verified contract.
