---
status: completed
date: 2026-09-09
updated: 2026-09-09
subject: 2026-09-08.hidden-items-sync-strategy
topics: [review, iteration, chrome-storage-sync, quotas, alarms]
informs: []
addresses: plan-hidden-items-sync.md
completed: 2026-09-09
from_review: b-review
---

# Iteration: hidden-items sync (review round 2)

## Source
- Reviewed after: `/b-iterate` (round 1 artifact `iterate-hidden-items-sync.md`,
  completed) and `/b-review` against `plan-hidden-items-sync.md`
- Plan: `plan-hidden-items-sync.md`
- Spec: none

Round 1 criticals (write-ack durability, in-flight race, sharding) remain
resolved. This round closes both follow-up warnings.

## Resolution

### 1. Conservative serialized shard quota — resolved
- **Fix**: `src/shared/hidden-items.ts` reserves eight bytes for the
  storage item's omitted JSON envelope and a one-byte safety margin while
  packing shard fragments.
- **Regression**: `__tests__/hidden-items.test.ts` measures
  `JSON.stringify({ [key]: value })` and proves an 8,193-byte combined item
  splits into two ≤8,192-byte shards.

### 2. Fallback alarm scheduling race — resolved
- **Fix**: `src/background/hidden-items-sync.ts` intentionally leaves the
  one-shot fallback armed after a successful flush. Chrome consumes the later
  no-op alarm, avoiding a clear-versus-reschedule race without generation
  bookkeeping.
- **Regression**: `__tests__/hidden-items-sync.test.ts` proves a later
  pending snapshot still flushes from that fallback after the in-memory timer
  is discarded.

## Verification

- Targeted regressions: 20/20 passed.
- Unit gate: 137/137 passed (`bun run test`).
- Diff-scoped lint: 13 files clean (`bunx biome check …`).
- TypeScript LSP diagnostics: clean for both changed source modules.

## Remaining Follow-up

- Two-profile Chrome Sync remains not-verifiable in this environment.

## Recommended Workflow

Run `/b-review` against `plan-hidden-items-sync.md`, then `/b-docs` if the
review retains its documentation-impact finding, `/b-save`, and `/b-commit`.
