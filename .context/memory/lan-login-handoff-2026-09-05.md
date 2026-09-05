---
date: 2026-09-05
domains: [product, authentication, research]
topics: [chrome-extension, lan-login-handoff, okta-sso, slack, zoom, microsoft-365, session-portability, host-browser-orchestration]
related:
  - .context/2026-09-05.lan-login-handoff/index.md
  - .context/2026-09-05.lan-login-handoff/brainstorm-lan-login-handoff.md
  - .context/2026-09-05.lan-login-handoff/research-auth-compatibility.md
priority: medium
status: completed
subject: 2026-09-05.lan-login-handoff
artifacts:
  - index.md
  - brainstorm-lan-login-handoff.md
  - brainstorm-state-lan-login-handoff.json
  - research-auth-compatibility.md
  - research/notes-chrome.md
  - research/sources-chrome.md
  - research/notes-okta.md
  - research/sources-okta.md
  - research/notes-slack.md
  - research/sources-slack.md
  - research/notes-microsoft365.md
  - research/sources-microsoft365.md
---

# Host-controlled authentication research and workflow iteration

## Request

Scope a Chrome extension for one person's own computers on the same LAN, research Okta-mediated Slack/Microsoft 365 login, then iterate the existing brainstorm around two host–client workflows. The latest request adds Zoom and distinguishes using the host's Okta login from its existing application login. The user explicitly wants to remain in brainstorm iteration.

## State

- Created a draft subject and captured the proposed mechanism separately from the user-facing goal.
- Authentication-only topology is selected. Browser capabilities and normal federation flows are documented; actual cross-machine session reuse and host-session preservation remain unverified.
- Confirmed goal: use applications from a client without lengthy login/logout flows while the host remains logged in and controls authentication.
- The user will not actively use the machines simultaneously. Persistent host login, not concurrent human use, is the requirement.
- Confirmed architecture direction: the host supplies authentication/session information; client browsers contact websites directly. No website-traffic proxy.
- Requested UX: click an extension button labeled `sync auth` when asked to authenticate, to request the host's state for that application.
- The latest use cases explicitly place the authentication request on the client. The earlier host/client button-placement ambiguity is resolved.
- Another organization manages the access policy. The user reports that the intended use does not violate its written policy, but the technical implementation does not match the policy.
- Treat this as a reported policy/implementation mismatch; do not infer prohibited use from the technical restriction alone. The policy document has not been independently reviewed during intake.
- The user named Okta, Slack, and Microsoft 365 and requested compatibility research instead of another application-selection question. Public-source research is complete in research-auth-compatibility.md.
- The user now prefers obtaining application authentication directly: if necessary, control the host's own browser to sign into the target app through normal Okta SSO. Reusing an existing host app session is the other starting state for the same proposed application-specific handoff.
- Both cases are preserved. Application-first is a preferred direction to investigate, not evidence that session handoff is feasible or simpler in this configuration.
- Zoom is newly in scope and not covered by the completed research. Do not extend the earlier research verdict to Zoom.
- The user suggests this might circumvent or prevent Okta false-positive detection. This is an untested hypothesis, not a verified outcome or an evasion requirement; normal host SSO and client access remain subject to provider controls.
- The draft and subject remain `status: draft`. No new formal plan, source changes, live browser access, or credential handling was introduced.
- Trust clarification: after pairing, the client is trusted and its manual `sync auth` request does not require another host-side approval. Provider security prompts remain separate.
- Initial host–client connectivity is a shared tailnet or internal LAN. The first PoC is specifically internal-LAN development-only and deliberately skips pairing, assuming clients are trusted; it must not leave development.
- Later shipped versions must require a pairing process. The development exception is not a shipped security policy. Pairing mechanics and application/account grant scope remain unspecified.
- Network reachability alone does not authenticate a client. Recorded the risk of other reachable devices requesting access and recommended disposable test accounts; no service or security setting was changed.

## Remaining validation needs

- Application-session handoff acceptance and host preservation for both cases; Case 1 first establishes a host application session through normal Okta SSO, not proof of client authentication. Zoom additionally needs source research.
- Browser/OS/profile pairs, native-app browser-assisted sign-in if expected, and behavior when the host is unavailable or its session expires.
- Tenant-specific device/MFA/Entra conditions, continued host-session validity, transport over the allowed private networks, and shipped pairing/grant/revocation mechanics. Per-request host approval is resolved: it is not required after pairing; the development PoC skips pairing.
- Any effect on false positives needs evidence separate from login success. Do not infer that moving the sign-in to the host removes downstream or ongoing risk evaluation.

## Verification and scope

- Four independent public-source investigations completed. Parent verified decisive Chrome cookie API, Slack session separation, Okta FastPass/session protection, and Microsoft browser Token Protection scope; paginated Chrome/Microsoft sources were completed.
- Artifact validation passed: 13 Markdown artifacts, 14 relative file links, 30 source-backed citation definitions, and preservation of all 89 source records across the four ledgers. This validates documentation integrity, not live authentication behavior.
- Documentation-only intake: no application code or live sessions touched; deterministic code checks not applicable.
- No existing project backlog was found. No backlog entries were created; brainstorm remains subject-local.

## Research outcome

- Chrome's cookie API can access HttpOnly-marked records with cookie and host permissions; that is not a documented provider cross-device session-import contract.
- SSO-only can use normal federation to establish fresh Slack/Microsoft sessions without copying their previous application state, when receiving-browser authentication and policy requirements are satisfied.
- Fresh FastPass/device proof and compliance requirements are not supplied by copied cookies. Okta can also reevaluate sessions beyond initial login, depending on feature/policy configuration.
- Microsoft Entra and application sessions remain independent of Okta federation. Current Microsoft browser Token Protection preview is ARM-app-specific, not a blanket Microsoft 365 web-app limitation.
- No general host-session-transfer support contract was found in the consulted vendor docs; this is not proof of technical impossibility for ordinary bearer sessions. Actual portability and host preservation still need controlled validation.
- No traffic-proxy or remote-browser substitute was introduced. No code, login state, credential value, or tenant policy was changed.

## Workflow iteration outcome

- Updated the existing brainstorm in place with the two cases, their application-first convergence, shared request scope, success/failure semantics, and unresolved handoff boundary.
- Recorded host-side normal browser SSO as the preferred approach when the host lacks an app session; did not substitute general Okta-session copying, a traffic proxy, or remote application use.
- Required provider interaction pauses for explicit human completion. Host-browser automation is not a means of satisfying a required client-device check.
- The host-approval interview question is resolved: trusted clients can trigger manual requests without per-request host confirmation. The first development PoC assumes trust without pairing; shipped versions must pair.
- Brainstorming continues; no compatibility result or implementation completion is claimed.
- Iteration verification: re-read the saved draft and checked both cases, the host-browser clarification, continued draft status, Zoom's research gap, and the distinction between the detection hypothesis and evidence. Refreshed the interview sidecar from the saved draft's SHA256. Documentation-only changes; no code checks or live authentication tests were applicable or performed.

## Trust model iteration

- Updated the current goal, constraints, shared request flow, and open questions to distinguish the internal-LAN/no-pairing development PoC from later paired-client versions.
- Broader initial connectivity remains tailnet/internal LAN. No public host–client service exposure was requested.
- Preserved application-first authentication, direct client website traffic, host login preservation, and draft/iteration status.
- No implementation, real authentication, or network configuration changes were performed. Pairing removal is a recorded PoC scope decision, not a code change.
- Verification: re-read the changed trust/deployment section, shared workflow, open questions, and clarification history. Confirmed the PoC exception and shipped pairing requirement are distinct, then refreshed the draft SHA256 sidecar. Documentation-only; no code checks or live network/authentication tests were performed.
