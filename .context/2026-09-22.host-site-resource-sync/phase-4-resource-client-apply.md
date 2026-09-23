---
status: completed
phase: 4
order: 4
plan: plan-host-site-resource-sync.md
phases_overview: plan-host-site-resource-sync-phases.md
difficulty: hard
model_hint: strongest reasoning model available
buck_hint: /b-build-hard
goal: "Client role applies inbound resource upserts — cookies with full field fidelity, localStorage via same-origin or auto-opened background tabs — and acks or errors; host role never applies."
files:
  - src/background/apps/resources.ts
  - src/background/connection.ts
  - __tests__/resource-sync.test.ts
from_plan_steps: [7, 8]
depends_on: [1]
dependency_type: HARD
acceptance_criteria:
  - "[x] Inbound `resource_upsert` is applied only on the client role; host role, unpaired, and unauthorized connections fail closed (drop, no write)."
  - "[x] Cookies are written via `chrome.cookies.set` preserving name, value, domain (omitted when the source was host-only), path, secure, httpOnly, sameSite, session/expirationDate, and `partitionKey` when present."
  - "[x] localStorage writes reuse an existing same-origin client tab; if none, `tabs.create({ url: origin + '/', active: false })`, wait for complete, then `executeScript` `setItem`; auto-opened tab ids are tracked and reused for later keys on the same origin."
  - "[x] Only tabs this feature opened may be auto-closed, and only when the last localStorage subscription for that origin goes away — never a user-opened tab."
  - "[x] Every applied item acks `resource_applied` (`replyTo`, `origin`, `type`, `id`); failures return `resource_error` with the closed enum (`permission_denied | oversized | no_document | disconnected | malformed | failed`)."
  - "[x] An oversize or malformed item rejects with no partial write."
  - "[x] Tests pass: client apply with cookie field fidelity (including host-only and partitioned cases), background tab opened once per origin and reused, host-role no-apply, oversize no-partial-write — synthetic values only."
completed_at: 2026-09-23
completed_by: b-build-hard
memory: [host-site-resource-sync-phase-4-2026-09-23.md]
---

# Phase 4: Client apply and inbound lifecycle

## Context

Parent user goal (inherited from [plan-host-site-resource-sync.md](plan-host-site-resource-sync.md)): host picks an open site, then copies chosen cookies/localStorage onto the paired client, live while checked.

This phase builds the receive side: the client worker applies inbound upserts and acks. Strictly, only Phase 1's contract hard-blocks this phase (its unit tests synthesize inbound frames), but execution keeps it after Phase 3 — it shares `src/background/connection.ts` with Phase 2's routing and full end-to-end behavior needs the Phase 3 send side. See the overview's dependency matrix.

## Implementation Details

From plan step 7 and the receive-side half of 8:

1. **Routing** (`src/background/connection.ts`): route inbound `resource_upsert` on the authorized connection to the resources module — client role only. Do not mix with the Slack pipeline; host role never applies.
2. **Cookie apply** (`src/background/apps/resources.ts`): `chrome.cookies.set` with the full field set. Preserve host-only cookies by omitting `domain` when the source was host-only. Pass `partitionKey` when present. Session cookies carry no `expirationDate`.
3. **localStorage apply**: reuse a same-origin client tab if one exists; else `tabs.create({ url: origin + '/', active: false })`, wait for the tab to complete loading, then `executeScript` `setItem`. Track auto-opened tab ids per origin; reuse them for later keys.
4. **Tab hygiene**: auto-opened tabs stay while the origin still has localStorage subscriptions; when the last one goes, only tabs this feature opened may be closed. Never close a user-opened tab.
5. **Acks/errors**: `resource_applied` with `replyTo`/`origin`/`type`/`id` on success; `resource_error` with the closed enum otherwise (`no_document` when no same-origin document can be obtained, `oversized`/`malformed` reject before any write).
6. **Tests** (`__tests__/resource-sync.test.ts`): the four behavior cases in the acceptance list. Synthetic values only.

## Risks

- **Cookie field fidelity.** Omitting the host-only rule or dropping `partitionKey`/`sameSite` silently produces a broken session cookie on the client — the highest-stakes defect in this feature. Test host-only and partitioned cases explicitly.
- **Auto-opened tabs surprise users.** Reuse aggressively; close only feature-created tabs; document the behavior (Phase 5 how-to).
- **Race on tab completion.** `setItem` before the background tab finishes loading fails — wait for complete and handle navigation-away with `no_document`.
- **Host-role apply.** A misrouted inbound upsert applied on the host would corrupt the source profile; the role check is fail-closed and tested.

## Verification

- Targeted vitest (`resource-sync` + `connection-routing`) passes, including client cookie fidelity, tab open-once/reuse, host-role no-apply, and oversize no-partial-write. Durable guardrails v2 pass: unit 0, lint 0, patch pass, coverage 91.4 ≥ 91.07, complexity pass with no new violations.
- Host uncheck still sends no frame (Phase 3 contract). The client closes an auto-opened tab only when its own last applied localStorage key for that origin is released. A cross-profile close on host uncheck needs a new wire frame and is not in this phase.
- Manual smoke of the full loop is Phase 5's gate; here a quick two-profile check (host checks an item → client cookie appears) is a useful early signal.

## Per-Phase Execution Loop

If executing this phase inside an OMP execution session:
1. Run `/b-build-hard` for this phase only.
2. Run `/b-review` against this phase file.
3. If review creates an `iterate-*.md` artifact (in-plan issues), run `/b-iterate`, then re-run `/b-review`. If review surfaces **out-of-plan issues** (new scope beyond this phase), do not iterate — route them to a separate `/b-plan` → `/b-build` follow-up; they do not block this phase. If `/b-review` flags documentation impact, run `/b-docs` before `/b-save`.
4. Run `/b-save` to consolidate memory, draft commits, and phase state.
5. Run `/b-commit` to checkpoint durable state.
6. If the phase is incomplete, leave `status: in-progress` so the session resumes here next turn.
