---
status: completed
date: 2026-09-06
subject: 2026-09-05.lan-login-handoff
topics: [outlook, microsoft-365, session-transport, msal, canonical-domain, authentication-boundary]
informs:
  - plan-lan-login-handoff.md
  - phase-3-application-compatibility-gate.md
  - phase-6-outlook-completion.md
related:
  - compatibility-outlook.md
  - real-outlook-transport-experiment.json
  - outlook-read-only-inspection.json
  - microsoft365-test-tenant-options.json
---

# Outlook session transport — paused at authentication boundary

## Result

**Scoped browser state reached an isolated Outlook client, but a complete authenticated handoff was not proved.** The client requested authentication at `https://login.microsoftonline.com`; the guard blocked that request and stopped. No sign-in/MFA interaction was completed, no broader credentials were copied, and no retry followed this authentication boundary.

The host still displayed its mailbox UI without a visible authentication prompt. It was not refreshed, so this is not proof of renewed or long-term host access. All temporary client contexts were closed and the local inspector process was stopped.

**User direction:** leave Outlook here, preserve this report, and work on Slack next. The report is completed; Outlook compatibility and the Outlook feature are not.

## What was authorized

The user identified `outlook.live.com` as a disposable consumer account and the existing `outlook.office365.com` tab as the real Microsoft 365 account. After initial read-only inspection and discussion of trial tenants, the user explicitly chose the real account: transport its existing session, but stop if logout or re-authentication is triggered.

An initial conservative guard stopped an unidentified redirect. The user then explicitly approved a corrected probe that recorded destinations. No authentication failure had been established by the first redirect stop.

No authorization was given to complete MFA, change tenant/device policy, export the whole browser profile, transfer general Okta/Microsoft IdP sessions, or automatically retry after an authentication boundary. The Outlook authorization does not implicitly authorize a real Slack workspace.

## Environment and proof limits

- Host: authorized already-open real Outlook tab, Chromium 151.0.7922.173 on Arch Linux.
- Client: a fresh isolated browser context in that same Chromium process.
- Driver: a supervised local Node/DevTools helper, using the Puppeteer implementation bundled with Chrome DevTools MCP. Sensitive values stayed inside the local process and isolated browser context.
- This tested local session-state feasibility, **not cross-machine authentication transport through Beam me up**.
- Existing WebRTC transport had separately passed synthetic cross-machine tests according to the user. The extension itself still has no application-session controller.

## What we found

### Outlook's canonical hostname changed

Navigating the legacy URL produced:

`https://outlook.office365.com/mail/` → `https://outlook.cloud.microsoft/...`

This was a normal Outlook destination, not a sign-in page. Microsoft's [unified-domain documentation](https://learn.microsoft.com/en-us/microsoft-365/enterprise/cloud-microsoft-domain?view=o365-worldwide) confirms Outlook's move to `cloud.microsoft`.

The exact application origins considered were:

- `https://outlook.office365.com`
- `https://outlook.office.com`
- `https://outlook.cloud.microsoft`

Do not replace this list with `*.microsoft.com`, `*.cloud.microsoft`, or arbitrary peer-supplied origins.

### Cookie and cache observations

- One cached MSAL account and one client-application ID were observed in the source Outlook origin.
- One unexpired Outlook access-token candidate was present. Its audience was Outlook, its account/tenant matched the cached account, and it had no `cnf` claim. This does not rule out server-side conditional access or establish portability.
- Observed Outlook cookie names included `OIDC`, `ClientId`, `OWAAppIdType`, `UC`, `x-ocditid`, `DefaultAnchorMailbox`, and `msal.cache.encryption`.
- `OIDC` was HttpOnly. Its values on the two legacy Outlook hostnames were equal in local memory; no values were returned or saved.
- No source cookies existed for `outlook.cloud.microsoft` at inspection time.
- Actual cache indexes were `msal.3.account.keys` and `msal.3.token.keys.<client-id>`. An early probe assumed unversioned names and omitted these indexes; the final probe corrected that mistake.
- The active-account entry had an `active-account-filters` suffix. Account indexes referred directly to local-storage keys.
- The source cache also contained unrelated Graph, Teams, SharePoint, and other Microsoft resources. Those entries were excluded.

[MSAL's cache documentation](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/caching) explains the encryption cookie, multiple cache generations, and proof-of-possession keys in IndexedDB/memory. Cache internals are not a supported application integration API. No device key or IndexedDB content was copied.

## Probe sequence

| Probe | Candidate / change | Outcome |
|---|---|---|
| Initial readiness check | Passive UI guard looked only at ARIA labels | Aborted before client creation. Corrected to include known button labels; this was an instrumentation issue, not logout. |
| First legacy-origin probe | Seven Outlook cookies; four matching cache entries prepared | Stopped at an off-origin redirect before app-document commit. Destination was not retained. Cache installation was not verified. Client removed. |
| User-approved corrected trace | Both legacy origins; nine cookies; six cache entries including observed indexes | Recorded redirect to `outlook.cloud.microsoft`. No sign-in request observed at this stop. Client removed. |
| Canonical-domain probe | Verified canonical Outlook origin; three app-cookie alias mappings added | Twelve cookie records installed and six cache entries confirmed installed. Client then requested identity-provider authentication; blocked and stopped. Client removed. |

### Final candidate, not a proven minimum

The final probe transferred:

1. Nine selected cookie records from the two legacy Outlook origins, preserving attributes and expiry.
2. Three isolated-client mappings to `outlook.cloud.microsoft`: source `OIDC`, `ClientId`, and `msal.cache.encryption`.
3. Six local-storage entries: one Outlook access token, matching ID token, account metadata, active-account metadata, and filtered account/token indexes.

No refresh token, Graph/Teams/SharePoint access token, general IdP cookie, temporary OAuth request state, PKCE material, or device proof was copied. Cache initialization ran only on the exact allowed Outlook origins and was removed after initial navigation; it was not a continuous replay mechanism.

## Final observations

- Client reached `https://outlook.cloud.microsoft`.
- Probe marker confirmed cache installation.
- Two selected Outlook service responses returned HTTP 2xx. Their semantic success and the signed-in client identity were **not** independently established by those status codes.
- Client requested `https://login.microsoftonline.com` authentication. Public metadata-discovery paths were exempt from the authentication guard; other authentication requests were blocked.
- This request was not recorded as a top-level navigation. Its exact endpoint/path category was not retained, so do not assume it was a visible login form, MFA challenge, device-compliance demand, or a specific token-renewal flow.
- The host still had mailbox/main/inbox UI and no visible authentication prompt.
- Neither client-refresh success nor host-refresh preservation was tested after the stop.

## Cleanup and retained state

- Each isolated client context was closed, removing its temporary copied browser state.
- No provider logout was invoked and no host cookies/storage were cleared.
- The inspector was stopped. No raw session values, full HAR, browser profile, or credential-bearing debug output was retained.
- Temporary experiment scripts are not a shipped controller and should not be treated as a supported completion mechanism.
- Extension manifest and application source were unchanged by this experiment. No new deterministic project checks were needed for the research-only repository changes.

Detailed sanitized evidence: [real-outlook-transport-experiment.json](real-outlook-transport-experiment.json). The current per-application verdict is in [compatibility-outlook.md](compatibility-outlook.md).

## How to resume Outlook later

1. **Get a new user decision before another real-account attempt.** Preserve the previous stop boundary unless explicitly changed. Do not silently complete a sign-in or copy broader credentials.
2. Re-establish the intended source account and an isolated client. Confirm current canonical origin and cache generation; do not assume this snapshot remains current.
3. Improve non-secret tracing before replay: record the blocked request's origin, safe endpoint category, method, resource type, and top-level/iframe distinction. Never record full query strings, headers, bodies, tokens, or cookie values.
4. Determine whether the authentication request is required for core Outlook access, cache initialization, renewal, or an auxiliary Microsoft resource. This experiment did not resolve that question.
5. Independently verify the client account and actual authenticated app behavior; do not infer success from copied storage, rendered shell, HTTP 2xx, or transport acknowledgement.
6. If a permitted complete mechanism is established, verify client refresh, host refresh/preservation, expiry, then the actual cross-machine extension path. Only then implement a permanent Outlook controller and its exact optional permissions.

**Do not conclude:** “MFA was definitely required,” “Microsoft rejected the copied token,” “the host was logged out,” “Outlook transport is supported,” or “Outlook transport is impossible.” None of those claims was established.
