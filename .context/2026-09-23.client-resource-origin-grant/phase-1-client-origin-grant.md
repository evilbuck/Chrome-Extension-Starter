---
status: completed
phase: 1
order: 1
plan: plan-client-resource-origin-grant.md
difficulty: medium
buck_hint: /b-build
goal: "An authorized client can grant cookies, scripting, and a site origin from a click, then retry held identities through the existing permission check."
files:
  - src/background/apps/resources.ts
  - src/background/connection.ts
  - src/pages/resources/client-grant.tsx
  - src/pages/options/index.tsx
  - __tests__/resource-client-grant.test.ts
depends_on: []
acceptance_criteria:
  - "[x] A fresh client apply with no origin grant still returns permission_denied and writes nothing."
  - "[x] Grant calls chrome.permissions.request for cookies, scripting, and the origin from a click."
  - "[x] Retry replays every held identity for the live connectionId through permissions.contains."
  - "[x] Disconnect, forget, and transport loss clear the hold. A mismatched connection cannot apply an older peer's item."
completed_at: 2026-09-23
completed_by: b-build
---

# Phase 1: Client origin grant

This bounded plan is one unit. The phase file exists so `close-verified` can see a completed owner for `plan-client-resource-origin-grant.md`.

Evidence: `__tests__/resource-client-grant.test.ts`, `pnpm build`, and the durable guardrails pass recorded in `review-client-resource-origin-grant.md`.
