---
status: completed
date: 2026-09-05
subject: 2026-09-05.lan-login-handoff
topics: [authentication, sso, okta]
informs: [../research-auth-compatibility.md]
---

# Research notes: Okta as SSO identity provider

## Current assessment

Normal downstream SSO redirects are documented; importing a host browser's IdP session into another computer is not documented in consulted sources (OKTA-1/2/3/12/23). SSO-only can establish downstream sessions without copying their existing state if client-side IdP authentication and policy requirements succeed. FastPass/device assurance and session/app policy can require additional proof or reauthentication; ITP session protection is configuration-dependent (OKTA-8/9/10/11/15). Host-session reuse and preservation remain unverified for the actual tenant.

## Source findings

### OKTA-1: Session management | Okta Developer

- Source: https://developer.okta.com/docs/concepts/session/
- Evidence: full-text; confidence: high.

- The page explicitly says it is written for Okta Classic Engine and directs Identity Engine users to account-team/forum guidance.
- Okta describes two distinct sessions: the IdP session (created after authentication, cookie-based, enables SSO within the org until sign-out/expiry under org policies) and each application's local/app session (also cookie-based, app-specific, with its own lifetime).
- Local logout ends only the app session while the IdP and other app sessions remain; app-initiated SLO can end IdP and associated app sessions, but non-privileged app sessions may persist and later require reauthentication.

### OKTA-2: Understand how sessions work after the upgrade | Okta Developer

- Source: https://developer.okta.com/docs/guides/oie-upgrade-sessions-api/main/
- Evidence: full-text; confidence: high.

- Identity Engine uses an idx cookie; the Classic sid cookie is not supported for Identity Engine. Okta says session cookies are for browsers only and using them outside browsers is unsupported/not recommended.
- Third-party-cookie blocking can disrupt some Okta flows. The Sign-In Widget handles Identity Engine endpoints and returns idx.
- Session-token-created sessions can interoperate during Classic-to-Identity Engine migration in a limited direction, but creating a Classic sid session when an idx session exists is unsupported; this is upgrade interoperability, not cross-device transfer.
- Okta recommends My Session Management (/api/v1/sessions/me) rather than session-ID REST services; the cookieToken operation works only for sid, not idx.

### OKTA-3: Single Sign-On overview | Okta Developer

- Source: https://developer.okta.com/docs/concepts/sso-overview/
- Evidence: full-text; confidence: high.

- Okta's documented SSO model has the IdP authenticate once, then provide access to connected service providers; direct navigation to an app can redirect an unauthenticated user to Okta and back.
- Okta supports OIDC and SAML 2.0 for federated SSO; OIDC is recommended for new integrations, while SAML is widely used by SaaS web apps. The app/protocol determines integration choice.
- Okta distinguishes SSO from logout: SLO depends on each app's protocol support and can be inconsistent; Universal Logout is described as clearing the main Okta session and revoking tokens, with app behavior dependent on integration.

### OKTA-4: Understanding SAML | Okta Developer

- Source: https://developer.okta.com/docs/concepts/saml/
- Evidence: full-text; confidence: high.

- Okta documents SAML as primarily web-based and brokered by a browser agent. In both SP-initiated and IdP-initiated flow, the browser carries redirects; the SP receives a SAML response/assertion and validates it.
- The SP cannot know the user until the assertion returns; SAML is asynchronous, and the response must contain needed information. The SP must have trusted IdP metadata/certificate, sign-in URL, and ACS endpoint.
- The downstream application (SP) receives an assertion to establish its own authenticated state; the page does not describe importing or transferring an existing browser's Okta session to another browser/device.

### OKTA-5: OAuth 2.0 and OpenID Connect overview | Okta Developer

- Source: https://developer.okta.com/docs/concepts/oauth-openid/
- Evidence: full-text; confidence: high.

- OIDC adds authentication and SSO to OAuth 2.0 and returns an ID token alongside optional access/refresh tokens; OAuth access tokens authorize a client to a protected resource, not a generic browser login.
- Okta recommends Authorization Code with PKCE for server-side, SPA, and native clients; authorization code is associated with a code challenge and requires the matching verifier. Interaction Code is only available in Identity Engine orgs.
- The SAML 2.0 assertion grant is for an existing trust relationship and exchanges one signed assertion for an OAuth token; it is a protocol grant, not an instruction to transfer browser cookies or downstream web sessions. Implicit is legacy and PKCE is recommended for modern SPAs.

### OKTA-6: Authentication | Okta Developer

- Source: https://developer.okta.com/docs/reference/api/authn/
- Evidence: full-text; confidence: high.

- The page labels Authentication API as Classic Engine; it says this API can create an Okta session cookie but directs migration planning for Identity Engine.
- Authentication transactions are stateful and use ephemeral state tokens; `sessionToken` is an ephemeral one-time token issued only on SUCCESS, exchangeable for a session or session cookie, with a five-minute lifetime.
- Authentication behavior depends on app type and org security policies; primary auth evaluates password, MFA, and sign-on policy. A Classic `deviceToken` is client-context data, is not shared with Identity Engine-specific APIs, and missing/mismatched device token can trigger repeated challenge/new-device behavior when relevant policies are enabled.

### OKTA-7: Sessions | Okta Developer API reference

- Source: https://developer.okta.com/docs/api/openapi/okta-management/management/tags/session
- Evidence: full-text; confidence: high.

- Okta says its Sessions API maintains authentication sessions using cookies for interactive browser user agents; administrator-configured cookie expiry and logout/browser closure govern validity.
- A session token is a one-time bearer proof of authentication that may be redeemed once for an interactive SSO session in a user agent; it is revoked when it expires. The page explicitly warns it is equivalent to the user's actual credentials and must be protected.
- The Sessions API does not itself do direct authentication; direct authentication is via Authentication API or OIDC Resource Owner Password flow. It lists browser visits to authorization/session redirect/embed links as ways to redeem session tokens.

### OKTA-8: Global session policy evaluation | Okta Help

- Source: https://help.okta.com/oie/en-us/content/topics/identity-engine/policies/osop-evaluation.htm
- Evidence: full-text; confidence: high.

- Identity Engine evaluates policy conditions/rules, including location and trusted-network conditions; restrictive rules should be prioritized. This demonstrates policy evaluation is contextual rather than only a one-time login event.
- Okta documents distinct policy layers: global session policy controls overall session validity, while app sign-in policy controls reauthentication frequency.
- When maximum Okta global-session idle time is reached, users must reauthenticate under app sign-in policy rules even if Keep me signed in was selected.
- Identity Engine System Log includes policy evaluation and user.session.start; user.session.start logs the first authenticator verification associated with establishing an IdP session and does not indicate an access token was granted.

### OKTA-9: Authentication method chain | Okta Help

- Source: https://help.okta.com/oie/en-us/content/topics/identity-engine/policies/authentication-method-chain.htm
- Evidence: full-text; confidence: high.

- Identity Engine app sign-in policy rules can require ordered authentication methods and characteristics such as phishing resistance, hardware protection, and user interaction.
- The documented reauthentication-frequency choices include every access, after a specified interval since signing in to any protected resource under the active global session, or only when no Okta global session exists.
- If already authenticated with a first method, the user may still be prompted for subsequent methods within the reauthentication window; Identity Threat Protection changes authenticator-order enforcement for session protection.

### OKTA-10: Okta FastPass | Okta Help

- Source: https://help.okta.com/oie/en-us/content/topics/identity-engine/devices/fp/fp-main.htm
- Evidence: full-text; confidence: high.

- FastPass is a phishing-resistant passwordless authenticator requiring the latest Okta Verify and an enrolled account on the user's desktop/laptop/mobile device; support is documented for Android, iOS, macOS, and Windows.
- FastPass uses public-key cryptography and a proof-of-possession private key issued during enrollment. The browser/OS app forwards a unique server challenge to Okta Verify on the same device; Okta verifies the signed response and evaluates device context.
- FastPass works with OIDC, SAML, and WS-Federation apps protected by Okta. Device assurance can deny non-compliant devices unless remediation is completed.
- Parent verified the full FastPass source: Okta Verify on the same device signs a fresh server challenge with its enrolled proof-of-possession key and supplies device signals. Browser-cookie access is not that proof mechanism; cookie availability alone cannot establish satisfaction of a FastPass challenge.

### OKTA-11: Device assurance | Okta Help

- Source: https://help.okta.com/oie/en-us/content/topics/identity-engine/devices/device-assurance.htm
- Evidence: full-text; confidence: high.

- Device assurance policies check security-related device attributes as part of app sign-in policy rules, such as OS version or security patch, before a device can access Okta-protected resources.
- A device assurance policy has no effect until included in an app sign-in policy rule; the feature establishes minimum device requirements for systems/apps.
- Okta documents Device health support through Okta Verify versions for Android, iOS, macOS, and Windows, with remediation messages for failed checks.

### OKTA-12: Okta deployment models - redirect vs. embedded | Okta Developer

- Source: https://developer.okta.com/docs/concepts/redirect-vs-embedded/
- Evidence: full-text; confidence: high.

- Redirect authentication delegates sign-in to an Okta-hosted page over OAuth 2.0 or SAML; after policy-governed authentication Okta redirects back to the app with a token/assertion and creates an Okta session.
- Okta says redirect authentication supports implicit SSO for other resources when an Okta session is created, and recommends it for multiple/third-party apps and centralized session management. Embedded clients instead own authentication and create their own app sessions.
- The page includes an engine matrix: redirect uses the configured org's API type; customer-hosted Sign-In Widget v7+ defaults to Identity Engine unless `useClassicEngine` is true, while older widget behavior differs. Exact app/org configuration determines the engine.

### OKTA-13: Device registration | Okta Help

- Source: https://help.okta.com/oie/en-us/Content/Topics/identity-engine/devices/device-registration.htm
- Evidence: full-text; confidence: high.

- Identity Engine device registration binds a device to the Okta Verify app instance; each registered device is a unique object in Universal Directory.
- Registration creates a unique key stored on the device in hardware- or software-backed keystore, then creates a device record bound to that Okta Verify app instance.
- When accessing a protected app, Okta probes whether Verify is installed, the device is registered/managed, secure hardware exists, and the proof-of-possession key is hardware-protected; failed probes prevent proceeding.

### OKTA-14: Work with Okta session cookies | Okta Developer

- Source: https://developer.okta.com/docs/guides/session-cookie/main/
- Evidence: full-text; confidence: high.

- The guide explicitly applies to Okta Classic Engine and points Identity Engine readers to the upgrade/session APIs; it says browser session cookies are not supported or recommended outside a browser. Third-party-cookie blocking can disrupt some flows.
- A Classic sessionToken can be supplied to a browser authorization/session-redirect/app-launch flow to set an Okta session cookie and continue SSO, but only once; by default Classic orgs ignore sessionToken when a browser already has a session cookie.
- The browser's resulting Okta session remains subject to expiry and logout/browser closure. The examples show downstream SAML SSO receiving a newly generated assertion after Okta session establishment; the token is not itself a downstream app session.

### OKTA-15: Enforce session protection policy | Okta Help

- Source: https://help.okta.com/oie/en-us/content/topics/itp/enforce-continuous-access.htm
- Evidence: full-text; confidence: high.

- This page describes the Generally Available session protection policy; by default it is monitoring mode, while a separate Session protection feature has its own configuration page.
- With Identity Threat Protection enabled, session protection monitors user sessions for IP-address or device-context changes and reevaluates global session/authentication policies when changes are detected.
- Enforced modes may prompt reauthentication; enforced-with-action can trigger Universal Logout or a delegated Workflow. Monitoring logs context changes/violations without remediation.
- Parent verified the full GA session-protection source: in ITP-enabled orgs it monitors IP/device-context changes; monitoring is the default and does not enforce remediation. Enforced modes can reevaluate global/app policies, prompt reauthentication, and optionally trigger Universal Logout. This is conditional feature configuration, not proof it is enabled in the user's tenant.

### OKTA-16: Okta Identity Engine overview | Okta Developer

- Source: https://developer.okta.com/docs/concepts/oie-intro/
- Evidence: full-text; confidence: high.

- Identity Engine app intent links support IdP- and SP-initiated app flows and host the app-specific sign-in experience; Identity Engine evaluates global session, app sign-in, and other relevant policies during the flow.
- Identity Engine's recommended Okta-hosted redirect widget redirects back to the app; embedded API sign-in uses limited APIs and does not create a session for SSO. Universal Logout can terminate sessions/tokens for supported apps when risk changes.
- Okta's documentation separates Identity Engine and Classic content, and says new orgs created on or after March 1, 2022 are Identity Engine orgs; existing Classic org functionality continues for now. Exact org configuration determines the engine.

### OKTA-17: SAML assertion inline hook | Okta Developer

- Source: https://developer.okta.com/docs/guides/saml-inline-hook/main/
- Evidence: full-text; confidence: high.

- The Okta org acts as IdP for a SAML-authenticated app; during the user's app sign-in, Okta invokes the assertion hook and then signs the user into the app with the resulting assertion claims.
- The external service can add/replace claims in the SAML assertion for that authentication transaction; this is per-app/per-sign-in customization, not a persistent browser session or downstream session import.
- The tutorial requires an Okta Integrator Free Plan org and notes its Glitch sample is unavailable, while still documenting the protocol flow.

### OKTA-18: Sessions | Okta Developer API reference

- Source: https://developer.okta.com/docs/api/openapi/okta-management/management/tag/Session/
- Evidence: full-text; confidence: high.

- The Sessions API reference reiterates browser-only cookie use, configurable expiration, and logout/browser closure as session terminators.
- It lists management operations to retrieve, revoke, and refresh a session, requiring management scopes; this is org/session administration rather than a client-side browser handoff contract.
- The session-token section reiterates one-time redemption and credential-equivalent sensitivity.

### OKTA-19: Create an app integration | Okta Developer

- Source: https://developer.okta.com/docs/guides/create-an-app-integration/saml2/main/
- Evidence: full-text; confidence: high.

- Okta app integrations connect an org to external apps and can provide SSO, central policy, and monitoring. Supported integration protocols include OIDC, SAML, SWA, WS-Fed, and SCIM, with OIDC/SAML as federated SSO choices and SWA as form-based credential submission.
- Custom integration creation is an admin operation and is visible only within the org; the app must be assigned to users/groups before they can SSO. The guide's hands-on setup requires an Okta Integrator Free Plan org and admin role; non-Free orgs use a Classic experience in this UI flow.
- The documented test path is user sign-in to End-User Dashboard/app tile, app-initiated redirect back from Okta, and System Log troubleshooting.

### OKTA-20: Create OpenID Connect app integrations | Okta Help

- Source: https://help.okta.com/oie/en-us/Content/Topics/Apps/Apps_App_Integration_Wizard_OIDC.htm
- Evidence: full-text; confidence: high.

- The OIDC app integration requires choosing a platform—web, native, or SPA—and configuring redirect URIs; Okta sends authentication responses/ID tokens only to registered absolute URIs, and wildcard subdomains are discouraged because they can expose codes/tokens to unexpected pages.
- For SPAs, the default client-authentication method is none with PKCE required; Okta says PKCE ensures only the client that requested the token can redeem it. Web/native integrations may use authorization code, refresh token, device authorization, and other configured grant types subject to platform settings.
- OIDC app integrations can be app-only/background or app/Okta initiated. Tenant configuration can constrain usable network zones for tokens, require DPoP, require consent, and define logout behavior. The page's wizard instructions use Classic experience in the Admin Console despite its Identity Engine publication.

### OKTA-21: Create SAML app integrations | Okta Help

- Source: https://help.okta.com/oie/en-us/Content/Topics/Apps/Apps_App_Integration_Wizard_SAML.htm?cshid=csh-attribute-statements-saml
- Evidence: full-text; confidence: high.

- Identity Engine SAML app integrations use federated authentication for one-click access; the integration's implementation/vendor determines required configuration.
- For an internal app, an administrator creates the integration in the org and assigns it to users; the downstream app must be configured to trust Okta and verify signed SAML assertions for SSO.
- The page warns that third-party-cookie blocking can disrupt app links/instructions and recommends allowing Okta to use cookies. The Admin Console workflow is labeled Classic experience even in Identity Engine docs.

### OKTA-22: Okta Identity Engine API release notes (2024)

- Source: https://developer.okta.com/docs/release-notes/2024-okta-identity-engine/
- Evidence: full-text; confidence: high.

- A June 2024 release note says `SessionNotOnOrAfter` is an optional SAML parameter allowing the IdP to control a service provider's session lifetime by adding it to the SAML assertion.
- The release note explicitly labels the feature 'GA in Preview' (not a blanket GA-in-Production statement), so availability should not be assumed for every tenant.
- The same release notes distinguish other Early Access/GA scopes, reinforcing that feature lifecycle and org availability matter.

### OKTA-23: Share a sign-in session with native mobile apps | Okta Developer

- Source: https://developer.okta.com/docs/guides/shared-sso-android-ios/ios/main/
- Evidence: full-text; confidence: high.

- The guide explicitly applies to Classic Engine and demonstrates sharing SSO between two native OIDC mobile apps on one device via that device's browser/external user-agent—not between separate computers.
- Okta distinguishes session SSO (cookie eliminates prompts during a session) from persistent SSO (persistent cookie can survive sessions); persistent SSO is disabled by default and must be enabled to share across native apps on a device.
- The guide says an existing session on the same Okta domain can silently authenticate another app by default; prompt=none checks whether the browser has a valid session and returns an error if absent/invalid.
