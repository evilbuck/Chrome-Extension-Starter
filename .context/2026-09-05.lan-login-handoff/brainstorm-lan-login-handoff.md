---
status: draft
created: 2026-09-05
updated: 2026-09-05
subject: 2026-09-05.lan-login-handoff
memory:
  - lan-login-handoff-2026-09-05.md
research:
  - research-auth-compatibility.md
---

# Plan: Host-controlled authentication across personal computers

## User Goal

Enable one person to use Microsoft 365, Zoom, and Slack web applications from another computer they own on a shared tailnet or internal LAN without repeated lengthy login/logout flows, using either the host's existing Okta authentication or its existing session in the requested application, while the host remains logged in.

Confirmed by the user: the host must retain its login while a client is used. The person will not actively use the computers simultaneously. This is persistent host-controlled authentication, not an exclusive login handoff.

## What we might build

- A Chrome extension installed on two or more user-owned computers.
- Authentication-only sharing: the host supplies existing authentication/session information for the requested website; the client's browser then communicates directly with that website.
- Required application targets: Microsoft 365, Zoom, and Slack. Okta is the SSO identity provider, not a dashboard or administration feature. Zoom is newly named and was not covered by the completed compatibility research.
- The host remains logged in and controls authentication. Website traffic is not proxied through the host.
- When a website asks the user to authenticate on a client, the intended action is to click an extension button labeled `sync auth`.
- Two distinct use cases: **Case 1 — authenticate through the host's existing Okta login**; **Case 2 — reuse the host's existing login to the requested application**.
- The desired result is authenticated client access without a separate login and without logging out the host. An SSO redirect alone does not meet either case.
- Cookies or another application-specific session mechanism may be involved; no universal state-transfer mechanism or application compatibility is established. Keep the user workflow separate from the unresolved cross-machine authentication mechanism.

## Why it matters

- Repeated authentication interrupts switching computers.
- The user wants continuity for their own use, not account sharing between different people.
- One-machine restrictions are part of the problem, not an edge case to ignore.

## Constraints / preferences

- Computers belong to the same person. Initial host–client network scope is a shared tailnet or internal LAN; the first proof of concept is restricted to an internal-LAN development environment.
- Client access must not sign out the host or transfer the exclusive login away from it.
- One person actively uses one computer at a time; simultaneous human use is not required.
- Authentication-only sync is confirmed. A website-traffic proxy or remote-host browser is not the requested direction.
- Chrome is the requested browser; operating systems and minimum Chrome version are unspecified.
- The existing environment restricts how many places may be logged in; the user identifies Okta-mediated access as the difficult case.
- Another organization manages the access policy. The user reports that the intended cross-device use does not violate its written policy, but the technical implementation does not match that policy. This is recorded as user-provided context, not an independently reviewed policy determination.
- No real credentials or session tokens should be collected into these planning artifacts.
- No code, browser sessions, security settings, or login policies are being changed during this intake.

## Trust and deployment scope

The user has separated the development proof of concept from the eventual shipped trust model:

| Stage | Host–client network scope | Trust and approval |
|---|---|---|
| First development PoC | Internal LAN only; this PoC never leaves the development environment | Skip pairing and assume clients are trusted. The client's manual `sync auth` action is sufficient; no per-request host approval. |
| Later shipped versions | Initially a shared tailnet or internal LAN | Require a pairing process. After pairing, the client is trusted and does not need host approval for every `sync auth` request. The pairing mechanism is not selected. |

- The private-network restriction concerns the host–client channel, not the client's ordinary direct connections to Slack, Zoom, Microsoft 365, or the authentication provider.
- A tailnet does not require both computers to be on the same physical LAN. Public exposure of the host–client service is outside the initial scope.
- **Known PoC risk:** network reachability is not client authentication. Without pairing or another authentication mechanism, another device that can reach the development service could potentially request authentication access. Internal-LAN placement does not establish that such a device is trusted.
- **Recommendation, not a confirmed requirement:** use disposable test accounts in the no-pairing PoC to limit the impact of that risk. The development exception must not become the shipped trust model.
- Provider-required MFA, consent, or other interactive security checks remain separate from extension pairing and still require explicit human completion.
- Application/account grant scope, the eventual pairing mechanism, and unpairing/revocation behavior remain unresolved. This records product scope only; it does not implement or expose a service.

## Proposed host–client workflows

This is an iteration of the existing brainstorm, not an implementation plan or a claim of working integrations. The user now prefers an application-first approach: control the host browser to sign into the target app through normal Okta SSO when necessary, rather than making general Okta-session portability the primary design. This is a preferred direction to investigate, not proof that application-session sharing is easier or feasible.

### Shared starting point

1. On the client, the user opens Microsoft 365, Zoom, or Slack and encounters an authentication requirement.
2. The user clicks `sync auth` in that client browser.
3. The extension identifies the requested application and tenant/workspace/account, and the intended host. Ambiguous account selection must be resolved rather than silently choosing or replacing another logged-in account.
4. The host receives the application-scoped request under the applicable trust model: assumed trust in the internal-LAN development PoC; an already-paired client in later shipped versions. Application/account grant scope remains to be settled.

The user confirmed that a paired client is trusted. Its manual `sync auth` click is sufficient; there is no additional host-side approval for each request. The development PoC skips pairing entirely. This does not authorize automatically completing provider security prompts.

### Case 1 — use the host's Okta authentication

**Starting state:** the client needs to sign into an application, and Chrome on the host is already authenticated with Okta. An existing host session in the application is not required by this case.

**Desired interaction:**

1. The client asks the host to help authenticate to the specific application, not to open the Okta dashboard.
2. The host extension orchestrates the normal sign-in in the **host's own Chrome browser**: for example, Slack → Okta → Slack. The host's existing Okta session may avoid another prompt. Required MFA, consent, or other provider interaction pauses for explicit human completion; browser control does not waive those requirements.
3. A compatible cross-machine completion must give the client authenticated access to the requested application.
4. The client resumes its original destination and communicates directly with the application. The host keeps its Okta login.

**Connection to Case 2:** the host's normal SSO flow first establishes a session in the requested application on the host, then converges on the same application-specific handoff needed by Case 2. This reflects the user's preferred direction: use the application's authentication rather than distribute the host's general Okta login.

**Unresolved boundary:** successful SSO on the host signs in the host browser; it does not itself sign in the client. The proposal still needs a compatible application-session handoff. Neither forwarding a redirect URL nor assuming a SAML response is a reusable cross-browser credential resolves this boundary. No mechanism for that handoff has been selected or validated.

### Case 2 — use the host's existing application session

**Starting state:** the client needs to authenticate, and the host is already signed into the same application and intended account/workspace.

**Desired interaction:**

1. The client requests access using the host's existing session for that application.
2. The host determines whether that exact application/account session is available and usable. An Okta session alone is not evidence of an existing Slack, Zoom, or Microsoft application session.
3. A compatible application-specific handoff gives the client authenticated access without unnecessarily starting a new Okta login.
4. The client resumes its destination and uses the application directly. The host's application login remains usable.

**Unresolved boundary:** an authenticated host tab is not proof that its session is portable. The client must be accepted by the service; copying browser state is not a guarantee of that acceptance. Initial success, later expiry/refresh, revocation, and effects on the host remain separate compatibility questions.

For Microsoft 365, name the actual web application being accessed rather than treating the entire suite as one interchangeable session. Zoom is a requested target, not a researched or verified integration.

### Application-first common path

```text
Client needs application authentication → user clicks sync auth
                         ↓
          Request to the authorized host
                         ↓
       Host already signed into this app/account?
              ├─ Yes → Case 2: existing app session
              └─ No  → Case 1, if allowed: normal host SSO via Okta
                                      ↓
                        Host app session established
              └───────────────────────┘
                         ↓
     Application-specific handoff — feasibility unresolved
                         ↓
       Client authenticated; host still authenticated
                         ↓
           Client talks directly to application
```

Working direction: one `sync auth` action requests access to the named application/account. Reuse an existing host application session when possible; otherwise, the host browser performs that application's normal SSO sign-in before reaching the same handoff boundary. Show the route being used; do not silently broaden the request into general IdP-session sharing. The host can fulfill the client-triggered request without a separate host approval under the stage-specific trust model above.

### Outcomes and failure behavior to settle

- **Success:** the client reaches the intended application/account, can use it directly, and the host remains signed in. Sending a message, opening an SSO page, or finding cookies is not success.
- **Host unavailable:** report that this request cannot proceed; do not silently move to another host or account.
- **Host needs authentication or the provider requires interaction:** identify the required action and pause for explicit human completion. Do not automatically accept security prompts. A host login does not satisfy a required client-device check.
- **No compatible handoff:** report this application/configuration as unsupported for the requested flow. Normal client login can be offered explicitly, but it does not count as `sync auth` success.
- **Later session expiry:** the service remains authoritative. Continuous background synchronization is not part of the agreed scope.
- **Scope and lifecycle:** no whole-profile sharing, traffic proxying, forced host logout, or promise that disconnecting the extension revokes all provider sessions.

### Okta false-positive hypothesis

- The user suggests that authenticating the application in the already-authenticated host browser might circumvent or prevent false-positive detection by Okta. This is a hypothesis, not an observed outcome or an established property of the design.
- [INFERENCE] Reusing an acceptable host Okta session may reduce repeated login prompts on the host. That is different from establishing that cross-machine application access causes fewer security alerts.
- Existing research documents configurable Okta session reevaluation and independent application/Microsoft Entra controls. Normal host-side SSO can still be evaluated, and client access is not guaranteed to be invisible or exempt from policy. No tenant-specific detection behavior has been tested.
- The design rationale is normal host-side sign-in and application-scoped access, not evasion of monitoring or enforcement. Required authentication/device checks remain boundaries, not obstacles for the extension to hide or bypass.
- If false positives are investigated later, compare non-secret outcomes and the actual configured policy with the service owner. Do not promise alert suppression or reinterpret a legitimate enforcement decision as a false positive without evidence.

## Open questions

1. For shipped versions, should pairing grant access to every supported application/account on the host, or only an explicit selection?
2. What application-specific cross-machine handoff can actually deliver client access without invalidating the host session? Successful SSO on the host alone is insufficient.
3. Does the application-first approach reduce unnecessary prompts or false positives in this configuration? Treat this separately from successful sign-in, and do not assume a security alert is a false positive.
4. Which operating systems and browser profiles must work?
5. Which Okta, Slack, Zoom, and Microsoft application/Entra requirements apply, including initial sign-in versus continued use? Zoom still needs compatibility research.
6. What host-unavailable and expired-session behavior should apply in both stages? For shipped versions, what pairing, lost-device, unpairing, and revocation behavior should be guaranteed?

## Brainstorm notes

### Initial intake — 2026-09-05

- User's hypothesis: Okta generally tracks the user only at login, so reusing host authentication state could avoid a separate tracked login.
- That mechanism and its applicability to this tenant/application set are unverified. This draft does not infer that the one-machine restriction can be bypassed or that an Okta session and every downstream application session are interchangeable.
- At initial intake, no external feasibility research had been performed and no architecture had been selected.
- First interview question: confirm the goal and distinguish sequential handoff from simultaneous browser use.
- Intake remains open. This is a loose brainstorm, not a formal implementation plan.

### Persistent host clarification — 2026-09-05

- The host must remain logged in when the user works on a client; keeping the host authenticated is central to the request.
- The user will not actively use both computers simultaneously.
- The host controls authentication and is described as being like a proxy for the client.
- The first question's handoff-versus-concurrent-use framing was too coarse: persistent host login is required, simultaneous human use is not.
- The second interview question distinguished authentication-state distribution from website-request proxying; the user's answer is recorded below.

### Manual authentication sync clarification — 2026-09-05

- The user explicitly selected authentication-only sharing: the host supplies session information, and the client's browser communicates directly with websites.
- Requested interaction: when asked to authenticate, click an extension button labeled `sync auth` to request authentication cookies or other relevant application state from the host.
- Interpretation: the button is used on the client requesting host authentication. The first message said "On the host computer," but the subsequent explicit host-supplies/client-connects choice establishes the intended roles.
- The host must remain logged in; simultaneous human use is still not required.
- Manual sync is the requested trigger. Continuous background synchronization has not been requested.
- Authentication-only topology is selected; technical feasibility and supported application mechanisms remain unverified.
- The third interview question established who controls the access policy; the user's answer is recorded below.

### External policy ownership — 2026-09-05

- The user confirmed that another organization manages the access policy.
- At this point, policy ownership was known but the user had not yet supplied the written-policy clarification recorded below.
- The requested authentication-only `sync auth` flow remains captured; no alternative architecture has been substituted.
- A proposed question about separate approval was superseded by the user's written-policy clarification before it was asked.

### Written policy versus technical enforcement — 2026-09-05

- The user states that the proposed use does not violate the organization's written policy, and that the technical implementation does not match the actual policy.
- Record the problem as a reported policy/implementation mismatch, not as evidence that the user's intended use is prohibited.
- The policy document has not been independently reviewed during intake; the user's clarification is the operating context for this brainstorm.
- The manual authentication-only sync flow and persistent host login remain unchanged. No request-proxy or remote-browser alternative has been substituted.
- The user subsequently named Okta, Slack, and Microsoft 365 and requested compatibility research rather than another application-selection question.

### Named SSO targets and research request — 2026-09-05

- Required research covers Okta, Slack, and Microsoft 365 login through Okta.
- Okta is in scope only as the SSO identity provider. Access to Okta itself is not a product requirement.
- The user wants an evidence-backed account of what can and cannot be supported before proceeding.
- [Authentication compatibility research](research-auth-compatibility.md) is complete as a public-documentation assessment. No live sessions or credentials were accessed.

### Two workflow cases and continued iteration — 2026-09-05

- The user distinguished authenticating through the host's existing Okta login from reusing its existing session in the target application.
- Microsoft 365, Zoom, and Slack are the named application targets. Zoom expands the requested scope beyond the previous research.
- The prior SSO-only emphasis was too narrow for Case 2. Both cases are now explicit; neither is silently substituted for the other.
- The common path is an application-specific handoff: Case 1 first establishes a host application session through Okta; Case 2 starts with that session already available. The user's subsequent clarification makes this the preferred direction to investigate, not a validated mechanism.
- The user explicitly requested updating the existing brainstorm and remaining in iteration. Keep this subject and draft at `status: draft`; do not advance to a formal plan or implementation.
- The interview question concerned unattended fulfillment by a paired host versus host confirmation per request. The user's answer and development-PoC exception are recorded below; this approval question is no longer open.

### Host-browser orchestration and detection hypothesis — 2026-09-05

- The user thinks direct application authentication may be easier, especially if the host browser can be controlled to authenticate Slack through its own normal SAML/SSO flow with Okta.
- This refines Case 1 into host-side preparation for the same application-session handoff required by Case 2. It does not turn the host into a website-traffic proxy or move the user's application work into a remote browser.
- The user also suggests this might circumvent or prevent Okta false-positive detection. Record that suggestion without promoting it to a fact, supported capability, or evasion requirement.
- Actual application-session portability, ongoing validity, host preservation, and any effect on false positives are all unverified. No browser automation, live authentication, credential access, or policy change was performed.

### Private-network trust and development exception — 2026-09-05

- The user confirmed that pairing makes a client trusted, resolving the per-request approval question: the client need not obtain another host confirmation for each manual `sync auth`.
- Initial deployment is confined to a tailnet or internal LAN.
- The user then explicitly exempted the first development proof of concept from pairing: assume clients are trusted because it is exposed only to the internal LAN, and keep this PoC entirely within the development environment.
- Later shipped versions must require pairing of some sort. The PoC exception is not a decision to omit authentication from the shipped product.
- Recorded the risk that internal-LAN reachability alone does not authenticate a requester, and recommended disposable test accounts. No actual listener, pairing bypass, browser automation, or session transfer was implemented.

## Research conclusions

- Chrome exposes cookie access with explicit permissions, including HttpOnly-marked cookie records. This is not a provider-supported cross-computer session-import contract.
- The earlier SSO-only research describes normal federation establishing fresh Slack/Microsoft sessions when the receiving browser satisfies authentication and policy requirements. It does not replace the now-explicit requirement to reuse an existing host application session.
- Host-to-client IdP-session reuse, application-session reuse, and host-session preservation remain unverified for the actual configuration. The proposed Case 1 convergence does not require choosing IdP-session copying; a button that merely opens an SSO URL still would not satisfy the requested feature.
- When device-bound proof, FastPass, mandatory reauthentication, or receiving-device compliance is required, cookie values alone do not supply it.
- Microsoft Entra remains a separate policy/session boundary even through Okta. The current ARM-specific browser Token Protection preview must not be generalized to all Microsoft 365 web apps.
- LAN transport still needs a decision: ordinary MV3 outbound networking is not an inbound server; WebRTC with signaling or an added native helper have different requirements.
- The compatibility report includes sourced can/cannot/conditional matrices for Chrome, Okta, Slack, and Microsoft 365, plus remaining validation needs. It predates the Zoom addition and does not establish Zoom support. No implementation or live integration success is claimed.
