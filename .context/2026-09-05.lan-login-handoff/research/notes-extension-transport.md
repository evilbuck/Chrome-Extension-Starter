---
status: completed
date: 2026-09-05
subject: 2026-09-05.lan-login-handoff
topics: [chrome-extension, webrtc, offscreen, tailscale]
---

# Extension transport — rolling notes

Parent-maintained notes from the TransportEvidence read-only researcher. Public documentation only; no browser, listener, or two-machine experiment. Source types: official API/product documentation and WebRTC reference documentation.

## User constraints

Prefer extension only; a companion is acceptable if research establishes the need. The user reports a policy-managed firewall and proposes Tailscale proxies analogous to OpenSSH. Forwarding is for the peer channel only, not application website traffic. The development PoC skips pairing; reachability does not authenticate a peer.

### LOCAL-CANONICAL — prior assessment

The earlier compatibility report establishes outbound MV3 networking, distinguishes Chrome Apps' TCP listener, and identifies WebRTC and native messaging as alternatives. It does not resolve signaling, offscreen lifecycle, or tailnet connectivity. The new report must not claim it already did.

### OFFSCREEN-1 — hidden DOM/WebRTC context

Official Chrome offscreen documentation was read in full. Chrome 109+ supports MV3 offscreen documents with the offscreen permission and WEB_RTC reason. Static bundled HTML can use Web APIs but only chrome.runtime among extension APIs. Reasons other than AUDIO_PLAYBACK have no API-imposed lifetime limit. Chrome 116+ runtime.getContexts supports context discovery. This provides a candidate RTC owner separate from the popup and service worker; it does not guarantee survival across shutdown, suspension, or network changes. Confidence: high API evidence; actual connection behavior untested.

### SW-1 — service-worker suspension

Official lifecycle documentation was read in full. Idle termination and lost globals make the worker a coordinator rather than an authoritative in-memory RTC/session owner. Events and API calls affect lifetime; offscreen messages can wake/reset timers. Persist only non-secret coordination state where needed and do not rely on artificial keepalive polling. Confidence: high; no claim that a connection survives every browser transition.

### WEBRTC-1 — signaling boundary

Official WebRTC peer-connection guide was read in full. Offer/answer and ICE candidate exchange require an independent signaling channel; WebRTC does not supply it. Data channels carry arbitrary binary data. Manual signaling is a candidate for a no-server PoC; it must include completed candidate gathering or candidate updates, not an early incomplete offer. A configuration without external ICE servers avoids external STUN/TURN but does not guarantee direct connectivity through a policy firewall or tailnet. Confidence: high on protocol; manual no-server topology is a design inference requiring a real two-machine proof.

### WEBRTC-2 — specification and transport trust

W3C WebRTC peer-connection, configuration, DTLS, ICE, and data-channel sections were consulted. Empty ICE-server configuration is valid; candidates remain implementation-filtered. SCTP data channels use DTLS; checking a fingerprint from the signaling exchange does not enroll or authorize a client. Manual signaling must not be described as a finished pairing system. Confidence: normative protocol evidence; deployment behavior untested.

### ICE-1 — virtual interfaces and routes

IETF RFC 8445 permits host candidates from physical and virtual/VPN interfaces and excludes loopback. ICE tests candidate connectivity; it does not override a firewall or guarantee success without TURN. A numeric Tailscale-interface candidate is possible in principle, not established for the actual Chrome installations. Confidence: high on protocol, conditional on browser/network behavior.

### MDNS-1 — link-local name limitation

RFC 6762 describes `.local.` mDNS names as link-local. A hostname-obfuscated candidate that works on one LAN must not be assumed resolvable on a routed tailnet. This is a routing/name-resolution risk, not proof that every cross-tailnet WebRTC connection fails.

### CHROME-POLICY-1 and CHROME-POLICY-2 — managed browser constraints

Official Chrome Enterprise policy descriptions establish configurable interface restrictions and mDNS concealment of local addresses. Inspect actual policy as non-secret diagnostic input later; do not disable policy or request camera/microphone access just to reveal addresses. Browser support for WebRTC does not prove usable private-network ICE candidates.

### CHROME-NET-1 and CHROME-TCPSERVER-1 — outbound requests versus listening

Chrome's extension networking guide covers outbound requests with scheme-specific host permissions. Its TCP-server API is explicitly a Chrome Apps API. No ordinary MV3 inbound TCP listener is established by these sources. A companion is an optional way to supply one; it is not a substitute for application-session compatibility.

### TAILSCALE-SERVE-1 — private TCP/HTTP forwarding

Official Serve CLI documentation was read in full. Serve forwards to an existing local HTTP/TCP service and can persist its mapping. It cannot turn an RTCDataChannel into a TCP listening endpoint or provide WebRTC signaling automatically. Therefore distinguish direct WebRTC carried by usable tailnet routes from a companion's loopback listener forwarded by Serve. This retains direct client application traffic and does not change the policy-managed firewall.

### OFFSCREEN-RELEASE-1 — API release context

Official July 2023 Chrome extension update confirms offscreen introduction in Chrome 109 and later additions. It does not separately date WEB_RTC. Plan choice: use Chrome 116+ context-discovery APIs without legacy branches, while requiring currently supported stable Chrome for real authentication tests.

### MDNS-ICE-DRAFT-1 — mDNS ICE limitations

The IETF draft describes UUID `.local` host-candidate names, internal resolution and reduced direct connectivity where mDNS cannot resolve. It is an expired draft, not a current normative RFC. Use alongside the current Chrome policy pages and RFC 6762, not as proof of current browser implementation.

### CHROME-UI-1 and CHROME-UI-2 — popup and visible alternatives

Official documentation says popups automatically close on click-away. A side panel is a more persistent visible experience but is unnecessary new UI scope here. Use the existing options tab for setup and an offscreen document for RTC ownership. Closing the popup must not terminate the peer channel.

### NATIVE-1 — companion fallback costs

Native messaging requires a separately registered binary, exact allowed extension origins and an extension permission. A companion is not required merely because the service worker sleeps; offscreen supplies a Window context. A companion is justified only by observed direct-connectivity failure or a demonstrated need for a real TCP/HTTP listener. It does not solve application portability or grant provider approval.

### WEBRTC-SEC-1 — encryption versus enrollment

RFC 8827 describes SCTP over DTLS and the trust placed in signaling fingerprints. Channel encryption alone does not identify the intended person/device. The no-pairing exception remains an explicit development risk; connection descriptors must remain in a user-controlled channel and never contain application credentials.

### TAILSCALE-CONN-1 — direct and relayed tailnet paths

Official Tailscale documentation describes direct UDP, DERP and peer-relay paths, all protected by WireGuard. A policy firewall can prevent direct transport while a permitted relayed tailnet connection remains possible. This is not external WebRTC TURN, not Tailscale Serve, and not website-traffic proxying. Record the actual tailnet path as non-secret evidence; do not promise connectivity without checking it.

### Final planning decision

The user accepts manual offer/answer exchange for the development PoC. Prefer extension-only offscreen WebRTC with complete manual signaling and no external STUN/TURN. Test the macOS-host/Linux-client pair under its existing browser/network policy. If direct ICE fails for a documented policy, mDNS or routing reason, propose a host-side loopback companion with tailnet-only Serve; do not weaken managed policy or silently add external relays. No actual connection has been exercised in this research.

### Late supporting sources and read limitations

TAILSCALE-OSI-1 confirms Tailscale is network-layer infrastructure and that LAN multicast behavior may differ. CHROME-ACTION-1 confirms popup configuration but adds no persistence guarantee. Three attempted index/source fetches returned an index, shell or encoded content and were not relied upon; the ledger records them.

### TAILSCALE-SERVICES-1 — parent check of the layer-3 exception

Main read the full current Serve CLI and Services pages, including the `--tun` exception. Layer-3 endpoints can support UDP but are Linux-only, require extra OS configuration, and use tagged/approved Services hosts. This does not supply a drop-in macOS-host path and is not the selected OpenSSH-style TCP/HTTP fallback. Narrow earlier Serve statements to the chosen HTTP/TCP mode rather than claiming every Serve mode is TCP-only.

### Parent source verification

Main completed the Chrome offscreen API page and Serve/Services pages. Confirmed WEB_RTC, runtime-only extension APIs, getContexts availability, popup-independent document ownership, backend forwarding and the Linux-only layer-3 limitation. No network service was launched.
