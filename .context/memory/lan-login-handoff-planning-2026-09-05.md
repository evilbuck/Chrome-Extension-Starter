---
date: 2026-09-05
domains: [planning, authentication, networking, research]
topics: [impersonate, chrome-extension, macos-host, linux-client, outlook-web, zoom, webrtc, tailscale]
related:
  - .context/2026-09-05.lan-login-handoff/plan-lan-login-handoff.md
  - .context/2026-09-05.lan-login-handoff/research-extension-transport.md
  - .context/2026-09-05.lan-login-handoff/research-zoom-compatibility.md
  - .context/backlog/todo.md
priority: high
status: completed
subject: 2026-09-05.lan-login-handoff
artifacts:
  - index.md
  - plan-lan-login-handoff.md
  - research-auth-compatibility.md
  - research-extension-transport.md
  - research-zoom-compatibility.md
  - research/notes-extension-transport.md
  - research/sources-extension-transport.md
  - research/notes-zoom-compatibility.md
  - research/sources-zoom-compatibility.md
---

# Development PoC planning checkpoint

## Request and confirmed decisions

The user invoked B-Plan, advancing beyond the prior brainstorm-only instruction. Reused the existing subject and user goal rather than restarting intake.

- Confirmed **macOS host and Linux client**; Microsoft 365 acceptance is **Outlook on the web**. Slack web and Zoom Web App remain required.
- Prefer **extension only**; a companion is acceptable if research establishes the need.
- User reports a **policy-managed firewall** and suggests Tailscale forwarding analogous to OpenSSH. This is peer-channel routing, not website-traffic proxying or permission to alter firewall policy.
- User accepts **manual offer/answer connection setup**. Once connected, client `sync auth` requests need no additional host approval under the development trust exception.
- Preserve application-first cases, host login, direct client website traffic, no continuous sync, development-only no-pairing scope and later shipped pairing.

## Planning outcome

Saved an active plan with architecture, affected files, eight gated implementation steps, ten acceptance criteria, all six app/case observations, failure/lifecycle verification and rollback boundaries. Planning is complete; implementation is not. Recommend b-phase because authentication risk, multiple extension contexts and the unresolved session-completion mechanism make an all-in-one build inappropriate. No phases or autonomous loop were created.

The first candidate uses existing options UI for manual signaling and a bundled offscreen WEB_RTC document as connection owner; the worker coordinates APIs rather than owning RTC. Chrome 116 is the selected API floor for getContexts, not a recommendation to run outdated Chrome. Actual proof uses supported current stable Chrome on both computers.

Ordinary Tailscale Serve TCP/HTTP forwarding needs a local backend. It cannot supply a missing MV3 listener or relay WebRTC directly. If actual ICE/policy/mDNS/routing evidence requires a companion, use a narrowly scoped loopback backend with tailnet-only exposure and preserve existing SSH forwards. Parent checked the layer-3 Services exception: UDP support there is Linux-only and needs extra OS/admin setup, not a drop-in Mac-host solution.

## Evidence and remaining boundary

Two source scouts mapped runtime versus UI/build/test seams. Two external evidence scouts researched transport and Zoom. Initial general-purpose research workers failed before execution with a harness TypeError; the failure was reported and read-only scouts plus parent-owned writes recovered the work. Source notes/ledgers preserve substantive evidence and failed fetches.

Zoom support article bodies were recovered from raw official HTML after reader mode returned only metadata. Zoom SSO is documented; authenticated Web App, portal, guest meeting, native app and API/OAuth surfaces differ. Device limits/session revocation can affect the host. No cross-computer browser-session handoff contract was found in consulted source bodies; no actual tenant compatibility or host preservation is established.

**Only feasibility gates are ready to execute.** Transport success is not application-login success. All three applications and both cases remain required; unsupported findings must not be silently relabeled as a completed feature.

## Verification

- Parent checked full Chrome offscreen and Tailscale Serve/Services documentation and directly parsed Zoom concurrency articleBody.
- Artifact validator passed: 24 Markdown files, 31 relative links, 55 frontmatter pointers and 56 canonical citation definitions; all six app/case scenarios explicitly remain unrun. User goal matches the brainstorm verbatim and its existing sidecar SHA256 still matches. Machine-readable evidence: `.context/2026-09-05.lan-login-handoff/planning-verification.json`.
- Documentation-only changes under `.context/`; no source/config changes, builds, lint, unit tests, real browser authentication, credential access, Tailscale/network mutations, installs or deployment.
- No runtime or authentication success claim. No commit/push was performed; the B-Plan write boundary was limited to `.context/`.

## Backlog and handoff

Registered only two near-term units: real Mac-to-Linux synthetic extension transport, and application handoff/host-preservation compatibility. Did not preallocate production pairing or expand the entire plan into a task queue.

Next: `/skill:b-phase` with the saved plan, front-loading those distinct feasibility gates; use `/b-build-hard` only against a bounded execution unit. Preserve the separate approval boundary for any future live account, credential, provider or network-exposure action.
