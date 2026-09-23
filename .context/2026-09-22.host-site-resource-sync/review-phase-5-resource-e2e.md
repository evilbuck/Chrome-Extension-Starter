---
status: completed
date: 2026-09-23
subject: 2026-09-22.host-site-resource-sync
topics: [review, phase-5, tab-open]
addresses: phase-5-resource-e2e-docs.md
---

# Review: Phase 5 and the shared tab open

## Verdict

Pass. The recorded two-profile smoke meets Phase 5 steps 1–8. The duplicate client tab was an in-plan defect in the apply path and is fixed.

## Spec axis

Worst finding: none remaining.

The smoke recorded in `verification-phase-5-results.md` shows a fresh pair, host listing of `teleport_smoke` and `teleport_smoke_key`, client values `host_v1`, live update to `host_v2`, uncheck leaving the client at `host_v2` after the host moved to `host_v3`, recheck restoring sync, host-tab close pausing localStorage while the still-subscribed cookie received `host_v4`, and reopen resuming localStorage through `host_v3` then `host_v4`.

The first granted reconnect opened two inactive `https://example.com` tabs for one localStorage subscription. `openDocument` now installs one in-flight promise per origin before `tabs.create`. Regression: `shares one in-flight tab open when two same-origin applies race`.

## Standards axis

Worst finding: none. The share is a synchronous check-and-set around the existing open. It does not skip `permissions.contains`.

## Guardrails

Durable v2 status pass after the fix. Unit gate pass, 471 tests. Lint advisory. Functional skipped. Patch, ratchet, and complexity pass.

## Documentation impact

The how-to and quickstart now describe the client Grant click. They do not treat pairing as an owner-authorization bypass.

## Out of plan

Host uncheck closing the auto-opened client tab remains `.context/backlog/items/resource-tab-close-wire-frame.md`. It is not a Phase 5 acceptance item.
