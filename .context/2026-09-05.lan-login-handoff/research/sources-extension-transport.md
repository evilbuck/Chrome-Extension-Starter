---
status: completed
date: 2026-09-05
subject: 2026-09-05.lan-login-handoff
topics: [chrome-extension, webrtc, offscreen, tailscale]
---

# Extension transport — source ledger

Access date: 2026-09-05. Researcher: TransportEvidence; captured by Main. No live connectivity verification. Sources are official API/product docs and WebRTC reference docs unless otherwise stated.

## OFFSCREEN-1 — chrome.offscreen

URL: https://developer.chrome.com/docs/extensions/reference/api/offscreen

Read: full official page.

- Availability: Chrome 109+, MV3+, permission `offscreen`.
- `WEB_RTC` reason supports WebRTC APIs; only `chrome.runtime` is available among extension APIs.
- Non-audio reasons have no document lifetime limit under this API; that is not a browser shutdown or peer-connection guarantee.
- Context discovery via `runtime.getContexts()` is Chrome 116+.

## SW-1 — extension service worker lifecycle

URL: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle

Read: full official page.

- Normal idle termination: 30 seconds; globals are lost on termination.
- Chrome 109 offscreen messages reset worker timers; Chrome 116 active WebSocket traffic extends worker lifetime.
- Persistent coordination cannot rely on service-worker globals.

## WEBRTC-1 — getting started with peer connections

URL: https://webrtc.org/getting-started/peer-connections

Read: full official guide.

- Data channels carry arbitrary binary data.
- Signaling is outside WebRTC; offer/answer and ICE candidates must be exchanged separately.
- STUN/TURN assist connectivity. Manual signaling with no external ICE server is a candidate design, not a verified arbitrary-network solution.

## WEBRTC-2 — WebRTC: Real-Time Communication in Browsers

URL: https://w3c.github.io/webrtc-pc/

Read: peer-connection/configuration, DTLS, ICE and data-channel sections.
Data: `iceServers` defaults to `[]`; candidate filtering remains implementation-dependent; SCTP uses DTLS. Signaling is separate. A negotiated fingerprint is not application enrollment.

## ICE-1 — RFC 8445: Interactive Connectivity Establishment

URL: https://www.rfc-editor.org/rfc/rfc8445

Read: overview, host candidates, and NAT/firewall sections.
Data: host candidates may use physical and VPN interfaces, not loopback; connectivity checks are required. No firewall override or arbitrary-network guarantee.

## MDNS-1 — RFC 6762: Multicast DNS

URL: https://www.rfc-editor.org/rfc/rfc6762

Read: abstract, names and scope.
Data: `.local.` is link-local; multicast destinations include 224.0.0.251 and FF02::FB. This is protocol scope, not a live Tailscale observation.

## CHROME-POLICY-1 — WebRTC IP handling

URL: https://chromeenterprise.google/policies/web-rtc-ip-handling/

Read: official policy description and values.
Data: policy can restrict interfaces or disallow non-proxied UDP. Current managed values on host/client are unknown.

## CHROME-POLICY-2 — local IP exposure in WebRTC ICE candidates

URL: https://chromeenterprise.google/policies/web-rtc-local-ips-allowed-urls/

Read: official policy description.
Data: matching origins can expose local IPs; otherwise mDNS concealment can apply. No policy change is proposed.

## CHROME-NET-1 — cross-origin network requests

URL: https://developer.chrome.com/docs/extensions/develop/concepts/network-requests

Read: full official guide.
Data: foreground extension pages/workers can contact remote servers with appropriate host permissions. HTTP/HTTPS schemes and custom CSP matter; this is not a listener API.

## CHROME-TCPSERVER-1 — chrome.sockets.tcpServer

URL: https://developer.chrome.com/docs/apps/reference/sockets/tcpServer.md.txt

Read: full official API reference.
Data: server/listen functionality belongs to the Chrome Apps API and requires its sockets manifest declaration. Do not treat it as MV3 extension permission.

## TAILSCALE-SERVE-1 — tailscale serve command

URL: https://tailscale.com/docs/reference/tailscale-cli/serve

Read: full official page, reached through the older documentation redirect.
Data: Serve exposes a local service within the tailnet; HTTP(S) and raw TCP forwarders target an actual local listener; `--bg` persists the mapping. It does not provide a WebRTC relay or a missing browser TCP listener.

## OFFSCREEN-RELEASE-1 — Chrome Extensions July 2023 update

URL: https://developer.chrome.com/blog/extension-news-july-2023

Read: official update.
Data: offscreen introduced Chrome 109; later reason additions. Does not separately date WEB_RTC.

## MDNS-ICE-DRAFT-1 — mDNS ICE privacy draft

URL: https://datatracker.ietf.org/doc/html/draft-ietf-rtcweb-mdns-ice-candidates-04

Read: abstract, procedure and limitations.
Data: mDNS hostname obfuscation, internal resolution and limited scope. **Expired Internet-Draft**, not normative final RFC or proof of current Chrome behavior.

## CHROME-UI-1 — Add a popup

URL: https://developer.chrome.com/docs/extensions/develop/ui/add-popup

Read: official guide.
Data: popups close on click-away and cannot be held open; not a durable RTC context.

## CHROME-UI-2 — chrome.sidePanel

URL: https://developer.chrome.com/docs/extensions/reference/api/sidePanel

Read: official reference.
Data: Chrome 114+ MV3 visible persistent extension experience; not a process-lifetime guarantee. An alternative considered, not selected.

## NATIVE-1 — Native messaging

URL: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging

Read: full official guide.
Data: registered process over stdin/stdout, nativeMessaging permission, absolute macOS/Linux executable paths and exact allowed extension origins. Real packaging/installation burden.

## WEBRTC-SEC-1 — RFC 8827: WebRTC Security Architecture

URL: https://www.rfc-editor.org/rfc/rfc8827

Read: trust model, DTLS/data channels and security considerations.
Data: data channels use SCTP over DTLS; signaling/fingerprint integrity affects endpoint trust. Encryption is not durable client enrollment.

## TAILSCALE-CONN-1 — Connection types

URL: https://tailscale.com/docs/reference/connection-types

Read: full official page.
Data: direct UDP, DERP and peer-relay paths; all WireGuard-encrypted. Blocked direct UDP can lead to relayed tailnet connectivity; actual accessibility is environment-dependent.

## WEBRTC-2 supplement — Window exposure

Same URL as WEBRTC-2. The consulted specification declares RTCPeerConnection and related interfaces exposed to Window. This supports an extension document rather than a worker global as the RTC owner; feature-detect during the real PoC.

## TAILSCALE-OSI-1 — Tailscale and the OSI model

URL: https://tailscale.com/docs/concepts/tailscale-osi

Read: full official page.
Data: WireGuard virtual network interface; LAN broadcasting/multicasting may behave differently. Not a blanket statement that all multicast is dropped.

## CHROME-ACTION-1 — chrome.action reference

URL: https://developer.chrome.com/docs/extensions/reference/api/action.md.txt

Read: official reference.
Data: action/default_popup is bundled UI; dismissal evidence is separately in CHROME-UI-1.

## CHROMIUM-ICE-READ-1 — unusable reader output

URL: https://chromium.googlesource.com/external/webrtc/+/master/p2p/g3doc/ice.md

Read attempt returned encoded text; not decoded or relied upon. Other normative/reference sources supplied the ICE findings.

## CHROME-ACTION-INDEX-READ-1 — index rather than requested page

URL: https://developer.chrome.com/docs/extensions/reference/api/action

Reader returned a generic API index; not relied upon. The explicit text reference and popup guide supplied evidence.

## CHROME-POLICY-INDEX-READ-1 — generic policy shell

URL: https://chromeenterprise.google/policies/?policy=WebRtcLocalIpsAllowedUrls

Reader returned a generic policy list; not relied upon. Direct policy-specific URLs supplied evidence.

## TAILSCALE-SERVICES-1 — Tailscale Services

URL: https://tailscale.com/docs/features/tailscale-services

Read: full page by Main, including all endpoint types and limitations.
Data: layer-3 `--tun` can carry UDP but only on Linux with extra OS configuration; Services require tagged hosts and administrative definition/approval. Not selected for the macOS host. Serve HTTP/TCP statements in the summary are intentionally scoped to those modes.

## Parent spot-check

Main read OFFSCREEN-1 and TAILSCALE-SERVE-1 to completion as well. Confirmed dynamic forwarding needs a backend; static file/text Serve modes are not an interactive extension peer service.
