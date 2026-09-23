---
status: active
date: 2026-09-22
subject: 2026-09-22.claude-ai-session
---

# Sources — Claude.ai session constitution

## User dump (2026-09-22)

- Access: user-pasted sessionStorage + localStorage from a logged-in claude.ai tab
- Key finding: dump is SPA cache/telemetry, not cookies. Account UUID present; not retained here.
- `spa_nav_loop` paths: `/login` → `/sso-callback` → `/new`

## SUPPORT-1: What Cookies Does Anthropic Use?

- URL: https://support.anthropic.com/en/articles/9020432-what-cookies-does-anthropic-use
- Canonical body fetched 2026-09-22 as https://privacy.claude.com/en/articles/10023541-what-cookies-does-anthropic-use
- Source type: first-party help/privacy table
- Confidence: high for *disclosed names and purposes*; does not prove HttpOnly, portability, or a minimal replay set

Quotes:

> Necessary cookies are used to provide basic functionality of our Services and cannot be refused - for example: authentication, site preferences (including cookie opt-out preference), or security.

Named **Authentication** cookies:

| Name | Purpose | Domain | Lifespan |
| --- | --- | --- | --- |
| sessionKey | Authentication | .anthropic.com, .claude.ai, console.anthropic.com | 1 month |
| sessionKeyV2 | Authentication | .anthropic.com, .claude.ai, console.anthropic.com | 1 hour |
| activitySessionId | Authentication | .anthropic.com, claude.ai, .console.anthropic.com | 12 hours |

Named **Preferences** cookie relevant to org selection:

| Name | Purpose | Domain | Lifespan |
| --- | --- | --- | --- |
| lastActiveOrg | Preferences | .anthropic.com, claude.ai | 1 year |

Named **Security** cookies on claude.ai (not claimed as the login session):

- `__ssid` (13 months, .anthropic.com / .claude.ai)
- `anthropic-device-id` (10 months, claude.ai / .console.anthropic.com)
- `anthropic-consent-preferences`
- `__cf_bm` (Cloudflare, 30 minutes)
- `cf_clearance` (Cloudflare, 1 year)

Cookie Policy link in article: https://www.anthropic.com/legal/cookies

## LEGAL-1: Cookie Policy

- URL: https://www.anthropic.com/legal/cookies
- Accessed: 2026-09-22
- Effective: 2024-03-19
- Confidence: high for purpose language; names live in the table, not this page

> when you sign in to use our Services, cookies that help us show you the correct information and preferences associated with your account.

Points to https://support.anthropic.com/en/articles/9020432

## SUPPORT-2: Move personal account to Team/Enterprise

- URL: https://support.anthropic.com/en/articles/9267400
- Accessed: 2026-09-22

> You can switch between them by clicking your initials or name in the lower left corner of the screen.

Keep both accounts vs migrate. Same email.

## SUPPORT-3: Get started with Team

- URL: https://support.anthropic.com/en/articles/9267247
- Accessed: 2026-09-22

> You can switch between your personal account and the Team org by clicking your initials or name in the lower left corner

## SUPPORT-4: SSO considerations

- URL: https://support.anthropic.com/en/articles/10276682
- Accessed: 2026-09-22

Users added to the SSO app keep prior Free/Pro/Team/Max accounts and toggle via the profile icon. `Require SSO for Claude` can lock those prior accounts.

## SUPPORT-5: Claude vs Console

- URL: https://support.anthropic.com/en/articles/8987223
- Accessed: 2026-09-22

Same email, independent Claude vs Console accounts.
