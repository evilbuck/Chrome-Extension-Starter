---
status: completed
date: 2026-09-05
subject: 2026-09-05.lan-login-handoff
topics: [chrome-extension, sso, okta, slack, microsoft-365, session-portability]
informs: [brainstorm-lan-login-handoff.md, plan-lan-login-handoff.md]
memory: [lan-login-handoff-2026-09-05.md, lan-login-handoff-implementation-2026-09-05.md, lan-login-handoff-planning-2026-09-05.md]
---

# Research: authentication-only sync compatibility

## Executive finding

**Chrome provides the cookie-access building blocks, but public documentation does not establish a reliable cross-computer `sync auth` feature for this tenant.** Normal Okta-mediated Slack and Microsoft 365 browser sign-in is documented. Reusing the host's existing authentication on another machine without a new challenge is the conditional, unproven part—not something established by the existence of SSO or a cookie API.

**SSO-only materially narrows the problem.** If the client has an acceptable Okta SSO session and satisfies the application's sign-in requirements, the normal federation flow can establish a fresh Slack or Microsoft application session. Copying every downstream application's existing cookies/tokens is not inherently required for that flow. However, opening an SSO URL alone does **not** meet the user's cross-machine, no-repeat-authentication goal. The host-to-client IdP-session reuse remains the decisive feasibility question. [O1] [O2] [S1] [M1] [M2]

No consulted official source defines a general Okta/Slack/Microsoft browser-session export/import contract for arbitrary LAN computers. That is a finding about documented support, **not proof that ordinary bearer-session reuse is technically impossible**. Site acceptance, device-bound proof, session policy, and host-session effects must be established in the actual configuration.

## User Goal and fixed scope

- One person uses their own computers on the same LAN, one actively at a time.
- The host remains logged in and supplies authentication state through a manual extension button labeled `sync auth`.
- Client browsers communicate directly with websites; no website-traffic proxy or remote-host browser is substituted.
- Required integrations: Okta as the SSO identity provider, Slack login, and Microsoft 365 login through Okta. Okta dashboard/admin access is not required.
- Another organization manages access policy. The user reports that the intended use does not violate written policy but the technical implementation is more restrictive. This is recorded as user-provided context, not independently reviewed policy evidence.
- Research principally establishes Chrome web-login boundaries. Direct native-app credential/session synchronization is a different surface; browser-assisted native sign-in must not be confused with native session copying.

## Support matrix

| Requirement | Research verdict | Exact boundary |
|---|---|---|
| Query/set browser cookies, including HttpOnly records | **Documented Chrome capability** | Requires the cookies API permission and matching host permissions. Cookie store, partition, domain/path, and security attributes matter. API access does not establish server acceptance. [C1] |
| Okta-mediated SSO without accessing the Okta dashboard | **Documented normal flow; conditional seamlessness** | Apps can initiate the redirect to Okta and receive an authentication response. An acceptable IdP session may avoid another prompt, unless app/global policy requires more authentication. [O1] [O2] [O3] |
| Move the host's Okta authentication to a different computer | **Undocumented and unproven for this tenant** | Consulted browser-session/API docs do not provide a general cross-computer import contract. Classic and Identity Engine session behavior differ. A transferable cookie record is not equivalent to portable device authentication. [O4] [O5] [O6] |
| Slack SSO login | **Documented SAML flow; conditional on the receiving browser and workspace** | Slack supports service-provider- and identity-provider-initiated SAML. If the client's IdP authentication and workspace requirements succeed, Slack establishes its own application session. Direct copying of an old Slack session is not required by that normal flow. [S1] [S2] |
| Microsoft 365 login through Okta | **Documented federation flow, with additional Microsoft conditions** | Okta documents Office 365 WS-Federation. Entra still validates federation and applies its own requirements; Microsoft applications issue/control their own session state. “Through Okta” does not remove Microsoft from the compatibility problem. [M1] [M2] [M3] |
| Guarantee that client use never invalidates the host session | **Not established; cannot be promised from browser APIs** | Sync can be designed not to issue a logout, but provider expiry, shared-session handling, reauthentication, and server/admin revocation remain outside extension control. Host preservation must be an observed acceptance criterion. [O3] [O7] [S3] [M4] |
| Synchronize any authentication mechanism | **Not a supportable generic promise** | Cookies are only one type of state. Site storage, authenticator/device keys, broker state, and fresh authentication challenges are not interchangeable. [C2] [C3] [O6] [M5] |
| Direct native Slack/Office session synchronization | **Not a Chrome-cookie API capability** | Native/broker credential stores are separate. A native app's ordinary browser-assisted login might benefit from a successful browser SSO flow, but that is a separate compatibility case, not proof that native session state can be synchronized. [C1] [M5] |
| Two extensions automatically acting as a LAN client/server | **Needs a transport design** | Outbound extension networking is documented; the TCP listener API found is a Chrome Apps API, not ordinary MV3. WebRTC is a conditional peer route requiring signaling and connectivity validation; a native helper is another option, not proven mandatory. [C4] [C5] [C6] [C7] |

## The important SSO boundary

The documented conceptual flows are:

```text
Client → Slack SSO → Okta authentication/policy → Slack's own session
Client → Microsoft 365 / Entra → Okta federation → Entra checks → Microsoft app session
```

These are normal browser authentication flows, not instructions to replay assertions or export credentials. The source host's existing application session is not itself the federation protocol. The unresolved bridge is whether the receiving browser can obtain an acceptable IdP authentication context without fresh login/device proof while the source host remains unaffected. [O1] [O2] [S1] [M1] [M2]

Consequences:

- No Okta dashboard feature is needed, but Okta's authentication domain/session/policies remain central.
- [INFERENCE] For the requested SSO-only product, validating IdP-session compatibility before adding Slack/Microsoft session-copy logic is the narrower, more relevant investigation.
- The host can be the source of the synchronization decision, but downstream services still own their newly established sessions. Logging out of the IdP does not universally control all app sessions. Slack explicitly says it does not support Single Logout or session duration configured in the IdP. Do not promise host-controlled revocation of every client app session. [O2] [S1]

## Hard limits and conditional blockers

### 1. Cookies do not supply device-bound authentication proof

When an Okta policy requires FastPass, Okta Verify on the **same device** responds to a fresh server challenge using an enrolled proof-of-possession key and supplies device signals. Having browser cookies is not that proof. Device assurance and app sign-in policy can impose additional requirements. This does not mean every existing Okta session always triggers FastPass; the actual policy and authentication context determine whether it is required. [O3] [O6]

Chrome's Device Bound Session Credentials (DBSC) is another, separate mechanism: a participating site uses short-lived cookies with device-key-backed refresh. Ordinary cookie values do not carry the original device's private key or its refresh proof. The site must opt in. Consulted Chrome material documents Windows availability/experimental rollout and macOS expansion work; it does not establish that this user's Okta, Slack, or Microsoft sites deploy DBSC. Do not treat all Chrome cookies as device-bound. [C3] [C8] [C9]

### 2. “Okta only checks at login” is not a safe universal assumption

Okta documents global-session and app reauthentication controls. In organizations with Identity Threat Protection enabled, session protection can monitor IP/device-context changes and reevaluate policies. Monitoring is the documented default; enforcement and remediation such as reauthentication or Universal Logout depend on configuration. These are available capabilities, not a finding that this tenant has them enabled. Sharing a LAN is not proof that all device/session checks will be satisfied. [O3] [O7]

### 3. Microsoft still evaluates the receiving browser

Microsoft distinguishes IdP/sign-in sessions from application sessions. Entra Conditional Access can impose device requirements, sign-in frequency, persistent-browser-session rules, and resource-specific restrictions even after successful federation through Okta. Microsoft 365 applications differ in their session and continuous-access-evaluation behavior. An Okta authentication response is therefore not a blanket Microsoft 365 access guarantee. [M2] [M3] [M4] [M6]

**Important applicability correction:** the current Microsoft Token Protection **browser preview** covers listed Azure Resource Manager web apps. It is not a blanket statement that Outlook/Teams/SharePoint web sessions in Chrome use that preview. Native-application support tables must not be generalized to every Microsoft 365 browser flow. Other Conditional Access/device controls can still apply independently. [M7]

### 4. Session lifetime and revocation remain server-controlled

Slack can impose its own session duration and owners/admins can invalidate sessions, including across devices. Microsoft controls sign-in/application session lifetime and revocation separately. A successful initial sign-in is not proof of persistence, seamless refresh, or host-session preservation. The appropriate requirement is that synchronization must not itself log the host out, followed by validation of normal session continuation—not a promise to prevent service-side expiry or revocation. [S3] [S4] [M4]

### 5. “Any cookies or whatever the app uses” is too broad

Chrome's cookie API does not constitute an entire-origin snapshot. Site storage and extension storage are distinct; partitioned state and cookie-store context affect visibility. Authenticator credentials and broker/device proofs are separate again. Slack's developer OAuth/API tokens and “Sign in with Slack” for third-party applications are not substitutes for a Slack web-client login. Short-lived authentication codes/assertions/session tokens should not be treated as reusable synchronization artifacts. [C1] [C2] [O4] [S5] [S6]

## LAN and extension constraints

- Extension pages/service workers can initiate outbound network requests with appropriate host permissions. This does not make an MV3 extension a general HTTP/WebSocket/TCP server listening on the LAN. The documented `tcpServer` surface belongs to Chrome Apps. [C4] [C5]
- WebRTC data channels can carry peer-to-peer data, but signaling is outside WebRTC and ICE/connectivity must be handled. An extension-only approach is conditional on the chosen browser context and a usable direct connection. Do not quietly add a cloud signaling/relay dependency to a LAN-only expectation. [C6]
- Native messaging connects an extension to a separately installed, registered native process. Such a helper could supply networking beyond extension APIs, but adds installation and platform work. It is not proven mandatory for every possible peer transport. [C7]
- MV3 service workers are not permanently resident. Host browser login does not imply an always-running extension process; availability/reconnection must respect the documented lifecycle. [C10]
- Any later implementation needs explicit peer trust, protected transport, narrowly scoped site access, and no credential values in logs. These are research recommendations, not features implemented in this session.

## What remains to validate in the actual environment

Public docs cannot determine these tenant-specific facts:

1. Okta engine and actual integration types: Slack federation and Microsoft WS-Federation versus a form-filling/SWA configuration.
2. Whether the receiving client is required to perform fresh MFA/FastPass, device assurance, or another authentication step even with an otherwise valid IdP session.
3. Microsoft Entra requirements for the specific apps in use: for example Outlook web, Teams web, or SharePoint, rather than treating all of Microsoft 365 as one session.
4. Whether initial authentication and subsequent ordinary use preserve the host's login and remain valid on the client.
5. Browser/OS/profile details and extension permission/deployment constraints; any native-app browser sign-in handoff that is also expected.
6. Whether a LAN-only peer transport can meet availability and pairing expectations without an added helper or external service.

A later controlled compatibility check should evaluate **all three named SSO targets** and host preservation, record non-secret outcomes and policy categories, and distinguish initial success from ongoing session validity. No session copying, account sign-in, policy change, or tenant testing was performed during this research. Opening normal SSO links alone would not count as validating the proposed cross-device feature.

## Recommendation

**Keep the authentication-only direction, but gate implementation on the actual IdP-session portability requirement.** The research justifies investigating a narrowly scoped, compatibility-aware browser feature; it does not justify advertising universal support for Okta, Slack, or Microsoft 365 merely because they use cookies/SSO.

If fresh device-bound authentication or mandatory reauthentication is required on the client, cookie synchronization alone cannot satisfy that requirement. A normal supported authentication flow on that client would still be necessary; the extension must not present a copied cookie as satisfying a proof it does not supply.

## Evidence and verification

- Four independent public-source investigations: Chrome, Okta, Slack, Microsoft 365.
- Source types: official API/product documentation, official vendor release/engineering material, WebRTC/MDN reference material, and the local manifest baseline.
- Parent spot-checked decisive Chrome cookie API, Slack SAML/session separation, Okta FastPass and GA session protection, and Microsoft browser Token Protection applicability. Paginated Chrome/Microsoft sources were read to completion.
- One Slack anomaly-logging page was available only as a search excerpt. It is explicitly labeled in the ledger and is not used as evidence that desktop login is blocked.
- The current repository manifest is an MV3 starter with storage/tabs/alarms permissions and broad host access, but no cookies API permission. No code or manifest changes were made.
- Documentation-only investigation: no build/lint/test gate was applicable, and no real authentication/session experiment was run. This is a documentation-based compatibility assessment, not a successful integration test.

### Rolling notes and full source ledgers

- [Chrome notes](research/notes-chrome.md) / [sources](research/sources-chrome.md)
- [Okta notes](research/notes-okta.md) / [sources](research/sources-okta.md)
- [Slack notes](research/notes-slack.md) / [sources](research/sources-slack.md)
- [Microsoft 365 notes](research/notes-microsoft365.md) / [sources](research/sources-microsoft365.md)

[C1]: https://developer.chrome.com/docs/extensions/reference/api/cookies
[C2]: https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies
[C3]: https://developer.chrome.com/docs/web-platform/device-bound-session-credentials
[C4]: https://developer.chrome.com/docs/extensions/develop/concepts/network-requests
[C5]: https://developer.chrome.com/docs/apps/reference/sockets/tcpServer.md.txt
[C6]: https://webrtc.org/getting-started/peer-connections
[C7]: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging
[C8]: https://developer.chrome.com/blog/dbsc-windows-announcement
[C9]: https://developer.chrome.com/blog/io26-web-identity
[C10]: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
[O1]: https://developer.okta.com/docs/concepts/sso-overview/
[O2]: https://developer.okta.com/docs/concepts/session/
[O3]: https://help.okta.com/oie/en-us/content/topics/identity-engine/policies/authentication-method-chain.htm
[O4]: https://developer.okta.com/docs/api/openapi/okta-management/management/tags/session
[O5]: https://developer.okta.com/docs/guides/oie-upgrade-sessions-api/main/
[O6]: https://help.okta.com/oie/en-us/content/topics/identity-engine/devices/fp/fp-main.htm
[O7]: https://help.okta.com/oie/en-us/content/topics/itp/enforce-continuous-access.htm
[S1]: https://slack.com/help/articles/205168057-Custom-SAML-single-sign-on
[S2]: https://slack.com/help/articles/203772216-Set-up-SAML-single-sign-on-for-Slack
[S3]: https://slack.com/help/articles/115005223763-Manage-session-duration
[S4]: https://slack.com/help/articles/206924507-Reset-all-single-sign-on-sessions
[S5]: https://docs.slack.dev/authentication/sign-in-with-slack/
[S6]: https://docs.slack.dev/authentication/tokens/
[M1]: https://help.okta.com/oie/en-us/content/topics/apps/office365-deployment/configure-sso.htm
[M2]: https://learn.microsoft.com/en-us/entra/identity/devices/concept-tokens-microsoft-entra-id
[M3]: https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-conditional-access-conditions
[M4]: https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-session-lifetime
[M5]: https://learn.microsoft.com/en-us/entra/identity/devices/concept-primary-refresh-token
[M6]: https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-continuous-access-evaluation
[M7]: https://learn.microsoft.com/en-us/entra/identity/conditional-access/deployment-guide-token-protection-web-apps
