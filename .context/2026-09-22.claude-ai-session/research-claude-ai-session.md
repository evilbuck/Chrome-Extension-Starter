---
status: active
date: 2026-09-22
subject: 2026-09-22.claude-ai-session
topics: [claude-ai, session-constitution, cookies, account-switch]
informs: []
---

# Claude.ai — what constitutes a saved session

## Decision

The user dump is **not** a saved Claude session. It is SPA **sessionStorage** telemetry plus **localStorage** React Query / greeting cache that *labels* an account after login.

Anthropic’s first-party cookie table is the only named authentication contract found. A Teleport-style saved session, if one exists, is **cookies**, not that storage dump.

A portable minimal set is **not** proved. Names below are disclosed purposes, not a replay recipe. HttpOnly, host/path, partition, and server acceptance after transplant are unobserved.

**Fork chosen 2026-09-22: employer Claude for Work SSO (C).** Capture, export, or replay of that session is stopped. It is organization-managed. Existing backlog item `enforce-enterprise-owner-authorization` applies. Do not dump work cookies or proceed to apply.

Same-email personal + org, if the user is in the SSO app and “Require SSO” has not locked the personal account, is Anthropic’s own lower-left switcher — not a Teleport blob.

## User dump classification

The first list was labeled “session cookies”. Key shapes match sessionStorage.

**Not session-constituting:** perf (`claudeai.perf.interaction_slow_draw`), experience bookkeeping, login A/B arm, o11y counters, SPA nav-loop detector, capability probes, composer greeting copy, sidebar pref, RQ cache TTL.

**Identity labels only (not credentials):** `rq-cache-confirmed-account`, `rq-cache-confirmed-account-session`, `rq-cache-confirmed-session-marker`, `frame-chat-summon-pending.account`. The “session marker” is a millisecond timestamp, not a token.

`spa_nav_loop` shows `/login` → `/sso-callback` → `/new`. That is post-SSO navigation telemetry.

If cookies were swapped without clearing this origin cache, the RQ account keys would fight the new login. Slack needed `localConfig_v2`; this Claude cache is the opposite — wipe, do not save.

Account UUID and greeting text from the dump are not retained in this file.

## Documented cookie constitution

Source: [What Cookies Does Anthropic Use?](https://support.anthropic.com/en/articles/9020432-what-cookies-does-anthropic-use) (body also at privacy.claude.com), fetched 2026-09-22. Cookie Policy (2024-03-19) points at that table and says Necessary cookies include sign-in cookies that show the correct account.

### Authentication (the session candidates)

| Name | Disclosed purpose | Disclosed domains | Disclosed lifespan |
| --- | --- | --- | --- |
| `sessionKey` | Authentication | `.anthropic.com`, `.claude.ai`, `console.anthropic.com` | 1 month |
| `sessionKeyV2` | Authentication | `.anthropic.com`, `.claude.ai`, `console.anthropic.com` | 1 hour |
| `activitySessionId` | Authentication | `.anthropic.com`, `claude.ai`, `.console.anthropic.com` | 12 hours |

Unknown until live metadata (names/attributes only): which of the three are present after this SSO login; HttpOnly/Secure/SameSite; host-only vs `.claude.ai`; whether `sessionKeyV2` refreshes `sessionKey`; whether `activitySessionId` is idle-activity rather than login; whether all three are required.

### Org selection (not a second login)

| Name | Disclosed purpose | Lifespan |
| --- | --- | --- |
| `lastActiveOrg` | Preferences | 1 year |

Anthropic documents an in-app switcher for a personal account and a Team/Enterprise org on the **same email**: initials / name, lower left, blue checkmark. Data is not shared between those accounts. SSO-enabled orgs use the same toggle when the user is in the SSO app.

That path does **not** need a Teleport session blob.

### Security / bot / IdP — not the Claude account session

- `anthropic-device-id` — Security, 10 months, `claude.ai` / `.console.anthropic.com`. Device-shaped. Do not treat as optional decoration and do not forge it. Observation only.
- `__ssid` — Security, 13 months.
- `__cf_bm` (30 min), `cf_clearance` (1 year) — Cloudflare bot/challenge. Site load, not account identity.
- Google security cookies on `.google.com` — IdP for `/sso-callback`. Out of Claude origin scope. Transferring them is a Google-account export, not a Claude session.
- Intercom, Stripe, analytics, marketing cookies — not authentication.

Claude.ai and Console can share an email and still be independent accounts ([help](https://support.anthropic.com/en/articles/8987223-can-i-have-a-claude-ai-account-and-a-console-account)). Console cookies are a different product.

## Two product forks

| Situation | Session constitution | Teleport? |
| --- | --- | --- |
| A. Same email: personal Free/Pro/Max **and** Team/Enterprise org | One Anthropic login. Switcher + likely `lastActiveOrg`. | No. Use Anthropic’s UI. |
| B. Two Claude logins (two emails / two Google accounts) | Two Authentication cookie sets (`sessionKey` / `sessionKeyV2` / `activitySessionId` candidates). Origin storage is cache to clear. | Not this request. |
| C. Employer Claude for Work with company SSO / domain claim | Organization-managed. Chosen 2026-09-22. | **Stopped.** Owner-authorization backlog item. No cookie dump, no apply. |

SSO extra (first-party): Anthropic is SAML SP; WorkOS does domain verification. “Reset connection” ends all users’ sessions. `Require SSO for Claude` can lock prior Free/Pro/Max accounts on the domain. Consumer Terms §2: work-email accounts may be linked to the org and monitored by the admin. Claude Code legal/compliance (third-party-developer scope): do not collect/store/intermediate Claude.ai credentials or session tokens; sign-in must complete through Anthropic’s own flow.

## Slack analogue (exactness target, not a copy)

Slack Case 2: `d` + `d-s` on `.slack.com`, HttpOnly, Secure, unpartitioned, plus minimal `localConfig_v2`. Proof = authenticated workspace after reload, host preserved.

Claude cookie **names** are documented; cookie **attributes**, minimal subset, and client-view proof are not. That gap does not authorize a work-session probe.

Manifest today: optional `cookies`/`scripting` only for Slack hosts. No `claude.ai` host permission.

## Explicitly not established

- Live cookie table (names + HttpOnly/host/path/expiry only).
- IndexedDB / Cache Storage necessity.
- Portability of Authentication cookies.
- Whether Anthropic binds `sessionKey*` to `anthropic-device-id` or Cloudflare clearance.

## Next

No cookie observation for this work session. Identification is complete. Resume only if a written organization-owner grant names this account, tenant, devices, and transfer mechanism — the existing human/process backlog item, not a verifier to build.

If personal and work are the same email and the user is in the SSO app, use Claude’s lower-left account menu. That is the supported same-profile switch.

## Sources

- User dump, 2026-09-22 (sessionStorage + localStorage; no cookie table)
- https://support.anthropic.com/en/articles/9020432-what-cookies-does-anthropic-use
- https://www.anthropic.com/legal/cookies
- https://www.anthropic.com/legal/consumer-terms
- https://support.anthropic.com/en/articles/9267400
- https://support.anthropic.com/en/articles/9267247
- https://support.anthropic.com/en/articles/10276682
- https://support.anthropic.com/en/articles/13132885-set-up-single-sign-on-sso
- https://support.anthropic.com/en/articles/8987223
- https://code.claude.com/docs/en/legal-and-compliance
- In-repo Slack constitution: `src/background/apps/slack.ts`; `.context/2026-09-05.lan-login-handoff/compatibility-slack.md`
- Backlog: `.context/backlog/items/enforce-enterprise-owner-authorization.md`
