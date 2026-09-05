---
status: active
date: 2026-09-05
subject: 2026-09-05.lan-login-handoff
topics: [phasing, chrome-extension, authentication, lan, web-rtc, session-portability]
source_plan: plan-lan-login-handoff.md
phases: 10
format: discrete
---

# Phased Plan: Development-only host-controlled application authentication

> Derived from [plan-lan-login-handoff.md](plan-lan-login-handoff.md)

## Overview

- **Total phases**: 10
- **Rationale**: The plan spans auth-sensitive browser experiments, cross-machine transport, MV3 offscreen/worker/UI lifecycle, three provider-specific implementations and real-device verification across more than fifteen files. Feasibility must precede integration, and each application is a separate vertical slice so one phase remains one-session sized.
- **Estimated total effort**: Ten one-session execution units; real-browser/provider access governs elapsed completion.
- **Difficulty mix**: 1 easy, 2 medium, 7 hard
- **User goal**: Enable one person to use Microsoft 365, Zoom and Slack web applications from another computer they own on a shared tailnet or internal LAN without repeated lengthy login/logout flows, using either the host's existing Okta authentication or its existing session in the requested application, while the host remains logged in.
- **Autonomous execution**: None selected. Use plain phase turns; do not add `orchestrate`, `workflow` or `/goal set` unless the plan is explicitly revised.

## Phase Summary

| Phase | Status | Difficulty | omp_execution | File |
|---|---|---|---|---|
| 1: Experiment Boundary | in-progress | easy | none | [phase-1-experiment-boundary.md](phase-1-experiment-boundary.md) |
| 2: Extension-Only Transport Gate | in-progress | hard | none | [phase-2-extension-transport-gate.md](phase-2-extension-transport-gate.md) |
| 3: Application Compatibility Gate | pending | hard | none | [phase-3-application-compatibility-gate.md](phase-3-application-compatibility-gate.md) |
| 4: Scoped Control Cutover | in-progress | hard | none | [phase-4-scoped-control-cutover.md](phase-4-scoped-control-cutover.md) |
| 5: Host Application Preparation | pending | medium | none | [phase-5-host-application-preparation.md](phase-5-host-application-preparation.md) |
| 6: Outlook Completion | pending | hard | none | [phase-6-outlook-completion.md](phase-6-outlook-completion.md) |
| 7: Slack Completion | pending | hard | none | [phase-7-slack-completion.md](phase-7-slack-completion.md) |
| 8: Zoom Web App Completion | pending | hard | none | [phase-8-zoom-completion.md](phase-8-zoom-completion.md) |
| 9: Integrated Failure Matrix | pending | hard | none | [phase-9-integrated-failure-matrix.md](phase-9-integrated-failure-matrix.md) |
| 10: Demonstrated Cutover | pending | medium | none | [phase-10-demonstrated-cutover.md](phase-10-demonstrated-cutover.md) |

## Dependency Matrix

| From → To | Type | Reason |
|---|---|---|
| Phase 1 → Phase 2 | HARD | Actual machines, Chrome versions and route/policy category must precede transport evidence. |
| Phase 1 → Phase 3 | HARD | Exact surfaces, profiles and authorization boundary must precede auth-sensitive observations. |
| Phase 2 → Phase 4 | HARD | Shared request control builds on the proven offscreen/channel lifecycle. |
| Phase 3 → Phase 4 | HARD | Control payloads and unsupported states must follow concrete compatibility contracts, never a generic auth blob. |
| Phase 3 → Phase 5 | HARD | Host preparation consumes exact application/account verification contracts. |
| Phase 4 → Phase 5 | HARD | Host orchestration needs scoped state, sender trust and invalidation rules. |
| Phases 2–5 → Phase 6 | HARD | Outlook completion needs transport, Outlook evidence, common control and host preparation. |
| Phase 6 → Phase 7 | HARD | Shared manifest/registry/UI integration is serialized; Slack must preserve Outlook behavior. |
| Phase 7 → Phase 8 | HARD | Shared integration is serialized; Zoom must preserve Outlook and Slack behavior. |
| Phases 6–8 → Phase 9 | HARD | The integrated matrix requires all three provider slices. |
| Phase 9 → Phase 10 | HARD | Cleanup, permissions and claims must follow observed integrated results. |

## Dependency Diagram

```text
                      ┌──── Phase 2: Transport ────┐
Phase 1: Boundary ────┤                            ├──→ Phase 4: Control ──→ Phase 5: Host
                      └── Phase 3: Compatibility ─┘                              │
                                                                                 v
Phase 10: Cutover ←── Phase 9: Matrix ←── Phase 8: Zoom ←── Phase 7: Slack ←── Phase 6: Outlook
```

**Legend:**
- `──→` / `←──` = HARD dependency (blocking)
- `- -→` = SOFT dependency (none selected)
- branching = shared prerequisite / convergence

**Dependency details:**
- Phase 1 HARD-precedes both feasibility gates; without an observed environment their results are non-reproducible.
- Phase 2 and Phase 3 are independent after Phase 1. Phase 2 proves only synthetic transport; Phase 3 discovers application completion contracts.
- Phase 4 waits for both gates and is the shared message/manifest/settings/UI integration owner.
- Phase 5 installs common host preparation after contracts and request control exist.
- Phases 6–8 are one provider each. They are serialized because each may update the shared manifest/registry/UI; every later provider re-smokes earlier ones.
- Phase 9 re-runs all six rows on one build and concentrates cross-cutting lifecycle/trust/privacy failures.
- Phase 10 documents and packages only Phase 9's demonstrated result.

## Parallel Opportunities

> Phases with NO dependency between them can be executed in parallel by separate agents.

- **Phase 2 ∥ Phase 3**: synthetic extension transport and application-mechanism investigation are independent after Phase 1.
  - *Rationale*: Phase 2 carries generated non-secret data and owns extension/network lifecycle; Phase 3 is `.context/` compatibility evidence only.
  - *Caveat*: Both share the Phase 1 environment boundary. Real application handoff still waits for transport.
- No later phases are parallel-safe because they share contracts/manifest/UI or depend on integrated evidence.

## Execution Order

1. Complete Phase 1 and verify its acceptance criteria.
2. Complete Phase 2 and Phase 3 in either order (or parallel after Phase 1).
3. If extension-only transport fails, stop this chain and create a companion-specific plan. Do not implement a helper here.
4. If an app contract is unsupported/unresolved, keep it visible. Phase 4 may represent the unsupported state, but its provider phase cannot implement a stub and the parent plan cannot complete.
5. Complete Phases 4–10 sequentially. Update the discrete file and this summary after each phase.

## Execution Workflow

Use this overview as the durable navigation map for an OMP execution session. For each phase:
1. Read the first non-completed phase from the Phase Summary table.
2. Read that discrete phase file and execute only its scope using the listed `buck_hint`.
3. If `omp_execution` is `orchestrate | workflow`, use its first-turn keyword. If it is `goal`, run `/goal set "<plan User Goal>" --budget <omp_goal_budget>` first. This plan currently sets every phase to `none`.
4. Run `/b-review` against the phase file.
5. For an in-plan `iterate-*.md`, run `/b-iterate`, then `/b-review` again. Route out-of-plan findings to a separate `/b-plan` → `/b-build`; they do not block this phase. Run `/b-docs` before `/b-save` when review flags documentation impact.
6. Run `/b-save` so memory, draft commits, phase state and review/iteration artifacts are durable.
7. Run `/b-commit` to checkpoint the phase.
8. If interrupted, leave the phase `status: in-progress`; resume from it and any active iteration artifact.

**Commit invariant**: one phase completion equals one commit. Never batch multiple completed phases into one commit.

## Execution Checklist

- [x] Phase 1: Experiment Boundary — build → review → iterate if in-plan issues → docs if impact → save → commit
- [x] Phase 2: Extension-Only Transport Gate — build-hard → review → iterate → docs → save → commit (cross-machine UDP gate awaiting user)
- [ ] Phase 3: Application Compatibility Gate — build-hard → review → iterate → docs → save → commit
- [x] Phase 4: Scoped Control Cutover — build-hard → review → iterate → docs → save → commit (in-environment complete; two-profile smoke awaits user)
- [ ] Phase 5: Host Application Preparation — build → review → iterate → docs → save → commit
- [ ] Phase 6: Outlook Completion — build-hard → review → iterate → docs → save → commit
- [ ] Phase 7: Slack Completion — build-hard → review → iterate → docs → save → commit
- [ ] Phase 8: Zoom Web App Completion — build-hard → review → iterate → docs → save → commit
- [ ] Phase 9: Integrated Failure Matrix — build-hard → review → iterate → docs → save → commit
- [ ] Phase 10: Demonstrated Cutover — build → review → iterate → docs → save → commit

## Notes

- No autonomous loop is selected. A future `/b-loop` decision must update each relevant phase and this summary table.
- Transport failure records the gate and triggers a separate companion contract; it does not authorize speculative loopback/Tailscale Serve work.
- Phase 3 may complete with honest unsupported/unresolved findings, but those findings keep the affected provider phase and parent feature open.
- The no-pairing mode is development-only; nothing here represents a reachable peer as securely paired or implements shipped pairing/grants/revocation.
