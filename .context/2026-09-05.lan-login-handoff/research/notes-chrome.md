---
status: completed
date: 2026-09-05
subject: 2026-09-05.lan-login-handoff
topics: [authentication, sso, chrome]
informs: [../research-auth-compatibility.md]
---

# Research notes: Chrome extension capabilities

## Current assessment

Documented: MV3 can access cookie records, including HttpOnly-marked records, with cookies and host permissions; this does not establish server acceptance (CHROME-2/3/4). Generic device-key/authenticator state is not a cookie; DBSC is site/platform-dependent (CHROME-11/12/13/15). Ordinary MV3 lacks the Chrome Apps TCP listener surface; WebRTC with signaling is a conditional peer route and a native helper is another option, not a universal requirement (CHROME-5/6/7/10/19/20).

## Source findings

### CHROME-1: Current extension manifest baseline

- Source: repo:public/manifest.json
- Evidence: local-file; confidence: high.

- The checked-in extension is Manifest V3 with a module service worker and a toolbar popup.
- Declared API permissions are storage, tabs, and alarms; cookies is not declared.
- Host permissions are currently <all_urls>, and content scripts match HTTP/HTTPS pages. This is a starter capability baseline, not evidence that authentication sync is implemented.

### CHROME-2: Chrome cookies API: permissions, cookie types, and methods

- Source: https://developer.chrome.com/docs/extensions/reference/api/cookies.md.txt
- Evidence: full-text; confidence: high.

- chrome.cookies.remove deletes by name, and chrome.cookies.set can create/overwrite cookies; set supports httpOnly, secure, sameSite, domain, path, expirationDate/session, storeId, and partitionKey.
- set requires host permission for its URL; omitted domain creates host-only cookie, omitted expiration creates a session cookie, and default sameSite is unspecified. Thus merely transferring name/value without scope/security metadata can create a different cookie.
- Cookie changes can emit overwrite/removal then explicit set notifications.
- Parent verified the API overview: querying/modifying cookies requires both the cookies API permission and host permission for each destination.
- Parent verified Cookie exposes value and httpOnly, and API methods default to unpartitioned cookies unless partitionKey is supplied. Cookie-store context and top-level-site partition keys are distinct from simply copying name/value.
- Parent completed the API source through its Events section: get/getAll return Cookie objects including value and httpOnly, and getAll is limited to one cookie store and domains with host permission. This confirms browser API access, not server acceptance of a transplanted session.

### CHROME-3: Chrome Extensions Declare permissions

- Source: https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions.md.txt
- Evidence: full-text; confidence: high.

- Chrome separates manifest permissions, optional permissions, host_permissions, and optional_host_permissions; host permissions allow interaction with matching URL hosts.
- Official examples list fetch from an extension service worker/pages and chrome.cookies access among features requiring host permissions.
- Adding/changing host match patterns can trigger install/update warnings; optional permissions can defer user grant. File and incognito access require separate user enablement.

### CHROME-4: Chrome Extensions Storage and cookies

- Source: https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies.md.txt
- Evidence: full-text; confidence: high.

- Extension storage is shared among the extension service worker, extension pages, and offscreen documents; content scripts' web storage accesses the host page's storage, not extension storage.
- Service workers can use IndexedDB and Cache Storage but not Local Storage or Session Storage directly; offscreen documents are the documented bridge.
- Chrome 115+ storage partitioning changes storage keys. Embedded third-party sites may not see the same storage as top-level navigation; extension embedding uses extension-origin partition behavior.
- Extension pages cannot set Secure cookies because chrome-extension:// is not https; therefore they cannot set SameSite=None or Partitioned cookies on their own extension origin. For third-party origins, host-permission requests can be treated same-site for network requests, but this does not apply to document.cookie and third-party blocking still matters.

### CHROME-5: Chrome Extensions Cross-origin network requests

- Source: https://developer.chrome.com/docs/extensions/develop/concepts/network-requests.md.txt
- Evidence: full-text; confidence: high.

- Extension service workers and foreground extension pages can fetch outside their own origin when host_permissions cover the destination; content scripts remain subject to the web page same-origin policy even when the extension has host permissions.
- Host permissions grant by host and scheme, so HTTP and HTTPS need separate declarations; a broad https://*/ pattern allows HTTPS access to all reachable domains.
- Chrome recommends fetch for service workers; extension network responses and content-script-mediated requests require security controls. Docs prefer HTTPS because hostile-network attackers can alter HTTP responses.

### CHROME-6: Chrome Extensions Native messaging

- Source: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging.md.txt
- Evidence: full-text; confidence: high.

- Native messaging exchanges messages with a registered native application; Chrome starts the host as a separate process and communicates over stdin/stdout.
- A native host requires a host manifest installed on the machine, an absolute path on macOS/Linux, and allowed_origins containing the exact extension origin (wildcards disallowed).
- The extension must declare nativeMessaging; connectNative/sendNativeMessage are available only in extension pages/service workers, not content scripts.
- The docs establish native messaging as a bridge to a native process, but do not state that it is required for every LAN transport; Web APIs such as WebRTC are a separate conditional option.

### CHROME-7: WebRTC: Getting started with peer connections

- Source: https://webrtc.org/getting-started/peer-connections
- Evidence: full-text; confidence: high.

- RTCPeerConnection can carry arbitrary binary data through RTCDataChannel between applications on different computers.
- Signaling is outside the WebRTC specification: peers must exchange SDP offers/answers and ICE candidates through a separate channel, commonly an HTTP API; no specific signaling solution is built in.
- ICE uses STUN/TURN servers and candidate exchange; TURN may relay when direct connectivity is unavailable. After descriptions and candidates are exchanged, peers can reach connected state.

### CHROME-8: MDN RTCDataChannel

- Source: https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel
- Evidence: full-text; confidence: high.

- RTCDataChannel is a bidirectional peer-to-peer network channel for arbitrary data, associated with an RTCPeerConnection; the remote side receives a datachannel event.
- RTCDataChannel is transferable, and its underlying protocol is DTLS/SCTP over UDP or TCP. The API exposes send/message/open/close lifecycle but does not define signaling or an inbound listening socket.
- Actual channel limits and connectivity behavior can vary by browser.

### CHROME-9: Chrome Extensions Extension service worker lifecycle

- Source: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle.md.txt
- Evidence: full-text; confidence: high.

- MV3 extension service workers are installed/activated through extension lifecycle events and are not persistent background pages.
- Chrome normally terminates an extension service worker after 30 seconds inactivity, after a single event/API call exceeds 5 minutes, or after fetch response exceeds 30 seconds; incoming events revive it.
- Global variables are lost on shutdown; docs recommend chrome.storage, IndexedDB, or CacheStorage for persistence. Web Storage API is unavailable in extension service workers.
- A WebSocket connection can extend worker lifetime from Chrome 116; native messaging connection can keep it alive from Chrome 105; these are lifecycle details, not a guarantee of indefinite availability or a listener API.

### CHROME-10: Chrome Apps chrome.sockets.tcpServer API reference

- Source: https://developer.chrome.com/docs/apps/reference/sockets/tcpServer.md.txt
- Evidence: full-text; confidence: high.

- chrome.sockets.tcpServer can create/listen/accept TCP sockets, but the reference is explicitly under "Reference for APIs available to Chrome Apps," not standard Chrome Extensions/MV3.
- Its manifest requirement is the Chrome Apps "sockets" key; it documents app event-page lifecycle and app-owned sockets, not ordinary MV3 extension service workers.
- The modern Chrome Extensions API reference consulted separately lists extension APIs but does not present sockets.tcpServer as a normal MV3 extension API.

### CHROME-11: Device Bound Session Credentials (DBSC)

- Source: https://developer.chrome.com/docs/web-platform/device-bound-session-credentials
- Evidence: full-text; confidence: high.

- Chrome describes DBSC as hardware-backed session security that adds a cryptographic key pair associated with the user's device; Chrome generates it during login and stores the private key in secure hardware when available.
- DBSC sites opt in through Secure-Session-Registration, session registration, and refresh endpoints; Chrome proves private-key possession before refreshing short-lived cookies.
- The documentation says this process links session continuity to the original device, and unsupported secure storage may fall back to standard behavior.

### CHROME-12: Chrome DBSC now available on Windows announcement

- Source: https://developer.chrome.com/blog/dbsc-windows-announcement
- Evidence: full-text; confidence: high.

- As of the 2026-03-03 update, DBSC is available in Chrome 145 on Windows; Chrome on Windows protects DBSC keys in hardware using TPM.
- The site starts DBSC by serving Secure-Session-Registration; a registration endpoint stores the public key and returns session configuration, then a refresh endpoint challenges proof of possession before issuing a fresh cookie.
- The announcement frames DBSC as protecting sessions bound to the original device and says a stolen cookie generally lacks access to the device TPM key.

### CHROME-13: Chrome I/O 2026 web identity update: DBSC status

- Source: https://developer.chrome.com/blog/io26-web-identity
- Evidence: full-text; confidence: high.

- The 2026-05-21 Chrome update calls DBSC experimental and available on Windows, with work underway to expand support to macOS.
- The same update describes DBSC as binding sessions to hardware so a stolen cookie alone cannot request re-issuance on another device.

### CHROME-14: Chrome for Developers Passkeys overview

- Source: https://developer.chrome.com/docs/identity/passkeys
- Evidence: full-text; confidence: high.

- Chrome describes passkeys as a replacement for passwords in which users sign in by unlocking their device; it points to WebAuthn APIs and credential-manager mediated flows.
- The page separates passkeys from ordinary website storage and directs implementation to WebAuthn registration/authentication guides and DevTools credential tooling.

### CHROME-15: Chrome WebAuthn strong authentication guide

- Source: https://developer.chrome.com/docs/identity/webauthn
- Evidence: full-text; confidence: high.

- WebAuthn gives web applications user-agent-mediated access to authenticators for application-scoped (eTLD+1) public-key credentials.
- Registration returns the public key to the website/server; authentication proves possession of the corresponding private key by an authenticator signing a challenge after user consent.
- Authenticators may be platform-integrated or external USB/BLE/NFC devices; the website receives assertions, not a cookie-equivalent secret or private key.

### CHROME-16: Chrome Extensions Manifest incognito behavior

- Source: https://developer.chrome.com/docs/extensions/reference/manifest/incognito.md.txt
- Evidence: full-text; confidence: high.

- Extensions declare incognito behavior as spanning (default), split, or not_allowed. Split mode runs incognito pages/background in a separate incognito process with a separate memory-only cookie store; processes cannot communicate.
- Spanning mode shares one extension process but marks events from incognito tabs; it cannot load extension package pages into the main frame of an incognito tab.
- chrome.storage.sync and chrome.storage.local are shared between regular and incognito processes, unlike cookie stores.

### CHROME-17: Chrome Enterprise ExtensionSettings policy

- Source: https://chromeenterprise.google/policies/extension-settings/
- Evidence: full-text; confidence: high.

- ExtensionSettings can map an extension ID/update URL to management settings and a default '*' config; policy can override legacy extension policies.
- For macOS, force-installing extensions from outside Chrome Web Store requires MDM, MCX domain management, or Chrome Enterprise Core enrollment. The policy applies to platforms supporting extensions.
- Policy-managed installation is distinct from user-loaded extension operation and may constrain deployment across personal/LAN machines.

### CHROME-18: Chrome Enterprise ExtensionInstallForcelist policy

- Source: https://chromeenterprise.google/policies/extension-install-forcelist/
- Evidence: full-text; confidence: high.

- ExtensionInstallForcelist silently installs listed extensions and prevents users from uninstalling or disabling them through Chrome UI; force-installed extensions receive certain implicit permissions such as enterprise.deviceAttributes/platformKeys.
- If the extension is removed from force list, Chrome automatically uninstalls it; policy also notes source code may be altered externally and that the list does not apply to Incognito mode.
- On macOS, force-installing outside-Web-Store extensions requires MDM, MCX domain join, or Chrome Enterprise Core enrollment.

### CHROME-19: Chrome Extensions API reference index

- Source: https://developer.chrome.com/docs/extensions/reference/api.md.txt
- Evidence: full-text; confidence: high.

- The current extension API inventory identifies MV3 support generally from Chrome 88+, with per-API version requirements; the listed standard APIs include cookies, runtime, storage, WebSocket-related lifecycle support, and webAuthenticationProxy, but no chrome.sockets.tcpServer namespace.
- The index describes webAuthenticationProxy as for remote desktop software intercepting WebAuthn requests, which is outside the requested auth-only LAN handoff direction and is not a cookie sync API.
- The inventory includes extension messaging, networking-adjacent APIs, and runtime/storage but no general TCP listener API for ordinary extensions.

### CHROME-20: MDN RTCPeerConnection API reference

- Source: https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection
- Evidence: full-text; confidence: high.

- RTCPeerConnection represents a connection between local and remote peers and provides createOffer/createAnswer, set local/remote descriptions, addIceCandidate, and createDataChannel APIs.
- The API emits icecandidate, datachannel, connectionstatechange, and related events; data channels can carry arbitrary data over the peer connection.
- The API reference does not define a server-side TCP listen/bind API, and browser compatibility/context availability must be checked for the specific extension page or worker context.
