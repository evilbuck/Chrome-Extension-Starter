---
date: 2026-09-06
domains: [extension, cloudflare, security, testing, docs]
topics: [five-character-pairing, hosted-signaling, pinned-keys, offscreen, webrtc]
related:
  - .context/2026-09-06.short-code-pairing/plan-short-code-pairing.md
  - docs/adr/0002-hosted-pairing-rendezvous.md
priority: high
status: completed
subject: 2026-09-06.short-code-pairing
artifacts:
  - plan-short-code-pairing.md
  - review-short-code-pairing.md
  - pairing-runtime-evidence.json
---

# Hosted five-character pairing completed

The user rejected repeated SDP copy/paste, chose a hosted service and authorized continuous b-plan → b-build → b-review execution. The personal Cloudflare Worker is deployed at `https://beam-me-up-pairing.buck-f11.workers.dev`, version `0676c8e7-7ab6-48f4-8ddd-28dca3c94d6c`; no PartyPix resources were used.

## Delivered behavior

The host generates one unique five-character invitation from an unambiguous 32-symbol alphabet, valid for two minutes. The client types it once, case-insensitively. Both profiles explicitly confirm the current counterpart before transport/application authorization. Profiles retain non-extractable P-256 private keys in IndexedDB and pinned peer metadata locally. Subsequent reconnect uses signed fresh connection epochs without another code. Disconnect retains trust; Forget immediately closes local authorization and requests authenticated server revocation. Manual descriptor setup/status exposure was removed.

Codes coordinate discovery, not standalone authentication. First key introduction trusts the hosted service; this is not PAKE. The broker does not relay application credentials or persist SDP. Direct WebRTC and the existing separate Slack permission/consent/identity checks remain.

## Review and runtime findings

Fixed real offscreen `chrome.storage` failure through an exact-sender-checked background storage bridge; private keys never traverse it. Fixed forget acknowledgement parsing, new-connection event filtering after reconnect, Slack readiness without authorization, and a delayed-alarm expiry bypass. Hardened stale async room/socket handling and authenticated idempotent revocation. The late-confirm expiry regression was demonstrated failing before remediation and passing afterward. Details: subject review artifact.

## Proof

- Extension: 15 files, 187 tests passed; TypeScript passed; production `dist/` rebuilt.
- Worker: 2 files, 24 workerd tests passed; generated bindings and TypeScript passed; actual deployment succeeded.
- Biome: 66 files, zero errors after formatting; four advisory warnings remain. No warning suppression or weakened check contract.
- Two disposable real Chrome profiles: typed code, no echo before both confirmations, mutual pair, direct echo, UI-close continuity, reload with retained trust, code-free reconnect, repeated disconnect/reconnect, local forget/remote refusal and idempotent other-peer forget.
- Hosted invalid/third-peer/rejected/reused/expired cases were refused; real two-minute expiry was waited out.
- Final rebuilt production extension repeated pairing, successful echo and successful forget on both profiles.
- Desktop Options, 390px Options and 400px popup visually observed; narrow surfaces had no horizontal overflow. Screenshots in subject folder.
- Test pairs revoked, disposable profiles and runtime harness removed. User's original browser was not modified by this pairing proof.

No guardrails.json — ran detected commands only (no coverage/complexity baseline). Run /b-init-guardrails to create a durable contract.

## Boundaries and closeout

No physical Mac/Linux or restrictive-network proof is claimed. No STUN/TURN was added. Pairing proof used synthetic echo, not Slack credentials. Original application compatibility/physical-network backlog remains open.

Quickstart, ADR supersession, changelog and separate pair/reconnect/disconnect/forget/deploy how-tos are updated. Plan/phases and this memory are completed; backlog records pairing completion without closing unrelated gates. The user explicitly selected an integrated-extension commit including required pre-existing Slack implementation, while preserving older Outlook/compatibility research outside that commit.
