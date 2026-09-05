---
status: completed
date: 2026-09-05
subject: 2026-09-05.lan-login-handoff
topics: [authentication, sso, okta]
informs: [../research-auth-compatibility.md]
---

# Sources: Okta as SSO identity provider

## OKTA-1: Session management | Okta Developer

- URL: https://developer.okta.com/docs/concepts/session/
- Source type: Official Okta Developer documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> When you use Okta as your IdP, there are two types of sessions ... the IdP session and the app session.

> The IdP session is active until the user signs out of the org or when the session expires, based on the policies defined in the org.

> The app creates the app session (also known as a local session) after the user is authenticated.

## OKTA-2: Understand how sessions work after the upgrade | Okta Developer

- URL: https://developer.okta.com/docs/guides/oie-upgrade-sessions-api/main/
- Source type: Official Okta Developer Identity Engine guide
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> The use of the session ID cookie (`sid`) isn't supported in Identity Engine. The new `idx` cookie is used with Identity Engine.

> Use session cookies with browsers only. Using session cookies outside of a browser is subject to change and isn't supported or recommended by Okta.

> creating a `sid` session when there's an `idx` session (Identity Engine session) present isn't supported.

## OKTA-3: Single Sign-On overview | Okta Developer

- URL: https://developer.okta.com/docs/concepts/sso-overview/
- Source type: Official Okta Developer documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> SSO is an authentication method that allows you to sign in to multiple apps and services using a single authentication flow.

> When the user navigates directly to your app's URL ... it redirects them to the Okta sign-in page. After successful authentication, Okta sends the user back to your app.

> For new app integrations, OIDC is recommended.

## OKTA-4: Understanding SAML | Okta Developer

- URL: https://developer.okta.com/docs/concepts/saml/
- Source type: Official Okta Developer protocol documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> SAML is mostly used as a web-based authentication mechanism because it relies on using the browser agent to broker the authentication flow.

> The SP never directly interacts with the IdP. A browser acts as the agent to carry out all the redirects.

> A SAML Response ... contains the actual assertion of the authenticated user.

## OKTA-5: OAuth 2.0 and OpenID Connect overview | Okta Developer

- URL: https://developer.okta.com/docs/concepts/oauth-openid/
- Source type: Official Okta Developer OAuth/OIDC documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> OIDC ... extends OAuth 2.0 with user authentication and Single Sign-On (SSO) functionality.

> Okta recommends that you use the Authorization Code flow with PKCE for your OAuth client, if possible.

> This flow is intended for a client app that uses an existing trust relationship without a direct user approval step at the authorization server.

## OKTA-6: Authentication | Okta Developer

- URL: https://developer.okta.com/docs/reference/api/authn/
- Source type: Official Okta Developer API reference
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> `sessionToken` | Ephemeral one-time token used to bootstrap an Okta session

> A one-time token is issued as the `sessionToken` response parameter when an authentication transaction completes with the `SUCCESS` status.

> The lifetime of the `sessionToken` is 5 minutes.

## OKTA-7: Sessions | Okta Developer API reference

- URL: https://developer.okta.com/docs/api/openapi/okta-management/management/tags/session
- Source type: Official Okta Developer API reference (Markdown)
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> Session tokens can only be used once to establish a Session for a user and are revoked when the token expires.

> Session tokens are secrets ... A session token for a user is equivalent to having the user's actual credentials.

> Okta uses an HTTP session cookie to provide access to your Okta organization and applications across web requests for an interactive user agent such as a web browser.

## OKTA-8: Global session policy evaluation | Okta Help

- URL: https://help.okta.com/oie/en-us/content/topics/identity-engine/policies/osop-evaluation.htm
- Source type: Official Okta Help Identity Engine documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> The global session policy controls how long an overall session is valid, but the app sign-in policy controls re-authentication frequency.

> After that, users must reauthenticate according to the rules of the app sign-in policy.

> It doesn't indicate that an access token was granted.

## OKTA-9: Authentication method chain | Okta Help

- URL: https://help.okta.com/oie/en-us/content/topics/identity-engine/policies/authentication-method-chain.htm
- Source type: Official Okta Help Identity Engine documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> In Prompt for authentication, specify how often the user should be prompted for authentication.

> Every time user signs in to resource: Users must authenticate every time they try to access the app.

> When it's been over a specified length of time ... Users are prompted to authenticate when they exceed the time interval you specify.

## OKTA-10: Okta FastPass | Okta Help

- URL: https://help.okta.com/oie/en-us/content/topics/identity-engine/devices/fp/fp-main.htm
- Source type: Official Okta Help Identity Engine documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> Okta FastPass uses public key cryptography to authenticate users.

> the Sign-In Widget ... forwards that challenge to Okta Verify with Okta FastPass enabled (installed on the same device).

> The Okta server validates the signature and confirms that the response corresponds to the unique challenge that was issued.

## OKTA-11: Device assurance | Okta Help

- URL: https://help.okta.com/oie/en-us/content/topics/identity-engine/devices/device-assurance.htm
- Source type: Official Okta Help Identity Engine documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> you can configure a device assurance policy to check whether a specific operating system version or security patch is installed on a device

> By adding device checks to app sign-in policy rules, you can establish minimum requirements for the devices

> You can't apply device assurance policies ... until you make them part of an app sign-in policy rule.

## OKTA-12: Okta deployment models - redirect vs. embedded | Okta Developer

- URL: https://developer.okta.com/docs/concepts/redirect-vs-embedded/
- Source type: Official Okta Developer deployment-model documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> Redirect authentication ... grants authentication control to Okta by redirecting to an Okta hosted sign-in page.

> After the user signs in (based on policies configured in Okta), Okta redirects the user back to your app.

> SSO is implicit (if an Okta session is created, SSO is implemented for other resources).

## OKTA-13: Device registration | Okta Help

- URL: https://help.okta.com/oie/en-us/Content/Topics/identity-engine/devices/device-registration.htm
- Source type: Official Okta Help Identity Engine documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> Device registration binds a device to the Okta Verify app instance on the device.

> A unique key is created and stored on the device.

> If the probe is successful ... the end user is able to proceed with their task. Otherwise, they're unable to proceed.

## OKTA-14: Work with Okta session cookies | Okta Developer

- URL: https://developer.okta.com/docs/guides/session-cookie/main/
- Source type: Official Okta Developer Classic Engine guide
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> This guide provides examples for retrieving and setting a session cookie ... for Okta Classic Engine.

> Use session cookies with browsers only. Okta doesn't support or recommend using session cookies outside of a browser because they're subject to change.

> The session token can only be used once to establish a session.

## OKTA-15: Enforce session protection policy | Okta Help

- URL: https://help.okta.com/oie/en-us/content/topics/itp/enforce-continuous-access.htm
- Source type: Official Okta Help Identity Engine documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> the session protection policy monitors the user session for changes in IP address or device context.

> When ITP detects session context changes, it reevaluates the global session and authentication policies.

> When the session protection policy is in either of the enforced modes, users may be prompted to reauthenticate more often.

## OKTA-16: Okta Identity Engine overview | Okta Developer

- URL: https://developer.okta.com/docs/concepts/oie-intro/
- Source type: Official Okta Developer Identity Engine overview
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> Identity Engine evaluates the global session policy, app sign-in policy, and all other policies relevant to the sign-in experience.

> Embedded API sign-in flow ... uses a limited set of APIs ... without creating a session for single sign-on.

> On March 1, 2022, all new Okta orgs are Identity Engine orgs.

## OKTA-17: SAML assertion inline hook | Okta Developer

- URL: https://developer.okta.com/docs/guides/saml-inline-hook/main/
- Source type: Official Okta Developer SAML guide
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> The Okta org functions as the Identity Provider (IdP).

> A user signs in to an app authenticated by SAML ... and authenticates the user.

> The user is signed in to the app with the additional claim in the SAML assertion.

## OKTA-18: Sessions | Okta Developer API reference

- URL: https://developer.okta.com/docs/api/openapi/okta-management/management/tag/Session/
- Source type: Official Okta Developer API reference (Markdown)
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> A session cookie has an expiration configurable by an administrator for the organization.

> The Sessions API provides operations to create and manage authentication Sessions.

> A session token is a one-time bearer token that provides proof of authentication.

## OKTA-19: Create an app integration | Okta Developer

- URL: https://developer.okta.com/docs/guides/create-an-app-integration/saml2/main/
- Source type: Official Okta Developer app-integration documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> App integrations in Okta connect your Okta org to external apps and services.

> Provide users with secure, seamless Single Sign-On (SSO) access to their apps.

> The app integration ... [must be] assigned to your end users.

## OKTA-20: Create OpenID Connect app integrations | Okta Help

- URL: https://help.okta.com/oie/en-us/Content/Topics/Apps/Apps_App_Integration_Wizard_OIDC.htm
- Source type: Official Okta Help Identity Engine OIDC documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> Choose the platform for your app integration. You can choose web, native, and single-page apps (SPA).

> Sign-in redirect URIs ... must be absolute URIs.

> PKCE ensures that only the client that requested the access token can redeem it.

## OKTA-21: Create SAML app integrations | Okta Help

- URL: https://help.okta.com/oie/en-us/Content/Topics/Apps/Apps_App_Integration_Wizard_SAML.htm?cshid=csh-attribute-statements-saml
- Source type: Official Okta Help Identity Engine SAML documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> SAML app integrations use federated authentication standards to give end users one-click access to your SAML application.

> You can modify your integration's parameters and assign it to users.

> You must configure your app integration to verify signed SAML assertions for SSO and trust Okta as the Identity Provider.

## OKTA-22: Okta Identity Engine API release notes (2024)

- URL: https://developer.okta.com/docs/release-notes/2024-okta-identity-engine/
- Source type: Official Okta Developer Identity Engine release notes
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> The `SessionNotOnOrAfter` parameter is an optional SAML parameter that enables the IdP to control the session at the SP.

> GA in Preview

## OKTA-23: Share a sign-in session with native mobile apps | Okta Developer

- URL: https://developer.okta.com/docs/guides/shared-sso-android-ios/ios/main/
- Source type: Official Okta Developer Classic Engine guide
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> share a Single Sign-On (SSO) session on a mobile device.

> Persistent SSO is disabled by default in Okta.

> The default behavior when a session exists is to silently authenticate the user without a sign-in prompt if using the same Okta domain.
