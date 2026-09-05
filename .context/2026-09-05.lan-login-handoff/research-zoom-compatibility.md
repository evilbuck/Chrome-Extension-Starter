---
status: completed
date: 2026-09-05
subject: 2026-09-05.lan-login-handoff
topics: [zoom, okta, sso, web-app, session-portability]
informs: [plan-lan-login-handoff.md]
memory: [lan-login-handoff-planning-2026-09-05.md, lan-login-handoff-implementation-2026-09-05.md]
---

# Research: Zoom web authentication and host preservation

## Finding

**Zoom supports browser SSO, but the consulted official documentation does not establish cross-computer browser-session handoff.** The requested client acceptance surface is the authenticated Zoom Workplace Web App at `https://app.zoom.us/wc`, not a portal landing page, guest meeting, native client or OAuth API grant. Normal Okta SSO can prepare the host's Zoom session; it does not itself authenticate the Linux client's browser. [WEBAPP] [SSO] [OKTA-SAML]

**Host preservation must be tested.** Zoom documents configurable simultaneous-device behavior, eviction when limits are exceeded and individual/all-session revocation. Browser-session counting and the actual tenant configuration remain untested. [MULTIDEVICE] [SESSIONS]

This closes the public-documentation gap in the earlier report. It does not make Zoom a supported integration or prove that ordinary bearer-session reuse is technically impossible.

## Confirmed environment

- macOS host, Linux client, Chrome on both.
- Manual `sync auth`, application-first host preparation/reuse, direct client website traffic, host remains logged in.
- Web applications only. Microsoft scope is Outlook web; Slack is also required, but neither is re-researched here.
- Required provider checks remain human-completed; extension trust is a different boundary.

## Compatibility matrix

| Capability / surface | Verdict | Exact boundary |
|---|---|---|
| Authenticated Zoom Web App | Documented application; handoff unverified | Web App offers sign-in separately from guest join and provides account/profile controls. Observe the intended signed-in account in this surface. [WEBAPP] |
| Host normal Okta → Zoom sign-in | Documented, configuration-dependent | Zoom documents tenant vanity-URL web SSO; Okta's Zoom integration supports SP-/IdP-initiated SAML and JIT provisioning. Tenant subdomain/assignment matters. [SSO] [OKTA-SAML] |
| Existing host app session reused by client | Not established by consulted docs | No session export/import or cross-browser handoff contract was found in the recovered Web App, portal, SSO or session articles and Okta setup guide. This is a bounded documentation finding, not a universal impossibility claim. |
| Host remains logged in | Required but unverified | Account/device limits can evict another session; user/admin session revocation exists. Do not infer browser compatibility from desktop-device quotas. [MULTIDEVICE] [SESSIONS] |
| Web portal | Separate documented surface | Generic/tenant sign-in routes lead to profile/settings/scheduling administration. Portal success alone is not authenticated Web App success. [PORTAL] |
| Guest meeting join | Separate, often unauthenticated | Guest entry may work without an account; host profiles/domain requirements can still force sign-in. A joined meeting is not account-authentication proof. [GUEST] [MEETING-AUTH] |
| Native Workplace app | Outside this PoC | SSO redirects back to a desktop/mobile app on that route. Browser state is not native credential storage. [SSO] |
| Zoom OAuth/API access | Not a browser login mechanism | Official developer docs describe API resource grants and bearer tokens, not importing the Web App's browser session. [OAUTH] [API] |

## Application-first cases

### Case 2: host already has the correct Zoom application session

The feature must establish that the host is in the intended Zoom account, then identify an acceptable application-specific completion mechanism. It cannot declare success from a host tab, cookie availability or a portal session alone. Client acceptance is signed-in Web App use, followed by continued host use.

### Case 1: host needs normal Zoom sign-in through Okta

Use the configured Zoom tenant's ordinary web sign-in route through Okta. Pause for explicit MFA/consent or other provider interaction. After returning, verify the host Web App session, not just the portal. Then converge on the same unverified handoff boundary as Case 2. Never replay an assertion or treat host authentication as receiving-device proof. [SSO] [OKTA-SAML]

## Verification contract

For each case, on the actual allowed macOS-host/Linux-client pair:

1. Record non-secret surface, account alias, browser version and relevant policy category.
2. Observe the host's starting authentication state without forcibly logging it out.
3. Invoke one manual scoped request; observe any provider challenge and require the user to complete it.
4. Confirm the client reaches the intended authenticated Web App/account and can refresh/navigate within its signed-in account UI. Do not start meetings, send chat or change settings as authentication proof.
5. Recheck the host after client authentication and later ordinary refresh/navigation. Record any eviction, expiry or reauthentication as an unsuccessful preservation outcome.
6. Keep all tokens, cookies, full network captures and session values out of artifacts. No broad provider/session reset or account-policy changes are part of this check.

An initial success does not prove long-term refresh, revocation or arbitrary tenant compatibility. If a required receiving-device check prevents completion, classify the flow honestly rather than presenting transport/session material as satisfying the check.

## Source recovery and evidence quality

Initial reader-mode requests returned Zoom metadata with a Loading marker. Decisive article bodies were subsequently recovered from official raw HTML `articleBody` content. Metadata-only and shell-only pages are recorded as access limitations, not negative evidence. Full Okta Zoom SAML integration and Zoom OAuth/API docs were also consulted.

No real account, provider setting, credential, session transfer or live application experiment was accessed/performed. [Rolling notes](research/notes-zoom-compatibility.md) and [source ledger](research/sources-zoom-compatibility.md) preserve source IDs, read scope, recovery history and supplementary meeting-surface evidence.

[WEBAPP]: https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0064261
[SSO]: https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0061708
[OKTA-SAML]: https://saml-doc.okta.com/SAML_Docs/How-to-Configure-SAML-2.0-for-Zoom.us.html
[MULTIDEVICE]: https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0066990
[SESSIONS]: https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0077145
[PORTAL]: https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0058317
[GUEST]: https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0059553
[MEETING-AUTH]: https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0063837
[OAUTH]: https://developers.zoom.us/docs/integrations/oauth/
[API]: https://developers.zoom.us/docs/api/using-zoom-apis/
