---
status: completed
date: 2026-09-05
subject: 2026-09-05.lan-login-handoff
topics: [chrome-extension, webrtc, offscreen, tailscale, transport]
informs: [plan-lan-login-handoff.md]
memory: [lan-login-handoff-planning-2026-09-05.md, lan-login-handoff-implementation-2026-09-05.md]
---

# Research: Extension-only transport with a Tailscale fallback

## Finding

**Extension-only is a viable first implementation candidate, not proven connectivity on the target computers.** Keep `RTCPeerConnection` in a bundled offscreen document, use the existing options page for manual offer/answer exchange, and prove a non-secret data-channel round trip from the macOS host to the Linux client under their existing policies. The user explicitly accepts manual connection setup. [OFFSCREEN] [WEBRTC]

**OpenSSH-style Tailscale Serve HTTP/TCP forwarding requires a backend listener.** It can expose that listener within the tailnet, but cannot turn an MV3 extension or WebRTC data channel into it. If browser ICE cannot use a viable LAN/tailnet path, a host-side loopback companion exposed through Serve is a concrete fallback. It forwards the extension peer channel only, never the client's application website traffic. [SERVE] [NATIVE]

This assessment resolves API/topology choices. It does not validate live network behavior or application-session portability.

## Inputs and confirmed decisions

- Host: macOS Chrome. Client: Linux Chrome.
- Prefer extension only; a companion is acceptable if research/verification establishes the need.
- The user reports a policy-managed firewall and proposes Tailscale forwarding as used for OpenSSH. Do not change that firewall or infer control over it.
- Manual offer/answer exchange during connection establishment is acceptable. Once connected, no host approval is required for each manual client `sync auth` request.
- PoC skips durable pairing and remains in a private development environment. This is not a shipped trust policy.
- No public signaling server, public TURN service, Funnel or website-traffic proxy is selected. Tailscale's own encrypted relay path, where already used by the tailnet, is a separate transport layer.

## Capability matrix

| Question | Evidence-backed answer | Planning consequence |
|---|---|---|
| Can a worker own the browser WebRTC object? | WebRTC interfaces are exposed to Window; MV3 workers lack that document context. Worker globals also disappear on suspension. [WEBRTC] [LIFECYCLE] | Offscreen document owns RTC; worker coordinates Chrome API operations. |
| Can an offscreen document use WebRTC? | Chrome documents the `offscreen` permission and `WEB_RTC` reason; only `chrome.runtime` is available among extension APIs there. [OFFSCREEN] | Bundle a static offscreen HTML entry; communicate with the worker through runtime messages. |
| Must the popup stay open? | Popups close on click-away. Non-audio offscreen reasons have no API-imposed lifetime limit. [POPUP] [OFFSCREEN] | Popup is an action/status view, not the transport owner. Browser exit still ends availability. |
| Is external signaling mandatory? | Signaling is outside WebRTC; its means are unspecified. [PEERS] | Manually exchange a complete gathered offer and answer through user-controlled setup pages. No app credentials in the descriptors. |
| Can STUN/TURN be omitted? | `iceServers: []` is valid; direct candidate connectivity still must succeed. [WEBRTC] [ICE] | Test host-only ICE first. No silent external relay fallback. |
| Does a VPN imply WebRTC will work? | ICE can use virtual interfaces, but Chrome policy controls interface exposure and can hide addresses behind mDNS. [ICE] [POLICY-IP] [POLICY-MDNS] | Record actual candidate types/policy categories and connection outcome on the two machines. Never weaken policy to force success. |
| Will mDNS candidates resolve across a tailnet? | mDNS is link-local; Tailscale warns multicast/LAN protocols may behave differently on its network-layer topology. [MDNS] [TAILSCALE-OSI] | Do not assume routed tailnet connectivity provides `.local` candidate resolution. |
| Does OpenSSH-style Serve forwarding provide a WebRTC relay? | Its HTTP(S)/TCP modes forward to a local service; they do not implement ICE/TURN. Linux-only layer-3 Services are a separate mode with extra OS configuration. [SERVE] [SERVICES] | Use normal routing for extension-only RTC; a macOS Serve TCP/HTTP fallback needs a local backend. |
| Does encryption replace pairing? | DTLS protects a negotiated data channel; trust also depends on signaling and identity verification. [SECURITY] | Record the no-pairing risk; no claim of durable authenticated enrollment. |

## Recommended first path

1. Use supported current stable Chrome on both machines. Set a Chrome 116 API floor if using `runtime.getContexts()` without compatibility branches; the offscreen API itself is documented from Chrome 109. Record actual installed versions during proof, not a guessed current version. [OFFSCREEN]
2. Use the existing options tab for host/client role, connection status and manual connection descriptors. No side panel or new UI framework is necessary.
3. Create exactly one offscreen document with reason `WEB_RTC`. Let it own one peer connection/data channel for this PoC. Worker restarts query existing document/connection state rather than claiming reconnect from stale storage.
4. Use host-only ICE with no configured external STUN/TURN. Export only after candidate gathering completes; an early offer without required candidates is not a complete connection descriptor. Bound size/version/session identity and discard stale descriptors.
5. Keep the connection descriptor and any sensitive in-flight application material out of Chrome Sync, logs and durable files. Do not log full SDP, local IPs or candidate contents; candidate categories and state/error codes suffice for diagnostics.
6. Require a real Mac-to-Linux synthetic request/response, then popup-close and worker-restart observations. Browser exit, offscreen loss or network failure produces visible disconnection and requires a fresh connection setup; no silent replay of auth requests.

## Evidence-triggered companion fallback

Use the fallback only when a real test identifies an unusable direct path: no usable ICE candidates, policy-suppressed interfaces/UDP, unresolvable candidates on the actual routed path, or a tested connection failure attributable to those constraints. Record the failure, not merely a timeout guess.

Proposed shape: **host extension → local registered native helper → loopback service → Tailscale Serve → Linux client extension**. The host extension can use native messaging; the client can make an outbound HTTPS request to a narrowly permitted tailnet endpoint. Keep one peer-channel implementation after selection rather than maintaining speculative dual transports. Exact protocol, platform registration, local origins, endpoint exposure and teardown require a bounded companion plan once the need is demonstrated. [NATIVE] [SERVE] [NETWORK]

No listener, registration, Serve mapping, certificate/security change or firewall change is authorized by this research. At implementation, confirm the exact backend/forwarding mapping before changing it; preserve existing SSH forwarding and never use a global Serve reset. Tailnet membership is not per-app client authorization, and encryption does not remove the PoC trust risk.

Tailscale can carry traffic through direct or relayed WireGuard paths where allowed. This can help a companion's TCP/HTTP reachability; it does not automatically make browser ICE use that path or satisfy provider authentication/device checks. [TAILSCALE-CONNECTIONS]

**Layer-3 exception checked:** Tailscale Services also has `serve --tun`, which can handle IP/UDP traffic, but official docs restrict it to Linux and require additional OS packet-handling configuration, tagged service hosts and administrative service setup/approval. It is not a drop-in macOS-host substitute for the requested OpenSSH-like forwarding. No network-policy change, host retagging or Services rollout is included here. [SERVICES]

## Verification and limitations

- Source-backed research only; no synthetic peer, native host, Tailscale configuration or real authentication experiment was run.
- Future gate: distinct macOS/Linux computers, actual policy/network, non-secret payloads, no unrelated browser sessions or apps disturbed.
- Verify popup dismissal, worker termination/revival, explicit disconnect, browser closure and route loss. A local two-tab test is not the two-machine acceptance proof.
- Transport success does not establish Outlook, Slack or Zoom session handoff. A helper cannot repair a provider-required receiving-device proof.
- [Rolling notes](research/notes-extension-transport.md) and [full source ledger](research/sources-extension-transport.md) record supplementary sources and access limitations. The expired mDNS ICE draft is explanatory only; conclusions above use current Chrome policy docs and normative/reference sources.

[OFFSCREEN]: https://developer.chrome.com/docs/extensions/reference/api/offscreen
[WEBRTC]: https://w3c.github.io/webrtc-pc/
[PEERS]: https://webrtc.org/getting-started/peer-connections
[LIFECYCLE]: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
[POPUP]: https://developer.chrome.com/docs/extensions/develop/ui/add-popup
[ICE]: https://www.rfc-editor.org/rfc/rfc8445
[MDNS]: https://www.rfc-editor.org/rfc/rfc6762
[POLICY-IP]: https://chromeenterprise.google/policies/web-rtc-ip-handling/
[POLICY-MDNS]: https://chromeenterprise.google/policies/web-rtc-local-ips-allowed-urls/
[SECURITY]: https://www.rfc-editor.org/rfc/rfc8827
[SERVE]: https://tailscale.com/docs/reference/tailscale-cli/serve
[TAILSCALE-CONNECTIONS]: https://tailscale.com/docs/reference/connection-types
[TAILSCALE-OSI]: https://tailscale.com/docs/concepts/tailscale-osi
[NATIVE]: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging
[NETWORK]: https://developer.chrome.com/docs/extensions/develop/concepts/network-requests
[SERVICES]: https://tailscale.com/docs/features/tailscale-services
