---
title: Prove macOS-to-Linux extension-only transport
status: active
priority: high
created: 2026-09-05
updated: 2026-09-05
completed: null
related:
  - .context/2026-09-05.lan-login-handoff/plan-lan-login-handoff.md
  - .context/2026-09-05.lan-login-handoff/research-extension-transport.md
---

# Prove macOS-to-Linux extension-only transport

Use the plan's transport gate before adding application authentication. The user accepts manual offer/answer setup. Keep RTC in a bundled offscreen document, use existing options UI, and test supported Chrome on the real Mac host and Linux client under existing policies.

## Acceptance criteria

- [ ] Manual complete offer/answer exchange establishes a bidirectional non-secret data channel on the actual required private route, or produces an evidence-backed connectivity failure.
- [ ] Popup closure and worker termination/revival do not falsely lose or revive a connection; browser/offscreen loss and explicit disconnect terminate pending work visibly.
- [ ] No external STUN/TURN, public service, firewall/browser-policy weakening, pairing claim or authentication-state access is introduced.
- [ ] If a companion is necessary, record the exact failed direct-path constraint and a bounded loopback/Serve contract before implementation; preserve existing SSH forwarding.
- [ ] Record non-secret outcomes and resolved deterministic checks. Synthetic transport success is not application-authentication success.

Next: phase the active plan, then execute this bounded gate with `/b-build-hard` and scoped review.
