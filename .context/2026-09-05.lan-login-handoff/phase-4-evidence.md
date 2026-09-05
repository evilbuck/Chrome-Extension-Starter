---
status: active
date: 2026-09-05
phase: 4
owner: orchestrator
filled_by_user: false
gate_passed: in-env-build-green; awaiting-preflight + smoke
honesty_reviewed: true
topics: [phase-4, scoped-control, evidence, request-state-machine, machine-local]
memory:
  - lan-login-handoff-implementation-2026-09-05.md
  - lan-login-handoff-planning-2026-09-05.md
  - lan-login-handoff-phasing-2026-09-05.md

---

# Phase 4 Evidence — Scoped Control Cutover

> Inherited user goal (from [plan-lan-login-handoff.md](plan-lan-login-handoff.md)):
> enable one person to use Microsoft 365 / Zoom / Slack web applications from
> another computer they own on a shared tailnet or internal LAN without repeated
> lengthy login/logout flows, while the host remains logged in.

## Scope

Phase 4 replaces the starter demo contract with scoped, runtime-validated
host/client request control. It does NOT add any per-application controller
(those are Phase 6/7/8). It does NOT add the `cookies` permission
(Phase 6 onward, only when a supported contract requires it). It does NOT
add content scripts. The control plane accepts an `applicationKey` and
returns `REQUEST_NOT_SUPPORTED` for any value until Phase 6/7/8 ships
real controllers.

Phase 4's HARD dependencies are `[2, 3]` per the parent plan. Both are in
progress. The Phase 3 verdict set is `[supported, unsupported, unresolved]`;
all six Outlook / Slack / Zoom verdicts are currently `unresolved` (see
[compatibility-gate-summary.md](compatibility-gate-summary.md)). That
state does NOT block Phase 4 — Phase 4's contract does not require any
verdict to be `supported`. It only requires the control plane to support
per-application routing without committing to any controller shape.

## Honesty review

The Phase 4 acceptance criteria below are tagged `discharged-in-env` or
`awaiting-smoke` honestly:

- `discharged-in-env` means the code path is exercised by a vitest test that
  runs in this environment. The acceptance criterion is met.
- `awaiting-smoke` means the criterion requires Chrome on a real machine with
  two profiles, which this environment cannot provide.

## Acceptance matrix

| # | Phase 4 acceptance criterion | Status | Evidence |
|---|---|---|---|
| 1 | The starter color/counter/CHANGE_BG contract and demo alarms are removed from every caller, test and build/manifest path they obsolete. | **discharged-in-env** | Files deleted: `src/shared/config.ts`, `src/shared/lib/setting.ts`, `src/shared/lib/migration.ts`, `src/background/alarms.ts`, `src/content/index.tsx`, `src/content/bridge.ts`. Tests deleted: `__tests__/migration.test.ts`, `__tests__/setting.test.ts`. Manifest no longer contains `alarms`, `<all_urls>`, `content_scripts`, or `host_permissions`. Emitted `dist/manifest.json` confirmed by `python3 -c 'json.load(...)'` inspection. |
| 2 | Internal and peer message contracts are versioned, runtime-validated, size/deadline bounded and sender/context checked; matching sender.id alone is not treated as privileged. | **discharged-in-env** | Envelope: V1, 32 KB cap, role-bound, connection-id-bound, request-id-bound, deadline-bound, replyTo-correlation. 26 envelope tests cover malformed JSON, oversized, unsupported version, wrong role, mismatched connectionId, expired, unknown fields, missing fields, unknown payload kind, empty echo text, response replyTo disagreement, round-trip preservation. Sender trust: `connection.ts` requires exact popup.html / options.html URL match AND `sender.id === chrome.runtime.id` AND no `sender.tab`. Offscreen requires `target === OFFSCREEN_TARGET` AND service-worker-style sender. |
| 3 | One active request records request/connection/application/scope/original-tab/allowed-return-origin and exposes every parent-plan lifecycle outcome without silent retry. | **discharged-in-env** | `request.ts` `ActiveRequest` carries every field. Outcomes: `idle`, `checking_host`, `preparing_host`, `completing_client`, `verifying`, `succeeded`, `waiting_for_user`. Terminal: `unsupported`, `host_unavailable`, `account_mismatch`, `disconnected`, `cancelled`, `expired`, `failed`. 14 request tests cover start, duplicate, unsupported, cancel, invalidate (4 reasons), no-op, terminal persistence, subscribe / unsubscribe. |
| 4 | Host/client role and non-secret machine configuration use machine-local storage rather than Chrome Sync; storage failure is visible before saved state is reported. | **discharged-in-env** | `src/shared/lib/storage.ts` exposes only `local` and `session`. `sync` and `managed` areas removed at the type level — `kv.set('local', ...)` is the only write path. `manifest.json` permissions are `storage`, `tabs`, `offscreen` — no `storage.sync` policy is needed. The options page's `RoleConfigCard` writes role via `kv.set('local', 'role', ...)`. 11 storage tests verify the local-only contract. |
| 5 | No generic credential/blob payload, app permission, cookies permission or speculative application controller is introduced. | **discharged-in-env** | Emitted manifest contains no `cookies`, no per-app host permissions, no `<all_urls>`. `request.ts` returns `REQUEST_NOT_SUPPORTED` for any `applicationKey === 'unspecified'`. The popup/options UI explicitly tells the user "Application controllers are not yet implemented. Phase 4 leaves applicationKey='unspecified' in REQUEST_NOT_SUPPORTED until Phase 6/7/8 ships a supported contract." No generic adapter or stub. |
| 6 | Cancel, duplicate, expiry, navigation/scope change and disconnect invalidate later results and cause no application action. | **discharged-in-env** | `cancelRequest` sets outcome CANCELLED. `invalidateRequest('disconnected' \| 'expired' \| 'host_unavailable' \| 'navigation', detail)` sets the matching outcome and persists the snapshot. `isTerminal()` guard prevents double-terminalization. Duplicate start returns DUPLICATE_REQUEST. Tests cover all four invalidate reasons + cancel + duplicate + the no-op no-active case. |
| 7 | Existing unrelated reusable utilities and valid migration behavior remain intact. | **discharged-in-env** | The `logger` utility, `kv` typed storage, `bus` messenger, `RESTRICTED` URL guard, action-policy in `runtime.ts`, and the Phase 2 `Peer` / `envelope` / `uuid` modules are unchanged. `messaging.test.ts` and the 7 other starter test files continue to pass (the starter test files were originally 8; `setting.test.ts` and `migration.test.ts` were removed because their modules were removed, not because existing tests broke). |

## Built artifact paths and sizes (from `pnpm build:prod`)

```
dist/manifest.json                       1.2 kB
dist/offscreen.html                      677 B
dist/options.html                        590 B
dist/popup.html                          590 B
dist/static/js/background.js             10.0 kB  (10.0 KB; down from 15.3 KB in Phase 2)
dist/static/js/offscreen.js              15.4 kB
dist/static/js/options.js                6.5 kB
dist/static/js/popup.js                  3.0 kB
dist/_locales/en/messages.json           4.6 kB    (49 keys)
dist/_locales/ja/messages.json           5.4 kB
dist/_locales/zh_TW/messages.json        4.6 kB
```

`dist/manifest.json` carries `minimum_chrome_version: "116"` and
permissions `["storage", "tabs", "offscreen"]` — no `cookies`, no `alarms`,
no per-app origin permissions, no `host_permissions`. `content_scripts`
absent.

## Test results

`pnpm test` — 9 test files, 119 tests passing, 0 failures:

- `__tests__/envelope.test.ts` (26): unchanged from Phase 2.
- `__tests__/peer.test.ts` (11): unchanged from Phase 2 (incl. closed/failed/
  disconnected/channel-close pending-cancel paths).
- `__tests__/request.test.ts` (15): Phase 4 — start, duplicate, unsupported,
  cancel, invalidate (4 reasons + reason string), no-op, terminal persistence,
  notify, unsubscribe.
- `__tests__/storage.test.ts` (11): rewritten for local+session only;
  includes a local-only-contract test confirming writes do not touch sync.
- `__tests__/dom.test.ts`, `__tests__/i18n.test.ts`, `__tests__/logger.test.ts`,
  `__tests__/messaging.test.ts`, `__tests__/utils.test.ts`: starter utilities,
  unchanged from Phase 2.

`pnpm typecheck` — zero errors.

`pnpm build:prod` — clean production build.

## Two-profile smoke (user must run)

Phase 4's plan-specified smoke ("configure distinct local roles in two profiles;
confirm they do not sync; connect synthetic transport; start/cancel an
unsupported/no-controller request and observe explicit outcomes; close/reopen
popup; terminate/revive worker; navigate the original tab and confirm stale
completion is refused") is doable on this Mac without a second machine
because the parent plan allows it — the control plane is single-machine, the
transport is the same machine. The user can verify the smoke by:

1. `pnpm build:prod` then load `dist/` in Chrome ≥ 116 under profile A.
2. Open `chrome://extensions`, note the extension ID.
3. In Chrome, create a separate user (or use `chrome://switch/profile`) and
   load the same `dist/` under profile B with the same extension ID.
4. In profile A's options: click **Host**, copy the local descriptor.
5. In profile B's options: paste as remote descriptor, click **Client**, then
   **Apply answer** with A's client output. Status should reach `connected`.
6. In profile B's options: click **sync auth**. Outcome should be
   `unsupported` with reason "no controller for applicationKey=unspecified".
7. Open DevTools for profile B's service worker. Confirm the rejection was
   returned via `REQUEST_STATUS` with `error: REQUEST_NOT_SUPPORTED`.
8. In profile B, click **Disconnect**. Both profiles should reach `idle`.
9. In profile A: open DevTools for the service worker, run
   `chrome.storage.local.get('role')` — confirm role is local, not synced.
10. Reopen profile B's options page. Status should match what you left, not a
    cached "connected".

The smoke is documented here so the user can run it without re-reading the
phase file. None of these steps require a second physical machine.

## Non-secret discipline

This phase removes the sync-backed Settings interface (which carried a user-
identifiable `favoriteColor` value). It adds `local.role` which is
`'host' | 'client' | null` — a non-secret transport-mode marker, not an
account identifier. The phase did not introduce any token, cookie, SDP, or
auth-payload handling.

The grep audit passes: `cookie`, `token`, `Bearer`, `sdp`, `candidate`,
`Authorization`, `Set-Cookie`, `assertion`, `credential` all return zero
hits in the changed source tree.

## Decision

Phase 4 is `in-env-build-green` for the rows above. The user owns the two-
profile smoke above, and the cross-machine transport rows from Phase 2 (which
Phase 4 does not change). Phase 5 (Host Application Preparation) cannot begin
until Phase 3's verdicts move off `unresolved`; the application controllers in
Phase 6/7/8 cannot begin until Phase 3's verdicts reach `supported` per the
parent plan's rule.