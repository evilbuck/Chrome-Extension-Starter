---
date: 2026-09-09
domains: [storage, chrome-extension, testing]
topics: [hidden-items, chrome-storage-sync, durability, quotas, service-worker, review-iteration]
related: [../2026-09-08.hidden-items-sync-strategy/iterate-hidden-items-sync.md, ../2026-09-08.hidden-items-sync-strategy/iterate-hidden-items-sync-2.md, ../2026-09-08.hidden-items-sync-strategy/plan-hidden-items-sync.md]
priority: high
status: completed
subject: 2026-09-08.hidden-items-sync-strategy
artifacts:
  - iterate-hidden-items-sync.md
  - iterate-hidden-items-sync-2.md
  - draft-commit.md
  - plan-hidden-items-sync.md
---

# Hidden-items sync durability iteration (2026-09-09)

Closed the original durability review and its round-two follow-up:

1. **lastError** — `kv` callback operations reject on
   `chrome.runtime.lastError`.
2. **Race-safe acknowledgment** — pending data is revisioned; a flush
   acknowledges only the revision it wrote.
3. **Quota shards** — sync stores a manifest plus bounded
   `hiddenItemsIndex:<n>` shards; thumbnails remain local.
4. **Serialized quota boundary** — shard packing reserves an eight-byte
   envelope margin, and a regression test proves an 8,193-byte combined item
   is split before `chrome.storage.sync` can reject it.
5. **Service-worker recovery** — a one-second fast-path timer is backed by a
   named one-shot alarm and module-load recovery. Successful timer flushes
   leave that one-shot alarm armed; its harmless later wake avoids the
   clear-versus-reschedule race.

## Verification

- Round-two targeted regressions: 20 passed.
- Unit gate after the fixes: 137 passed.
- Diff-scoped Biome check: 13 files clean.
- The prior full guardrails measurement reported 98% patch coverage and
  82.7% global line coverage; the coverage ratchet is now raised from 77.41
  to 82.7 in `guardrails.json`.
- Earlier live unpacked SW smoke verified pending → alarm → sharded sync
  write + revision acknowledgment, with thumbnails local-only.

## Follow-ups

- Two-profile Chrome Sync remains not-verifiable.
- Re-run `/b-review` against `plan-hidden-items-sync.md` before save/commit.
