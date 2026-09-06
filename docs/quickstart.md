# Quickstart — Beam me up

Beam me up connects two Chrome profiles through a direct WebRTC data channel. Pairing uses a hosted five-character code and explicit confirmation on both browsers; no offer/answer text needs copying. The current application controller supports the observed Slack Enterprise Grid identity plus one member workspace. Outlook and Zoom transfers are not implemented.

## Before you start

- Use Chrome 116 or newer and separate profiles on browsers you control.
- Both browsers need Internet access to `beam-me-up-pairing.buck-f11.workers.dev` for signaling.
- The data channel still needs direct LAN or tailnet reachability. There is no STUN/TURN server or application-data relay; a code finding the other browser does not prove UDP/mDNS reachability.
- First pairing trusts the hosted rendezvous to introduce public keys. Both confirmations are required, but this is not PAKE or protection against a malicious first-introduction service.
- Slack transfer copies shared credentials. They may authorize more than the selected workspace. Pairing does not replace Slack's separate consent and optional permission approval.

## Load the extension

From a checkout with Node.js LTS and pnpm installed:

```sh
pnpm install
pnpm build:prod
```

On each browser:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and choose this checkout's `dist/` directory.
4. Open **Beam me up → Options**.

Load compiled `dist/`, not `src/`. After rebuilding, reload the unpacked extension in both browsers. Use `pnpm build:watch` while developing, but reload explicitly: MV3 content scripts and service workers do not hot-swap. `pnpm build` is a development build; `pnpm build:prod` is the production build.

## Pair and check the connection

Follow [Pair two Chrome browsers](howto/pair-two-browsers.md). The host generates a two-minute code, the client types it once, and both approve the pending counterpart. **Connected** on both browsers plus a successful **Send echo** is the transport check.

Closing Options or the popup leaves the offscreen connection running. Extension reload closes transport but retains the pinned peer. [Reconnect](howto/reconnect-paired-browsers.md) without a new code; [Disconnect](howto/disconnect-paired-browser.md) keeps trust; [Forget](howto/forget-paired-browser.md) removes it.

## Transfer a Slack session

Use a dedicated receiving profile without an existing Slack session. Do not sign into another Slack session in that profile during a transfer.

1. Select **Host** on the signed-in profile and **Client** on the receiver. On the host, open Slack and complete normal sign-in yourself.
2. On **each** browser, read and check the shared-session consent, click **Enable Slack**, and approve the optional permissions. Installation alone does not request Slack cookie/scripting access.
3. [Pair the profiles](howto/pair-two-browsers.md), or [reconnect](howto/reconnect-paired-browsers.md) if already paired. Both must show **Connected**.
4. On the client, click **Refresh sources**, then select the intended workspace and displayed account ID. Click **Start Slack transfer**.
5. Wait for the result. The extension stages state in a new Slack tab, verifies account/workspace identity, reloads and verifies again, then rechecks the host. **Cancel** invalidates pending work; the request remains busy until cleanup finishes.
6. **Eat:** only **Succeeded** plus **Open transferred Slack tab** is success. Open that tab, check the intended account/workspace, and confirm the host remains signed in. A chooser, landing page or authentication prompt is not success.

A sign-in or device challenge stops transfer rather than being bypassed. No IdP session, message history, drafts or general browser-profile export is included. Other Slack account shapes fail closed; Microsoft 365 and Zoom remain unsupported.

If **Local Slack cleanup could not finish** appears, restore optional Slack permissions and refresh sources to retry cleanup, or clear Slack site data in the dedicated receiving profile. A failed operation is not proof that no local state remains. Only non-secret cleanup metadata is retained in extension session storage; credential bundles are not stored in extension diagnostics.

Cleanup preserves a newer login when ownership no longer matches. Cookie rotation can require manual cleanup; Chrome's cookie APIs do not provide atomic compare-and-delete, so do not sign into Slack concurrently in the receiving profile.

Request display state is currently worker-local. After worker suspension the popup may show **Idle** again while a transferred Slack tab remains signed in. This limitation concerns transfer history, not the separately persisted browser pair.

## Troubleshooting

- **Code expired, rejected or already claimed:** abandon the attempt and generate a fresh code. Do not repeatedly confirm an unexpected browser.
- **Pairing service unavailable:** check Internet access and the exact hosted endpoint. Existing public pair metadata is not itself a live connection.
- **Discovery succeeds but connection fails:** inspect `chrome://webrtc-internals`, direct UDP reachability, Chrome WebRTC policy, host firewall rules and mDNS across the LAN/tailnet. No relay fallback is configured.
- **Remembered peer cannot reconnect:** open Beam me up and choose **Connect to paired browser** on both profiles. If one profile forgot the pair, forget the stale record on the other and pair again.
- **Forget reports a failure:** local authorization closes immediately, but successful durable cleanup/server revocation must not be assumed. Restore connectivity and resolve the visible error before relying on revocation.
- **No offscreen document:** verify Chrome 116+, the current unpacked build and the extension's offscreen permission. Inspect the extension service worker for errors; do not paste SDP or credentials into logs or issue reports.

For physical-machine verification, record Chrome versions, actual LAN/tailnet route, candidate type (not full addresses), echo outcome, UI-close/reconnect behavior and visible network-loss behavior. Two profiles on one machine do not prove a Mac/Linux firewall or mDNS path.

## Removing the extension

Remove Beam me up from `chrome://extensions`. This closes transport but does **not** sign out an already transferred Slack session. Clear Slack site data in the receiving profile if needed. Shared cookies can cover multiple workspaces; do not clear host site data unless you intend to sign it out.

## Maintainer references

- [Pairing how-tos and deployment](howto/README.md)
- [Hosted rendezvous decision](adr/0002-hosted-pairing-rendezvous.md)
- [Physical-network verification limits](adr/0001-extension-only-transport.md)

Checks: `pnpm test`, `pnpm typecheck`, `pnpm exec biome check src __tests__ services/pairing`, `pnpm --filter beam-me-up-pairing test`, and `pnpm --filter beam-me-up-pairing typecheck`. The service typecheck generates its binding types. No durable `guardrails.json` currently exists; `/b-init-guardrails` can establish coverage and complexity baselines.