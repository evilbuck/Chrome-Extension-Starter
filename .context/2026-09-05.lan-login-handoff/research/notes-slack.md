---
status: completed
date: 2026-09-05
subject: 2026-09-05.lan-login-handoff
topics: [authentication, sso, slack]
informs: [../research-auth-compatibility.md]
---

# Research notes: Slack web SSO and sessions

## Current assessment

Slack supports normal Okta-mediated SAML web sign-in, not a documented arbitrary browser-session import contract (SLACK-1/3/15/18). A valid client-side IdP context can participate in fresh Slack SSO, but Slack owns its session duration and provider/admin invalidation (SLACK-3/4/5/7/8). API tokens and Sign in with Slack for third-party services are not Slack web-login session transfers (SLACK-9/10). Mobile-only device controls were not generalized to desktop Chrome; the excerpt-only anomaly source is not used as a desktop login-blocking claim.

## Source findings

### SLACK-1: Set up SAML single sign-on for Slack

- Source: https://slack.com/help/articles/203772216-Set-up-SAML-single-sign-on-for-Slack
- Evidence: full-text; confidence: high.

- Slack documents SAML SSO as giving members access to Slack through a chosen identity provider; its setup page links Okta as an IdP guide.
- After SSO is enabled, members required to use SSO bind their Slack accounts to the IdP, and going forward sign in to Slack with the IdP account; if SSO is required, members see a sign-in page before access.
- Members already signed in when SSO is enabled remain signed in. Workspace/Org Owners can bypass SSO with email/password. Feature is available on Business+ and Enterprise; Free/Pro only if a Salesforce org is connected.

### SLACK-2: Manage single sign-on settings

- Source: https://slack.com/help/articles/220403548-Manage-single-sign-on-settings
- Evidence: full-text; confidence: high.

- Slack says Workspace Owners and Org Owners can enable SSO and that configurable settings depend on Slack plan.
- The page identifies SSO as available on Business+ and Enterprise, and on Free/Pro only when a Salesforce org is connected; access is owner-controlled.
- Slack directs users with upstream IdP SSO issues to Slack Support, indicating the provider dependency for sign-in.

### SLACK-3: Custom SAML single sign-on

- Source: https://slack.com/help/articles/205168057-Custom-SAML-single-sign-on
- Evidence: full-text; confidence: high.

- Slack documents both IdP-initiated and service-provider-initiated SAML flows; SP-initiated entry point is https://yourdomain.slack.com, with the ACS/post-back URL https://yourdomain.slack.com/sso/saml.
- Slack requires HTTP POST binding (not HTTP Redirect), and the IdP must authenticate and authorize before sending an assertion. Required NameID and email attributes bind the assertion to a Slack user.
- Slack explicitly does not support Single Logout or session duration configured in the IdP; instead, admins can use Slack's own session-duration control. Feature scope is Workspace/Org Owners on Business+/Enterprise, or Free/Pro with connected Salesforce org.
- Parent verified the full page: Slack documents both IdP-initiated and SP-initiated SAML, while explicitly not supporting Single Logout or session duration configured in the IdP. The supported login flow and Slack session lifecycle are separate concerns.

### SLACK-4: Manage session duration

- Source: https://slack.com/help/articles/115005223763-Manage-session-duration
- Evidence: full-text; confidence: high.

- Slack session duration can force members to sign in whenever they close Slack or after a configured period; optional warnings precede expiry and reauthentication.
- Duration changes take effect the same day and end member sessions randomly over the selected timeframe, so existing host sessions may be invalidated independently of any extension action.
- The feature is available to Workspace/Org Owners/Admins on all Slack plans.

### SLACK-5: Reset all single sign-on sessions

- Source: https://slack.com/help/articles/206924507-Reset-all-single-sign-on-sessions
- Evidence: full-text; confidence: high.

- For workspaces with mandatory SSO, an owner can force some/all members to merge their Slack accounts with the IdP before accessing Slack again.
- Members selected for reset are signed out of Slack on all devices; processing may take minutes. Resetting everyone also signs out the acting owner.
- Feature scope is Workspace Owners on Pro and Business+, and Free with connected Salesforce; the page does not list Enterprise in its Who can use section (possible documentation scope/version caveat).

### SLACK-6: Approve Slack workspaces for your network

- Source: https://slack.com/help/articles/360024821873-Approve-Slack-workspaces-for-your-network
- Evidence: full-text; confidence: high.

- Slack documents an IT-admin SSL-interception proxy that limits network access to approved Slack workspaces or an Enterprise organization and connected workspaces.
- The proxy injects X-Slack-Allowed-Workspaces-Requester and X-Slack-Allowed-Workspaces headers; unapproved workspace sign-in shows an error while approved access continues normally.
- Feature scope is Workspace Owners/Admins on Business+ and Enterprise. This is a network control, not a browser extension auth/session-import mechanism.

### SLACK-7: admin.users.session.invalidate method

- Source: https://docs.slack.dev/reference/methods/admin.users.session.invalidate/
- Evidence: full-text; confidence: high.

- Slack's Admin API invalidates a single user session and forces login again; other sessions on other devices remain unaffected.
- The method is Enterprise-only, requires a user token with admin.users:write, and must be called by an Org Owner or Admin; it is not a normal member/browser-extension operation.
- Slack documents invalid_auth/accesslimited errors when token/network restrictions apply, reinforcing that API/admin controls are separate from web SSO.

### SLACK-8: admin.users.session.reset method

- Source: https://docs.slack.dev/reference/methods/admin.users.session.reset/
- Evidence: full-text; confidence: high.

- Slack's Enterprise-only Admin API wipes all valid sessions for a user, leaving the user unauthenticated and resetting the Slack client's local cache.
- By default it resets all sessions; optional web_only or mobile_only scope the wipe. It requires admin.users:write and is accessible only to org/compliance owners/admins.
- This is server-side invalidation of web sessions, not a supported browser-extension handoff or session-copy protocol.

### SLACK-9: Using Sign in with Slack

- Source: https://docs.slack.dev/authentication/sign-in-with-slack/
- Evidence: full-text; confidence: high.

- Sign in with Slack is an OpenID Connect/OAuth flow that lets users log into a separate service using their Slack profile; Slack redirects back to that service with authorization data.
- Modern flow uses /openid/connect/authorize, openid/profile/email scopes, then /openid.connect.token; the code/token and redirect URI are for the relying-party app, not Slack web-client session creation.
- If the target workspace was previously authenticated, Slack may sign the user in directly and bypass consent for that third-party app. This is still app authorization, not a browser extension importing or transferring a Slack web session.

### SLACK-10: Tokens

- Source: https://docs.slack.dev/authentication/tokens/
- Evidence: full-text; confidence: high.

- Slack tokens are app-platform credentials tied to app scopes/permissions, with bot, user, configuration, app-level, workflow and service token types.
- User tokens let an app act on behalf of users and begin xoxp-; bot tokens represent an app and begin xoxb-. These are API/app authorization credentials, not browser cookies or the Slack web client's SSO session.
- Workflow tokens are short-lived and cannot bypass organization policies; service tokens are long-lived CLI/app credentials. None is documented as a Slack web-login handoff.

### SLACK-11: Allow an org domain with Enterprise Mobility Management

- Source: https://slack.com/help/articles/360042166574-Allow-an-org-domain-with-Enterprise-Mobility-Management
- Evidence: full-text; confidence: high.

- Slack's org-domain allow setting is for an Enterprise organization and EMM app, configured through AppConfig; it restricts members from accessing workspaces outside the organization.
- The documented effects and remediation are for EMM mobile app users (Android/iOS), including delayed sign-out of outside workspaces.
- This is not evidence of a Chrome/web-browser handoff and does not support investigating native credential stores; browser extension scope remains Slack web only.

### SLACK-12: Anomalous events | Slack Developer Docs

- Source: https://api.slack.com/admins/audit-logs-anomaly
- Evidence: search-excerpt; confidence: medium.

- Direct fetch returned HTTP 403, so only search-excerpt evidence is available.
- Search results state Enterprise Grid admins can manage allow-lists of trusted ASNs and CIDR IP ranges and that allow-listed traffic is not marked anomalous in audit logs.
- Because the full page was blocked, details about whether these controls affect browser login/session issuance versus audit classification remain unverified here.

### SLACK-13: Block jailbroken or rooted mobile devices from accessing Slack

- Source: https://slack.com/help/articles/360042097113-Block-jailbroken-or-rooted-mobile-devices-from-accessing-Slack
- Evidence: full-text; confidence: high.

- Slack documents a Workspace/Org Owner setting available on all plans, despite title and scope being mobile devices; it can block SSO sign-in on jailbroken/rooted devices.
- The page separately says browser sign-in can succeed on such devices but Slack may sign the browser session out at the next device check; detection may have false positives and is not 100%.
- This is evidence of device-dependent server-side invalidation and not a browser-extension session transfer. It does not establish that ordinary desktop Chrome is covered by the mobile-device check.

### SLACK-14: Sign in to Slack

- Source: https://slack.com/help/articles/212681477-Sign-in-to-Slack
- Evidence: full-text; confidence: high.

- Slack's browser sign-in help covers signing into one or more workspaces with an email address and notes that a workspace/org requiring 2FA requires a six-digit authentication code.
- The article does not document session export/import or a cross-browser/device session-transfer mechanism, and it does not detail SAML steps; those are covered by Slack's SAML docs.
- This baseline confirms authentication is workspace/account sign-in, with tenant-controlled 2FA as an additional condition.

### SLACK-15: Integrate Slack with Okta

- Source: https://help.okta.com/en-us/content/topics/provisioning/slack/slck-integrate-slack.htm
- Evidence: full-text; confidence: high.

- Okta's Slack integration setup is admin-console work: add Slack app, use .enterprise in the domain for Enterprise Grid, and choose a sign-on option; SAML 2.0 exposes setup instructions.
- Okta's optional API integration is separate and requires opening Slack, signing in, authorizing, and saving; this supports the distinction between provisioning/API administration and end-user browser SSO.
- The page is explicitly a Classic Engine publication and does not document cross-browser Slack cookie/session import or preservation.

### SLACK-16: Slack supported features

- Source: https://help.okta.com/oie/en-us/content/topics/provisioning/slack/slck-supported-features.htm
- Evidence: full-text; confidence: high.

- Okta's Identity Engine Slack integration page lists lifecycle/provisioning capabilities: push/import users, deactivation/reactivation, profile updates, group push, schema import.
- It explicitly notes Multi-Channel Guest User Schema is unsupported.
- The listed integration features concern app provisioning and do not document Slack web session transfer, cookie portability, or guarantees about browser login/session persistence.

### SLACK-17: Connect your SSO account with Slack

- Source: https://slack.com/help/articles/220766827-Connect-your-SSO-account-with-Slack
- Evidence: full-text; confidence: high.

- Slack sends a binding email when an owner enables SSO or requires reauthentication; the member authenticates via that flow to connect the Slack account to the IdP. The binding email expires after 72 hours, and the process can be done from desktop or mobile.
- After an SSO session reset, members are signed out; a rebind email lets them sign in using the IdP and choose to remain associated with the existing Slack account or switch. Choosing remain associated retains message history.
- Scope is all members/guests on Business+ and Enterprise, and Free/Pro only with connected Salesforce.

### SLACK-18: Cookie Policy

- Source: https://slack.com/trust/compliance/cookie-policy
- Evidence: full-text; confidence: high.

- Slack uses session and persistent cookies; session cookies last only while the browser is open and are deleted on close, while persistent cookies last until deletion or expiry.
- Slack says cookies are unique to an account or browser and can be associated with account information to remember logged-in state/workspaces; cookies support authentication and security.
- The policy does not describe exporting/importing cookies, cross-device session handoff, or a supported way to transplant Slack web cookies. Therefore direct session copying is not documented here, not proven impossible.

### SLACK-19: admin.users.session.list method

- Source: https://docs.slack.dev/reference/methods/admin.users.session.list/
- Evidence: full-text; confidence: high.

- Slack's Enterprise-only Admin API lists active organization/workspace user sessions and exposes session identifiers plus recent/created device hardware, OS/version, client version, and IP metadata.
- The docs say a session can be invalidated; if a user has multiple sessions on multiple devices, other sessions remain unaffected. The list is admin API visibility, not a browser extension interface.
- This demonstrates Slack models active sessions separately and tracks device/IP context, but does not document how cookies/session state can be copied or imported.

### SLACK-20: admin.users.session.getSettings method

- Source: https://docs.slack.dev/reference/methods/admin.users.session.getSettings/
- Evidence: full-text; confidence: high.

- Slack's Enterprise-only Admin API returns per-user session duration and whether a session terminates when the client closes; users without settings are omitted.
- The API requires admin.users:read and Org Owner/Admin privileges; it is observation of server-side policy, not a browser extension endpoint.
- This confirms session lifespan/close behavior is a Slack-side policy and may vary per user, so extension-level continuity cannot be guaranteed.

### SLACK-21: Require a mandatory mobile browser

- Source: https://slack.com/help/articles/360037780633-Require-a-mandatory-mobile-browser-on-Enterprise-Grid
- Evidence: full-text; confidence: high.

- Slack Org Owners can require members on unmanaged mobile devices to use a secure mobile browser when signing in with SSO or opening links from the Slack mobile app.
- The setting is Enterprise-plan-only and targets iOS/Android/mobile browser controls; it does not establish a policy for desktop Chrome or a session-copy mechanism.
- The source recommends pairing it with blocking file downloads/message copying, showing a separate data-protection control.
