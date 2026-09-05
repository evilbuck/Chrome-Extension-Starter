---
status: active
created: 2026-09-05
updated: 2026-09-05
subject: 2026-09-05.lan-login-handoff
memory:
  - lan-login-handoff-implementation-2026-09-05.md
  - lan-login-handoff-planning-2026-09-05.md
  - lan-login-handoff-phasing-2026-09-05.md

---

# Host-controlled authentication across personal computers

The development-PoC plan is saved for a macOS host and Linux client, targeting Outlook on the web, Slack web and authenticated Zoom Web App. Start with extension-only offscreen WebRTC and accepted manual offer/answer setup; consider a host-side companion behind tailnet-only Tailscale Serve only if real connectivity evidence requires it. Application traffic remains direct. Only the feasibility gates are ready to execute: cross-machine application-session handoff and host preservation remain unverified.

Trust scope clarified: the first internal-LAN development PoC skips pairing and assumes trusted clients. Later shipped versions require pairing; after pairing, the client's manual request needs no additional host approval. Initial product connectivity is tailnet/internal LAN only. The draft explicitly records that network reachability alone is not client authentication.

- [Development PoC implementation plan](plan-lan-login-handoff.md)
- [Phased execution overview](plan-lan-login-handoff-phases.md)
- [Phasing verification](phasing-verification.json)
- [Phase 1: Experiment Boundary](phase-1-experiment-boundary.md)
- [Phase 2: Extension-Only Transport Gate](phase-2-extension-transport-gate.md)
- [Phase 3: Application Compatibility Gate](phase-3-application-compatibility-gate.md)
- [Phase 4: Scoped Control Cutover](phase-4-scoped-control-cutover.md)
- [Phase 5: Host Application Preparation](phase-5-host-application-preparation.md)
- [Phase 6: Outlook Completion](phase-6-outlook-completion.md)
- [Phase 7: Slack Completion](phase-7-slack-completion.md)
- [Phase 8: Zoom Web App Completion](phase-8-zoom-completion.md)
- [Phase 9: Integrated Failure Matrix](phase-9-integrated-failure-matrix.md)
- [Phase 10: Demonstrated Cutover](phase-10-demonstrated-cutover.md)
- [Brainstorm draft](brainstorm-lan-login-handoff.md)
- [Authentication compatibility research](research-auth-compatibility.md)
- [Extension-only transport and Tailscale fallback research](research-extension-transport.md)
- [Zoom compatibility research](research-zoom-compatibility.md)
- [Rolling research notes and sources](research/)
- [Interview state](brainstorm-state-lan-login-handoff.json)
- [Session checkpoint](../memory/lan-login-handoff-2026-09-05.md)
- [Planning session checkpoint](../memory/lan-login-handoff-planning-2026-09-05.md)
- [Phasing session checkpoint](../memory/lan-login-handoff-phasing-2026-09-05.md)
