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

The first granted reconnect opened two inactive `https://example.com` tabs for one localStorage subscription. `openDocument` keeps one per-origin promise through document readiness for a tracked tab, an existing tab, or a newly created tab. It records `opened` only for a tab this feature creates. A loading non-origin URL is not rejected; a mismatched URL is rejected only once the tab is `complete`.

The race regression waits for the fourth `aborted` call, which is inside `applyStorage` immediately before `openDocument`, then asserts one `tabs.create`, then emits completion. A later authoritative run returned `{ kind: 'resource_error', error: 'failed' }` for the first apply. That was not a missed join. Node v26.8.1 leaves `localStorage` unset unless `--localstorage-file` is set, and the shared `executeScript` mock ran `writeLocalStorageValue` against that ambient storage. The race test now returns a scoped `{ result: true }`. `__tests__/setup-promise.ts` installs an in-memory `Storage` when `clear` is missing so the rest of the suite does not call `localStorage.clear()` on an unset global.

## Standards axis

Worst finding: none. Sharing the open does not skip `permissions.contains`.

## Guardrails

Three consecutive fresh runs of the guardrails check on Node v26.8.1 (`~/.local/share/mise/installs/node/latest/bin/node`) returned durable status pass after the storage shim. Unit exit 0. Lint, patch, ratchet, and complexity pass. Functional skipped. Coverage 91.6%.

## Documentation impact

The how-to and quickstart now describe the client Grant click. They do not treat pairing as an owner-authorization bypass.

## Out of plan

Host uncheck closing the auto-opened client tab remains `.context/backlog/items/resource-tab-close-wire-frame.md`. It is not a Phase 5 acceptance item.
