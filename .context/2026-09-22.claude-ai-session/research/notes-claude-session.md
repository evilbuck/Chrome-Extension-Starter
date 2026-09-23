---
status: active
date: 2026-09-22
subject: 2026-09-22.claude-ai-session
topics: [claude-ai, session-constitution, cookies, localStorage, sessionStorage]
---

# Rolling notes — Claude.ai session constitution

Question: what browser state constitutes a saved Claude.ai session for same-browser account switching (personal vs work), without a second Chrome profile.

Method inherited from Slack/Outlook compatibility work: identify state *categories* from observation + first-party docs. Do not invent cookie names. Do not record values. Success is an authenticated app/account view after reload, not presence of storage keys.

## User dump (2026-09-22)

User labeled the first list "session cookies". The key names and JSON payloads match **sessionStorage** (SPA/runtime), not `document.cookie` / `chrome.cookies`.

Account UUID and greeting copy were present. Those values are **not** copied into this file.

### sessionStorage (mislabelled as cookies)

| Key | Role | Session-constituting? |
| --- | --- | --- |
| `claudeai.perf.interaction_slow_draw` | Perf sample | No |
| `experience-storage` | In-app experience/placement bookkeeping (`dismissedIds`, `shownIds`, …) | No |
| `frame-chat-summon-pending` | UI pending-summon + cached account id | No (identity *label* only) |
| `login-entry:arm` | Login A/B arm (`app`) + timestamp | No |
| `o11y.same_path_load` | Observability load counter | No |
| `spa_nav_loop` | SPA nav-loop detector (`/login` → `/sso-callback` → `/new`) | No; useful only as evidence the dump is post-SSO |
| `test.sessionStorageSupported` | Capability probe | No |

`spa_nav_loop` path sequence confirms this tab completed SSO and landed on `/new`. That is navigation telemetry, not a credential.

### localStorage

| Key | Role | Session-constituting? |
| --- | --- | --- |
| `rq-cache-confirmed-account` | React Query cache of account UUID | No. Scope *label* (Slack analogue: team/account id), not the session |
| `rq-cache-confirmed-account-session` | `{account, marker}` | No. Marker is a millisecond timestamp, not a token |
| `rq-cache-confirmed-session-marker` | Same marker | No |
| `spa:codeSidebarLive` | UI pref | No |
| `spa:rqCacheRetention` | Cache TTL policy | No |
| `static-composer-greeting-data-v2` | Personalized greeting copy keyed by account UUID + marker | No |
| `test.localStorageSupported` | Capability probe | No |

### What is missing from the dump

- No `Set-Cookie` / Application-panel **Cookies** table
- No HttpOnly names or attributes
- No IndexedDB / Cache Storage inventory
- No `claude.ai` vs `anthropic.com` vs `claude.com` cookie-host split

Conclusion from dump alone: **this is not a saved session.** It is SPA cache + telemetry that *mentions* an account id after login.

## Slack constitution (in-repo precedent)

Exact Slack Case 2 session (implemented, locally transferred):

- Cookies: `d` and `d-s` on `.slack.com`, path `/`, HttpOnly, Secure, unpartitioned
- Origin storage: minimal `localConfig_v2` enterprise + member workspace entries
- Not transferred: `ui`, IdP state, drafts, messages, generic profile
- Proof: authenticated workspace view after client reload; host preserved

Claude identification must reach that specificity before any capture/apply work. Manifest today has optional `cookies`/`scripting` only for Slack hosts.

## First-party cookie docs

Fetched 2026-09-22: https://support.anthropic.com/en/articles/9020432-what-cookies-does-anthropic-use
(canonical body also at https://privacy.claude.com/en/articles/10023541-what-cookies-does-anthropic-use)

Authentication cookies named: `sessionKey` (1 month), `sessionKeyV2` (1 hour), `activitySessionId` (12 hours). Domains include `.claude.ai` / `.anthropic.com`.

`lastActiveOrg` is Preferences, 1 year — org selection inside a login, not a second login.

Cookie Policy (https://www.anthropic.com/legal/cookies, effective 2024-03-19): Necessary cookies include sign-in cookies that show the correct account. Points at the same table. No additional cookie names.

Help Center: same-email personal + Team/Enterprise uses the lower-left account switcher. SSO orgs keep that toggle when the user is in the SSO app.

## Fork

A = same-email org switch (no Teleport). B = two Claude logins (cookie candidates above; unproved). C = employer SSO (authorization gate).

## Next

If B: cookie-attribute observation only. No values in chat or `.context/`.
