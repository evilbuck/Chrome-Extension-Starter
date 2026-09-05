---
status: active
---

# Session memory index

- [2026-09-05 — Implementation: Phase 2 transport, Phase 3 evidence, Phase 4 control plane](lan-login-handoff-implementation-2026-09-05.md): shipped 119/119 tests passing; `dist/manifest.json` permissions reduced to `['storage', 'tabs', 'offscreen']`; request state machine, machine-local storage, and two-profile smoke documented. All six Phase 3 compatibility verdicts recorded as `unresolved` (no invented cookie names); Phases 2 and 4 acceptance rows honestly labeled; Phase 4 evidence declares the two-profile smoke the user can run on this Mac without a second machine. Live-browser and Tart VM cross-machine observations remain with the user.

- [2026-09-05 — Development PoC phasing](lan-login-handoff-phasing-2026-09-05.md): split the auth-sensitive plan into ten one-session contracts. Phase 1 records the experiment boundary; Phases 2 and 3 are independent transport and compatibility gates; Phases 4–10 form the common-control, per-application, integrated-matrix and demonstrated-cutover chain. No autonomous OMP loop selected; only Phase 1 is active in backlog.

- [2026-09-05 — Development PoC planning](lan-login-handoff-planning-2026-09-05.md): macOS host → Linux client; Outlook web, Slack web and Zoom Web App. Extension-only offscreen WebRTC first, manual offer/answer accepted; companion + Tailscale Serve only after a demonstrated connectivity need. Application handoff and host preservation remain feasibility gates. Plan and two near-term backlog units saved; no implementation.

- [2026-09-05 — Host–client authentication workflow iteration](lan-login-handoff-2026-09-05.md): application-first workflow; internal-LAN development PoC skips pairing, while shipped versions require pairing and trust clients thereafter without per-request host approval. Initial connectivity is tailnet/internal LAN. Zoom remains unresearched; session portability, host preservation, and fewer false positives remain unverified.