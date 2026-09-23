---
title: Resources Phase 1: Wire contract and permission foundation
status: active
priority: high
created: 2026-09-22
updated: 2026-09-22
completed: null
related:
  - .context/2026-09-22.host-site-resource-sync/phase-1-resource-wire-contract.md
  - .context/2026-09-22.host-site-resource-sync/plan-host-site-resource-sync-phases.md
---

# Resources Phase 1: Wire contract and permission foundation

Optional host permissions (`*://*/*` in `optional_host_permissions` only), cookie/localStorage identities and origin guards (`src/shared/lib/resources.ts`), `RESOURCE_*` message kinds, `resource_upsert`/`resource_applied`/`resource_error` envelope kinds with strict parse and 48 KiB item / 96 KiB envelope caps, peer allow-through, and authorized offscreen forwarding. Envelope tests for malformed/oversize/unknown-kind; Slack suites must stay green.

Full details and acceptance criteria: [phase-1-resource-wire-contract.md](../../2026-09-22.host-site-resource-sync/phase-1-resource-wire-contract.md). Execute with `/b-build-hard`.
