---
date: 2026-09-23
domains: [chrome-extension, resource-sync, testing, docs]
topics: [end-to-end, smoke, tab-open, client-grant]
related: [host-site-resource-sync-phase-4-2026-09-23.md]
priority: high
status: completed
subject: 2026-09-22.host-site-resource-sync
artifacts:
  - phase-5-resource-e2e-docs.md
  - verification-phase-5-results.md
  - plan-host-site-resource-sync-phases.md
---

# Host site resource sync — Phase 5 closed

The two-profile smoke is recorded in `verification-phase-5-results.md`. Concurrent same-origin applies share one promise through document readiness, not only through `tabs.create`. The subject is `close-verified` completed.

## Verification

- Unit suite: 23 files, 471 tests passed.
- Three consecutive fresh durable guardrails runs: status pass. Unit, lint, patch, ratchet, and complexity passed. Functional skipped. Coverage 91.6%.
- Smoke used synthetic values only. The native optional-permission prompt cannot be accepted in headless Chromium; the disposable client profile was reseeded after the Grant click. Production checks were not bypassed.
