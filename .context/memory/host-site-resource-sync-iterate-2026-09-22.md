---
date: 2026-09-22
domains: [chrome-extension, resource-sync, testing]
topics: [localStorage, refresh-race, pause-resume, resource-sync]
related: []
priority: high
status: completed
subject: 2026-09-22.host-site-resource-sync
artifacts:
  - iterate-host-site-resource-sync.md
  - .context/2026-09-22.host-site-resource-sync/review-zz-buck-loop-2026-09-23T03-32-50-733Z.md
---

# Host site resource sync — tab-close pause across overlapping reads

## Decision

localStorage refresh is a tail queue. Each caller takes an epoch when it requests a refresh and runs only after earlier refreshes finish. An in-flight read may still upsert the value it already fetched, but a newer epoch is the only one allowed to commit `paused` and the poll alarm.

## Files Modified

- `src/background/apps/resources.ts`
- `__tests__/resource-sync.test.ts`
- `.context/2026-09-22.host-site-resource-sync/iterate-host-site-resource-sync.md`
- `.context/2026-09-22.host-site-resource-sync/draft-commit.md`

## Verification

- Listener-only overlap test: hold `executeScript`, emit `tabs.onRemoved` with no host tab, resolve the read, and wait for `paused: true` without calling `sync.refresh()`. Passed.
- `pnpm exec vitest run`: 22 files, 456 tests passed.
- `pnpm exec biome check` on the two changed files: clean.
- Re-review of `phase-3-resource-live-watches.md` passed. Durable guardrails v2 passed after the tail-queue edit: unit, lint, patch, global ratchet, and complexity. Functional gate skipped by contract.

## Abandoned Approaches

Unconditionally clearing `paused` after `executeScript` undid a real tab close. A dirty flag checked before releasing the owner could also drop a close that arrived after the last loop check; the overlap test hid that by calling `sync.refresh()` afterward.
