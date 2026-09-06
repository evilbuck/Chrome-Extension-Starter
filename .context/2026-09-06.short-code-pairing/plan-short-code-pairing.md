---
status: completed
date: 2026-09-06
subject: 2026-09-06.short-code-pairing
topics: [pairing, discovery, signaling, webrtc, security, setup]
research: []
iterations: []
memory: [short-code-pairing-2026-09-06.md]
---

# Plan: Automatic five-character pairing

## User Goal

> The pairing should be discoverable with a unique code generation that should be manually confirmed on the other chrome instance. The code should be easy to type. 5 characters alpha-numberic. This will establish the pair. None of this copy and paste three times across the computers that happens 3 times.

The user authorized an orchestrated b-plan → b-build → b-review workflow and selected **Hosted service**. Execute through verification, documentation, save and scoped commit without another workflow gate.

## Decision

Deploy a narrowly scoped Cloudflare Worker with SQLite-backed Durable Objects on the personal Cloudflare account (not PartyPix). Wrangler OAuth is available. Target: `https://beam-me-up-pairing.buck-f11.workers.dev`.

Hosted signaling replaces manual descriptors, not the existing direct WebRTC application channel. The original ADR's prohibition on hosted signaling is superseded; no companion, STUN/TURN, application-data relay or broader network support is introduced.

## User flow

1. Host selects its existing Host role and generates a code. The five-character alphabet is `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (32 symbols, excluding 0/O and 1/I). Invitation expires after two minutes.
2. Client types the code once; lowercase is normalized. Both browsers show the pending counterpart. Client explicitly confirms; Host explicitly approves that pending browser. Host approval is necessary because a five-character lookup must not itself authorize exporting Slack sessions.
3. After both confirmations, browser identities are pinned locally and signed offer/answer exchange happens automatically. No descriptors appear in ordinary setup or status responses.
4. Future connections use **Connect to paired browser** on each browser, with no new code. There is one remembered pair per browser. Disconnect retains trust; Forget closes transport immediately and removes local trust, with authenticated server revocation when reachable.
5. To replace a peer, forget the current pair first. Existing Slack sharing consent and optional Chrome permissions remain separate, and subsequent app requests require no extra host pairing approval.

## Trust and privacy contract

- The rendezvous is **trusted during first pairing**. Explicit approval limits code-guess authorization, but does not defend first pairing against a malicious service substituting keys. Do not claim PAKE or authenticated out-of-band key verification.
- Each profile creates a non-extractable ECDSA P-256 private key in extension IndexedDB. Public keys are SPKI base64. `chrome.storage.local` stores only confirmed pair metadata: room ID, fixed role, counterpart public key/name and creation time. No short code, SDP or application token is retained there.
- Signed SDP binds protocol domain, room ID, fresh connection UUID, sender role and entire descriptor. Verify the pinned counterpart key before applying any remote SDP. Fresh connection IDs prevent reconnect replay and role/room binding prevents reflection and cross-pair substitution.
- Reconnect/forget use signed, short-lived, single-use nonce proofs bound to action and room. The service checks the pinned key, timestamp and replay cache before issuing a one-use WebSocket ticket.
- WebSocket tickets are random 256-bit values, expire within one minute and travel in `Sec-WebSocket-Protocol`, never URL query strings. Persist ticket hashes, not tickets. Code lookup is an HTTPS POST body, never a URL.
- Service state contains invitation/identity/approval/ticket-hash/replay metadata only. Forward SDP frames directly to the other live socket; never durably store or log them. No application payload is sent to this service.
- No Peer is created before both confirmations. Offscreen authorization additionally requires the active connection to have verified the pinned key. Gate inbound and outbound Slack work in both offscreen and worker; legacy manual routes must not bypass this.
- Cancellation, expiry, peer replacement, stale async crypto/ICE work, disconnection and worker/offscreen lifecycle changes fail closed. A late callback cannot authorize or close a newer attempt.

## Broker architecture and fixed wire contract

`src/shared/lib/pairing-protocol.ts` is the source of truth for types, endpoint, sizes and canonical signed text. `src/shared/lib/pairing-crypto.ts` contains standard WebCrypto helpers shared by browser and Worker.

- One CodeSlot DO per five-character code provides atomic reservation/lookup with TTL. Generate cryptographically random candidates; retry actual collisions. No singleton global traffic bottleneck.
- One PairRoom DO per random room UUID coordinates its two participants. Persist approval and confirmed public-key metadata, one-use ticket hashes and nonce replay protection. Use the hibernating WebSocket API and attachments for role/epoch identity; alarms expire pending invitations and stale tickets/proofs. No critical security state only in JS instance memory.
- `POST /v1/invitations`: host public key/name → room credentials and code.
- `POST /v1/join`: code and client public key/name → credentials for the same room. Exactly one pending client; duplicate/third claim fails closed.
- `POST /v1/reconnect`: signed identity proof → credentials for remembered pair.
- `POST /v1/forget`: signed identity proof → revoke pair and close its sockets.
- `GET /v1/socket/<roomId>` upgrade with protocols `[beam-pairing-v1, ticket]`.
- Server messages: waiting, pending (attempt UUID + counterpart key/name + expiry), paired (role-specific pair record + fresh connection UUID), signed signal, typed error.
- Client messages: confirm (attempt UUID + exact pending counterpart public key), cancel, signed signal.
- Both confirms and both sockets must be present before `paired` is emitted and signaling accepted. Reconnect authenticates both pinned participants without repeating first-pair confirmation.
- Cap HTTP bodies at 8 KiB, frames at 96 KiB and descriptor strings at 48 KiB. Validate exact discriminants and field bounds. Limit allocation, lookup, reconnect and upgrade attempts per IP with Cloudflare's rate-limit binding; report its per-location limitation honestly.
- Expose only exact Worker host permissions in the extension. Do not enable automatic invocation logging that exposes invitation or signaling content; static safe error events are sufficient.

## Integration ownership and implementation sequence

Cross-slice interfaces are fixed above before concurrent work. All writing agents skip formatters, builds and tests; Main runs validation after integration.

1. **Broker slice** owns `services/pairing/**`, service configuration and focused service security regressions. Shared protocol/crypto are read-only to it.
2. **Offscreen slice** owns the pairing controller, IndexedDB identity storage, and `src/offscreen/index.ts`. The controller handles typed `PairingCommand`, reports `PairingSnapshot`, drives existing Peer methods and exposes current-connection authorization. It does not edit worker/UI/constants.
3. **Worker/UI slice** owns `src/background/connection.ts`, shared message constants, options/popup/shared pairing UI, locale, exact manifest permission, and routing regressions. Add `MSG.PAIRING = 'PAIRING'` and `MSG.OFFSCREEN_PAIRING = 'OFFSCREEN_PAIRING'`; forward validated commands with the existing offscreen target. Result is `PairingCommandResult`. Existing transport status gains `authorized: boolean` and `pairing: PairingSnapshot`; remove `localDescriptor` and all legacy manual setup commands/callers.
4. **Main integration** owns shared protocol/crypto, workspace/package integration, deployment, real-runtime proof, security review fixes, documentation and durable evidence. Existing Peer descriptor methods remain private-to-transport building blocks; no need to rename them.

## Execution phases

- Phase 1 — implementation and deterministic checks: concurrent independent slices followed by integration. [phase-1-implementation.md](phase-1-implementation.md)
- Phase 2 — b-review and remediation: security and correctness review, fixes, targeted rechecks. [phase-2-review.md](phase-2-review.md)
- Phase 3 — hosted deployment and actual browser proof, docs/save/commit. [phase-3-live-proof.md](phase-3-live-proof.md)

## Acceptance criteria

- [x] Normal setup never asks the user to copy SDP/ICE descriptors.
- [x] Exactly one five-character alphanumeric code is typed on the other Chrome instance.
- [x] Both explicit confirmations bind the current attempt and exact counterpart; no app authorization beforehand.
- [x] Active codes are unique, two-minute, single-use; collision/expiry/cancel/replay/third-peer attempts fail closed.
- [x] Actual hosted rendezvous connects two real extension instances and exchanges data on the existing WebRTC channel.
- [x] Confirmed identity survives extension reload; reconnect verifies pinned keys with fresh connection IDs; Forget removes authorization immediately.
- [x] Slack consent/permission/identity checks remain intact; unconfirmed/replaced peers cannot request Slack state.
- [x] Pairing secrets, SDP and application authentication material are absent from logs and durable research/test artifacts.
- [x] Deterministic checks/build and review pass, with exact exercised scope and physical-machine limitations recorded.

## Verification and boundaries

Keep regression tests for uncertain security boundaries: collisions and stale allocation; expiration and single-use claims; confirmation mismatch/replay; signed descriptor cross-role/connection/identity tampering; unconfirmed worker/offscreen application requests; cancellation/forget races. Do not add mock-echo or wording tests.

Run two disposable Chromium profiles against the actual hosted endpoint, enable Developer mode before extension reload, enter/confirm codes through the real UI, exchange synthetic data-channel traffic, close UI documents, reload/reconnect, and forget. Observe desktop/narrow UI. No real Slack tokens are needed for pairing proof. A same-machine two-profile run is not physical Mac/Linux proof.

The pre-existing Slack/local compatibility work is dirty and must be preserved. Baseline had 160 passing tests and a passing production build. There is no durable guardrails.json: resolve the ephemeral contract and also run existing Biome, TypeScript and production build checks; explicitly report the missing baseline.

Completed evidence: [review](review-short-code-pairing.md), [runtime/check results](pairing-runtime-evidence.json), and [user procedures](../../docs/howto/README.md). The user explicitly selected a coherent integrated-extension commit, including its required pre-existing Slack implementation while leaving older Outlook/compatibility research outside the commit.

## Sources

- https://developers.cloudflare.com/workers/best-practices/workers-best-practices/
- https://developers.cloudflare.com/durable-objects/best-practices/websockets/
