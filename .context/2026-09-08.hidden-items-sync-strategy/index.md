---
status: completed
date: 2026-09-08
subject: 2026-09-08.hidden-items-sync-strategy
topics: [storage, chrome-storage-sync, cross-browser, hidden-items]
informs: []
---

# hidden-items sync strategy

Trace whether ebay-enhance persists hidden eBay items in `chrome.storage.sync`
(otherwise cross-browser sync is impossible) versus `chrome.storage.local`.

## Findings (draft)

- `src/shared/types.d.ts` — `StorageSchema.local.hiddenItems: HiddenItemsMap`;
  no `sync.hiddenItems` key exists.
- `src/shared/hidden-items.ts` — `loadHiddenItems` / `saveHiddenItems` /
  `hideItem` / `unhideItem` / `unhideAll` / `watchHiddenItems` all target
  `kv.get('local', 'hiddenItems')` / `kv.set('local', 'hiddenItems', ...)`.
- `src/shared/lib/storage.ts` — typed KV wraps `chrome.storage.{local,sync,
  managed,session}`; the schema chooses the area per call.
- `src/shared/lib/setting.ts` — `SettingManager` (settings) targets
  `chrome.storage.sync`; that is the ONLY area currently using sync.

## Conclusion (so far)

The extension does NOT currently sync hidden items across browsers — they are
stored in `chrome.storage.local`. Only settings (`settings`, `version`) use
`chrome.storage.sync`. The user request would require moving hiddenItems to
`sync` (or a hybrid: small indexed keys + thumbnails elsewhere).

Open question: should this be the canonical exploration file? Yes; will
consolidate after a couple more lookups.

## Artifacts
- [research-hidden-items-sync.md](research-hidden-items-sync.md)
- [plan-hidden-items-sync.md](plan-hidden-items-sync.md)
- [iterate-hidden-items-sync.md](iterate-hidden-items-sync.md) — review round 1 (completed 2026-09-09)
- [iterate-hidden-items-sync-2.md](iterate-hidden-items-sync-2.md) — review round 2 (completed 2026-09-09)
- [draft-commit.md](draft-commit.md) — durability-hardening commit draft