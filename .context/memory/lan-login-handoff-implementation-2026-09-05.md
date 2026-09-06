---
date: 2026-09-05
domains: [chrome-extension, build, refactor, test]
topics: [lan-login-handoff, phase-1, phase-2, phase-3, phase-4, phase-7, slack, transport, application-compatibility, control-plane, machine-local, request-state-machine, cleanup-ownership]
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
  - slack-session-transport-experiment.json
  - slack-integration-plan.json
  - src/background/apps/slack.ts
  - src/shared/lib/slack.ts
  - src/pages/slack/request-panel.tsx
  - __tests__/slack-session.test.ts
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

## 2026-09-06 — Real Outlook probe and Slack handoff

- The user authorized the real Outlook account for a bounded existing-session transport experiment, stopping on logout/re-authentication; this superseded the earlier Outlook-only disposable/read-only limits, not Slack authorization.
- On Chromium 151 / Arch Linux, an isolated client followed the legacy Outlook origin to the new `outlook.cloud.microsoft` hostname. Official Microsoft documentation confirmed the domain migration.
- Twelve scoped cookie records (including three canonical-host mappings) and six account-specific MSAL cache entries were installed in the isolated client. No refresh token or unrelated Graph/Teams/SharePoint/Okta credential was copied.
- The client requested authentication at `login.microsoftonline.com`. That request was blocked; no sign-in/MFA completed and no retry followed that boundary. Client identity and refresh were not verified. The original host retained its visible mailbox UI without a prompt; it was not refreshed.
- All isolated clients were removed and the inspector stopped. No credential values or raw profile/HAR exports were retained. This was a same-browser CDP probe, not a cross-machine extension feature.
- The user requested a resumable report and switched focus to Slack. Report: `.context/2026-09-05.lan-login-handoff/research-outlook-session-transport.md`; detailed sanitized evidence: `real-outlook-transport-experiment.json` in that subject. Outlook remains unresolved and paused.

- Slack continuation: the user explicitly selected their real workspace, stopping on logout/sign-in/MFA/device checks and prohibiting messages, reactions, or workspace changes. This supersedes the earlier disposable-only Slack selection.
- Started a reloadable, Slack-scoped local inspector (`beam-session-inspector`); both temporary Node modules passed syntax checks. Connection is pending Chromium approval/attachment. No Slack credential state has been read and no client created. Resume instructions are in `slack-session-transport-experiment.json`; do not restart the pending connection unnecessarily.
- After user debugging approval, the inspector attached. The sole Slack client is Enterprise Grid; `localConfig_v2` contains one enterprise plus one member workspace with matching enterprise/user bindings. Workspace and enterprise tokens differ; the workspace's enterprise token matches the enterprise entry. HttpOnly `d`, `d-s`, and `ui` cookies are `.slack.com`-scoped. Metadata only was emitted; no transfer/client was created. Workspace-only credential isolation is unproven, so a shared-session scope decision is required before copying.

## 2026-09-06 — Slack extension teleport

- User explicitly authorized the shared Slack session after the workspace-isolation warning, then approved the extension's optional permissions.
- Bounded local feasibility probe passed: only observed `d` / `d-s` cookies and a minimal two-entry Enterprise Grid/member `localConfig_v2` were copied. Source/client identity, client reload and host preservation passed without an authentication boundary or message/reaction/workspace mutation.
- Implemented the exact provider in `src/background/apps/slack.ts`, strict session validators, correlated peer protocol, connection/deadline/cancellation guards, and shared popup/options controls for consent, source selection and transfer.
- Actual extension transfer over WebRTC between two isolated Chromium profiles reached `succeeded`. Independent read-only account/workspace/enterprise checks matched on the receiving client and the original browser. A repeat request failed with `client_not_empty` and preserved the established sessions.
- This is same-machine, two-profile extension evidence on Linux, not a physical macOS-to-Linux test. Case 1 normal host sign-in and the full cross-machine/failure matrix remain open. Outlook stayed paused.
- Security review found cleanup could delete a newer client login after interruption. A regression failed before the fix; cleanup now checks nonce-salted cookie and token fingerprints before removing owned state, preserves conflicts, reports `cleanup_required`, and never blindly deletes `ui`. The journal contains only non-secret ownership metadata in `chrome.storage.session`, not replayable credentials.
- Provider and transport reviewers reported no remaining blocking findings after the ownership fix. Fixtures execute the actual injected storage cleanup functions, covering owned removal, replacement-cookie preservation, newer app-token preservation, and worker-revival cleanup.
- Verification: 160 tests in 11 files passed; the production build and its type checker passed; Biome passed on the fix. Desktop options and the 420px popup were visually checked with no horizontal overflow.
- No `guardrails.json`: the detected ephemeral Vitest gate passed. No coverage/complexity baseline exists; run `/b-init-guardrails` to establish a durable contract.
- Known lifecycle limitation: terminal request status returns to `idle` after service-worker suspension, while the transferred Slack session remains valid. Status persistence is separate follow-up scope.
- The reviewed production build passed a second real WebRTC transfer. Both temporary profiles were removed; the original host identity and workspace UI were verified again after cleanup, with no auth prompt or host reload. The private inspector disconnected/exited cleanly and all four temporary scripts were removed. Parent Phase 7 remains active; this is not physical-pair completion.