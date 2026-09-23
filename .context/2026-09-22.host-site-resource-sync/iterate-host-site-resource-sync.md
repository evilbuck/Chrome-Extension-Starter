---
status: completed
date: 2026-09-22
updated: 2026-09-22
subject: 2026-09-22.host-site-resource-sync
topics: [review, iteration]
informs: []
addresses: phase-3-resource-live-watches.md
completed: 2026-09-22
from_review: b-review
---

# Iteration: Host site resource sync Phase 3

## Source
- Reviewed after: `/b-iterate`
- Plan: `plan-host-site-resource-sync.md`
- Phase: `phase-3-resource-live-watches.md`

## Critical Issues

### 1. Fix the Phase 3 regression test's `setInterval` return type
- **File**: `__tests__/resource-sync.test.ts:870-873`
- **Problem**: The new stale-status-poll regression mocks `window.setInterval` with a function that returns `number`, but this project's merged DOM/Node typings require `NodeJS.Timeout`. `npm run build:prod` therefore fails type checking with TS2345, so the extension cannot produce a production bundle from the current Phase 3 tree.
- **Proposed fix**: Return a value compatible with `ReturnType<typeof window.setInterval>` (or preserve/call the original timer and capture its callback without narrowing the return type), then rerun the production build and the deterministic guardrails contract.

## Warnings

None.

## Review Evidence

- Durable guardrails v2 passes: 455 unit tests, diff-scoped lint across 50 files, patch coverage, global coverage ratchet at 91.40% versus 91.07%, and complexity; functional tests are contract-disabled/skipped.
- `npm run build:prod` fails in the Phase 3 stale-status-poll regression at `__tests__/resource-sync.test.ts:870` with TS2345 (`number` is not assignable to `Timeout`).
- Sequential standards fallback used the TypeScript, Preact/React, universal quality, async/concurrency guides and the diff-relevant Long Method, Temporary Field, Duplicate Code, and Primitive Obsession smell definitions.

## Recommended Workflow

Start with `/b-iterate` — it will pick up this file automatically.
Then re-run `/b-review` against the same phase.
Inside an OMP execution session, the iterate artifact is not done until it is completed, review passes, and `/b-save` has recorded durable state.
For larger rework, use `/b-build` or `/b-build-hard`.

## Resolution

- Overlapping refresh requests now mark the active pass dirty; the same refresh promise runs another full cookie/localStorage pass before settling.
- Status polls capture the active selection request and ignore responses after cleanup or a newer selection.
- Regressions reproduce both races and pass with the fixes.
- The stale-status-poll timer mock now returns an explicitly typed `NodeJS.Timeout` handle without scheduling a real timer, restoring project type-check compatibility.
- Production `build:prod` succeeds; the targeted stale-poll regression, all 455 unit tests, and diff-scoped Biome checks pass.
