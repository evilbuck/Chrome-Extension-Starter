---
status: completed
date: 2026-09-08
subject: 2026-09-08.hidden-items-sync-strategy
topics: [storage, chrome-storage-sync, hidden-items, thumbnails]
research: [research-hidden-items-sync.md]
iterations: [iterate-hidden-items-sync.md, iterate-hidden-items-sync-2.md]
spec: null
memory: [hidden-items-sync-durability-2026-09-09.md, hidden-items-sync-closure-2026-09-10.md]
---

# Plan: sync hidden-items index via chrome.storage.sync

## User Goal

As an eBay user signed into Chrome on multiple browsers/devices, my hide list
follows me — I hide an item once and it stays hidden everywhere.

## Goal

Split hidden-item persistence into a small synced index
(`sync.hiddenItemsIndex`: `{id, title, url, hiddenAt}` per item) plus
device-local thumbnails (`local.thumbnails`), so the hide list syncs via
`chrome.storage.sync` while large thumbnail payloads stay out of sync quotas.
Fresh start: no migration of existing `local.hiddenItems` (per user choice).

## Context used / assumptions

- User-provided context: "It should use chrome storage sync mechanism."
  Clarified 2026-09-08 → indexed sync + local thumbnails; fresh start, no
  migration; goal = hide list follows the user across browsers.
- Session context: b-plan invoked with no explicit task; auto-selected the
  single active subject `2026-09-08.hidden-items-sync-strategy`.
- Artifacts used: `research-hidden-items-sync.md` (finding: hidden items live
  in `local.hiddenItems`; only settings use sync; quotas 8 KB/item,
  100 KB total; throttling ~1 write/2s).
- Assumptions: `storage` permission already declared (no manifest change);
  thumbnail is the only field large enough to threaten sync quotas;
  `watchHiddenItems` abstraction means callers (content, popup, options)
  need no changes; no repo privacy doc exists (store listing disclosure is
  a follow-up, out of scope).

## Scope

- `StorageSchema`: add `sync.hiddenItemsIndex: HiddenItemsIndexMap`, add
  `local.thumbnails: Record<string, string>`; remove `local.hiddenItems`.
- Rewrite `src/shared/hidden-items.ts`: load joins sync index + local
  thumbnails; save writes index to sync and thumbnails to local;
  `watchHiddenItems` follows the sync key (thumbnail-only changes need no
  separate watch — thumbnails are write-through with the index).
- `src/background/badge.ts`: `onChanged` listener area `local` → `sync`
  (`hiddenItems` → `hiddenItemsIndex`); `refreshHiddenBadge` unchanged
  (goes through `loadHiddenItems`).
- Quota/throttle safety: debounce/coalesce sync writes in `saveHiddenItems`
  (rapid consecutive hides collapse to one write); document LWW
  last-write-wins semantics for concurrent devices in a code comment.
- Tests: extend `__tests__/hidden-items.test.ts` for split read/write join,
  thumbnail fallback when missing, and fresh-start (no `local.hiddenItems`
  read). Mock `chrome.storage.sync` alongside `local`.

## Out of scope

- Migration of existing `local.hiddenItems` (explicit fresh-start decision;
  old key becomes orphaned — note in plan, do not delete user data in code).
- One-shot cleanup of the orphaned `local.hiddenItems` key.
- Privacy-policy / Web Store disclosure update for sync transmission
  (no repo privacy doc exists; listing text is a separate task).
- Chunked/sharded sync, conflict UI, per-device lists.
- Changes to content/popup/options callers beyond what `hidden-items.ts`
  already abstracts.

## Affected files

- `src/shared/types.d.ts` — schema: `sync.hiddenItemsIndex`,
  `local.thumbnails`, drop `local.hiddenItems`; add `HiddenItemIndex` /
  `HiddenItemsIndexMap` types (index = HiddenItem minus thumbnail).
- `src/shared/hidden-items.ts` — split load/save/watch + write debounce.
- `src/background/badge.ts` — listener area/key.
- `__tests__/hidden-items.test.ts` — split-store tests (extend sync mock).

## Implementation steps

1. Schema: add `HiddenItemIndex` (`Omit<HiddenItem,'thumbnail'>`) and
   `HiddenItemsIndexMap`; add `sync.hiddenItemsIndex` +
   `local.thumbnails`; remove `local.hiddenItems` from `StorageSchema`.
2. `hidden-items.ts`: `loadHiddenItems` reads sync index + local thumbnails
   in parallel, joins (missing thumbnail → `''`); `saveHiddenItems` splits
   and writes both areas; `hideItem`/`unhideItem`/`unhideAll` unchanged in
   signature (delegate to new load/save); `watchHiddenItems` watches
   `('sync','hiddenItemsIndex')` and re-joins thumbnails on fire.
3. Debounce sync writes: coalesce `saveHiddenItems` calls within ~1s into a
   single `kv.set('sync', …)` (trailing-edge; keep local thumbnail write
   immediate or coalesced together — simplest: debounce the whole save).
4. `badge.ts`: listener → `area === 'sync' && changes.hiddenItemsIndex`.
5. Tests: join behavior, thumbnail-missing fallback, unhide/unhideAll clear
   both areas, watcher fires on sync change; run `bun run test`,
   `bun run lint`, `bun run typecheck`, `bun run build`.

## Acceptance criteria

- [ ] Hiding on device A appears on device B via Chrome sync (same profile):
      `sync.hiddenItemsIndex` carries id/title/url/hiddenAt, no thumbnail.
      (Not yet verified live — needs manual two-profile check.)
- [x] Thumbnails render from local store after reload; missing thumbnail
      degrades to empty string, never throws.
- [x] Rapid consecutive hides (bulk) collapse to ≤ ~1 sync write/sec.
- [x] Badge count updates on sync change, not local.
- [x] Typecheck, lint, unit tests, dev build all green.
- [x] No reads of `local.hiddenItems` remain in `src/` (orphaned user data
      left untouched on disk by design).

## Verification

- `bun run test` (extended `hidden-items.test.ts`), `bun run typecheck`,
  `bun run lint`, `bun run build`.
- Manual two-profile check if feasible: hide on one Chrome profile, confirm
  `chrome.storage.sync` carries the index and second profile hides the item
  (thumbnails local-only).
- `grep hiddenItems src` shows only the orphaned-key note, no live reads.

## Execution Instructions

This is a non-phased execution-ready plan. Treat the whole plan as one unit:
1. Run `/b-build` against this plan.
2. Run `/b-review` against this plan.
3. If review creates an `iterate-*.md` artifact (in-plan issues), run `/b-iterate`, then re-run `/b-review`. If review surfaces **out-of-plan issues** (new scope beyond this plan), do not iterate — route them to a separate `/b-plan` → `/b-build` follow-up; they do not block this plan. If `/b-review` flags documentation impact, run `/b-docs` before `/b-save`.
4. Run `/b-save` to consolidate memory, draft commits, and review/iteration artifacts.
5. Run `/b-commit` to checkpoint durable state.
6. If interrupted before completion, leave a clear note in memory and resume from the active plan or iterate artifact next turn.

## Risks

- Sync quotas (100 KB total): very large hide lists (thousands) can still
  fill sync even without thumbnails — accepted; sharding is out of scope.
- Throttle (1 write/2s, 1800/hr): debounce mitigates; sustained bulk-hide
  beyond the debounce window still throttles (Chrome queues, no data loss).
- LWW conflicts: concurrent hide/unhide on two devices can clobber —
  acceptable for a personal list; documented in code comment.
- Fresh start: existing users lose visible hides until re-hidden; orphaned
  `local.hiddenItems` lingers on disk (deliberate, avoids destructive write).
- Sync requires signed-in Chrome with sync enabled; signed-out users get
  device-local behavior with no error (Chrome persists sync locally).
