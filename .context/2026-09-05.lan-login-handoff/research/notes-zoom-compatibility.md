---
status: completed
date: 2026-09-05
subject: 2026-09-05.lan-login-handoff
topics: [zoom, okta, sso, web-app, session-portability]
---

# Zoom compatibility — rolling notes

Parent-maintained notes from ZoomEvidence. Public documentation only; no account, session, or provider settings accessed. Source type: official product/API documentation.

### Prior assessment

The existing Chrome/Okta/Slack/Microsoft report does not cover Zoom. Do not extend its conclusions into a Zoom support claim.

### ZW-PORTAL-1 — portal overview

Direct read returned official metadata and a Loading marker rather than the body. Metadata describes profile/settings management. This helps distinguish the portal from the web application, not its authentication or session lifecycle. Body-level claims remain unavailable; researcher is investigating another public rendering path.

### ZW-WEBAPP-1 — browser web app

Direct read returned official title and metadata describing the Zoom Workplace experience in the browser without downloads/plugins. Body unavailable. This establishes a distinct browser application at overview level only; it does not establish authentication handoff.

### ZW-SSO-SIGNIN-1 — user SSO sign-in

Direct read returned metadata indicating that users can use SSO if the owner/admin configured it. Body unavailable. No sign-in steps, session import, or continued-host behavior inferred from metadata alone.

### ZW-MULTIDEVICE-1 — multiple-device policy

Metadata mentions a default allowance for two desktop computers, two tablets and two mobile devices, but is truncated. Do not generalize this into a browser-session allowance or host-preservation guarantee. Full-body scope and current configuration still need evidence.

### ZW-DEVSESS-1 and ZW-DEVSESS-1M — account sessions

Standard and mobile-variant reads exposed only metadata about viewing/managing devices and sessions. Neither provided body-level export/import, logout-scope, or host-continuity evidence. The alternate URL did not resolve the access limitation.

### OKTA-ZOOM-INTEGRATION-1 — generic integration overview

Full official Okta integration overview names Zoom as an example of an external app and describes authenticated browser app access after configuration/assignment. It distinguishes federation protocols from SCIM provisioning. Useful background, not Zoom-specific session-handoff evidence.

### OKTA-ZOOM-SAML-1 — generic SAML mechanics

Full official Okta SAML overview explains browser-mediated federation and possible MFA. This supports normal host-browser preparation conceptually; it does not authenticate another browser or establish a reusable assertion/session-transfer contract.

### ZW-WEB-BROWSER-1, ZW-ALT-SIGNIN-1, ZW-PLATFORM-COMPARE-1, ZW-NATIVE-APP-1 — discovery limitations

These official support reads returned metadata and Loading, not article bodies. They identify browser/native/provider/platform topics but are not evidence for detailed compatibility. Stop accumulating these snippets; recover decisive article bodies in a fresh public-document browser if available.

### ZW-SIGNIN-ROOT-1 and ZW-WEBAPP-ROUTE-1 — distinct entry surfaces

Public reader output from `zoom.us/signin` and `app.zoom.us/wc/home` distinguishes account sign-in from the Web App route. The latter exposed a PWA shell. Neither is authenticated acceptance evidence. The plan should test signed-in Zoom Web App use, not merely a guest meeting join or accessible portal landing page.

### ZW-OAUTH-1 and ZW-API-1 — API grants are not browser login

Full official Zoom developer pages describe OAuth access tokens and authenticated HTTP API calls. These authorize API resources, not importing a host's Zoom browser-session state. Do not use API/OAuth success as a surrogate for authenticated Web App use. No OAuth authorization was performed.

### Raw article-body recovery

The researcher recovered the decisive Zoom article bodies from official raw HTML `articleBody` data. The initial reader limitations remain recorded above; they are not the basis for final absence or support claims.

### ZW-WEBAPP-2 — authenticated application versus guest join

The recovered Web App article names `app.zoom.us/wc`, browser sign-in and account/profile controls, and distinguishes signing in from joining a meeting without an account. The requested acceptance surface is the authenticated Web App. This article does not describe browser-session export/import. Absence is bounded to the article, not a universal technical impossibility claim.

### ZW-MULTIDEVICE-2 — configurable concurrency and eviction

The recovered article documents concurrent-device limits and eviction of the first session when the same-type limit is exceeded. Account capabilities/settings affect limits. It does not clearly establish how two particular Web App browser sessions are counted. Host preservation must be observed in the actual allowed configuration, not inferred from nominal desktop-device counts.

### ZW-SSO-SIGNIN-2 and OKTA-ZOOM-SAML-OIN-1 — normal federation

Zoom documents tenant vanity-URL web SSO and provider-controlled/account-configured logout timing. Okta's actual Zoom integration supports SP-initiated and IdP-initiated SAML SSO plus JIT provisioning; the tenant subdomain matters. These establish a normal host-browser preparation route, not cross-computer completion or portable application state.

### ZW-PORTAL-2 and ZW-DEVSESS-2 — portal and revocation

Recovered portal documentation separates account/settings/scheduling from the Web App. Device/session management explicitly includes web browsers, exposes session context and allows individual or all-session sign-out. The extension must not claim invisible client use, immunity to server revocation or that disconnecting the peer transport revokes every application session.

### ZW-GUEST-1, ZW-BROWSER-LINK-1 and ZW-MEETING-AUTH-1 — meeting access is a separate contract

Guest joining may work without an account, while host-configured authentication profiles can require a signed-in account/domain. Browser-join availability has its own settings and security prompts. These meeting controls are not evidence of account-session handoff. Do not start/join a meeting to validate this authentication feature unless separately requested; signed-in read-only account observations suffice.

### Final assessment

Zoom is now researched at the public-documentation level. Normal browser SSO is documented; application-session portability and host preservation remain unverified. No consulted recovered article or Okta setup guide supplies a browser-session export/import contract. That is a bounded documentation finding, not proof that all bearer-session reuse is technically impossible.

### OKTA-ZOOM-OIN-2 — catalog corroboration

Official Okta Zoom listing corroborates integration availability and separates authentication from provisioning/onboarding/offboarding. Catalog capability badges are not evidence that every listed protocol is active for this tenant. The specific SAML setup guide remains the authoritative integration detail used here.

### Parent source verification

Main fetched ZW-MULTIDEVICE-2 raw HTML and parsed its articleBody. Confirmed the device-limit/oldest-session-eviction statements and configuration-dependent limits. No account/admin page or settings were accessed; raw source was retained only in tool context.
