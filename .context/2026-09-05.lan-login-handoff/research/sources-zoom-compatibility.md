---
status: completed
date: 2026-09-05
subject: 2026-09-05.lan-login-handoff
topics: [zoom, okta, sso, session-portability]
---

# Zoom compatibility — source ledger

Access date: 2026-09-05. Researcher: ZoomEvidence; captured by Main. Initial direct reads below returned official metadata plus Loading rather than article bodies. A title/description is not full-source evidence.

## ZW-PORTAL-1 — Getting started with the Zoom Web Portal

URL: https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0058317

Read: metadata only; localized-title anomaly; body unavailable.
Data: description identifies profile customization and Zoom settings. No session-lifecycle conclusion.

## ZW-WEBAPP-1 — Getting started with the Zoom Web App

URL: https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0064261

Read: metadata only; body unavailable.
Data: Zoom Workplace in the browser, no downloads/plugins. No session-import conclusion.

## ZW-SSO-SIGNIN-1 — Signing in with SSO

URL: https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0061708

Read: metadata only; body unavailable.
Data: SSO depends on account-owner/admin configuration. No body-level steps or policy conclusion.

## ZW-MULTIDEVICE-1 — Signing in to your Zoom account on multiple devices

URL: https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0066990

Read: metadata only; truncated description; body unavailable.
Data: snippet mentions two desktop computers, two tablets and two mobile devices by default. Browser applicability and exact continuation behavior are unestablished from this snippet.

## ZW-DEVSESS-1 — Managing signed-in devices and sessions

URL: https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0077145

Read: metadata only, body unavailable.
Data: account surface to view/manage devices and sessions; no session-handoff or host-preservation guarantee established.

## ZW-DEVSESS-1M — mobile article rendering

URL: https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0077145&mobile_site=true

Read: metadata only; same limitation as standard URL.

## OKTA-ZOOM-INTEGRATION-1 — Get started with app integrations

URL: https://help.okta.com/oie/en-us/content/topics/apps/apps-overview-get-started.htm

Read: full text.
Data: Zoom is an external-app example; assigned integrations enable authenticated browser access; SCIM is provisioning. This is generic background, not Zoom session-transfer documentation.

## OKTA-ZOOM-SAML-1 — SAML app integrations

URL: https://help.okta.com/oie/en-us/content/topics/apps/apps-about-saml.htm

Read: full text.
Data: IdP and service provider use browser-mediated assertions; MFA can precede issuance. No cross-browser assertion/session-reuse contract is established.

## ZW-WEB-BROWSER-1 — Using the Zoom Web App on Chromebook and web browser

URL: https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0059744

Read: metadata only; body unavailable.
Data: browser-specific Web App article exists; no detailed session findings.

## ZW-ALT-SIGNIN-1 — Signing in with Google, Apple, Facebook or Microsoft

URL: https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0067781

Read: metadata only; body unavailable.
Data: alternate sign-in providers; no Okta/browser-state transfer evidence.

## ZW-PLATFORM-COMPARE-1 — Meetings and Webinars comparison by platform

URL: https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0065520

Read: metadata only; search-index excerpt used for discovery, not body-level evidence.
Data: platform comparison exists; no detailed support claim.

## ZW-SIGNIN-ROOT-1 — Sign In | Zoom

URL: https://zoom.us/signin

Read: public metadata and limited navigation.
Data: sign-in/account entry for meetings, profile and settings; not authenticated-session evidence.

## ZW-WEBAPP-ROUTE-1 — Zoom Web App route

URL: https://app.zoom.us/wc/home

Read: public route shell with Zoom title/PWA metadata.
Data: browser application route; no authenticated controls or transfer proof.

## ZW-NATIVE-APP-1 — Downloading Zoom Workplace desktop or mobile app

URL: https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0060928

Read: metadata only; body unavailable.
Data: native-app surface is distinct from browser app; no native protocol inference.

## ZW-OAUTH-1 — OAuth 2.0

URL: https://developers.zoom.us/docs/integrations/oauth/

Read: full developer documentation; no live authorization.
Data: OAuth grants access to Zoom APIs; browser authorization/consent results in API tokens. That is not Web App session import.

## ZW-API-1 — Using Zoom APIs

URL: https://developers.zoom.us/docs/api/using-zoom-apis/

Read: full developer documentation.
Data: API HTTP requests require access-token authentication; API resource access does not establish signed-in Web App access.

## ZW-WEBAPP-2 — recovered Web App article body

URL: https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0064261

Read: raw HTML articleBody, modified 2026-09-03.
Data: browser app at `app.zoom.us/wc`; separate Sign in, Join a meeting, Sign up; guest join differs from signed-in profile/settings. No session-handoff mechanism described.

## ZW-MULTIDEVICE-2 — recovered concurrency article body

URL: https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0066990

Read: raw HTML articleBody.
Data: configured device limits can evict the oldest same-type session; defaults/settings/account tiers affect limits. Browser counting and host preservation in this tenant remain untested.

## ZW-SSO-SIGNIN-2 — recovered SSO article body

URL: https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0061708

Read: raw HTML articleBody, modified 2026-09-04.
Data: SSO on the web and Workplace app; tenant vanity web URL redirects through identity provider; automatic logout depends on account configuration.

## OKTA-ZOOM-SAML-OIN-1 — How to Configure SAML 2.0 for Zoom

URL: https://saml-doc.okta.com/SAML_Docs/How-to-Configure-SAML-2.0-for-Zoom.us.html

Read: full official integration setup guide.
Data: SP-initiated SSO, IdP-initiated SSO and JIT provisioning; tenant subdomain/entity ID required. No browser-session export/import contract.

## OKTA-ZOOM-SAML-OIN-2 — alternate support article

URL: https://support.okta.com/help/s/article/how-to-configure-saml-for-zoom-in-okta?language=en_US

Read: Loading/CSS Error shell only. Not relied upon; OIN-1 supplies substantive integration evidence.

## ZW-PORTAL-2 — recovered portal article body

URL: https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0058317

Read: raw HTML articleBody, modified 2026-09-03.
Data: generic/organization sign-in URL; profile, meetings, contacts, settings and other account management; separate native/browser surfaces.

## ZW-DEVSESS-2 — recovered device/session article body

URL: https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0077145

Read: raw HTML articleBody, modified 2026-09-03.
Data: session list includes web browsers, OS/browser/location/login time; individual/multiple/all sign-out. Revocation is account/server-controlled; no session import described.

## ZW-GUEST-1 — Joining a Zoom meeting without an account

URL: https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0059553

Read: raw HTML articleBody, modified 2026-09-03.
Data: accountless joining exists subject to host settings/authentication profiles. Guest access is not authenticated Web App acceptance.

## ZW-BROWSER-LINK-1 — Join from your browser setting

URL: https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0067293

Read: raw HTML articleBody, modified 2026-09-03.
Data: account/group/personal browser-join controls and security prompts are separate from account login. No session-handoff evidence.

## ZW-MEETING-AUTH-1 — Requiring authentication to join a meeting or webinar

URL: https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0063837

Read: raw HTML articleBody, modified 2026-09-03.
Data: profiles can require signed-in accounts/email domains, including Web App participants. Wrong account/domain prompts are not bypassed by transport trust.

## OKTA-ZOOM-OIN-2 — Integrate Zoom with Okta

URL: https://www.okta.com/integrations/zoom/

Read: full official catalog page.
Data: authentication and provisioning integration; onboarding/offboarding differs from browser-session preservation. Catalog capability badges are not treated as proof of every protocol in the actual tenant.

## Parent spot-check

Main directly fetched and parsed the raw ZW-MULTIDEVICE-2 articleBody. Confirmed concurrent-device limits and automatic eviction when exceeded. Browser counting and actual tenant policy remain unverified.
