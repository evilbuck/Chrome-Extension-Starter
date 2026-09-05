---
status: completed
date: 2026-09-05
subject: 2026-09-05.lan-login-handoff
topics: [authentication, sso, microsoft365]
informs: [../research-auth-compatibility.md]
---

# Sources: Microsoft 365 federated login

## MICROSOFT365-1: Configure Single Sign-On for Office 365 — Okta Classic Engine

- URL: https://help.okta.com/en-us/content/topics/apps/office365-deployment/configure-sso.htm
- Source type: official vendor documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> "Configure single sign-on (SSO) to let your users authenticate to Office 365 using their Okta credentials."

> "WS-Federation defines mechanisms to transfer identity information using encrypted SOAP messages. It doesn't require a separate password for Office 365."

> "Sign in to Microsoft as a global administrator for your Microsoft tenant."

## MICROSOFT365-2: What is federation with Microsoft Entra ID? — Microsoft Learn

- URL: https://learn.microsoft.com/en-us/entra/identity/hybrid/connect/whatis-fed
- Source type: official vendor documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> "Federation is a collection of domains that have established trust."

> "You can federate your on-premises environment with Microsoft Entra ID and use this federation for authentication and authorization."

> "This sign-in method ensures that all user authentication occurs on-premises."

## MICROSOFT365-3: Understanding Tokens in Microsoft Entra ID — Microsoft Learn

- URL: https://learn.microsoft.com/en-us/entra/identity/devices/concept-tokens-microsoft-entra-id
- Source type: official vendor documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> "Web applications accessed via browsers sometimes use different kinds of tokens compared with native apps such as Outlook and Teams."

> "App auth cookie | Web app | Access the resource"

> "Sign-in session tokens ... are passed to the identity provider to request tokens that are in the app session category."

## MICROSOFT365-4: Conditional Access: Manage Session Controls Effectively — Microsoft Learn

- URL: https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-conditional-access-session
- Source type: official vendor documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> "Sign-in frequency specifies how long a user can stay signed in before being prompted to sign in again when accessing a resource."

> "A persistent browser session lets users stay signed in after closing and reopening their browser window."

> "Application enforced restrictions ... require Microsoft Entra ID to pass device information to the selected cloud apps."

## MICROSOFT365-5: Conditional Access adaptive session lifetime policies — Microsoft Learn

- URL: https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-session-lifetime
- Source type: official vendor documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> "The Microsoft Entra ID default configuration for user sign-in frequency is a rolling window of 90 days."

> "A persistent browser session lets users stay signed in after closing and reopening their browser window."

> "In persistent browsers, cookies remain stored on the user's device even after the browser is closed."

## MICROSOFT365-6: Continuous access evaluation in Microsoft Entra — Microsoft Learn

- URL: https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-continuous-access-evaluation
- Source type: official vendor documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> "This two-way conversation provides two important capabilities."

> "Not all client app and resource provider combinations are supported."

> "The first column of this table refers to web applications launched via web browser ... The remaining four columns refer to native applications."

## MICROSOFT365-7: How Token Protection Enhances Conditional Access Policies — Microsoft Learn

- URL: https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-token-protection
- Source type: official vendor documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> "Token Protection is a Conditional Access session control"

> "Browser-based application support is currently limited to selected web apps, browsers, and device configurations that access Azure Resource Manager."

> "For browser-based applications in preview, enforcement is supported for Azure Resource Manager"

## MICROSOFT365-8: Token Protection deployment guide — Web apps (Preview) — Microsoft Learn

- URL: https://learn.microsoft.com/en-us/entra/identity/conditional-access/deployment-guide-token-protection-web-apps
- Source type: official vendor documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> "Token Protection for web applications is currently in preview."

> "Only the preceding web applications are supported."

> "Authentication requests from supported applications and browsers stop completing entirely inside the browser and are instead handled by the platform authentication broker."

## MICROSOFT365-9: Understanding Primary Refresh Token (PRT) in Microsoft Entra ID — Microsoft Learn

- URL: https://learn.microsoft.com/en-us/entra/identity/devices/concept-primary-refresh-token
- Source type: official vendor documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> "A Primary Refresh Token (PRT) is a key artifact of Microsoft Entra authentication ... issued to Microsoft first party token brokers"

> "Customers who enable Entra federation with non-Microsoft Identity Providers must configure those Identity Providers to support WS-Trust protocol to enable PRT issuance"

> "The browsers that support Browser SSO are Safari, Firefox, Chrome, and Microsoft Edge."

## MICROSOFT365-10: How to Use Conditions in Conditional Access Policies — Microsoft Learn

- URL: https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-conditional-access-conditions
- Source type: official vendor documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> "Modern authentication clients - Browser ... include web-based applications that use protocols like SAML, WS-Federation, OpenID Connect"

> "This setting works with all browsers. However, to satisfy a device policy ... the following operating systems and browsers are supported."

> "The device check fails if the browser is running in private mode or if cookies are disabled."

## MICROSOFT365-11: How to Require Device Compliance with Conditional Access — Microsoft Learn

- URL: https://learn.microsoft.com/en-us/entra/identity/conditional-access/policy-all-users-device-compliance
- Source type: official vendor documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> "Microsoft Intune and Microsoft Entra work together to secure your organization through device compliance policies and Conditional Access."

> "Without a compliance policy created in Microsoft Intune, this Conditional Access policy won't function as intended."

> "When a user first signs in through the browser the user is prompted to select the certificate."

## MICROSOFT365-12: Tutorial to migrate Okta sign-on policies to Microsoft Entra Conditional Access — Microsoft Learn

- URL: https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/migrate-okta-sign-on-policies-conditional-access
- Source type: official vendor documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> "This tutorial assumes you have: Office 365 tenant federated to Okta for sign-in and multifactor authentication"

> "Okta device trust to device-based Conditional Access"

> "The test user ... is prompted to sign in with Okta MFA and Microsoft Entra multifactor authentication."

## MICROSOFT365-13: Satisfy Microsoft Entra ID MFA controls with MFA claims from a federated IdP — Microsoft Learn

- URL: https://learn.microsoft.com/en-us/entra/identity/authentication/how-to-mfa-expected-inbound-assertions
- Source type: official vendor documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> "Microsoft Entra ID requires specific assertions from a federated identity provider (IdP)"

> "Microsoft Entra will redirect to IdP for authentication"

> "The inbound MFA assertions must be present in the AuthnContext element of the AuthnStatement."

## MICROSOFT365-14: Overview of Conditional Access Authentication Strengths — Microsoft Learn

- URL: https://learn.microsoft.com/en-us/entra/identity/authentication/concept-authentication-strengths
- Source type: official vendor documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> "An authentication strength is a Microsoft Entra Conditional Access control"

> "Federated multifactor"

> "Conditional Access policies are evaluated only after the initial authentication."

## MICROSOFT365-15: Strengthen federated sign-in security — Microsoft Learn

- URL: https://learn.microsoft.com/en-us/entra/identity/users/strengthen-federated-sign-in-security
- Source type: official vendor documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> "In a federated sign-in, the identity provider authenticates the user and issues a federation token."

> "Microsoft Entra ID validates the incoming token and maps it to a user account in the tenant."

> "Entra performs a series of security and policy checks"

## MICROSOFT365-16: Authentication transfer as a condition to secure mobile users — Microsoft Learn

- URL: https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-authentication-transfer
- Source type: official vendor documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> "Authentication transfer is an authentication flow that simplifies cross-device sign-in from PC to mobile for Microsoft apps."

> "Authentication transfer only transfers authentication claims. Device-related claims ... don't transfer to the target device."

> "Authentication transfer isn't supported for non-Microsoft apps."

## MICROSOFT365-17: SharePoint authentication — SharePoint in Microsoft 365 — Microsoft Learn

- URL: https://learn.microsoft.com/en-us/sharepoint/authentication
- Source type: official vendor documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> "The Federation Authentication (FedAuth) cookie is for each top-level site in SharePoint"

> "By default, all SharePoint cookies are session cookies."

> "These cookies are saved to the browser's cache and will persist even if the browser is closed or the computer is restarted."

## MICROSOFT365-18: Web browser cookies used in Microsoft Entra authentication — Microsoft Learn

- URL: https://learn.microsoft.com/en-us/entra/identity/authentication/concept-authentication-web-browser-cookies
- Source type: official vendor documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> "Persistent session tokens are stored as persistent cookies on the web browser's cookie jar."

> "Non-persistent session tokens are stored as session cookies on the web browser, and are destroyed when the browser session is closed."

> "Cookie definitions and respective names are subject to change at any moment in time according to Microsoft Entra service requirements."

## MICROSOFT365-19: Session timeouts for Microsoft 365 — Microsoft 365 Enterprise — Microsoft Learn

- URL: https://learn.microsoft.com/en-us/microsoft-365/enterprise/session-timeouts?view=o365-worldwide
- Source type: official vendor documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: medium

> "When users authenticate in any of the Microsoft 365 web apps or mobile apps, a session is established."

> "The Microsoft 365 services have different session timeouts"

> "Sessions can expire when users are inactive, when they close the browser or tab, or when their authentication token expires"

## MICROSOFT365-20: user: revokeSignInSessions — Microsoft Graph v1.0 — Microsoft Learn

- URL: https://learn.microsoft.com/en-us/graph/api/user-revokesigninsessions?view=graph-rest-1.0
- Source type: official vendor documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> "Invalidates all the refresh tokens issued to applications for a user (and session cookies in a user's browser)"

> "This operation prevents access ... by requiring the user to sign in again"

> "This API doesn't revoke sign-in sessions for external users, because external users sign in through their home tenant."

## MICROSOFT365-21: WS-Fed app integrations — Okta Classic Engine

- URL: https://help.okta.com/en-us/content/topics/apps/apps-about-wsfed.htm
- Source type: official vendor documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> "Typically, WS-Fed is used to sign on to ... Microsoft Office 365, where Okta acts as an authorization server or identity provider (IdP)."

> "Okta returns an assertion to the client apps through the end user's browser."

> "The client apps validate the returned assertion and allow the user access to the client app."

## MICROSOFT365-22: Device Bound Session Credentials (DBSC) — Chrome for Developers

- URL: https://developer.chrome.com/docs/web-platform/device-bound-session-credentials
- Source type: official browser documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> "DBSC ... ensuring sessions are bound to specific devices."

> "To integrate DBSC into your application, you need to ... Add a session registration endpoint ... [and] Add a refresh endpoint"

> "Most of your existing endpoints don't require any changes. DBSC is designed to be additive and non-disruptive."

## MICROSOFT365-23: chrome.cookies API reference — Chrome for Developers

- URL: https://developer.chrome.com/docs/extensions/reference/api/cookies.md.txt
- Source type: official browser API documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> "Use the chrome.cookies API to query and modify cookies, and to be notified when they change."

> "To use the cookies API, declare the \"cookies\" permission ... along with host permissions"

> "Fired when a cookie is set or removed."

## MICROSOFT365-24: chrome.webRequest API reference — Chrome for Developers

- URL: https://developer.chrome.com/docs/extensions/reference/api/webRequest.md.txt
- Source type: official browser API documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> "Use the chrome.webRequest API to observe and analyze traffic and to intercept, block, or modify requests in-flight."

> "The webRequest API only exposes requests that the extension has permission to see"

> "The web request API presents an abstraction of the network stack to the extension."

## MICROSOFT365-25: Configure Single Sign-On for Office 365 — Okta Identity Engine

- URL: https://help.okta.com/oie/en-us/content/topics/apps/office365-deployment/configure-sso.htm
- Source type: official vendor documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> "Identity Engine publication"

> "Configure single sign-on (SSO) to let your users authenticate to Office 365 using their Okta credentials."

> "Sign in to Microsoft as a global administrator for your Microsoft tenant."
