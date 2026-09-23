---
title: Resources Phase 2: Host site picker and resource panel
status: completed
priority: high
created: 2026-09-22
updated: 2026-09-22
completed: 2026-09-22
related:
  - .context/2026-09-22.host-site-resource-sync/phase-2-resource-site-panel.md
  - .context/2026-09-22.host-site-resource-sync/plan-host-site-resource-sync-phases.md
---

# Resources Phase 2: Host site picker and resource panel

Host options page (host + authorized pair only): unique http(s) origins from open tabs, per-origin `chrome.permissions.request` from a user gesture in the options page, unclassified cookie/localStorage lists with metadata (never values), warning copy in en/ja/zh_TW, and the worker's `RESOURCE_LIST_SITES`/`RESOURCE_ENABLE`/`RESOURCE_LIST_ITEMS` handlers behind `isAllowedUiPage`.

Full details and acceptance criteria: [phase-2-resource-site-panel.md](../../2026-09-22.host-site-resource-sync/phase-2-resource-site-panel.md). Execute with `/b-build`. HARD-depends on Phase 1.

Completed with the host-only options panel, per-origin user-gesture permission request, metadata-only cookie/localStorage listing, options-only authorized-host routing, browser smoke, and passing durable guardrails.
