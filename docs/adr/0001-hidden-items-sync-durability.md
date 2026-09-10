# Hidden-items sync: durable local pending + service-worker flush

The hide list must follow the signed-in Chrome user across devices
(`chrome.storage.sync`), but sync enforces an 8 KB-per-item quota and ~1
write/2 s throttle, and content scripts die on navigation. We decided that
`saveHiddenItems` never touches sync from the calling context: it writes a
revisioned pending snapshot (`local.pendingHiddenItemsIndex =
{revision, index}`) plus thumbnails to `chrome.storage.local` immediately,
so the hide is durable before it is acknowledged. The service-worker
coordinator (`src/background/hidden-items-sync.ts`) then coalesces flushes
on a 1 s timer, writes `hiddenItemsIndexManifest` +
`hiddenItemsIndex:<n>` shards (each ≤ 8192 bytes UTF-8 minus a reserved
envelope margin), and only after a successful write acknowledges by storing
`local.syncedHiddenItemsRevision` for exactly that revision. A one-shot 30 s
`chrome.alarms` fallback stays armed even after a successful timer flush.

## Considered Options

- **Debounced sync write in the content script** (the original plan):
  rejected — a page reload during the debounce window loses the hide
  (reproduced 2026-09-08: reload 123 ms after Hide left the sync index
  null while local state survived).
- **Direct sync write per hide**: rejected — pays a throttled sync round
  trip per click; bulk hides would queue.
- **`chrome.storage.session` for the pending snapshot**: rejected —
  ephemeral, wrong durability class for user data.

## Consequences

- Conflict semantics are whole-list last-write-wins across devices;
  accepted for a personal list.
- Thumbnails stay device-local (out of sync quotas by design).
- Shrinking lists leave `{}` tombstones in freed shard slots instead of
  removing keys (avoids remove/write races; costs 2 bytes per slot).
- Repeated flush failures (poison entry, quota overflow) retry ~every 30 s
  with `logger.error` visibility; no user-facing failure surface yet.
