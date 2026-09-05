---
status: in-progress
in_progress_at: 2026-09-05T19:42Z
in_progress_reason: "In-environment build, tests, and bundle inspection are green. Cross-machine UDP gate remains with the user — Phase 1 preflight is `not observed` for both machines and the Tart VM has not been brought up. Evidence captured in phase-2-evidence.md."
phase: 2
order: 2
plan: plan-lan-login-handoff.md
phases_overview: plan-lan-login-handoff-phases.md
difficulty: hard
model_hint: Strongest reasoning model available — multi-context MV3 lifecycle, cross-machine networking and failure-sensitive verification
buck_hint: /b-build-hard
goal: "Prove or reject extension-only offscreen WebRTC between the actual macOS host and Linux client using synthetic, non-secret traffic under existing network policy."
omp_execution: none
files:
  - public/manifest.json
  - public/offscreen.html
  - rsbuild.config.ts
  - src/offscreen/index.ts
  - src/background/index.ts
  - src/background/runtime.ts
  - src/background/connection.ts
  - src/pages/options/index.tsx
  - src/pages/popup/index.tsx
  - src/shared/constants.ts
  - src/shared/types.d.ts
  - __tests__/messaging.test.ts
from_plan_steps: [2]
depends_on: [1]
dependency_type: HARD
acceptance_criteria:
  - "[ ] Built unpacked extensions on the actual macOS host and Linux client complete manual offer/answer exchange and establish one ordered reliable data channel, or an evidence-backed route/policy/ICE failure is recorded."
  - "[ ] A bidirectional synthetic request/response crosses the real two-machine channel; a same-browser mock is not accepted as gate evidence."
  - "[ ] Connection descriptors are versioned, role-bound, connection-ID-bound, expiring and size-limited; candidate gathering completes before export."
  - "[ ] Popup closure and worker termination/revival recover live state from the offscreen context without polling or stale persisted connected state."
  - "[ ] Explicit disconnect and browser/offscreen/network loss terminate pending synthetic work visibly and never auto-reconnect or replay."
  - "[ ] No application auth state, SDP, ICE credentials or full candidate addresses enter logs, source control, Chrome Sync or durable notes."
  - "[ ] If extension-only fails, the exact observed failure and the evidence needed for a companion-specific plan are recorded; no companion is speculatively implemented."
completed_at: null
completed_by: null
memory:
  - lan-login-handoff-implementation-2026-09-05.md
  - lan-login-handoff-planning-2026-09-05.md
  - lan-login-handoff-phasing-2026-09-05.md

---

# Phase 2: Extension-Only Transport Gate

## Context

Inherited user goal (from [plan-lan-login-handoff.md](plan-lan-login-handoff.md)): enable one person to use Microsoft 365, Zoom and Slack web applications from another computer they own on a shared tailnet or internal LAN without repeated lengthy login/logout flows, using either the host's existing Okta authentication or its existing session in the requested application, while the host remains logged in.

This phase front-loads the first decisive engineering risk: whether two Chrome extensions can maintain a direct peer channel across the user's actual macOS-host/Linux-client route under existing policy. It uses only synthetic non-secret data. Passing this phase proves transport and extension lifecycle, not application authentication. Failing it is useful evidence and triggers a separate companion-specific plan; it does not authorize a helper, firewall change, Tailscale reset or public endpoint.

Phase 1 is a HARD dependency because this gate must use the recorded machines, Chrome versions and route category rather than a convenient substitute. Phase 3 can run independently after Phase 1; neither Phase 2 nor Phase 3 waits for the other.

## Implementation Details

1. **Inspect exported-symbol call sites before edits.** Use LSP references for every exported message constant/type/runtime helper changed in `src/shared/constants.ts`, `src/shared/types.d.ts`, `src/background/runtime.ts` and related modules. Preserve the repository's existing `MSG` / `MESSAGE_SPEC` / `MessageMap` convention; do not introduce a parallel messaging framework.

2. **Add the bundled offscreen entry.** Add `public/offscreen.html` and `src/offscreen/index.ts` using the existing Rsbuild page/worker entry patterns. Update `rsbuild.config.ts` so the emitted HTML and script paths exactly match `chrome.runtime.getURL(...)`. Add only Chrome's `offscreen` permission and set the manifest's minimum Chrome version to the Phase 1-observed supported floor (never below the plan's Chrome 116 `runtime.getContexts()` requirement). Use offscreen reason `WEB_RTC`; no capture permission, remote script, external STUN or TURN service.

3. **Make offscreen ownership explicit.** The offscreen document owns the `RTCPeerConnection`, ordered reliable data channel and all live connection state. The service worker creates/checks the context via `runtime.getContexts()`, sends bounded internal messages, and queries current state after revival. Persist only non-secret request/status metadata if needed; never persist a truthy `connected` flag that can outlive the context.

4. **Implement manual signaling in the existing options page.** Add host/client role selection and create/apply descriptor controls. Complete ICE gathering before displaying a descriptor. Validate a versioned descriptor envelope containing role, connection ID, creation/expiry times and SDP only within a strict maximum encoded size. Reject malformed, expired, wrong-role and mismatched-connection descriptors before passing them to WebRTC. Selectable text and paste fields need no clipboard permission. Do not log or save descriptors.

5. **Add the synthetic channel protocol.** One active connection; one ordered reliable data channel. Define a tiny versioned, size-bounded request/response envelope carrying only generated IDs and a fixed non-secret payload. Validate unknown wire input at runtime. Enforce peer role, version, connection ID, request ID, deadline and duplicate handling. This protocol is a transport probe only — it must not contain a generic application-auth payload/blob field.

6. **Expose truthful status.** Options/popup report disconnected, connecting, connected and failed from the offscreen context. Popup dismissal does not tear down a healthy channel. Explicit disconnect closes the peer connection and channel, invalidates pending requests and clears only PoC-created non-secret status. Browser/offscreen loss is terminal and requires explicit manual reconnection; no polling keepalive and no automatic descriptor replay.

7. **Verify in-process lifecycle before cross-machine proof.** Use a focused throwaway harness or existing Vitest conventions only for deterministic message validation/state transitions that defend plausible bugs (malformed envelope, expiry, duplicates, role mismatch). Do not keep same-browser mocks as evidence of the gate itself.

8. **Run the real route experiment.** Build production unpacked output. Load it in supported Chrome on the recorded macOS host and Linux client. Exchange offer/answer descriptors manually using a user-controlled transfer method. Observe bidirectional request/response, then popup closure, worker termination/revival, explicit disconnect, network loss and browser/offscreen loss. Record categories/results only; do not retain raw SDP, candidates or authenticated network captures.

9. **Adjudicate the fallback.** If direct WebRTC fails under existing policy, record the exact failure stage: signaling validation, candidate gathering, candidate resolution/reachability, DTLS/data-channel establishment, browser policy or lifecycle. Confirm it is reproducible on the required route without changing policy. Then stop. Create a separate companion-specific `/b-plan` before any loopback service or Tailscale Serve endpoint is implemented. Preserve existing SSH Serve mappings.

## Risks

- **False positive from same-machine testing.** A local mocked or two-profile channel exercises code, not the actual route. The acceptance gate requires the Mac/Linux pair.
- **Worker-as-owner lifecycle bug.** MV3 workers suspend. Keeping the connection in the worker will create silent disconnects; the offscreen document must own it.
- **Descriptor leakage.** SDP and ICE data include transport credentials and network metadata. They may be rendered transiently for manual exchange but never logged or saved in artifacts.
- **Premature fallback.** A failed data channel does not automatically prove a companion is necessary. Isolate whether the defect is code, browser policy or route before opening a fallback plan.
- **Overgeneralized protocol.** Synthetic transport must not pre-decide the application-auth payload contract that Phase 3 is responsible for discovering.

## Verification

- Run the repository's resolved deterministic check contract after source changes. If no durable contract exists, surface that warning and use the Buck ephemeral lint/test gates; also run `pnpm typecheck` and `pnpm build:prod` because emitted MV3 paths are part of this phase's behavior.
- Inspect the built `manifest.json`, `offscreen.html` and emitted scripts; load that build, not source/dev assumptions, in both browsers.
- Record real two-machine results against every acceptance criterion in a non-secret phase evidence artifact.
- Run `/b-review` against this file; require review of offscreen lifecycle, runtime sender validation, descriptor secrecy, stale-state behavior and cross-machine evidence.

## Per-Phase Execution Loop

If executing this phase inside an OMP execution session:
1. Run `/b-build-hard` for this phase only. (`omp_execution: none` — no keyword or `/goal set` precondition; start a plain first turn.)
2. Run `/b-review` against this phase file.
3. If review creates an `iterate-*.md` artifact (in-plan issues), run `/b-iterate`, then re-run `/b-review`. If review surfaces **out-of-plan issues** (new scope beyond this phase), do not iterate — route them to a separate `/b-plan` → `/b-build` follow-up; they do not block this phase. If `/b-review` flags documentation impact, run `/b-docs` before `/b-save`.
4. Run `/b-save` to consolidate memory, draft commits, and phase state.
5. Run `/b-commit` to checkpoint durable state.
6. If the phase is incomplete, leave `status: in-progress` so the session resumes here next turn.
