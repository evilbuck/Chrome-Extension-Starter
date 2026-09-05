---
status: completed
date: 2026-09-05
subject: 2026-09-05.lan-login-handoff
topics: [authentication, sso, chrome]
informs: [../research-auth-compatibility.md]
---

# Sources: Chrome extension capabilities

## CHROME-1: Current extension manifest baseline

- URL: repo:public/manifest.json
- Source type: Local repository source
- Accessed: 2026-09-05
- Evidence: local-file
- Confidence: high

> "manifest_version": 3

> "permissions": ["storage", "tabs", "alarms"]

## CHROME-2: Chrome cookies API: permissions, cookie types, and methods

- URL: https://developer.chrome.com/docs/extensions/reference/api/cookies.md.txt
- Source type: Official Chrome API documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> Sets a cookie with the given cookie data; may overwrite equivalent cookies if they exist.

> If host permissions for this URL are not specified in the manifest file, the API call will fail.

> If omitted, the cookie becomes a session cookie.

## CHROME-3: Chrome Extensions Declare permissions

- URL: https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions.md.txt
- Source type: Official Chrome extension documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> Host permissions allow extensions to interact with the URL's matching patterns.

> Make fetch() requests from the extension service worker and extension pages.

> Access cookies with the chrome.cookies API.

## CHROME-4: Chrome Extensions Storage and cookies

- URL: https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies.md.txt
- Source type: Official Chrome extension documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> Extension storage is shared across the extension's origin including the extension service worker, any extension pages ... and offscreen documents.

> Starting in Chrome 115, storage partitioning introduces changes to how partitioning keys are defined.

> Note that this only applies to network requests, not access through document.cookie ...

## CHROME-5: Chrome Extensions Cross-origin network requests

- URL: https://developer.chrome.com/docs/extensions/develop/concepts/network-requests.md.txt
- Source type: Official Chrome extension documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> Extension origins aren't so limited ... as long as the extension requests host permissions.

> A match pattern of "https://*/" allows HTTPS access to all reachable domains.

> If your extension is used on a hostile network, a network attacker ... could modify the response and, potentially, attack your extension.

## CHROME-6: Chrome Extensions Native messaging

- URL: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging.md.txt
- Source type: Official Chrome extension documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> Chrome starts the host in a separate process and communicates with it using standard input and standard output streams.

> To use these methods, the "nativeMessaging" permission must be declared in your extensions's manifest file.

> These methods are not available inside content scripts, only inside your extension's pages and service worker.

## CHROME-7: WebRTC: Getting started with peer connections

- URL: https://webrtc.org/getting-started/peer-connections
- Source type: Official WebRTC project documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> The communication between peers can be video, audio or arbitrary binary data (for clients supporting the RTCDataChannel API).

> the signaling component is not part of it.

> Once the two peers have set both the local and remote session descriptions ... [they] need to collect the ICE candidates at each peer and transfer ... to the other peer.

## CHROME-8: MDN RTCDataChannel

- URL: https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel
- Source type: MDN Web API reference
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> The RTCDataChannel interface represents a network channel which can be used for bidirectional peer-to-peer transfers of arbitrary data.

> To create a data channel and ask a remote peer to join you, call ... createDataChannel().

> RTCDataChannel is a transferable object.

## CHROME-9: Chrome Extensions Extension service worker lifecycle

- URL: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle.md.txt
- Source type: Official Chrome extension documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> Normally, Chrome terminates a service worker ... after 30 seconds of inactivity.

> Any global variables you set will be lost if the service worker shuts down.

> Active WebSocket connections now extend extension service worker lifetimes.

## CHROME-10: Chrome Apps chrome.sockets.tcpServer API reference

- URL: https://developer.chrome.com/docs/apps/reference/sockets/tcpServer.md.txt
- Source type: Official Chrome Apps API documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> Reference for APIs available to Chrome Apps.

> Use the chrome.sockets.tcpServer API to create server applications using TCP connections.

> The following keys must be declared in the manifest to use this API. "sockets"

## CHROME-11: Device Bound Session Credentials (DBSC)

- URL: https://developer.chrome.com/docs/web-platform/device-bound-session-credentials
- Source type: Chrome for Developers documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> “This process links session continuity to the original device.”

> “When one of these cookies expires, Chrome proves possession of the private key before refreshing them.”

> “Modify your login flow to include a `Secure-Session-Registration` header.”

## CHROME-12: Chrome DBSC now available on Windows announcement

- URL: https://developer.chrome.com/blog/dbsc-windows-announcement
- Source type: Official Chrome blog
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> DBSC are now available in Chrome 145 on Windows.

> Chrome on Windows protects these keys in hardware using the Trusted Platform Module (TPM).

> If ... an attacker is trying to use a stolen cookie on a different device without access to the TPM, [the server can] deny the request.

## CHROME-13: Chrome I/O 2026 web identity update: DBSC status

- URL: https://developer.chrome.com/blog/io26-web-identity
- Source type: Official Chrome blog
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> DBSC is an experimental feature, now available on Windows.

> We are also working on expanding DBSC support to macOS.

> even if a cookie is stolen, only the same device can request a re-issue of the cookie

## CHROME-14: Chrome for Developers Passkeys overview

- URL: https://developer.chrome.com/docs/identity/passkeys
- Source type: Official Chrome identity documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> Passkeys are an easier and more secure replacement for passwords, enabling users to sign in to their account by unlocking their device screen.

> Add passkeys to your web app.

> Manage passkeys

## CHROME-15: Chrome WebAuthn strong authentication guide

- URL: https://developer.chrome.com/docs/identity/webauthn
- Source type: Official Chrome identity documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> WebAuthn ... [provides] access to authenticators ... for ... application-scoped ... public-key credentials.

> Authenticate to a website by proving possession of the corresponding private key.

> The relying party ... stores the public key ... for future authentications.

## CHROME-16: Chrome Extensions Manifest incognito behavior

- URL: https://developer.chrome.com/docs/extensions/reference/manifest/incognito.md.txt
- Source type: Official Chrome extension documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> This incognito process runs alongside the regular process, but has a separate memory-only cookie store.

> The processes are unable to communicate with each other.

> chrome.storage.sync and chrome.storage.local are always shared between regular and incognito processes.

## CHROME-17: Chrome Enterprise ExtensionSettings policy

- URL: https://chromeenterprise.google/policies/extension-settings/
- Source type: Official Chrome Enterprise policy documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> On macOS instances, apps and extensions from outside the Chrome Web Store can only be force installed if the instance is managed via MDM ... or enrolled in Chrome Enterprise Core.

> This policy only applies to platforms that support extensions.

## CHROME-18: Chrome Enterprise ExtensionInstallForcelist policy

- URL: https://chromeenterprise.google/policies/extension-install-forcelist/
- Source type: Official Chrome Enterprise policy documentation
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> install silently, without user interaction, and ... users can't uninstall or turn off them through the Google Chrome interface.

> If a previously force-installed app or extension is removed from this list, Google Chrome automatically uninstalls it.

> Note: This policy doesn't apply to Incognito mode.

## CHROME-19: Chrome Extensions API reference index

- URL: https://developer.chrome.com/docs/extensions/reference/api.md.txt
- Source type: Official Chrome Extensions API reference
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> Manifest V3 is supported generally in Chrome 88 or later.

> The chrome.cookies API ... query and modify cookies.

> The chrome.webAuthenticationProxy API lets remote desktop software ... intercept Web Authentication API (WebAuthn) requests ...

## CHROME-20: MDN RTCPeerConnection API reference

- URL: https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection
- Source type: MDN Web API reference
- Accessed: 2026-09-05
- Evidence: full-text
- Confidence: high

> The RTCPeerConnection interface represents a WebRTC connection between a local computer and a remote peer.

> createDataChannel() ... [creates] a new channel linked with the remote peer, over which any kind of data may be transmitted.

> createOffer() ... [creates] an SDP offer ... [to be] sent over the signaling channel to a potential peer.
