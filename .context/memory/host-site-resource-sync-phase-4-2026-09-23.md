---
date: 2026-09-23
domains: [chrome-extension, resource-sync, testing]
topics: [client-apply, cookies, localStorage, resource-upsert, host-only, background-tabs]
related: [host-site-resource-sync-phase-3-2026-09-22.md]
priority: high
status: completed
subject: 2026-09-22.host-site-resource-sync
artifacts:
  - phase-4-resource-client-apply.md
  - plan-host-site-resource-sync-phases.md
  - draft-commit.md
  - review-zz-buck-loop-2026-09-23T04-38-07-709Z.md
---

# Host site resource sync — Phase 4 client apply

Implemented only `phase-4-resource-client-apply.md`. End-to-end two-profile smoke remains Phase 5.

## Shipped

- Inbound `resource_upsert` is routed off the Slack host pipeline. Authorized client connections apply; host role, unauthorized, mismatched connection, and expired deadline return `resource_error` and do not write.
- Cookies go through `chrome.cookies.set` with path, secure, httpOnly, sameSite, and partitionKey. A leading-dot domain is passed through; a domain without a leading dot is treated as host-only and omitted. Session cookies omit `expirationDate`.
- Host send encoding matches that rule: `hostOnly` cookies are sent without a leading dot and without expiry; non-host-only cookies without a leading dot are prefixed so the client can tell them apart.
- localStorage reuses a tracked auto-opened tab, otherwise a same-origin client tab, otherwise `tabs.create({ url: origin + '/', active: false })`. `setItem` waits until the tab is complete. A tab that never completes returns `no_document` and does not write.
- Auto-opened tab ids are tracked per origin and reused. `releaseLocalStorage` closes only that tab, and only after the last applied key for the origin is released. User-opened tabs are never removed.
- Oversize and malformed items fail before `cookies.set`, `tabs.create`, or `executeScript`.

## Verification

- `__tests__/resource-sync.test.ts` and `__tests__/connection-routing.test.ts`: 106 passed.
- Durable guardrails v2 pass. Coverage 91.4 ≥ 91.07. No new complexity violations. Diff-scoped lint pass.

## Decisions

- Host-only is encoded as "domain does not start with `.`" because the Phase 1 wire item has no `hostOnly` field. The send side now prefixes non-host-only domains so real Chrome cookies (which omit the leading dot) still apply as domain cookies.
- Ack `id` is the cookie name or localStorage key.
- Host uncheck still sends nothing. The client therefore cannot see a host subscription end. Tab close is implemented on the client's applied-key set, not on a new wire frame.

## Review

Passed against this phase's unit contract. No in-plan defects. Out-of-plan findings do not reopen Phase 4.

- A fresh client has no grant path. Apply checks `{ permissions: ['cookies', 'scripting'], origins: [origin/*] }`, and that grant is requested only from the host options panel. An inbound frame cannot call `permissions.request`. The client fails closed with `permission_denied` and writes nothing. Phase 5 smoke step 4 is not viable until a separate plan adds a client grant.
- `releaseLocalStorage` is tested and only removes feature-opened tabs, but nothing in `connection.ts` calls it. Host uncheck still sends no frame, so auto-opened tabs stay open for the life of the client profile. A cross-profile close needs a new wire frame and is not this phase.
- The leading-dot host-only rule is already in the uncommitted AGENTS.md conventions block (`wireCookieDomain`; never forward Chrome's undotted `cookie.domain`). No further docs edit is required for that review finding.

## Next

Commit this phase. Plan the client origin grant before treating Phase 5 smoke as viable. The tab-close wire frame is a separate follow-up and does not block Phase 5's written acceptance criteria.
