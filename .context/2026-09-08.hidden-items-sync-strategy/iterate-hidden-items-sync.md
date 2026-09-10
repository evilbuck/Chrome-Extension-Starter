---
status: completed
date: 2026-09-09
updated: 2026-09-09
subject: 2026-09-08.hidden-items-sync-strategy
topics: [review, iteration, chrome-storage-sync, hidden-items, durability, quotas]
informs: []
addresses: plan-hidden-items-sync.md
completed: 2026-09-09
from_review: b-review
---

# Iteration: hidden-items sync

## Source
- Reviewed after: `/b-iterate`
- Plan: `plan-hidden-items-sync.md`
- Spec: none

## Critical Issues — resolved

### 1. Failed sync writes are acknowledged and pending data is deleted
- **Fix**: `src/shared/lib/storage.ts` now rejects callback-based ops on
  `chrome.runtime.lastError` via shared `callChrome`. Flush keeps the
  revisioned pending snapshot until a successful write + revision ack.
- **Tests**: storage wrapper + flush quota rejection retain pending data.

### 2. An in-flight flush can delete a newer pending snapshot
- **Fix**: pending is `{ revision, index }`. Flush writes that revision's
  shards, then sets `local.syncedHiddenItemsRevision` to exactly that
  revision. A newer pending revision remains outstanding and re-schedules.
- **Tests**: delayed sync callback + second hide while in flight.

### 3. The complete index exceeds sync's per-item quota at a small list size
- **Fix**: sync stores `hiddenItemsIndexManifest` + bounded
  `hiddenItemsIndex:<n>` shards (≤8192 bytes UTF-8 per item). Oversized
  single entries reject without acknowledging.
- **Tests**: 100 representative items shard below quota; oversized title
  rejected.

## Warnings — addressed / remaining

### 1. In-memory debounce only (service-worker death)
- **Fix**: coordinator keeps 1s timer as fast path; always arms named
  `chrome.alarms` `hidden_items_sync` fallback; recovers pending on every
  module evaluation (true SW start, not just profile startup). Clears
  fallback alarm after a successful idle flush; re-arms on failure.
- **Tests**: cold-start recovery, timer-gone alarm path, failed-write keeps
  alarm.

### 2. Cross-device Chrome Sync remains unverified
- **Status**: not-verifiable — no two disposable Chrome profiles on one
  sync-enabled account in this session.
- **Follow-up**: hide on profile A, confirm profile B updates both ways
  without thumbnails.

## Verification
- Unit: 135 passed (hidden-items + coordinator durability/quota/race cases).
- Lint: biome check clean on changed sources (schema version info only).
- Typecheck: clean.
- Coverage: lines 82.7% (baseline 77.41); patch 98% (≥90).
- Complexity: no new src hotspots above CCN 10 (splitIndexIntoShards CCN 9).
- Live SW smoke (unpacked `dist/` in isolated Chromium):
  - pending write immediately armed `hidden_items_sync` alarm
  - after ~1s flush: sync manifest + shard written; `syncedHiddenItemsRevision`
    ack; fallback alarm cleared; thumbnails stayed local-only
  - second pending revision flushed to both items under new revision
  - Content-script DOM injection did **not** attach in this Chromium 151
    automation session (only BACKGROUND context via `getContexts`); durability
    path validated through the service worker storage/alarm surface instead.

## Recommended next
- Re-run `/b-review` against `plan-hidden-items-sync.md`.
- Optional: two-profile sync verification when accounts available.
- Commit via draft-commit.md when ready.
