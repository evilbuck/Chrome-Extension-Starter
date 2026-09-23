---
status: active
date: 2026-09-22
subject: 2026-09-22.host-site-resource-sync
topics: [phasing, options-page, cookies, localStorage, live-sync, host-client, webrtc]
source_plan: plan-host-site-resource-sync.md
phases: 5
format: discrete
memory: [host-site-resource-sync-phase-1-2026-09-22.md, host-site-resource-sync-phase-2-2026-09-22.md, host-site-resource-sync-phase-3-2026-09-22.md, host-site-resource-sync-iterate-2026-09-22.md, host-site-resource-sync-phase-4-2026-09-23.md]
---

# Phased Plan: Host options site resource sync

> Derived from [plan-host-site-resource-sync.md](plan-host-site-resource-sync.md)

## Overview

- **Total phases**: 5
- **Rationale**: 10 implementation steps across ~15 files spanning options UI, background worker, offscreen forwarding, and the envelope/transport layer, with a credential-on-the-wire path — beyond one session's safe scope.
- **Estimated total effort**: 5 build sessions, one per phase, each closing its own build → review → save → commit cycle.
- **Difficulty mix**: 2 hard (wire contract, client apply), 2 medium (site panel, live watches), 1 easy (e2e verification + docs).

## Phase Summary

| Phase | Status | Difficulty | omp_execution | File |
|-------|--------|------------|---------------|------|
| 1: Wire contract and permission foundation | completed | hard | none | [phase-1-resource-wire-contract.md](phase-1-resource-wire-contract.md) |
| 2: Host site picker and resource panel | completed | medium | none | [phase-2-resource-site-panel.md](phase-2-resource-site-panel.md) |
| 3: Subscriptions and live watches | completed | medium | none | [phase-3-resource-live-watches.md](phase-3-resource-live-watches.md) |
| 4: Client apply and inbound lifecycle | completed | hard | none | [phase-4-resource-client-apply.md](phase-4-resource-client-apply.md) |
| 5: End-to-end verification and docs | completed | easy | none | [phase-5-resource-e2e-docs.md](phase-5-resource-e2e-docs.md) |

## Dependency Matrix

| From → To | Type | Reason |
|-----------|------|--------|
| Phase 1 → Phase 2 | HARD | Panel needs the `RESOURCE_*` MSG kinds, permission-object builder, and origin filter from Phase 1 |
| Phase 2 → Phase 3 | HARD | Subscriptions wire into Phase 2's checkboxes and extend the same worker module (`resources.ts`, `site-panel.tsx`) |
| Phase 1 → Phase 4 | HARD | Client apply consumes the envelope kinds and strict parse from Phase 1 |
| Phase 3 → Phase 4 | SOFT | Phase 4's unit tests synthesize inbound frames; only full end-to-end behavior needs Phase 3's send side |
| Phase 2 → Phase 4 | SOFT | Both edit `src/background/connection.ts` (options commands vs. inbound apply routing) — distinct handlers, same file |
| Phase 4 → Phase 5 | HARD | The two-profile smoke exercises the complete loop; docs describe applied behavior |
| Phases 1–4 → Phase 5 | HARD | E2e verification requires every code phase complete |

## Dependency Diagram

```
Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4 ──→ Phase 5
```

Execution order is the linear chain. Strictly, Phase 4 hard-depends only on Phase 1 (see matrix); it is sequenced after Phase 3 to avoid `connection.ts` contention and to let its manual signal use the real send side.

**Legend:**
- `──→` = HARD dependency (blocking)
- `- -→` = SOFT dependency (can stub/mock) — see matrix rows

**Dependency details:**
- Phase 2 HARD-depends on Phase 1: constants, identities, permission shape, envelope kinds.
- Phase 3 HARD-depends on Phase 2: same files extended (worker module, panel).
- Phase 4 HARD-depends on Phase 1 (envelope contract); SOFT on Phase 2 (shared `connection.ts`) and Phase 3 (e2e only).
- Phase 5 HARD-depends on all code phases.

## Parallel Opportunities

> Phases with NO dependency between them can be executed in parallel by separate agents.

- **Phase 4 ∥ Phase 3**: Phase 4 needs only Phase 1's contract; its tests synthesize inbound frames.
  - *Rationale*: send side (Phase 3) and receive side (Phase 4) touch different behavior in the same worker module.
  - *Caveat*: both edit `src/background/apps/resources.ts` and `src/background/connection.ts` — parallel agents must coordinate merges on those two files; sequential execution avoids the coordination cost for marginal gain.

## Execution Order

1. Complete Phase 1, verify acceptance criteria
2. Update phase file: `status: completed`, check acceptance criteria
3. Update this overview: change status to `completed` in summary table
4. Queue Phase 2, repeat...

## Execution Workflow

Use this overview as the durable navigation map for an OMP execution session. For each phase:
1. Read the first non-completed phase from the Phase Summary table.
2. Read that discrete phase file and execute only its scope using the listed `buck_hint`.
3. Run `/b-review` against the phase file after implementation.
4. If review creates an `iterate-*.md` artifact (in-plan issues), run `/b-iterate`, then re-run `/b-review`. If review surfaces **out-of-plan issues** (new scope beyond this phase), do not iterate — route them to a separate `/b-plan` → `/b-build` follow-up; they do not block this phase. If `/b-review` flags documentation impact, run `/b-docs` before `/b-save`.
5. Run `/b-save` so memory, draft commits, phase state, and review/iteration artifacts are durable.
6. Run `/b-commit` to checkpoint durable state.
7. If interrupted mid-cycle, leave the phase file `status: in-progress`; the session resumes from that phase and any active `iterate-*.md` artifact.

**Commit invariant**: one phase completion equals one commit. Do not batch multiple completed phases into a single commit; run `/b-save` → `/b-commit` after each phase, before queueing the next.

## Notes

- The source plan's OMP opt-in comment (goal mode, ~50k budget) applied to the *unphased* path. With phasing, per-phase standard Buck cycles are the default (sum of per-phase budget hints: 16k + 8k + 8k + 16k + 4k ≈ 50k, consistent with the plan). If the user later prefers one persistent objective across all phases, `/goal set` with ~50k remains a valid alternative.
- Teleport is not a Slack/Claude controller: the resource sync must not reuse `REQUEST_START` or the Slack state machine (source plan, reiterated).
- Do not edit `src/background/apps/slack.ts` in any phase except to move a shared helper; prefer new modules.

## Execution Checklist

- [x] Phase 1: Wire contract and permission foundation — build → review → iterate if in-plan issues → docs if doc impact → save → commit
- [x] Phase 2: Host site picker and resource panel — build → review → iterate if in-plan issues → docs if doc impact → save → commit
- [x] Phase 3: Subscriptions and live watches — build → review → iterate if in-plan issues → docs if doc impact → save → commit
- [x] Phase 4: Client apply and inbound lifecycle — build → review → iterate if in-plan issues → docs if doc impact → save → commit
- [x] Phase 5: End-to-end verification and docs — build → review → iterate if in-plan issues → docs if doc impact → save → commit
