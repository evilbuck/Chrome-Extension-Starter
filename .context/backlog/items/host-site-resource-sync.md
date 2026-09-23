---
title: Host options site resource sync
status: active
priority: high
created: 2026-09-22
updated: 2026-09-23
completed: null
related:
  - .context/2026-09-22.host-site-resource-sync/plan-host-site-resource-sync.md
  - .context/2026-09-22.host-site-resource-sync/plan-host-site-resource-sync-phases.md
---

# Host options site resource sync

Host options page lists open-tab origins, shows all cookies and localStorage for the selected site, and live-syncs checked items to the paired client. Phased 2026-09-22 into five phases; execute via the [phases overview](../../2026-09-22.host-site-resource-sync/plan-host-site-resource-sync-phases.md) — Resources Phase 5 is next, after the client origin grant.

## Acceptance criteria

- [ ] Linked plan acceptance criteria pass after phasing and implementation.
- [ ] Uncheck does not delete client copies.
- [ ] Host tab close pauses localStorage only; cookies keep syncing.
