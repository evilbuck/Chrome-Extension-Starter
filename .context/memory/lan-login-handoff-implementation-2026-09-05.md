---
date: 2026-09-05
domains: [chrome-extension, build, refactor, test]
topics: [lan-login-handoff, phase-1, phase-2, phase-3, phase-4, transport, application-compatibility, control-plane, machine-local, request-state-machine]
related:
  - .context/2026-09-05.lan-login-handoff/index.md
  - .context/2026-09-05.lan-login-handoff/plan-lan-login-handoff.md
  - .context/2026-09-05.lan-login-handoff/plan-lan-login-handoff-phases.md
  - .context/2026-09-05.lan-login-handoff/phase-1-experiment-boundary.md
  - .context/2026-09-05.lan-login-handoff/phase-2-extension-transport-gate.md
  - .context/2026-09-05.lan-login-handoff/phase-2-evidence.md
  - .context/2026-09-05.lan-login-handoff/phase-3-application-compatibility-gate.md
  - .context/2026-09-05.lan-login-handoff/compatibility-outlook.md
  - .context/2026-09-05.lan-login-handoff/compatibility-slack.md
  - .context/2026-09-05.lan-login-handoff/compatibility-zoom.md
  - .context/2026-09-05.lan-login-handoff/compatibility-gate-summary.md
  - .context/2026-09-05.lan-login-handoff/phase-4-scoped-control-cutover.md
  - .context/2026-09-05.lan-login-handoff/phase-4-evidence.md
  - docs/adr/0001-extension-only-transport.md
  - docs/quickstart.md
subject: 2026-09-05.lan-login-handoff
artifacts:
  - preflight-experiment-boundary.md
  - phase-1-experiment-boundary.md
  - phase-2-extension-transport-gate.md
  - phase-2-evidence.md
  - phase-3-application-compatibility-gate.md
  - compatibility-outlook.md
  - compatibility-slack.md
  - compatibility-zoom.md
  - compatibility-gate-summary.md
  - phase-4-scoped-control-cutover.md
  - phase-4-evidence.md
  - docs/quickstart.md
  - docs/adr/0001-extension-only-transport.md
  - src/shared/constants.ts
  - src/shared/types.d.ts
  - src/shared/lib/uuid.ts
  - src/shared/lib/envelope.ts
  - src/shared/lib/peer.ts
  - src/shared/lib/storage.ts
  - src/shared/lib/error.ts
  - src/background/index.ts
  - src/background/runtime.ts
  - src/background/connection.ts
  - src/background/request.ts
  - src/offscreen/index.ts
  - src/pages/popup/index.tsx
  - src/pages/options/index.tsx
  - public/manifest.json
  - public/_locales/en/messages.json
  - public/_locales/ja/messages.json
  - public/_locales/zh_TW/messages.json
  - public/offscreen.html
  - rsbuild.config.ts
  - pnpm-workspace.yaml
priority: high
status: active
---

# Implementation session — Phase 2 transport, Phase 3 evidence, Phase 4 control plane

## What shipped in-environment

Phase 1 preflight artifact authored with `not observed (requires user
observation)` rows for both machines, route category, account/workspace
decisions, Case 1 starting-state preparation, and non-secret discipline
sign-off. User owns filling these in.

Phase 2 transport gate code shipped with 11 peer tests + 26 envelope tests
all green. Critical correctness points:

- `Peer.waitForIceComplete` returns immediately if `iceGatheringState ===
  'complete'`, otherwise installs a resolver and a 5s deadline that REJECTS
  on timeout — incomplete SDP is never serialized.
- `Peer.sendRequest` returns a Promise correlated to the matching response
  envelope; `Peer.sendReply` builds a response envelope carrying `replyTo`.
- Two independent de-dup sets (`outboundSentIds` for outgoing, `inboundReplayIds`
  for incoming) so a response whose `requestId` matches our outbound is
  accepted even though the response's own ID is fresh.
- `connectionState === 'disconnected'` (network loss) cancels pending
  requests with `kind: 'channel_closed'` without transitioning the
  lifecycle state. `'closed'` and data-channel-close paths also cancel
  pending. `fail()` cancels pending.

Phase 2 evidence file labels each acceptance row honestly as
`discharged-in-env` / `partially-discharged-in-env` / `awaiting-cross-machine`
/ `n/a` / `awaiting-user` per the parent's verdict set; the previous
over-claim of "request/response correlation verified" was corrected to
`partially-discharged-in-env` with a recorded gap (JSDOM has no real
RTCPeerConnection).

Phase 3 application compatibility evidence was rewritten to record all six
verdicts as `unresolved`. The earlier draft invented specific Outlook cookie
names (`ESTSAUTH`, `ESTAUTHPERSISTENT`, `OutlookSession`, `RPSSecAuth`),
Slack cookie prefixes (`d`, `lc`, `bcookie`, `xoxd-*`), and Zoom JWT claim
names — all removed. Only cited public-doc constraints remain
(FastPass device-binding, Entra CAE re-evaluation, Token Protection ARM
preview scope, Slack SLO limits, Zoom concurrent-session cap).

Phase 4 scoped control cutover shipped:

- Starter demo fully removed: `CHANGE_BG`, color/counter `Settings`,
  `chrome.alarms.POLL/DAILY_CLEANUP`, `chrome.storage.sync` /
  `chrome.storage.managed`, the `src/content/` directory and bridge,
  the `migration.ts` machinery. Tests for the deleted modules were
  removed; tests for the surviving modules were updated.
- New request state machine (`src/background/request.ts`) implements the
  6-state progression (`idle → checking_host → preparing_host →
  completing_client → verifying → succeeded`) plus `waiting_for_user` and
  7 terminal outcomes (`unsupported`, `host_unavailable`,
  `account_mismatch`, `disconnected`, `cancelled`, `expired`, `failed`).
  Pending requests are cancelled on `connectionState === 'closed' /
  'failed' / 'disconnected'` and on data-channel close. Duplicate start
  returns `DUPLICATE_REQUEST`. Cancellation is idempotent. `applicationKey
  === 'unspecified'` always returns `REQUEST_NOT_SUPPORTED` — no stub
  controllers exist.
- Storage module rewritten to expose only `local` and `session` areas.
  Type-level removal of `sync` and `managed` prevents accidental writes
  via `kv.set('sync', ...)`.
- Manifest now lists only `permissions: ['storage', 'tabs', 'offscreen']`,
  `minimum_chrome_version: '116'`, no `cookies`, no `alarms`, no
  `<all_urls>`, no `host_permissions`, no `content_scripts`.

Phase 4 evidence file documents all 7 acceptance rows with honest
`discharged-in-env` vs `awaiting-smoke` tags and a 10-step two-profile
smoke the user can run on this Mac without a second physical machine
(the control plane is single-machine; only the transport is cross-machine).

User-facing `docs/quickstart.md` (12 KB) covers the seven-row cross-machine
checklist and a Tart VM bring-up recipe.

ADR 0001 (`docs/adr/0001-extension-only-transport.md`) records the
Mac-vs-Linux verdict: WebRTC/offscreen API is OS-neutral; only network
namespace and policy differ; Tart VM with `--net-bridged` is the closest
faithful Linux-client substitute on this Mac.

## Test + build state

- `pnpm typecheck`: clean.
- `pnpm test`: 9 test files, 119 tests passing, 0 failures.
- `pnpm build:prod`: clean. `dist/manifest.json` carries
  `minimum_chrome_version: "116"` and permissions `['storage', 'tabs',
  'offscreen']`. Offscreen bundle has zero Preact imports. Background
  bundle shrunk from 15.3 KB (Phase 2) → 10.0 KB (Phase 4).

## What is owned by the user

- Phase 1 preflight rows: Chrome versions on both machines, route category,
  account/workspace decisions, Case 1 starting-state preparation.
- Phase 2 cross-machine smoke: Tart VM with bridged networking, manual
  offer/answer exchange, real bidirectional synthetic request/response,
  popup-closure / worker-revival / disconnect / network-loss observations.
- Phase 2 / Phase 4 two-profile smoke on this Mac.
- Phase 3 live-browser observation rows: disposable Outlook / Slack / Zoom
  tenants, then real tenant separately authorized.
- ADR 0001's honest verdict: bare-metal Linux is still required for the
  firewall/NAT/mDNS row that no container or VM can reproduce.

## Lessons captured this session

- The `task` agent in this OMP session throws `getWorkPoolYieldItems`
  internally on every dispatch. Inline build is the only reliable path.
- JSDOM does not implement `RTCPeerConnection`, so two-peer bytes
  correlation cannot be unit-tested. The honest verdict is
  `awaiting-cross-machine` and the gap must be recorded explicitly.
- Cookie-name lists, JWT claim names, and storage keys must NOT appear
  in compatibility evidence unless an actual observation occurred. The
  evidence is allowed to name categories ("first-party session cookies",
  "origin storage") but never specific names without observation.
- The compatibility verdict set is exactly `[supported, unsupported,
  unresolved]`. "Conditional supported" is not in the allowed set and
  overclaims the evidence.
- `chrome.storage.onChanged` listener's `areaName` parameter is typed
  `string` (Chrome's full `AreaName`) but our narrower `local | session`
  schema needs a cast for the comparison.
- Test labels must reflect what the test actually exercises. A test
  with `expect(true).toBe(true)` is a placeholder, not a proof.
- The `task` agent + `outputSchema` combo reliably fails in this session.
  `outputSchema` should be omitted when dispatching; the agent delivers
  plain text and the orchestrator parses.

## Decision recorded

Phase 4 is `in-env-build-green`. Phases 5–10 are gated on the user's live
observations. The product is now a real transport + scoped control plane
that returns `REQUEST_NOT_SUPPORTED` for any application — that is
exactly what the parent plan allows at this stage and what the plan
forbids substituting with stubs.