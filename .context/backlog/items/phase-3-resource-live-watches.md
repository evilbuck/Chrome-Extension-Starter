---
title: Resources Phase 3: Subscriptions and live watches
status: active
priority: high
created: 2026-09-22
updated: 2026-09-22
completed: null
related:
  - .context/2026-09-22.host-site-resource-sync/phase-3-resource-live-watches.md
  - .context/2026-09-22.host-site-resource-sync/plan-host-site-resource-sync-phases.md
---

# Resources Phase 3: Subscriptions and live watches

Check persists identity (never values) to `chrome.storage.local`, snapshots, and sends one upsert per item; `chrome.cookies.onChanged` pushes updates while subscribed (no delete on host-side removal); localStorage polled via `executeScript` while a same-origin host tab exists, paused (not unchecked) when the last one closes, resumed on reopen; `RESOURCE_STATUS`; send-side lifecycle (stop when unpaired/unauthorized, re-arm on revival/reconnect). Uncheck removes the identity only — never a client delete.

Full details and acceptance criteria: [phase-3-resource-live-watches.md](../../2026-09-22.host-site-resource-sync/phase-3-resource-live-watches.md). Execute with `/b-build`. HARD-depends on Phase 2.
