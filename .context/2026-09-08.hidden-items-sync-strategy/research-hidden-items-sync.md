---
status: active
date: 2026-09-08
subject: 2026-09-08.hidden-items-sync-strategy
topics: [storage, chrome-storage-sync, cross-browser, hidden-items]
informs: [plan-hidden-items-sync.md]
---

# hidden-items sync strategy — research

## Question

Does ebay-enhance use `chrome.storage.sync` to sync hidden eBay items across
browsers/devices for users signed into Chrome? (User follow-up: "It should
use chrome storage sync mechanism.")

## Finding

**No.** Hidden items are persisted in `chrome.storage.local`, not
`chrome.storage.sync`. They therefore do not sync across browsers/devices
today. Only settings are currently synced.

## Evidence

|File|Evidence|
|---|---|
|`src/shared/types.d.ts:43-50`|`StorageSchema.local.hiddenItems: HiddenItemsMap`. `sync` only carries `settings` and `version`.|
|`src/shared/hidden-items.ts:8-15,53-55`|`loadHiddenItems` / `saveHiddenItems` / `watchHiddenItems` all call `kv.get('local','hiddenItems')` / `kv.set('local','hiddenItems',...)`. No `sync` calls anywhere in this module.|
|`src/shared/lib/storage.ts:15-26,154-162`|`createTypedStorage` is a typed wrapper around the four `chrome.storage.*` buckets; the area is chosen per-call. `chrome.storage.onChanged` listener is wired in `watch` and filters by area.|
|`src/shared/lib/setting.ts:38-67`|`SettingManager` writes to `chrome.storage.sync`. This is the **only** current use of `sync`.|
|`src/background/badge.ts:12-16`|Badge listener explicitly filters `area === 'local'` for `hiddenItems`. Would also need updating if the area moved.|
|`src/shared/lib/migration.ts:151-243`|Migration helpers already know how to round-trip `chrome.storage.sync` ↔ `chrome.storage.local`, so the move is mechanically supported.|

## Cross-browser sync today

- `chrome.storage.sync.settings` — yes (when the user is signed into Chrome
  with sync enabled). Quotas: **8 KB / item, 100 KB total, 512 items**.
- `chrome.storage.local.hiddenItems` — local only. Quota: 10 MB default.
- Item record size: `{ id, title, url, thumbnail, hiddenAt }`. With typical
  eBay titles and base64 thumbnail data URLs, a single item easily exceeds
  1 KB and can run to 5–10 KB. A few dozen hidden items therefore **fit**
  in `sync`; thousands may not.

## What it would take to use sync

The user request "use chrome storage sync" is reasonable for a small hidden
list but is bounded. Options:

1. **Pure sync** — change `hiddenItems` area to `sync`. Trivial code change
   (single file), but risks `QUOTA_BYTES_PER_ITEM` / `QUOTA_BYTES` over time;
   `chrome.storage.sync` silently truncates new writes when full and Chrome
   may evict older items.
2. **Indexed sync + local thumbnails** — store `{id, hiddenAt, title, url}`
   in `sync.hiddenItems` and keep large thumbnails in `local.thumbnails`.
   Keeps the active set synced while letting thumbnails stay on-device.
3. **Hybrid sharded** — chunked key strategy. Heavier; probably overkill for
   a personal hide list.
4. **Manifest changes** — `chrome.storage.sync` requires the `storage`
   permission (already declared per the schema usage); no new permission
   needed, but the privacy-policy disclosure must mention sync transmission
   of `hiddenItems`.

## Recommendation (pending user confirmation)

Option 2 (indexed sync + local thumbnails) is the boring/safe pick:
- Honors the user's "use sync" requirement so the hide list follows them
  across browsers/devices.
- Avoids the truncation/eviction risk of stuffing raw thumbnails into sync.
- Requires updating `StorageSchema` to add `sync.hiddenItemsIndex`,
  `sync.version`, `local.thumbnails`; updating `hidden-items.ts` writers;
  updating `badge.ts` listener area; updating the privacy disclosure.

Option 1 is acceptable only if the user is confident the list stays small
(few hundred items). Pure simplicity wins when the constraint holds.

## Risks / unknowns

- **Throttling:** `chrome.storage.sync` writes are throttled (~1 write per
  2 seconds, max 1800 writes/hour). Hiding many items quickly (e.g. bulk
  hide) would back up. Mitigation: debounce writes.
- **Conflict resolution:** `sync` is LWW per-key; concurrent hides on two
  devices can clobber. Acceptable for a personal hide list, but document.
- **Privacy disclosure:** Web Store requires disclosure if data is
  transmitted off-device; sync does transmit.
- **Existing users** with hidden items already in `local` would need a
  one-shot migration on next load.

## Subject folder created

`.context/2026-09-08.hidden-items-sync-strategy/` with `research/` for
rolling notes and `research-hidden-items-sync.md` as canonical summary.

## Recommended next step

Ask the user to choose between Option 1 (pure sync — simplest) and Option 2
(indexed sync + local thumbnails — bounded) before planning. After choice,
run `/b-plan` to scope the schema change, writers, listeners, migration,
and privacy-policy update.