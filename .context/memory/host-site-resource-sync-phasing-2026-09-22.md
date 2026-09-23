---
date: 2026-09-22
domains: [phasing, planning, chrome-extension]
topics: [resource-sync, host-options, phases, backlog, wire-contract]
related: [lan-login-handoff-phasing-2026-09-05.md]
priority: medium
status: completed
subject: 2026-09-22.host-site-resource-sync
artifacts:
  - plan-host-site-resource-sync-phases.md
  - phase-1-resource-wire-contract.md
  - phase-2-resource-site-panel.md
  - phase-3-resource-live-watches.md
  - phase-4-resource-client-apply.md
  - phase-5-resource-e2e-docs.md
---

# Host site resource sync — plan phased

Ran `/skill:b-phase` on `plan-host-site-resource-sync.md` (10 steps, ~15 files, UI + worker + offscreen + envelope layers, credential-on-the-wire risk → exceeds all phase thresholds). No grill-session artifacts existed.

- **5 phases**: 1 wire contract + permission foundation (hard, `/b-build-hard`), 2 host site picker + resource panel (medium), 3 subscriptions + live watches (medium), 4 client apply + inbound lifecycle (hard, `/b-build-hard`), 5 e2e verification + docs (easy).
- **Dependencies**: linear execution order 1→2→3→4→5; strictly Phase 4 hard-depends only on Phase 1 (SOFT on 2/3 — sequenced after 3 to avoid `connection.ts` contention). Phase 4 ∥ Phase 3 flagged as a parallel opportunity with shared-file caveat.
- **From-plan-step mapping**: P1=[1,3], P2=[2], P3=[4,5,6,8-send], P4=[7,8-recv], P5=[9,10].
- **Backlog**: five `phase-*-resource-*.md` items created (slugs disambiguated from the lan-login `phase-N-*` items); only Resources Phase 1 added to the active queue; phases 2–5 under a new "Upcoming resource sync phases" section; parent item updated to point at the overview.
- **Lifecycle**: `subject-lifecycle.ts activate` → `ok: true, code: "applied"`, canonical, revision 2. Note: the script needs the subject path including `.context/` (`.context/2026-09-22.host-site-resource-sync`); a bare folder name resolves outside `.context/` and fails with `invalid-transition`.
- **User goal inherited** by all phases from the parent plan (no per-phase goals; phases are slices of one outcome).
- **Next**: execute Resources Phase 1 via `/b-build-hard`, then the per-phase loop (review → iterate in-plan only → save → commit; one commit per phase).

Session is docs-only (all changes under `.context/`) → deterministic check gate skipped.
