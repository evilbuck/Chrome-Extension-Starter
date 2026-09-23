---
date: 2026-09-23
domains: [chrome-extension, permissions, client-apply]
topics: [origin-grant, user-gesture, resource-apply]
related: []
priority: high
status: active
subject: 2026-09-23.client-resource-origin-grant
artifacts:
  - plan-client-resource-origin-grant.md
---

# Client origin grant

## Decision

A fresh client cannot grant site access from an inbound frame. The authorized client options page polls pending origins and a Grant click calls `chrome.permissions.request` for `cookies`, `scripting`, and that origin. Retry replays every held identity for the live `connectionId` through the existing `permissions.contains` check. Disconnect clears the hold. A mismatched connection cannot apply an older peer's item.

## Verification

- `pnpm exec vitest run`: 23 files, 469 tests passed.
- Biome clean on the changed source and tests after format.

## Not done

Phase 5 two-profile smoke is not run. It needs two Chrome profiles and a user gesture on the client.
