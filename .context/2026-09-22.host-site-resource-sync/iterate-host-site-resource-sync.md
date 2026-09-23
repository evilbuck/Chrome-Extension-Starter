---
status: completed
date: 2026-09-22
updated: 2026-09-22
subject: 2026-09-22.host-site-resource-sync
topics: [review, iteration]
informs: []
addresses: phase-2-resource-site-panel.md
completed: 2026-09-22
from_review: b-review
---

# Iteration: Host site resource sync Phase 2

## Source
- Reviewed after: `/b-build`
- Plan: `plan-host-site-resource-sync.md`
- Phase: `phase-2-resource-site-panel.md`

## Critical Issues

### 1. Preserve partitioned-cookie identity in the resource list
- **File**: `src/pages/resources/site-panel.tsx:192-196`
- **Problem**: Cookie rows use `name + domain + path + storeId` as their keyed identity and do not render partition metadata. The phase's inherited cookie identity includes `partitionKey`; Chrome can return multiple partitioned cookies with the same current key fields. Those rows become indistinguishable to the user and share a duplicate Preact key, so reconciliation can reuse or drop the wrong row instead of reliably listing every returned cookie.
- **Proposed fix**: Reuse `cookieIdentityKey` from `src/shared/lib/resources.ts` for the row key and render a concise partition flag/top-level-site marker when `partitionKey` exists. Add a UI regression case with two synthetic cookies that differ only by `partitionKey` and verify both distinct rows remain visible after a rerender.

## Warnings

None.

## Recommended Workflow

Start with `/b-iterate` — it will pick up this file automatically.
Then re-run `/b-review` against the same phase.
Inside an OMP execution session, the iterate artifact is not done until it is completed, review passes, and `/b-save` has recorded durable state.
For larger rework, use `/b-build` or `/b-build-hard`.
