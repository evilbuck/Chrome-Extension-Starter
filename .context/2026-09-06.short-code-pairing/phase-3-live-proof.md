---
status: completed
subject: 2026-09-06.short-code-pairing
difficulty: hard
omp_execution: orchestrate
---

# Phase 3: Hosted runtime proof and closeout

## User Goal
The installed extension pairs through one typed code and confirmation, with the hosted service actually running.

## Contract
Deploy to the approved personal Cloudflare endpoint. Use disposable Chromium profiles only: no real application credentials are needed. Follow [the approved plan](plan-short-code-pairing.md).

## Acceptance
- [x] Real hosted code allocation, invalid/reused/expired/cancelled code behavior exercised.
- [x] Two real extension instances confirm and exchange synthetic data over direct WebRTC.
- [x] No application authorization before confirmation; wrong peer/key and stale attempts fail closed.
- [x] UI closure and extension reload preserve trust; reconnect works without a code; forget revokes authorization.
- [x] Desktop and narrow UI visually observed.
- [x] Quickstart/ADR/changelog, memory/index/backlog and scoped commit record the exact evidence and remaining physical-machine limitation.

Remove disposable profiles and throwaway runtime harness after proof. Never close or modify the user's original browser session.

Results: [runtime/check evidence](pairing-runtime-evidence.json). Disposable profiles, harness and throwaway scripts were removed after the final production-build pairing/echo/forget run.
