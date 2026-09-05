---
status: accepted
date: 2026-09-05
subject: 2026-09-05.lan-login-handoff
supersedes: null
superseded_by: null
related:
  - ../.context/2026-09-05.lan-login-handoff/plan-lan-login-handoff.md
  - ../.context/2026-09-05.lan-login-handoff/phase-2-extension-transport-gate.md
  - ../.context/2026-09-05.lan-login-handoff/research-extension-transport.md
---

# ADR 0001: Extension-only transport — accepted path, Mac-vs-Linux discharge matrix, container-vs-bare-metal verdict

## Context

[plan-lan-login-handoff.md](../.context/2026-09-05.lan-login-handoff/plan-lan-login-handoff.md) and [research-extension-transport.md](../.context/2026-09-05.lan-login-handoff/research-extension-transport.md) establish extension-only offscreen WebRTC as the preferred PoC transport, with a host-side loopback companion behind Tailscale Serve as an evidence-triggered fallback. [phase-2-extension-transport-gate.md](../.context/2026-09-05.lan-login-handoff/phase-2-extension-transport-gate.md) requires the gate to be proved on "the actual macOS host and Linux client", and the parent plan locks the Chrome API floor at 116 for `runtime.getContexts()`.

Two open questions sit in front of implementation:

1. Which Phase 2 acceptance items can be discharged by a Mac host + Linux container on this workstation, and which require bare-metal Linux?
2. When the user does not have a real second Linux machine reachable, which container/VM option on this Mac (M4 Pro, macOS 26.6.2) is the closest faithful substitute for a bare-metal Linux client?

## Decision

### D1. Extension-only offscreen WebRTC is the accepted first path.

This restates the plan; it does not change it. No companion, no Tailscale Serve mapping, no public listener is authorized by this ADR. A failure in Phase 2 is evidence to open a companion-specific plan; it does not authorize speculative parallel transports.

### D2. Mac-vs-Linux API behavior is OS-neutral under the same Chrome version and policy.

The MV3 offscreen API, `runtime.getContexts()`, `RTCPeerConnection`, SDP, data-channel negotiation and ICE host-candidate binding are not OS-specific. Differences between macOS and Linux Chrome under this transport are policy and network-namespace differences, not API differences. Therefore any Phase 2 acceptance row that exercises only API, signaling envelope, descriptor validation, data-channel message flow and lifecycle recovery can be discharged on either OS at parity, provided Chrome ≥ 116 is installed on both ends.

### D3. The cross-machine network/firewall/mDNS row is NOT OS-neutral.

Host candidate uniqueness, mDNS candidate obfuscation, mDNS resolution across a routed tailnet, host firewall policy on a real NIC and NAT behavior are not reproducible inside a container's userland. Phase 2 acceptance rows that depend on these (real route under existing policy, mDNS candidates across tailnet, host-only ICE without external STUN/TURN proving actual UDP reachability) require either bare-metal Linux or a true Linux VM with bridged networking.

### D4. The right Linux-client substitute on this Mac is a Tart VM with bridged networking.

[Tart](https://github.com/cirruslabs/tart) (`/opt/homebrew/bin/tart`) is installed on this machine. Tart with `--net-bridged` produces a real Linux VM with a real LAN IP and a real UDP socket surface, the closest faithful substitute for bare-metal Linux we can run on this host without buying a second box. Docker Desktop (the only container runtime installed) gives a separate NAT namespace and cannot prove the network row.

### D5. Two Chrome profiles on one Linux host do NOT substitute for two machines.

Two profiles on the same Linux host share IP, interface, routing and mDNS behavior. They can prove signaling, descriptor validation, data-channel message flow and profile isolation, but they cannot prove the second-machine LAN/tailnet/mDNS/firewall row that Phase 2 acceptance requires. Two-profile testing is useful inside the VM but never as the Phase 2 gate.

## Consequences

- Phase 1 preflight must record observed Chrome versions and tailnet/mDNS policy on the real macOS host; those values are gate inputs and must be entered before Phase 2 starts. (`preflight-experiment-boundary.md` already drafts these rows as `not observed (requires user observation)`.)
- Phase 2 implementation may proceed now: the offscreen API, descriptor envelope, runtime sender checks, data-channel wire protocol and lifecycle behavior are OS-neutral code and can be developed and unit-tested on either platform. Cross-machine acceptance waits on Phase 1 observations + a Linux VM with bridged networking.
- The macOS host can run a built unpacked extension from this repo with no host-network changes.
- The Linux VM (`tart run --net-bridged ghcr.io/cirruslabs/ubuntu:24.04-arm64`) can load the same unpacked extension under a separate Chrome profile. UDP between host Chrome and VM Chrome is direct on the LAN when the VM is bridged, and reaches a real NIC + real firewall on the macOS side — the strongest two-machine substitute we can build without a second physical machine.
- Docker Desktop's existing k3d-flux-local cluster occupies the daemon right now; it is unrelated to this work and should not be touched. A Tart VM is independent of Docker.

## Phase 2 acceptance → discharge mapping

| Acceptance item | Discharged by Mac + Linux VM (Tart, bridged) | Discharged by Mac + Docker container | Discharged by two profiles on one Linux |
|---|---|---|---|
| Manual offer/answer exchange and one ordered reliable data channel across two machines | yes | API row yes; network row no | no |
| Bidirectional synthetic request/response across the real two-machine channel | yes (real LAN) | no (NAT'd) | no |
| Connection descriptors versioned/role-bound/connection-ID-bound/expiring/size-limited | yes (code under test) | yes | yes |
| Candidate gathering completes before export | yes | yes | partial (loopback host candidates only) |
| Popup closure and worker termination/revival recover live state | yes | yes | yes |
| Explicit disconnect and browser/offscreen/network loss terminate visibly; no auto-reconnect/replay | yes | partial | partial |
| No application auth state, SDP, ICE credentials or full candidate addresses enter logs/storage | yes | yes | yes |
| Failure mode reproduction if extension-only fails | yes | partial | no |

## Verification

This ADR is not implementation; it does not move the transport gate. Verification of the gate itself happens in Phase 2 after Phase 1 preflight is filled with observed values. This ADR's verification is that every "yes" in the discharge table above is implemented by an actual Phase 2 acceptance row and a corresponding smoke artifact, and every "no" is documented in the Phase 2 evidence record as either (a) deferred to a later phase or (b) replaced by an equivalent two-machine proof on the Tart VM.

## Rejected alternatives

- **Run Phase 2 against a Docker container on the assumption that "Linux is Linux".** Rejected: container NAT does not exercise the cross-machine route. A passing container test is not the Phase 2 acceptance proof.
- **Run Phase 2 against two Chrome profiles on one Linux host as a substitute for two machines.** Rejected: same IP, same NIC, same firewall; it cannot prove the cross-machine row.
- **Wait for the user to provide a second physical machine before starting Phase 2 code.** Rejected: the code under test is OS-neutral. We can author and unit-test all non-network rows now. The cross-machine proof waits only on Phase 1 observations and the user's confirmation that they want the Tart VM path.
- **Authorize a companion behind Tailscale Serve preemptively.** Rejected: the plan forbids preallocating companion work. The fallback triggers only on a recorded Phase 2 failure.