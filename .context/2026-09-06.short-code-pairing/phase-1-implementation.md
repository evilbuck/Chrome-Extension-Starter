---
status: completed
subject: 2026-09-06.short-code-pairing
difficulty: hard
omp_execution: orchestrate
---

# Phase 1: Pairing implementation

## User Goal
Type one short code and confirm a browser pair instead of exchanging descriptors.

## Contract
Follow [the approved plan](plan-short-code-pairing.md), especially its ownership and wire-contract sections. Main has fixed shared types, canonical signature text, endpoint and runtime message names before concurrent broker, offscreen and worker/UI implementation. All agents skip validation until integration.

## Acceptance
- [x] Broker implements unique expiring codes, both confirmations, authenticated reconnect and bounded signaling.
- [x] Offscreen persists identity/pair trust, verifies signed descriptors and gates the current connection.
- [x] Worker and both UI surfaces replace legacy descriptor setup; Slack guards preserved.
- [x] Existing and focused security regressions, type checks, formatter/lint and builds pass under the resolved deterministic contract.

Next: [Phase 2 review](phase-2-review.md). The user authorized continuous orchestration.
