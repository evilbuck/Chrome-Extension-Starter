---
date: 2026-09-22
domains: [chrome-extension, frontend, permissions, testing]
topics: [resource-sync, options-panel, cookies, localStorage, optional-host-permissions]
related: [host-site-resource-sync-phase-1-2026-09-22.md]
priority: high
status: completed
subject: 2026-09-22.host-site-resource-sync
artifacts:
  - phase-2-resource-site-panel.md
  - plan-host-site-resource-sync-phases.md
  - plan-host-site-resource-sync.md
  - draft-commit.md
  - iterate-host-site-resource-sync.md
---

# Host site resource sync — Phase 2 site panel landed

Implemented only `phase-2-resource-site-panel.md`. Phase 3 subscription behavior remains pending.

## Shipped

- Host + authorized-pair gate mounts the resource panel on options; client and unauthorized states do not.
- Open tabs become unique eligible http(s) origins through the Phase 1 filter.
- Site selection calls `chrome.permissions.request` directly from the UI gesture, then `RESOURCE_ENABLE` and `RESOURCE_LIST_ITEMS`.
- Worker rechecks per-origin cookies/scripting permission, lists cookie metadata without values, and enumerates localStorage key/byte metadata in a same-origin tab.
- Missing/blocked isolated-world localStorage is `readable: false`, distinct from an empty readable store.
- Resource commands require the exact options page plus an authorized host connection; Slack routing remains separate.
- English warning states that checked items, including credentials, copy live and are not classified; ja/zh_TW contain the same keys with permitted English fallback.
- Review iteration now keys cookie rows with the complete cookie identity and displays partitioned cookies' top-level sites, so otherwise-identical partitioned rows stay distinct.

## Verification

- RED: targeted test initially failed because `@/pages/resources/site-panel` did not exist.
- Targeted integration/UI suite: 103 tests passed across `resource-sync`, `connection-routing`, and `pairing-ui`.
- `pnpm typecheck`: passed.
- `pnpm build:prod`: passed.
- Browser smoke against built bundles: authorized-host panel rendered; selecting `https://example.com` showed cookie `syn-cookie`, localStorage key `syn-key`, flags and sizes, with no values. Screenshot: `/tmp/teleport-resource-panel.png`.
- Durable guardrails v2: pass. Unit, lint, global coverage ratchet (91.10% >= 91.07%), and complexity gates passed; functional gate skipped by contract.
- Partition regression followed red/green: the new rerender case failed before the UI exposed partition metadata, then passed after the identity/display fix.
- Iteration light guardrails: all 436 unit tests passed; Biome passed on the two changed code files; `pnpm typecheck` passed.

## Decisions

- Cookie byte size is computed from UTF-8 name + value in the worker, then only the numeric size leaves the worker.
- localStorage size is computed inside the injected isolated-world function, so values do not return to the extension UI.
- Phase 2 renders checkboxes; subscription persistence and live behavior remain Phase 3.
- Cookie list reconciliation uses the shared `cookieIdentityKey`; partition metadata is visible rather than inventing a second UI identity convention.

## Files modified

- `src/background/apps/resources.ts`
- `src/background/connection.ts`
- `src/pages/resources/site-panel.tsx`
- `src/pages/options/index.tsx`
- `src/shared/constants.ts`
- `public/_locales/{en,ja,zh_TW}/messages.json`
- `__tests__/resource-sync.test.ts`
- `__tests__/connection-routing.test.ts`
- `__tests__/pairing-ui.test.tsx`
- Phase, overview, plan, backlog, memory, and draft-commit artifacts under `.context/`

## Remaining

Phase 3 wires checkbox subscribe/unsubscribe, persistence, cookie change watches, and localStorage polling/pause/resume.
