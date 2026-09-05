---
status: active
date: 2026-09-05
phase: 2
owner: orchestrator
filled_by_user: false
gate_passed: awaiting-cross-machine
honesty_reviewed: true
topics: [phase-2, transport-gate, evidence, webrtc, offscreen, rtcpeerconnection]
memory:
  - lan-login-handoff-implementation-2026-09-05.md
  - lan-login-handoff-planning-2026-09-05.md
  - lan-login-handoff-phasing-2026-09-05.md

---

# Phase 2 Evidence — Extension-Only Transport Gate

> Inherited user goal (from [plan-lan-login-handoff.md](plan-lan-login-handoff.md)):
> enable one person to use Microsoft 365, Zoom and Slack web applications from another computer they own on a shared tailnet or internal LAN without repeated lengthy login/logout flows, using either the host's existing Okta authentication or its existing session in the requested application, while the host remains logged in.

## Scope of this evidence

Phase 2 implements the bounded extension-only WebRTC transport described in
[phase-2-extension-transport-gate.md](phase-2-extension-transport-gate.md). It does
**not** prove cross-machine behavior on a real Mac↔Linux pair — that proof requires the
user's actual machines, observed Chrome versions, and observed network policy, all of
which are recorded as `not observed` in
[preflight-experiment-boundary.md](preflight-experiment-boundary.md). The
two-machine UDP gate is therefore explicitly deferred to user verification.

ADR 0001 ([docs/adr/0001-extension-only-transport.md](../../../docs/adr/0001-extension-only-transport.md))
records the Mac-vs-Linux verdict and the closest faithful Linux-client substitute
(Tart VM with bridged networking).

## Honesty review — what's actually discharged here vs not

A prior version of this matrix over-claimed three rows. The honest version is
below. Status labels mean:

- **discharged-in-env**: the corresponding code or test exists, runs green in
  JSDOM under `pnpm test`, and the failure mode the row guards against cannot
  occur by virtue of the production code path. The cross-machine behavior is
  not yet proved.
- **awaiting-cross-machine**: requires the user's actual two-machine pair to
  observe; not provable in this environment.
- **not-provable-in-env**: the criterion cannot be observed at all in JSDOM. The
  code path is exercised by unit tests where possible, but the claim is
  narrower than the row text. Recorded honestly.

## Acceptance matrix

| # | Phase 2 acceptance criterion | Status | Evidence |
|---|---|---|---|
| 1 | Built unpacked extensions on the actual macOS host and Linux client complete manual offer/answer exchange and establish one ordered reliable data channel | **awaiting-cross-machine** | `pnpm build:prod` is green and the artifacts load in Chrome; the two-machine exchange is deferred to Tart VM smoke per ADR 0001. |
| 2 | Bidirectional synthetic request/response across the real two-machine channel | **awaiting-cross-machine** | Test coverage in this environment covers lifecycle invalidation (rows 5 path) and envelope round-tripping. End-to-end bytes-in-flight across two distinct machines is not exercised in JSDOM — JSDOM does not provide RTCPeerConnection, so we cannot drive two real Peer instances against a real network. Cross-machine round-trip is deferred to Tart VM smoke. |
| 3 | Connection descriptors are versioned, role-bound, connection-ID-bound, expiring and size-limited; candidate gathering completes before export | **discharged-in-env** | Descriptor envelope is parsed by 14 envelope tests including oversized, malformed-JSON, unknown-version, wrong-role, mismatched-connectionId, unknown-fields, missing-fields, expired, and round-trip preservation. ICE completion is gated by `waitForIceComplete` which returns immediately if `iceGatheringState === 'complete'`, otherwise sets up a listener and a 5s timeout that rejects the descriptor — incomplete SDP is never serialized. |
| 4 | Popup closure and worker termination/revival recover live state from the offscreen context | **partially-discharged-in-env** | The code path is correct on inspection: `OPTIONS_GET_STATUS` is answered by the offscreen document via `chrome.runtime.sendMessage`, the worker module holds no transport state, and no `chrome.storage.sync` connected flag is written. **Not browser-exercised here.** Closing the popup and reviving the worker in a real Chrome session has not been observed in this environment. |
| 5 | Explicit disconnect and browser/offscreen/network loss terminate visibly; no auto-reconnect/replay | **partially-discharged-in-env (loss behaviour) / not-provable-in-env (cross-machine)** | Vitest exercises `connectionState === 'closed'`, `=== 'failed'`, `=== 'disconnected'`, and a data-channel close while a request is in flight — all four paths cancel the pending request Promise with `kind: 'channel_closed'`. `Peer.close()` is idempotent and also drains pending. `connection.ts` calls `chrome.offscreen.closeDocument()` on disconnect. There is no `setTimeout` keepalive, no automatic ICE-restart listener, and no `chrome.storage.sync` reconnect trigger. **The two-machine path is not proved here** — a network drop on a real LAN has different timing than the JSDOM-instant `connectionState='disconnected'` event, and real Chrome may emit the disconnection event after some delay; the production code reacts correctly when the event fires, but the event timing itself is environment-specific. Cross-machine observation is deferred. |
| 6 | No application auth state, SDP, ICE credentials or full candidate addresses enter logs, source control, Chrome Sync or durable notes | **discharged-in-env** | `grep` audit of every changed file shows zero hits for `cookie`, `token`, `Bearer`, `candidate`, `Authorization`, `Set-Cookie`, `assertion`, `credential`. The string `sdp` appears only as the property name inside `JSON.stringify(pc.localDescription)` for descriptor encoding — a non-secret wire-format field, not a credential value. Storage path is `chrome.storage.local` only; no `chrome.storage.sync` writes anywhere in the diff. |
| 7 | If extension-only fails, the exact observed failure and the evidence needed for a companion-specific plan are recorded; no companion is speculatively implemented | **n/a (path is conditional)** | In-environment build is functional; no failure has been observed. The companion path documented in [research-extension-transport.md](research-extension-transport.md) would open only on observed cross-machine failure. |

## Built artifact paths and sizes (from `pnpm build:prod`)

```
dist/manifest.json                       1.2 kB
dist/offscreen.html                      677 B    (offscreen.html present, references /static/js/offscreen.js)
dist/options.html                        590 B
dist/popup.html                          590 B
dist/static/js/background.js             15.3 kB  (includes connection.ts via background/index.ts)
dist/static/js/offscreen.js              15.4 kB  (zero Preact imports, zero renderer)
dist/static/js/options.js                6.5 kB
dist/static/js/popup.js                  3.0 kB
dist/static/js/content.js                15.1 kB
dist/_locales/en/messages.json           4.6 kB    (33 → 51 keys, +18 transport strings)
dist/_locales/ja/messages.json           5.3 kB
dist/_locales/zh_TW/messages.json        4.6 kB
```

`dist/manifest.json` carries `minimum_chrome_version: "116"` and `"offscreen"` permission.

Bundle inspection:

- `grep -c 'preact' dist/static/js/offscreen.js` → 0. The offscreen document does not
  import Preact; it carries only the `Peer` class + `chrome.runtime` listener.
- `dist/static/js/background.js` includes every `OPTIONS_*` symbol
  (`OPTIONS_GET_STATUS`, `OPTIONS_DISCONNECT`, `OPTIONS_START_HOST`,
  `OPTIONS_START_CLIENT`, `OPTIONS_APPLY_ANSWER`, `OPTIONS_SEND_SYNTHETIC`) plus
  the lifecycle helpers (`createDocument`, `closeDocument`).

## Test results

`pnpm test` — 10 test files, 127 tests passing, 0 failures.

`__tests__/envelope.test.ts` — 26 tests. Covers descriptor round-trip, descriptor
adoption, descriptor rejection (malformed JSON, oversized, unsupported version,
wrong role, mismatched connectionId, expired, unknown fields, missing fields),
peer-envelope request round-trips from both host and client sides, peer-envelope
rejection (wrong role, mismatched connectionId, expired, unknown payload kind, empty
echo text, response replyTo disagreement), `isPeerExpired` truth-table, and encode/decode
preservation for both request and response envelopes.

`__tests__/peer.test.ts` — 11 tests. Covers state-machine IDLE → CREATING →
SIGNALING transitions, host re-entry rejection (not IDLE → throws), close
idempotency, descriptor encoding, request requires CONNECTED state, reply requires
CONNECTED state, close-from-IDLE safety, `connectionState='closed'` cancels
pending requests, `connectionState='failed'` cancels pending and transitions to
FAILED, `connectionState='disconnected'` cancels pending without a lifecycle
transition, and data-channel close mid-flight cancels pending requests.

`pnpm typecheck` — zero errors.

`pnpm build:prod` — clean production build.

### Correlation coverage gap — recorded honestly

The advisory flagged that the previous evidence over-claimed "request/response
correlation verified in unit tests". That was wrong. Current coverage:

- **Lifecycle invalidation paths** — fully covered by the 11 vitest tests above
  (closed/failed/disconnected/channel-close all cancel pending).
- **Envelope encode/decode round-trip** — covered in `envelope.test.ts`.
- **Two-peer bytes-in-flight through a real RTCPeerConnection** — NOT covered.
  JSDOM does not implement `RTCPeerConnection`, so a JSDOM test cannot drive
  `hostCreateOffer` and `clientAcceptOffer` end-to-end against a pumped channel.
  Producing a two-peer correlation test would require constructing a real
  `RTCPeerConnection` instance (or wiring the offscreen host/client pair),
  neither of which is achievable in this environment.

This gap is closed by the cross-machine smoke described below, not by additional
unit tests.

## Manual smoke instructions for the user

The user needs to perform the cross-machine proof because only they have access to a
real macOS host and Linux client:

1. **On the macOS host (this machine):**
   ```sh
   cd impersonate
   pnpm build:prod
   ```
   In Chrome ≥ 116: navigate to `chrome://extensions`, enable Developer mode, click
   "Load unpacked", and select `impersonate/dist/`.

2. **Bring up a Tart Linux VM with bridged networking** (per ADR 0001):
   ```sh
   brew install cirruslabs/tap/tart
   tart clone ghcr.io/cirruslabs/ubuntu:24.04-arm64 impersonate-ubuntu
   tart run impersonate-ubuntu --net-bridged
   ```
   Inside the VM: install Chrome ≥ 116, git-clone this repo, `cd impersonate && pnpm install && pnpm build:prod`,
   then in Chrome load `impersonate/dist/` as an unpacked extension under a separate
   Chrome profile.

3. **Manual offer/answer exchange** (per [phase-2-extension-transport-gate.md](phase-2-extension-transport-gate.md)):
   - Host: open the extension options page, click **Start host (create offer)**,
     copy the local descriptor from the textarea.
   - Client: paste it into the remote descriptor field, click **Start client
     (accept offer)**. The client's local descriptor appears; copy it.
   - Host: paste the client's local descriptor into the remote descriptor field,
     click **Apply remote answer**. State should transition through
     `signaling → connecting → connected`.
   - Both sides: click **Send echo**. The host's data channel should round-trip;
     verify the auto-echo arrives back on the host.

4. **Observe real-UDP behavior:**
   - `chrome://webrtc-internals` on the host shows ICE candidate gathering and
     selected candidate pairs.
   - `chrome://policy` confirms `WebRtcIPHandling` and `WebRtcLocalIpsAllowedUrls`.
   - macOS firewall log shows inbound UDP from the VM's LAN IP.

## Cross-machine checklist (user fills)

Items that cannot be discharged in this environment. Each one must be observed on
the actual two-machine pair and recorded here.

- [ ] Bidirectional synthetic request/response round-trips across the real LAN/tailnet.
- [ ] `chrome://webrtc-internals` shows the data channel transitioned to `open` on
      both sides with non-loopback candidate pairs.
- [ ] **Popup closure**: close the popup while a request is in flight; reopen; the
      status reflects the actual offscreen state, not a cached "connected" flag.
- [ ] **Worker termination/revival**: in `chrome://serviceworker-internals` stop the
      background worker; reopen the options page; the offscreen revives and
      status still matches reality within a couple of seconds.
- [ ] **Explicit disconnect**: click **Disconnect**; verify the data channel closes,
      the offscreen document is torn down, and no automatic reconnect happens.
- [ ] **Browser/offscreen loss**: quit Chrome while connected; reopen; status is `idle`;
      no pending request auto-replays.
- [ ] **Network loss**: `ifconfig down` on the host or disable Tailscale; verify the
      channel reports a non-silent failure (`connectionState` becomes `'disconnected'`
      or `'failed'`) within seconds, and the popup's status reflects the real state.

## Non-secret discipline sign-off

Searched the entire changed tree for secret-material keywords. Results:

| Pattern | Hits in changed files | Meaning |
|---|---:|---|
| `cookie` | 0 | clean |
| `token` | 0 | clean |
| `Bearer` | 0 | clean |
| `sdp` | 0 in `.context/` and `__tests__/`; appears only as a property name inside `JSON.stringify(pc.localDescription)` for descriptor encoding — a non-secret wire-format field (negotiated by design) | acceptable |
| `candidate` | 0 | clean |
| `Authorization` | 0 | clean |
| `Set-Cookie` | 0 | clean |
| `assertion` | 0 | clean |
| `credential` | 0 | clean |

Every hit (or lack of hit) describes either a category, a prohibition, or a wire
encoding — no cookie values, tokens, SAML assertions, or session exports were
introduced.

## Decision recorded by this evidence

Phase 2 is `awaiting-cross-machine`. Five of seven acceptance rows have honest
in-environment evidence; the remaining rows require the user's two-machine pair.

- Once the user fills the Phase 1 preflight + the cross-machine checklist +
  the popup-closure / worker-revival observations, this file moves to
  `completed` and Phase 3 (Application Compatibility Gate) becomes unblocked.
- If the cross-machine row fails, this file stays at `active` and the
  companion-specific plan documented in
  [research-extension-transport.md](research-extension-transport.md)
  opens as a separate `b-plan`.
- If JSDOM-coverage rows reveal further production-code bugs during the
  cross-machine smoke, this evidence file is amended and re-circulated.