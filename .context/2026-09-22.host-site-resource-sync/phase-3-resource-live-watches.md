---
status: pending
phase: 3
order: 3
plan: plan-host-site-resource-sync.md
phases_overview: plan-host-site-resource-sync-phases.md
difficulty: medium
model_hint: capable general model preferred
buck_hint: /b-build
goal: "Checking an item persists a subscription and pushes the current value; host-side cookie and localStorage changes keep pushing while checked; unchecking stops pushes without deleting client copies."
files:
  - src/background/apps/resources.ts
  - src/pages/resources/site-panel.tsx
  - src/shared/types.d.ts
  - public/_locales/en/messages.json
  - __tests__/resource-sync.test.ts
from_plan_steps: [4, 5, 6, 8]
depends_on: [2]
dependency_type: HARD
acceptance_criteria:
  - "[ ] `StorageSchema.local` gains the subscription record (identities only, never values); subscriptions survive worker revival and re-arm their listeners/polls."
  - "[ ] Checking an item persists the identity, snapshots the current value, and sends one `resource_upsert` per item over the authorized channel; cookies carry the full field set from the wire contract."
  - "[ ] Unchecking removes the identity only — no further pushes, and no delete/remove frame of any kind."
  - "[ ] `chrome.cookies.onChanged` filtered to subscribed identities: `overwrite`/`explicit` sets push the updated value; a host-side removal neither unsubscribes nor sends a delete (next set upserts again)."
  - "[ ] While a same-origin non-incognito host tab exists, subscribed localStorage keys are polled via `executeScript` `localStorage.getItem` and upserted on value change; when the last same-origin host tab closes, items are marked `paused` (stay checked, polling stops); a later same-origin tab resumes polling and pushes current values; a completed load triggers a rescan."
  - "[ ] `RESOURCE_STATUS` returns subscriptions plus paused/error state per item, shown in the panel."
  - "[ ] Unpaired or unauthorized: sending stops, subscriptions persist; reconnect resumes the cookie listener and localStorage poll; forgetting the pair keeps subscriptions until a new authorized pair exists."
  - "[ ] Tests pass: subscribe-sends-current-value, uncheck-stops-and-never-deletes (no `cookies.remove` / `removeItem`), cookie `onChanged` push, localStorage pause/resume, no-send-while-unpaired — synthetic values only."
completed_at: null
completed_by: null
---

# Phase 3: Subscriptions and live watches

## Context

Parent user goal (inherited from [plan-host-site-resource-sync.md](plan-host-site-resource-sync.md)): host picks an open site, then copies chosen cookies/localStorage onto the paired client, live while checked.

This phase turns the Phase 2 panel's checkboxes into persistent subscriptions with live host-side watches (cookie events + localStorage polling) and the pause/resume lifecycle. The send side completes here; observing applied values on the client end-to-end is Phase 4/5 territory — Phase 3 tests assert on outbound frames.

## Implementation Details

From plan steps 4, 5, 6, and the send-side half of 8:

1. **Persistence** (`src/shared/types.d.ts` + worker): add the subscription record to `StorageSchema.local` — identities only (`name+domain+path+partitionKey+storeId` for cookies, `origin+key` for localStorage), never values. Re-arm subscriptions after worker revival.
2. **Subscribe/unsubscribe** (`src/background/apps/resources.ts`): `RESOURCE_SUBSCRIBE` snapshots the current value and sends one upsert per item through Phase 1's authorized path; `RESOURCE_UNSUBSCRIBE` removes the identity and sends nothing. There is no delete frame in the contract.
3. **Cookie watch**: `chrome.cookies.onChanged` filtered to subscribed identities. Cause `overwrite`/`explicit` with a cookie present → upsert. Host-side removal → no client delete; subscription stays checked; the next set upserts.
4. **localStorage watch**: while a same-origin non-incognito host tab exists, poll subscribed keys via `executeScript` `localStorage.getItem` and upsert on change. `tabs.onRemoved` / `tabs.onUpdated`: no remaining same-origin host tab → mark items `paused`, stop polling, do not uncheck. A later same-origin tab resumes and pushes current values; a completed load triggers a rescan. Poll-interval lag is accepted for v1 — do not patch page JS.
5. **Status** (`RESOURCE_STATUS`): subscriptions + paused/error per item; surface in the panel (`site-panel.tsx`).
6. **Lifecycle (send side)**: disconnect/unauthorized → stop sending, keep subscriptions; reconnect → resume listener + poll; forget pair → keep subscriptions, send nothing until a new authorized pair.
7. **Tests** (`__tests__/resource-sync.test.ts`): the five behavior cases in the acceptance list. Synthetic values only.

## Risks

- **Cookie upsert fidelity.** The upsert must carry domain/path/sameSite/secure/httpOnly/session/partitionKey — copying name+value alone creates a different cookie on apply (Phase 4 depends on these fields being present).
- **Pause ≠ unsubscribe.** Tab-close must not uncheck or drop identities; only polling stops.
- **Worker revival.** MV3 kills the worker; listeners and poll timers must re-arm from persisted identities, not from in-memory state.
- **Poll cost.** Keep the poll interval modest and only poll origins with active localStorage subscriptions.

## Verification

- Targeted vitest for subscribe/uncheck/cookie-change/pause-resume/unpaired passes; Slack suites stay green.
- Manual: with a paired client (Phase 4 not yet built, watch the client console/logs or defer full confirmation to Phase 5), confirm host-side checkbox state, paused badge on tab close, and resume on reopen.

## Per-Phase Execution Loop

If executing this phase inside an OMP execution session:
1. Run `/b-build` for this phase only (escalate to `/b-build-hard` if ambiguity appears).
2. Run `/b-review` against this phase file.
3. If review creates an `iterate-*.md` artifact (in-plan issues), run `/b-iterate`, then re-run `/b-review`. If review surfaces **out-of-plan issues** (new scope beyond this phase), do not iterate — route them to a separate `/b-plan` → `/b-build` follow-up; they do not block this phase. If `/b-review` flags documentation impact, run `/b-docs` before `/b-save`.
4. Run `/b-save` to consolidate memory, draft commits, and phase state.
5. Run `/b-commit` to checkpoint durable state.
6. If the phase is incomplete, leave `status: in-progress` so the session resumes here next turn.
