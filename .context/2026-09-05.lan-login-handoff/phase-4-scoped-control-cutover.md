---
status: in-progress
in_progress_at: 2026-09-05T20:05Z
in_progress_reason: "Starter demo removed (CHANGE_BG, alarms, sync-backed Settings, content scripts). Request state machine + machine-local storage wired. 119/119 tests pass; build clean. Two-profile smoke awaiting user. Phases 5–8 remain gated on Phase 3 verdicts leaving `unresolved`."
phase: 4
order: 4
plan: plan-lan-login-handoff.md
phases_overview: plan-lan-login-handoff-phases.md
difficulty: hard
model_hint: Strongest reasoning model available — shared trust boundary, typed/runtime contracts and broad starter cutover
buck_hint: /b-build-hard
goal: "Replace the starter demo contract with scoped, runtime-validated host/client request control while preserving the proven transport and avoiding any generic auth payload."
omp_execution: none
files:
  - public/manifest.json
  - rsbuild.config.ts
  - src/background/index.ts
  - src/background/runtime.ts
  - src/background/connection.ts
  - src/background/sync.ts
  - src/background/alarms.ts
  - src/content/index.tsx
  - src/content/bridge.ts
  - src/shared/constants.ts
  - src/shared/types.d.ts
  - src/shared/config.ts
  - src/shared/lib/messaging.ts
  - src/shared/lib/setting.ts
  - src/shared/lib/storage.ts
  - src/shared/lib/error.ts
  - src/pages/options/index.tsx
  - src/pages/popup/index.tsx
  - __tests__/messaging.test.ts
  - __tests__/setting.test.ts
from_plan_steps: [4]
depends_on: [2, 3]
dependency_type: HARD
acceptance_criteria:
  - "[ ] The starter color/counter/CHANGE_BG contract and demo alarms are removed from every caller, test and build/manifest path they obsolete."
  - "[ ] Internal and peer message contracts are versioned, runtime-validated, size/deadline bounded and sender/context checked; matching sender.id alone is not treated as privileged."
  - "[ ] One active request records request/connection/application/scope/original-tab/allowed-return-origin and exposes every parent-plan lifecycle outcome without silent retry."
  - "[ ] Host/client role and non-secret machine configuration use machine-local storage rather than Chrome Sync; storage failure is visible before saved state is reported."
  - "[ ] No generic credential/blob payload, app permission, cookies permission or speculative application controller is introduced."
  - "[ ] Cancel, duplicate, expiry, navigation/scope change and disconnect invalidate later results and cause no application action."
  - "[ ] Existing unrelated reusable utilities and valid migration behavior remain intact."
completed_at: null
completed_by: null
memory:
  - lan-login-handoff-implementation-2026-09-05.md
  - lan-login-handoff-planning-2026-09-05.md
  - lan-login-handoff-phasing-2026-09-05.md

---

# Phase 4: Scoped Control Cutover

## Context

Inherited user goal (from [plan-lan-login-handoff.md](plan-lan-login-handoff.md)): enable one person to use Microsoft 365, Zoom and Slack web applications from another computer they own on a shared tailnet or internal LAN without repeated lengthy login/logout flows, using either the host's existing Okta authentication or its existing session in the requested application, while the host remains logged in.

Phases 2 and 3 are HARD dependencies. The proven transport defines the real lifecycle boundary; the compatibility gate defines which application data contracts may exist. This phase installs the common request/trust/state machine and removes starter behavior, but deliberately stops before host preparation or client application completion. It is the integration-owner phase for shared files; later app-specific work consumes this contract instead of editing around it.

## Implementation Details

1. **Map all exported-symbol callers first.** Use LSP references for `MSG`, `MESSAGE_SPEC`, `MessageMap`, settings exports, storage helpers, background runtime exports and any demo constants slated for removal. Cleanly migrate every caller/test; no aliases, deprecated message names or duplicate contract modules remain.

2. **Replace starter messaging.** Remove `CHANGE_BG` and the color/counter demo actions. Extend the existing message-map pattern with explicit internal operations for transport status, role/config, connect/disconnect, start/cancel/status request and offscreen coordination. Runtime validators must handle unknown input before any cast. Separate trusted extension page/offscreen senders from content-script/external contexts using sender URL/origin/context as available; `sender.id === chrome.runtime.id` is necessary but insufficient.

3. **Define the peer control envelope.** Version, type, connection ID, request ID, role, creation/deadline and bounded payload discriminator. Reject malformed, wrong-role, expired, duplicate, mismatched-connection and oversized messages without navigation or application action. Application-specific payloads are discriminated narrow contracts from Phase 3; if no contract is supported, keep that application visibly unsupported — never add `unknown`, `any`, base64 credential or generic blob escape hatches.

4. **Implement one-request state.** Centralize the state progression from the plan: `idle → checking_host → preparing_host → completing_client → verifying → succeeded`, with `waiting_for_user` and all terminal non-success outcomes. Record request ID, connection ID, exact application key, intended account/workspace/tenant alias, original client tab ID/URL and allowed return origin. One request deadline pauses only for explicit human interaction; transport timeout is separate and bounded.

5. **Enforce invalidation.** Cancel, client-tab navigation, account/scope change, connection loss, expiry and browser/offscreen loss invalidate any later callback/result. Duplicate requests do not restart work. Cancellation reports provider action already completed if applicable; it never performs broad logout as rollback. No automatic replay after worker revival or reconnect.

6. **Move configuration out of sync.** Host/client role, exact app/account scope and connection metadata are machine-local non-secret configuration. Do not use the starter's sync-backed setting path. Report saved state only after storage success. Preserve migration machinery only where it still has a live purpose; remove demo migrations/callers that no longer do.

7. **Replace options/popup demo UI with truthful common control.** Options retains role/manual signaling/disconnect/non-secret status from Phase 2 and adds exact supported application/account scope configuration. Popup adds explicit `sync auth`, cancel and current outcome. Disable start for disconnected, ambiguous/unsupported scope, wrong tab/origin or an already active request. Closing the popup leaves connection/request ownership with offscreen/worker state.

8. **Remove obsolete starter runtime/build wiring.** Delete demo alarms rather than converting them to background sync. Remove color overlay and bridge/build/manifest entries if no Phase 3 contract requires narrowly scoped content scripting. Remove source files only after every caller/build entry is migrated. Do not add application origin host permissions or `cookies` yet; those belong to Phase 6 and only when a supported concrete contract requires them.

9. **Protect observable invariants.** Update existing tests and add only behavioral tests that catch plausible regressions: sender trust, malformed/oversized envelope rejection, duplicate/expiry behavior, state invalidation, local-not-sync role isolation and visible storage failure. Do not assert source text, mere field forwarding or mock echoes.

## Risks

- **Broad shared-file blast radius.** This phase touches the message/schema/settings spine and starter removal. One integrator owns these files; do not run overlapping app-controller edits concurrently.
- **Type safety without runtime safety.** Peer data is untrusted. TypeScript types alone are not validation.
- **Stale async completion.** Provider/browser callbacks can resolve after cancel or navigation. Every completion path must recheck request, tab, account scope and deadline.
- **Premature permissions.** Adding broad host/cookies grants here would decouple permissions from the evidence that justifies them.
- **Accidental auto-sync.** Demo alarms must be removed, not repurposed; the product contract is explicit manual sync only.

## Verification

- Run the resolved deterministic check contract, `pnpm typecheck` and `pnpm build:prod`.
- Smoke the built extension: configure distinct local roles in two profiles; confirm they do not sync; connect synthetic transport; start/cancel an unsupported/no-controller request and observe explicit outcomes; close/reopen popup; terminate/revive worker; navigate the original tab and confirm stale completion is refused.
- Inspect built manifest/build output to confirm obsolete content/overlay/demo wiring is gone unless an evidence-backed narrow contract explicitly retained it.
- Run `/b-review` against this phase, focusing on runtime sender checks, all invalidation paths, storage failure truthfulness and absence of speculative auth payloads/permissions.

## Per-Phase Execution Loop

If executing this phase inside an OMP execution session:
1. Run `/b-build-hard` for this phase only. (`omp_execution: none` — no keyword or `/goal set` precondition; start a plain first turn.)
2. Run `/b-review` against this phase file.
3. If review creates an `iterate-*.md` artifact (in-plan issues), run `/b-iterate`, then re-run `/b-review`. If review surfaces **out-of-plan issues** (new scope beyond this phase), do not iterate — route them to a separate `/b-plan` → `/b-build` follow-up; they do not block this phase. If `/b-review` flags documentation impact, run `/b-docs` before `/b-save`.
4. Run `/b-save` to consolidate memory, draft commits, and phase state.
5. Run `/b-commit` to checkpoint durable state.
6. If the phase is incomplete, leave `status: in-progress` so the session resumes here next turn.
