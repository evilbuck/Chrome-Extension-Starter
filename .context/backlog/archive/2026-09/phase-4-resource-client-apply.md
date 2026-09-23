---
title: Resources Phase 4: Client apply and inbound lifecycle
status: completed
priority: high
created: 2026-09-22
updated: 2026-09-23
completed: 2026-09-23
related:
  - .context/2026-09-22.host-site-resource-sync/phase-4-resource-client-apply.md
  - .context/2026-09-22.host-site-resource-sync/plan-host-site-resource-sync-phases.md
---

# Resources Phase 4: Client apply and inbound lifecycle

Client role applies inbound upserts: cookies via `chrome.cookies.set` with full field fidelity (host-only domain omission, `partitionKey`, sameSite, session); localStorage via same-origin tab reuse or auto-opened background tabs (tracked, reused per origin, only feature-opened tabs ever auto-closed); ack `resource_applied` or `resource_error` from the closed enum; oversize/malformed reject with no partial write; host role never applies.

Full details and acceptance criteria: [phase-4-resource-client-apply.md](../../2026-09-22.host-site-resource-sync/phase-4-resource-client-apply.md). Executed with `/b-build-hard`. Review passed with no in-plan defects. HARD-depended on Phase 1; sequenced after Phase 3.
