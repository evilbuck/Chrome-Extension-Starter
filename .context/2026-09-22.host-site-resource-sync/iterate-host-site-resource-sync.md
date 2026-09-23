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

### 1. A completed tab read must not undo a newer tab-close pause
- **File**: `src/background/apps/resources.ts:353-372`, `__tests__/resource-sync.test.ts:401-433`
- **Problem**: After `executeScript` resolves, the worker unconditionally `paused.delete`s and the outer refresh reschedules the poll alarm. A real `tabs.onRemoved` refresh that already observed no same-origin tab is overwritten, so the last host tab closing does not stay paused. The new regression encodes that stale outcome (`paused: false` after the tabs were removed).
- **Proposed fix**: Give localStorage refresh one serialized owner. Only the latest `tabs.query` snapshot may commit `paused` and the poll alarm. An in-flight read may still upsert the value it already read, but it must not clear a newer no-tab snapshot. Replace the overlap regression so a tab-close snapshot that lands during a held read stays paused with no poll alarm; a later same-origin tab still resumes.

## Warnings

None.

## Review Evidence

- Durable guardrails v2 passes: 455 unit tests, diff-scoped lint across 50 files, patch coverage, global coverage ratchet at 91.40% versus 91.07%, and complexity; functional tests are contract-disabled/skipped.
- `npm run build:prod` succeeds for worker and web bundles with type checking enabled.
- Sequential standards fallback used the TypeScript, Preact/React, universal quality, async/concurrency guides and the diff-relevant Long Method, Temporary Field, Duplicate Code, and Primitive Obsession smell definitions. Its worst finding is the same overlapping-refresh race.

## Recommended Workflow

Start with `/b-iterate` — it will pick up this file automatically.
Then re-run `/b-review` against the same phase.
Inside an OMP execution session, the iterate artifact is not done until it is completed, review passes, and `/b-save` has recorded durable state.
For larger rework, use `/b-build` or `/b-build-hard`.

## Previous Iteration Resolution

- The prior production-build typing defect was fixed.
- Overlapping reconnect refreshes now queue a full follow-up pass, and stale panel status/toggle responses are selection-scoped.

- LocalStorage refreshes are chained on one tail. A tab-close requested during a held read runs after that read and is the snapshot that commits pause and the poll alarm. The overlap test waits on `tabs.onRemoved` only; it does not call `sync.refresh()`.
- Unit gate 456 passed; biome clean on the two changed files.
