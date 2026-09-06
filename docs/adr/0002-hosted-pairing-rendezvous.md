# ADR 0002: Hosted rendezvous, direct application transport

Accepted 2026-09-06. The user selected a hosted service to replace repeated offer/answer copying with one five-character code. A Cloudflare Worker with SQLite Durable Objects allocates short-lived invitations and coordinates explicit confirmation on both browsers. This supersedes only ADR 0001's prohibition on hosted signaling; its direct-network and physical-machine verification limits remain.

## Trust boundary

The code is a two-minute, single-use lookup, not authentication by itself. Both participants approve the exact pending counterpart. First pairing trusts the rendezvous to introduce the correct public keys: this is not PAKE and does not resist a malicious bootstrap service substituting keys.

Each Chrome profile retains a non-extractable P-256 signing key in IndexedDB. Confirmed peer metadata is stored in `chrome.storage.local`. Offscreen documents have only the Chrome runtime API, so a sender-checked worker message handles storage; the private key never crosses that message boundary. Reconnect signs fresh, room- and role-bound SDP and verifies the pinned peer before authorizing application traffic.

## Consequences

- One remembered peer and fixed role per profile. Disconnect retains trust; Forget immediately closes local transport and clears local trust. Authenticated server revocation prevents the old pair reconnecting. The other browser may still display its old local record until it also forgets it.
- The service handles codes, public identity/approval metadata, short-lived ticket hashes and proof nonces. SDP is relayed in memory, not persisted or logged. Slack session data continues over the direct WebRTC channel and is never sent to the rendezvous.
- Internet access is required for signaling. Losing signaling closes the current connection. No STUN/TURN or application-data relay was added; successful discovery does not prove LAN/tailnet UDP or mDNS reachability.
- Each code has an atomic reservation object; each pair has its own room object and hibernating sockets. Deadline checks enforce expiry at authorization transitions, independently of delayed cleanup alarms. One offer and answer per connection epoch are admitted.
- Request limits are per IP and Cloudflare location, not a globally exact counter. Shared egress can therefore affect multiple browsers.
- Existing Slack consent, optional permissions and account/workspace verification remain separate from pairing.

User and maintainer procedures: [how-to index](../howto/README.md).