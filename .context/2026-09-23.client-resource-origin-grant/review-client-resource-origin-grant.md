---
status: completed
date: 2026-09-23
subject: 2026-09-23.client-resource-origin-grant
topics: [review, origin-grant]
---

# Review: Client origin grant

## Verdict

Pass. A fresh client still fails closed without a grant. Grant is a click on the authorized client options page. Retry replays every held identity for the live connection through `permissions.contains`. Disconnect, forget, and transport loss clear the hold. A mismatched connection cannot apply an older peer's item.

## Evidence

- `pnpm build`: web and worker builds succeeded.
- Durable guardrails v2: pass. Unit, lint, patch, ratchet, and complexity passed. Functional gate skipped. Coverage 91.5%.
- `__tests__/connection-routing.test.ts`: host session cannot call `RESOURCE_CLIENT_PENDING`.
- `pnpm build`: web and worker builds succeeded after narrowing `connectionId` and removing invalid `as const` assertions on enum members.
- Durable guardrails: recorded in the closeout memory after this review's check.

## Documentation impact

None for this subject. Phase 5 owns the end-to-end how-to.

## How-to impact

The Grant click is a new user action. Phase 5's how-to must mention it. That does not block this subject.

## Closeout

`close-verified` refuses an unphased plan (`unphased plan remains open`). The plan `status` is `completed`. The subject stays active under that script rule. Do not edit lifecycle fields by hand.
