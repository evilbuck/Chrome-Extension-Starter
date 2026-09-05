---
status: completed
date: 2026-09-05
subject: 2026-09-05.lan-login-handoff
topics: [authentication, sso, slack]
informs: [../research-auth-compatibility.md]
---

# Sources: Slack web SSO and sessions

## SLACK-1: Set up SAML single sign-on for Slack

- URL: https://slack.com/help/articles/203772216-Set-up-SAML-single-sign-on-for-Slack
- Source type: Official Slack Help Center
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> SAML-based single sign-on (SSO) gives members access to Slack through an identity provider (IDP) of your choice.

> Going forward, all members will sign in to Slack with their IDP account.

> Any members already signed in when SSO is enabled will remain signed in.

## SLACK-2: Manage single sign-on settings

- URL: https://slack.com/help/articles/220403548-Manage-single-sign-on-settings
- Source type: Official Slack Help Center
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> Workspace Owners and Org Owners can enable single sign-on (SSO) as an extra layer of security.

> Available on the Business+ and Enterprise plans.

> If you're unable to sign in with SSO due to upstream issues with your provider, contact our Support team for help.

## SLACK-3: Custom SAML single sign-on

- URL: https://slack.com/help/articles/205168057-Custom-SAML-single-sign-on
- Source type: Official Slack Help Center
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> Slack supports Identity Provider (IDP) Initiated Flow, Service Provider (SP) Initiated flow, Just In Time provisioning, and automatic provisioning through our SCIM API.

> Slack does not support Single Logout or session duration configured in your IDP.

> Your IDP must ensure a user is both authenticated and authorized before sending an assertion.

## SLACK-4: Manage session duration

- URL: https://slack.com/help/articles/115005223763-Manage-session-duration
- Source type: Official Slack Help Center
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> When you set up session duration, you can choose to have members sign back in whenever they close Slack or after a certain time period.

> Members will be warned two hours before session expiration, and receive a final reminder 15 minutes before they're signed out.

> Available on all plans.

## SLACK-5: Reset all single sign-on sessions

- URL: https://slack.com/help/articles/206924507-Reset-all-single-sign-on-sessions
- Source type: Official Slack Help Center
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> Doing this forces members to merge their Slack accounts with your identity provider (IDP) before they can access Slack again.

> Members you reset sessions for will be signed out of Slack on all devices.

> If you choose to sign out everyone on your workspace, you will also be signed out.

## SLACK-6: Approve Slack workspaces for your network

- URL: https://slack.com/help/articles/360024821873-Approve-Slack-workspaces-for-your-network
- Source type: Official Slack Help Center
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> By limiting connections, you can prevent anyone on your network from signing in to workspaces that are not approved.

> The proxy inserts new HTTP headers (X-Slack-Allowed-Workspaces-Requester and X-Slack-Allowed-Workspaces).

> Business+ and Enterprise plans.

## SLACK-7: admin.users.session.invalidate method

- URL: https://docs.slack.dev/reference/methods/admin.users.session.invalidate/
- Source type: Official Slack Developer Docs API reference
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> Revoke a single session for a user. The user will be forced to login to Slack.

> If the user has multiple sessions with multiple devices, the other sessions will be unaffected.

> The features within are only available to Slack workspaces on an Enterprise plan.

## SLACK-8: admin.users.session.reset method

- URL: https://docs.slack.dev/reference/methods/admin.users.session.reset/
- Source type: Official Slack Developer Docs API reference
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> Wipes all valid sessions on all devices for a given user.

> This method wipes a user session, leaving the user unauthenticated.

> Use the web_only and mobile_only parameters to wipe only web or only mobile sessions.

## SLACK-9: Using Sign in with Slack

- URL: https://docs.slack.dev/authentication/sign-in-with-slack/
- Source type: Official Slack Developer Docs
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> Sign in with Slack helps users log into your service using their Slack profile.

> The flow is based on the OpenID Connect standard, built on top of OAuth 2.0.

> You redirect users to a special OpenID endpoint, /openid/connect/authorize, rather than /oauth/v2/authorize.

## SLACK-10: Tokens

- URL: https://docs.slack.dev/authentication/tokens/
- Source type: Official Slack Developer Docs
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> Tokens are the keys to the Slack platform.

> User tokens allow you to work directly on behalf of users when necessary.

> Workflow tokens ... do not allow the bot user to act on behalf of a user ... or to bypass any organization policies.

## SLACK-11: Allow an org domain with Enterprise Mobility Management

- URL: https://slack.com/help/articles/360042166574-Allow-an-org-domain-with-Enterprise-Mobility-Management
- Source type: Official Slack Help Center
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> In an Enterprise organization, you have the option to only allow access to your org domain when members use your Enterprise Mobility Management (EMM) app.

> With this setting enabled, members using an EMM app can only sign in to the approved org.

> If members need to access workspaces outside of their approved org, they can download the Slack app for iOS or Android.

## SLACK-12: Anomalous events | Slack Developer Docs

- URL: https://api.slack.com/admins/audit-logs-anomaly
- Source type: Official Slack Developer Docs
- Accessed: 2026-09-05
- Evidence: search-excerpt
- Confidence: medium

> Slack provides an API for admins to manage allow-lists of trusted ASNs and IP ranges (using CIDR notation) on their Enterprise organization Slack instance.

> Traffic from allow-listed ASNs and IP ranges are not marked as anomalous in admin audit logs.

## SLACK-13: Block jailbroken or rooted mobile devices from accessing Slack

- URL: https://slack.com/help/articles/360042097113-Block-jailbroken-or-rooted-mobile-devices-from-accessing-Slack
- Source type: Official Slack Help Center
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> Members using single sign-on (SSO) from jailbroken or rooted devices will be blocked when signing in to Slack.

> Members signing in from jailbroken or rooted devices in a browser will be able to successfully sign in to Slack, but will be signed out the next time Slack checks.

> Available on all plans.

## SLACK-14: Sign in to Slack

- URL: https://slack.com/help/articles/212681477-Sign-in-to-Slack
- Source type: Official Slack Help Center
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> Whether you're a member of one Slack workspace or many, you can use the same email address to sign in to all of them.

> If your workspace or organization requires two-factor authentication (2FA), you'll need to provide a 6-digit authentication code to sign in.

## SLACK-15: Integrate Slack with Okta

- URL: https://help.okta.com/en-us/content/topics/provisioning/slack/slck-integrate-slack.htm
- Source type: Official Okta Help Center (Classic Engine publication)
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> If you're using Slack Enterprise Grid, include `.enterprise` in your domain name.

> Select a sign-on option from the Sign on methods section. If you select SAML 2.0, click View Setup Instructions and follow the instructions.

> Slack opens in a new window. Sign in to Slack and click Authorize.

## SLACK-16: Slack supported features

- URL: https://help.okta.com/oie/en-us/content/topics/provisioning/slack/slck-supported-features.htm
- Source type: Official Okta Help Center (Identity Engine publication)
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> This table lists the features and functionality available with a Slack integration.

> Push User Deactivation — Deactivating a user in Okta removes a user from all organizations and teams in integrated third-party applications.

> Currently Multi-Channel Guest User Schema is not supported.

## SLACK-17: Connect your SSO account with Slack

- URL: https://slack.com/help/articles/220766827-Connect-your-SSO-account-with-Slack
- Source type: Official Slack Help Center
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> We'll send you an email explaining how to connect (or "bind") your Slack account with your identity provider (IDP).

> To sign back in to Slack ... You’ll then be able to sign in using your IDP.

> To retain your message history in Slack, make sure to choose the option to remain associated with your account.

## SLACK-18: Cookie Policy

- URL: https://slack.com/trust/compliance/cookie-policy
- Source type: Official Slack Legal/Policy documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> They are unique to your account or your browser.

> Session-based cookies last only while your browser is open and are automatically deleted when you close your browser.

> Some cookies are associated with your account and personal information in order to remember that you are logged in and which workspaces you are logged into.

## SLACK-19: admin.users.session.list method

- URL: https://docs.slack.dev/reference/methods/admin.users.session.list/
- Source type: Official Slack Developer Docs API reference
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> List active user sessions for an organization.

> Both recent and created contain ... device_hardware ... os ... os_version ... slack_client_version ... ip.

> If the user has multiple sessions with multiple devices, the other sessions will be unaffected.

## SLACK-20: admin.users.session.getSettings method

- URL: https://docs.slack.dev/reference/methods/admin.users.session.getSettings/
- Source type: Official Slack Developer Docs API reference
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> Get user-specific session settings—the session duration and what happens when the client closes.

> Session settings include a duration (the amount of time a session can last) and whether the session should be terminated when the client is closed.

> This feature ... only available to Slack workspaces on an Enterprise plan.

## SLACK-21: Require a mandatory mobile browser

- URL: https://slack.com/help/articles/360037780633-Require-a-mandatory-mobile-browser-on-Enterprise-Grid
- Source type: Official Slack Help Center
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> Org Owners can require all members using Slack on unmanaged mobile devices to use a secure mobile browser ... when signing in with single sign-on (SSO).

> Available on Enterprise plans.

> To learn how to set up mandatory mobile browsers on devices managed by Enterprise Mobility Management (EMM) ...
