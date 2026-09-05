---
status: completed
date: 2026-09-05
subject: 2026-09-05.lan-login-handoff
topics: [authentication, sso, microsoft365]
informs: [../research-auth-compatibility.md]
---

# Research notes: Microsoft 365 federated login

## Current assessment

Okta-federated Microsoft 365 browser sign-in is documented; cross-computer session import is not a supported contract found in consulted sources (MICROSOFT365-1/15/18/21/25). Entra and Microsoft apps still own policy and session state; federation does not remove device, MFA, session-frequency, or resource-specific conditions (MICROSOFT365-3/4/5/6/10/11/13/14). The current browser Token Protection preview is ARM-app-specific and must not be generalized from native-app support to all Microsoft 365 web apps (MICROSOFT365-7/8). Actual tenant portability and host preservation require validation.

## Source findings

### MICROSOFT365-1: Configure Single Sign-On for Office 365 — Okta Classic Engine

- Source: https://help.okta.com/en-us/content/topics/apps/office365-deployment/configure-sso.htm
- Evidence: full-text; confidence: high.

- Okta documents Office 365 SSO via SWA or WS-Federation; it recommends WS-Federation when possible and says WS-Fed transfers identity information without requiring a separate Office 365 password.
- The WS-Federation integration is configured by an administrator (automatic setup requires Microsoft global-admin authentication/permissions; manual setup uses Microsoft Graph PowerShell), and domains must be federated in the Microsoft tenant.
- Okta's procedure ends with testing by signing in as a test user and opening Office 365 from the Okta End-User Dashboard; this documents a browser redirect/login integration, not importing an existing Microsoft browser session.

### MICROSOFT365-2: What is federation with Microsoft Entra ID? — Microsoft Learn

- Source: https://learn.microsoft.com/en-us/entra/identity/hybrid/connect/whatis-fed
- Evidence: full-text; confidence: high.

- Microsoft defines federation as domains with established trust, typically authentication and usually authorization.
- Microsoft documents federating an on-premises environment with Microsoft Entra ID for authentication and authorization; authentication occurs on-premises in that example, while Entra is the cloud resource trust boundary.
- This overview names AD FS and PingFederate as available federation examples and does not document Okta specifically; Okta compatibility is therefore established by Okta's Office 365 WS-Fed documentation, not this page.

### MICROSOFT365-3: Understanding Tokens in Microsoft Entra ID — Microsoft Learn

- Source: https://learn.microsoft.com/en-us/entra/identity/devices/concept-tokens-microsoft-entra-id
- Evidence: full-text; confidence: high.

- Microsoft distinguishes sign-in session tokens from app-session tokens: sign-in sessions maintain signed-in state and are presented to the identity provider to request app-session tokens; app sessions authorize specific applications.
- Microsoft states web apps accessed via browsers may use different token kinds than native apps such as Outlook and Teams.
- The token table identifies app auth cookies as issued by the web app, scoped to the resource, with lifetime determined by the application; Entra access tokens are resource-scoped and typically 60–90 minutes, while PRT/refresh tokens are Entra-issued and renewable/revocable.

### MICROSOFT365-4: Conditional Access: Manage Session Controls Effectively — Microsoft Learn

- Source: https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-conditional-access-session
- Evidence: full-text; confidence: high.

- Entra Conditional Access session controls include sign-in frequency and persistent browser sessions; sign-in frequency applies to OAuth 2.0/OIDC apps and explicitly lists Office.com, Exchange Online, SharePoint/OneDrive, Teams web, and other Microsoft web apps.
- A persistent browser session lets users remain signed in after closing/reopening a browser; this is an Entra-controlled session behavior, not a portable session-transfer API.
- Application-enforced restrictions can pass device information to selected cloud apps so apps can provide limited or full experiences based on compliance/domain join; Conditional Access App Control can monitor/control sessions in real time via Defender for Cloud Apps. Token protection is separately described as binding a token to its intended device.

### MICROSOFT365-5: Conditional Access adaptive session lifetime policies — Microsoft Learn

- Source: https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-session-lifetime
- Evidence: full-text; confidence: high.

- Entra's default user sign-in frequency is a rolling 90 days, but tenant policy can force reauthentication; policy violations such as password change, device noncompliance, or account disablement can revoke sessions.
- Sign-in frequency explicitly covers Microsoft web apps including Office.com, Exchange Online, SharePoint/OneDrive, and Teams web, but behavior depends on OAuth/OIDC implementation and apps that do not drop their own cookies or regularly redirect to Entra can affect enforcement.
- Persistent browser sessions store cookies on the device after browser close; Microsoft warns cached artifacts can remain usable until token expiration regardless of Conditional Access policies. Conditional Access session controls require Entra ID P1/P2 premium licensing.

### MICROSOFT365-6: Continuous access evaluation in Microsoft Entra — Microsoft Learn

- Source: https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-continuous-access-evaluation
- Evidence: full-text; confidence: high.

- CAE is a two-way interaction between Microsoft Entra (token issuer) and an enlightened/relying resource provider; it can revoke access on critical events or Conditional Access changes rather than waiting for normal token expiry.
- Microsoft lists Exchange Online, SharePoint Online, and Teams as initial CAE services and provides separate client/resource tables: Outlook web is supported for SharePoint/Exchange, Office web is not supported for those CAE combinations (with a footnote reducing Office web token lifetimes to one hour under CA policy), OneDrive web is supported for SharePoint, and Teams web is partially supported.
- CAE requires clients to understand claim challenges; support differs by application and platform. A browser that simply receives a federated login cannot be assumed to negotiate CAE-aware sessions or avoid service-side reevaluation.

### MICROSOFT365-7: How Token Protection Enhances Conditional Access Policies — Microsoft Learn

- Source: https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-token-protection
- Evidence: full-text; confidence: high.

- Token Protection binds supported sign-in session tokens such as PRTs to a device and makes Microsoft Entra accept only bound tokens from supported applications.
- Microsoft's platform table separates native from browser apps: Windows native is GA, while browser support is preview only for supported web apps accessing Azure Resource Manager; iOS/iPadOS browser apps are not supported and macOS browser apps are preview with restrictions.
- For native apps, supported resources include Exchange Online, SharePoint Online, and Teams (plus Windows AVD/Windows 365); browser preview enforcement is only for Azure Resource Manager via the Windows Azure Service Management API resource. Therefore this native support table must not be generalized to Chrome browser access to Microsoft 365 web apps.

### MICROSOFT365-8: Token Protection deployment guide — Web apps (Preview) — Microsoft Learn

- Source: https://learn.microsoft.com/en-us/entra/identity/conditional-access/deployment-guide-token-protection-web-apps
- Evidence: full-text; confidence: high.

- The browser Token Protection preview is specifically for web applications that access Azure Resource Manager and requires Entra ID P1; only Azure portal, Intune admin center, Entra admin center, Microsoft Engage Center/Hub are supported, while other ARM web apps are blocked when enforced.
- Supported browser matrix is Windows 11 (specified builds) Edge/Chrome with Entra joined/hybrid joined/registered devices, and macOS Edge/Chrome with MDM-managed devices. Browser setup requires platform authentication, the Microsoft Single Sign-On extension, and on macOS Company Portal plus Enterprise SSO plug-in or Platform SSO.
- The guide says supported browser authentication is handled by a platform authentication broker to use device-bound PRTs; it explicitly excludes Firefox/Safari and unsupported apps. This is a specialized brokered/device-registration flow, not generic Chrome cookie/session portability.
- Parent verified the current August 2026 guide's scope: browser Token Protection is a preview for specific Azure Resource Manager web applications, not a blanket statement about Outlook/Teams/Microsoft 365 browser sessions. Its supported platforms table is Windows 11 Edge/Chrome on supported joined/registered devices and MDM-managed macOS Edge/Chrome.
- Parent completed the source through its final enforcement section. The source's browser-preview applicability remains the listed ARM applications/resources; its diagnostic and deployment material does not establish blanket Token Protection enforcement for Microsoft 365 browser apps.

### MICROSOFT365-9: Understanding Primary Refresh Token (PRT) in Microsoft Entra ID — Microsoft Learn

- Source: https://learn.microsoft.com/en-us/entra/identity/devices/concept-primary-refresh-token
- Evidence: full-text; confidence: high.

- A PRT is issued to first-party token brokers for SSO; PRTs carry device/user claims used in Conditional Access, and registered-device PRTs satisfy device-registration policies while unregistered-device PRTs do not.
- Browser behavior is platform-specific: Windows can expose PRT browser SSO to Edge, Chrome, and Firefox; macOS with the SSO extension profile supports Chrome/Firefox/Safari/Edge, while Linux browser device-bound protection is specifically limited to Edge. Browser cookies can be protected by a PRT session key only in the documented platform/broker/extension flows; private browsing modes are excluded.
- For non-Microsoft federated IdPs, Microsoft says WS-Trust support is required for PRT issuance on Windows 10+ joined devices. PRT issuance/renewal and browser SSO depend on brokers, registration, and platform components, not merely a web redirect; native/OS credential and broker flows are outside this assignment.

### MICROSOFT365-10: How to Use Conditions in Conditional Access Policies — Microsoft Learn

- Source: https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-conditional-access-conditions
- Evidence: full-text; confidence: high.

- Entra treats Browser as a modern-authentication client category including web apps using SAML, WS-Federation, OIDC, or OAuth confidential clients; Mobile apps and desktop clients is a separate category, so native support must not be conflated with browser access.
- Conditional Access device-platform signals are based on user-agent information and are not verified alone. To satisfy device policies such as compliant-device requirements, supported browser/OS combinations must provide device authentication; browser device checks fail in private mode or with cookies disabled.
- Chrome is supported for device-based Conditional Access on Windows 10+ (Chrome 111+ with CloudAPAuthEnabled or Microsoft SSO extension) and macOS (Enterprise SSO plug-in plus Microsoft SSO extension). Device compliance and approved-client/app-protection controls remain tenant and policy dependent.

### MICROSOFT365-11: How to Require Device Compliance with Conditional Access — Microsoft Learn

- Source: https://learn.microsoft.com/en-us/entra/identity/conditional-access/policy-all-users-device-compliance
- Evidence: full-text; confidence: high.

- Microsoft Intune compliance policies and Entra Conditional Access jointly enforce device minimum requirements when users access protected services; the policy's grant control is explicitly 'Require device to be marked as compliant'.
- Microsoft warns that without an Intune compliance policy the Conditional Access policy does not function as intended, making Intune enrollment/compliance a tenant-side prerequisite for this control.
- On iOS, Android, macOS, and some non-Microsoft browsers, Entra identifies a registered device through a provisioned client certificate and may prompt the user to select it on first browser sign-in; this is device registration/compliance evidence, not something supplied by an Okta identity assertion.

### MICROSOFT365-12: Tutorial to migrate Okta sign-on policies to Microsoft Entra Conditional Access — Microsoft Learn

- Source: https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/migrate-okta-sign-on-policies-conditional-access
- Evidence: full-text; confidence: high.

- Microsoft's tutorial explicitly assumes an Office 365 tenant federated to Okta for sign-in and MFA, and maps Okta sign-on policies to Entra Conditional Access rather than treating Okta as the sole policy layer.
- The tutorial says Okta device trust must be replaced or supplemented by Entra hybrid join and/or Intune enrollment/compliance for device-based Conditional Access; network locations also need translation to Entra named locations.
- The documented test flow can prompt for Okta MFA and then Entra Conditional Access, and Microsoft provides separate guidance to avoid double prompts. This demonstrates tenant configuration, claims, licensing (Entra P1), and policy interactions remain Microsoft-side concerns.

### MICROSOFT365-13: Satisfy Microsoft Entra ID MFA controls with MFA claims from a federated IdP — Microsoft Learn

- Source: https://learn.microsoft.com/en-us/entra/identity/authentication/how-to-mfa-expected-inbound-assertions
- Evidence: full-text; confidence: high.

- Entra can honor MFA performed by a federated IdP only under configured federatedIdpMfaBehaviour values and required assertion formats; for WS-Fed/SAML 1.1, Microsoft documents specific multiple-authentication claims in the RSTR assertion.
- For SAML 2.0, the inbound MFA assertion must be in AuthnContext/AuthnStatement; assertions in an AttributeReference section are ignored. Thus an Okta login's MFA may or may not satisfy Entra CA depending on tenant configuration and exact Okta assertion claims.
- For WS-Fed/SAML 1.1, Entra sign-in frequency uses UserAuthenticationInstant; for SAML 2.0 it uses AuthInstant from the AuthnStatement. This ties federation assertions to Microsoft session policy evaluation, not to browser-cookie transfer.

### MICROSOFT365-14: Overview of Conditional Access Authentication Strengths — Microsoft Learn

- Source: https://learn.microsoft.com/en-us/entra/identity/authentication/concept-authentication-strengths
- Evidence: full-text; confidence: high.

- Authentication strength is a Conditional Access control defining allowed combinations, including built-in MFA, passwordless MFA, and phishing-resistant MFA strengths; Entra ID P1 is a prerequisite for Conditional Access.
- Microsoft's table explicitly recognizes Federated multifactor and Federated single-factor plus an additional factor for MFA strength, but not for phishing-resistant MFA strength. The tenant must configure accepted methods/strength and have the IdP assertion satisfy the relevant semantics.
- Authentication-strength policies are evaluated after initial authentication, so federation can complete an initial sign-in yet still be followed by a Microsoft-side requirement for stronger authentication.

### MICROSOFT365-15: Strengthen federated sign-in security — Microsoft Learn

- Source: https://learn.microsoft.com/en-us/entra/identity/users/strengthen-federated-sign-in-security
- Evidence: full-text; confidence: high.

- Microsoft describes the federated flow as IdP authentication → signed federation token → Entra validation/mapping → Entra authentication, Conditional Access, and MFA checks. This directly separates Okta's identity proof from Entra's authorization/policy gate.
- Entra validates token signature, trusted issuer/federation trust, token lifetime, and account mapping before completing sign-in; tenant context can add sign-in risk, device, application authorization, and other controls.
- The page also documents a Federated Token Validation Policy preview (`federatedTokenValidationPolicy` via Graph beta) that can enforce root-domain consistency; preview APIs are subject to change. This is another tenant-side federation control, not a browser-session portability mechanism.

### MICROSOFT365-16: Authentication transfer as a condition to secure mobile users — Microsoft Learn

- Source: https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-authentication-transfer
- Evidence: full-text; confidence: high.

- Microsoft documents an authentication-transfer flow for cross-device sign-in from a supported Microsoft app on a PC to a supported Microsoft app on a mobile device using a QR code; it is currently preview and requires Entra ID P1 for users subject to managing Conditional Access policies.
- The flow transfers authentication claims only; device compliance/managed status does not transfer and the target device is evaluated independently. All applicable Conditional Access policies are evaluated before completion, and the source PC must reauthenticate even with a PRT.
- Support varies by Microsoft app/version (example: desktop Outlook to mobile Outlook), and the page explicitly says authentication transfer is not supported for non-Microsoft apps. It does not describe arbitrary Chrome-to-Chrome LAN browser session transfer or a general browser-session import API.

### MICROSOFT365-17: SharePoint authentication — SharePoint in Microsoft 365 — Microsoft Learn

- Source: https://learn.microsoft.com/en-us/sharepoint/authentication
- Evidence: full-text; confidence: high.

- SharePoint documents separate service cookies: FedAuth per top-level site and rtFA across SharePoint, with rtFA enabling silent authentication to another top-level site and deletion on SharePoint sign-out.
- By default SharePoint cookies are browser session cookies deleted when the browser closes; Microsoft Entra's Keep Me Signed In signal can enable persistent cookies saved in the browser cache across browser close/restart.
- These are Microsoft 365/SharePoint-issued cookies local to a browser profile. A federated IdP redirect can help authenticate, but the page does not document copying/importing those cookies to another browser/computer.

### MICROSOFT365-18: Web browser cookies used in Microsoft Entra authentication — Microsoft Learn

- Source: https://learn.microsoft.com/en-us/entra/identity/authentication/concept-authentication-web-browser-cookies
- Evidence: full-text; confidence: high.

- Microsoft Entra uses multiple browser cookies for SSO/session state; persistent session tokens are stored in the browser cookie jar while nonpersistent tokens are destroyed when the browser session closes.
- The documented cookie set includes transient/persistent session information, browser-instance/CSRF context, and a PRT-specific proof-of-possession cookie when PRT is in use. Definitions/names may change, and some cookies are client-side or service-specific.
- Microsoft says unsupported libraries, privacy features, and private browsing can make cookies unavailable, causing reauthentication or broken sign-out. The documentation describes browser-local cookies and supported browser flows, not an arbitrary supported API to export/import Entra cookies between Chrome profiles/computers.

### MICROSOFT365-19: Session timeouts for Microsoft 365 — Microsoft 365 Enterprise — Microsoft Learn

- Source: https://learn.microsoft.com/en-us/microsoft-365/enterprise/session-timeouts?view=o365-worldwide
- Evidence: full-text; confidence: medium.

- Microsoft states that authentication to any Microsoft 365 web or mobile app establishes a session and that services have different session timeouts; expiry can follow inactivity, browser/tab close, or authentication-token expiry/revocation.
- The table differentiates service owners/behaviors: SharePoint has a five-day inactivity timeout when Keep me signed in is chosen, Outlook Web App defaults to six hours (tenant-configurable), and Entra modern-auth tokens use access/refresh lifetimes with revocation conditions.
- This is an older reference (page date 2018, updated 2026) and service behavior may be superseded by current Conditional Access/app-specific docs; use it as corroboration that Microsoft 365 services own independent sessions, not as a universal lifetime guarantee.

### MICROSOFT365-20: user: revokeSignInSessions — Microsoft Graph v1.0 — Microsoft Learn

- Source: https://learn.microsoft.com/en-us/graph/api/user-revokesigninsessions?view=graph-rest-1.0
- Evidence: full-text; confidence: high.

- Microsoft Graph's documented session API is revocation: it invalidates a user's application refresh tokens and browser session cookies by resetting signInSessionsValidFromDateTime.
- The API forces applications to reacquire tokens through the authorize endpoint after invalidation; it is not an import or transfer API. It requires a bearer token and appropriate User.RevokeSessions.All (or higher) permissions.
- Revocation can take a few minutes and does not revoke external users' home-tenant sessions. This reinforces that Entra controls/revokes sessions centrally but doesn't expose arbitrary browser-cookie import in the documented v1 API.

### MICROSOFT365-21: WS-Fed app integrations — Okta Classic Engine

- Source: https://help.okta.com/en-us/content/topics/apps/apps-about-wsfed.htm
- Evidence: full-text; confidence: high.

- Okta says WS-Fed is used for Microsoft Office 365 and positions Okta as authorization server/identity provider for external apps.
- The documented flow is browser-mediated: the app delegates authentication to Okta; Okta authenticates with SSO/MFA and returns an assertion through the user's browser; the client app validates it and grants access.
- Okta notes users/apps/IdPs can be on an intranet behind a firewall if the end user can reach Okta, which supports direct browser federation across reachable networks but does not document transfer of an already-issued Microsoft 365 session.

### MICROSOFT365-22: Device Bound Session Credentials (DBSC) — Chrome for Developers

- Source: https://developer.chrome.com/docs/web-platform/device-bound-session-credentials
- Evidence: full-text; confidence: high.

- DBSC is an opt-in web-site/server protocol: the site must return Secure-Session-Registration, provide registration/configuration, and implement a refresh endpoint; Chrome then binds that site's session to a generated key and short-lived cookie.
- DBSC protects continuity for the participating site's own cookie/session and may fall back to standard behavior when secure key storage is unavailable; it does not create a generic browser-level export/import or LAN session-transfer mechanism.
- This Chrome page is a developer integration guide, not Microsoft Entra/Microsoft 365 support documentation. Nothing here establishes that Office.com, SharePoint, Exchange, Teams, or Entra have enabled DBSC; such enablement remains provider/app-specific and must not be inferred from Chrome capability.

### MICROSOFT365-23: chrome.cookies API reference — Chrome for Developers

- Source: https://developer.chrome.com/docs/extensions/reference/api/cookies.md.txt
- Evidence: full-text; confidence: high.

- Chrome's extension cookies API is permission-gated: it requires the cookies permission plus host permissions for target hosts, and operations are scoped to a browser cookie store/profile (including separate incognito stores).
- The API exposes query/set/remove methods for cookies and an onChanged event that fires when a cookie is set or removed; this is a local browser API, not a Microsoft/Entra session-transfer protocol or provider-issued import contract.
- The API's existence only establishes browser-side capability to observe/manage cookie records under extension permissions. It does not establish that Microsoft 365 accepts arbitrary copied cookie values, preserve PRT/DBSC/device binding, satisfy CA, or support cross-computer session handoff; no implementation recipe is provided here.

### MICROSOFT365-24: chrome.webRequest API reference — Chrome for Developers

- Source: https://developer.chrome.com/docs/extensions/reference/api/webRequest.md.txt
- Evidence: full-text; confidence: high.

- Chrome webRequest is permission- and host-permission-gated and exposes a request lifecycle to an extension only for permitted URLs/initiators; listeners are event-specific and filterable by URL/type/tab/window.
- Manifest V3 generally does not grant blocking request handlers to ordinary extensions; policy-installed extensions retain webRequestBlocking. This is a browser interception/observation API, not Microsoft Entra or Microsoft 365 session-transfer support.
- Chrome documents sensitive/request-header visibility limits and notes the API is an abstraction of the network stack. Therefore a listener cannot be treated as a complete or stable representation of provider session state, DBSC/PRT proofs, or app cookies.

### MICROSOFT365-25: Configure Single Sign-On for Office 365 — Okta Identity Engine

- Source: https://help.okta.com/oie/en-us/content/topics/apps/office365-deployment/configure-sso.htm
- Evidence: full-text; confidence: high.

- Okta Identity Engine documents the same Office 365 sign-in choices as Classic Engine: SWA, WS-Federation automatic, and WS-Federation manual using PowerShell; Okta recommends WS-Federation when possible.
- Automatic WS-Fed federation requires Microsoft global-admin sign-in/permissions and domain selection; manual federation supports only one federated domain per Office 365 app instance. Okta warns that an admin account in a federated domain can be locked out of Microsoft 365 admin center and should use the default tenant domain.
- The OIE page's end-user test is to sign into Okta as a test user and open Office 365, documenting fresh browser SSO validation rather than import/preservation of an existing Microsoft session.
