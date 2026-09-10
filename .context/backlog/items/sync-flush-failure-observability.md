---
title: Surface repeated hidden-items sync flush failures
status: active
priority: medium
created: 2026-09-10
updated: 2026-09-10
completed: null
related:
  - src/background/hidden-items-sync.ts
  - src/shared/hidden-items.ts
  - ../2026-09-08.hidden-items-sync-strategy/plan-hidden-items-sync.md
---

# Surface repeated hidden-items sync flush failures

From the 2026-09-10 b-review of the hidden-items sync plan (out-of-plan
finding; the plan itself passed).

## Problem

A same-revision flush that keeps failing — poison entry, serialized
per-item quota overflow, or `MAX_ITEMS` overflow (`MAX_SYNC_SHARDS=511`
plus manifest plus `settings`/`version` brushes the 512-item sync cap) —
retries every ~30 s forever via the fallback alarm. Visibility is
`logger.error` in the service-worker console only; local reads keep
working, so the user never learns sync has stalled.

## Options

- Retry backoff (e.g. exponential up to a ceiling) instead of flat 30 s.
- A user-facing sync-failure indicator (badge dot, options-page banner).
- Distinguish terminal failures (oversized entry) from transient ones
  (throttle/quota) — terminal ones should stop retrying and surface.
- While here: decide whether shrinking lists should `remove()` freed
  `{}` shard-tombstone slots instead of leaving them (MAX_ITEMS headroom).

## Acceptance

- A forced persistent failure becomes visible to the user without
  DevTools, and does not spin at 30 s forever.
