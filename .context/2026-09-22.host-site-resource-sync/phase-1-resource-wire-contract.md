---
status: completed
phase: 1
order: 1
plan: plan-host-site-resource-sync.md
phases_overview: plan-host-site-resource-sync-phases.md
difficulty: hard
model_hint: strongest reasoning model available
buck_hint: /b-build-hard
goal: "Land the shared wire contract and permission foundation: optional host permissions, resource identities/guards, envelope kinds with strict parse and size caps, and authorized offscreen forwarding."
files:
  - public/manifest.json
  - src/shared/lib/resources.ts
  - src/shared/constants.ts
  - src/shared/lib/envelope.ts
  - src/shared/lib/peer.ts
  - src/offscreen/index.ts
  - __tests__/envelope.test.ts
from_plan_steps: [1, 3]
depends_on: []
dependency_type: NONE
acceptance_criteria:
  - "[x] `public/manifest.json` adds `*://*/*` to `optional_host_permissions` only; `cookies` and `scripting` stay optional permissions; `host_permissions` unchanged."
  - "[x] `src/shared/lib/resources.ts` exports cookie identity (`name + domain + path + partitionKey + storeId`) and localStorage identity (`origin + key`) helpers, the origin filter (non-http(s), `RESTRICTED` schemes, and incognito excluded), and the permission-object builder `{ permissions: ['cookies', 'scripting'], origins: [`${origin}/*`] }`."
  - "[x] `MSG` gains `RESOURCE_LIST_SITES`, `RESOURCE_ENABLE`, `RESOURCE_LIST_ITEMS`, `RESOURCE_SUBSCRIBE`, `RESOURCE_UNSUBSCRIBE`, `RESOURCE_STATUS`; payload kinds gain `resource_upsert` with the closed error enum for `resource_applied` / `resource_error`."
  - "[x] Envelope encode/parse handles the three new kinds; strict parse fails closed on unknown fields, missing `origin`, and unpaired `connectionId`."
  - "[x] A single item whose JSON payload would exceed 48 KiB is rejected before send; the envelope cap reuses `PEER_MAX_BYTES` (96 KiB)."
  - "[x] `src/shared/lib/peer.ts` allows the new kinds through the existing `sendRequest` path; `src/offscreen/index.ts` forwards them only when `pairing.isAuthorized(connectionId)`."
  - "[x] `__tests__/envelope.test.ts` covers malformed, oversize, and unknown-kind cases and passes; existing Slack/pairing/envelope suites stay green."
completed_at: 2026-09-22
completed_by: b-build-hard
memory: [host-site-resource-sync-phase-1-2026-09-22.md]
---

# Phase 1: Wire contract and permission foundation

## Context

Parent user goal (inherited from [plan-host-site-resource-sync.md](plan-host-site-resource-sync.md)): host picks an open site, then copies chosen cookies/localStorage onto the paired client, live while checked.

This phase builds the contract layer every later phase compiles against: permission shape, resource identities, envelope kinds, and the authorized forwarding path. Nothing user-visible ships here; the deliverable is a strict, tested wire contract that does not weaken the existing Slack transport.

## Implementation Details

From plan steps 1 and 3:

1. **Manifest.** Add `*://*/*` to `optional_host_permissions` only. `cookies` and `scripting` remain in optional permissions. Do not touch `host_permissions`.
2. **Identities and guards** (`src/shared/lib/resources.ts`, new):
   - Cookie identity: `name + domain + path + partitionKey + storeId`.
   - localStorage identity: `origin + key`.
   - Origin filter: keep `http:`/`https:` unique origins from host tabs; skip `RESTRICTED` schemes and incognito tabs (same pattern the Slack module uses).
   - Permission object builder: `{ permissions: ['cookies', 'scripting'], origins: [`${origin}/*`] }`.
3. **Constants** (`src/shared/constants.ts`): add the six `RESOURCE_*` `MSG` kinds, `resource_upsert` to `PAYLOAD_KIND`, `resource_applied`/`resource_error` to `PAYLOAD_RESPONSE_KIND`, and the closed error enum `permission_denied | oversized | no_document | disconnected | malformed | failed`.
4. **Envelope** (`src/shared/lib/envelope.ts`): encode/parse the new kinds per the plan's wire contract (upsert carries the full cookie shape — name, domain, path, secure, httpOnly, sameSite, session, optional expirationDate/partitionKey, value — or `{ type: 'localStorage', key, value }`; acks carry `replyTo`, `origin`, `type`, `id`). Fail closed on unknown fields, missing `origin`, unpaired `connectionId`. Reject any single item whose JSON payload would exceed 48 KiB. Reuse `PEER_MAX_BYTES` (96 KiB) as the envelope cap.
5. **Transport allow-through** (`src/shared/lib/peer.ts`): permit the new kinds through the existing `sendRequest` path — no parallel send mechanism.
6. **Offscreen gate** (`src/offscreen/index.ts`): forward the new kinds only when `pairing.isAuthorized(connectionId)` holds.
7. **Tests** (`__tests__/envelope.test.ts`): malformed frame, oversize item, unknown kind, missing origin, unpaired connectionId. Synthetic values only — no real cookie/storage values in fixtures.

## Risks

- **Generic credential frames on the wire.** `PAYLOAD_KIND` comments currently forbid generic blobs. This phase makes the exception explicit and typed; keep parse strict and logs value-free.
- **Transport regression.** `peer.ts`/`envelope.ts` are shared with the working Slack path. Run the full existing suite; any Slack breakage blocks this phase.
- **Cap drift.** The 48 KiB item cap and 96 KiB envelope cap must both be enforced and tested; do not chunk in v1.

## Verification

- `__tests__/envelope.test.ts` new cases pass.
- Existing Slack/pairing/envelope vitest suites green.
- Manual: `pnpm build:prod` succeeds; load `dist/` and confirm the extension still pairs and hands off Slack (no behavioral change expected yet).

## Per-Phase Execution Loop

If executing this phase inside an OMP execution session:
1. Run `/b-build-hard` for this phase only.
2. Run `/b-review` against this phase file.
3. If review creates an `iterate-*.md` artifact (in-plan issues), run `/b-iterate`, then re-run `/b-review`. If review surfaces **out-of-plan issues** (new scope beyond this phase), do not iterate — route them to a separate `/b-plan` → `/b-build` follow-up; they do not block this phase. If `/b-review` flags documentation impact, run `/b-docs` before `/b-save`.
4. Run `/b-save` to consolidate memory, draft commits, and phase state.
5. Run `/b-commit` to checkpoint durable state.
6. If the phase is incomplete, leave `status: in-progress` so the session resumes here next turn.
