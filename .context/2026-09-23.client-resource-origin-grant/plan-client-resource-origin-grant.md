---
status: completed
date: 2026-09-23
subject: 2026-09-23.client-resource-origin-grant
topics: [chrome-extension, permissions, client-apply, user-gesture]
research: []
iterations: []
memory: [client-resource-origin-grant-2026-09-23.md]
---

# Plan: Client origin grant before resource apply

## User Goal

The person using the paired client can click once to allow a site before that site's cookies or localStorage are written. A fresh client no longer fails the two-profile smoke solely because the host's grant does not exist on the client.

## Goal

Add a client options control that calls `chrome.permissions.request` from a click for `cookies`, `scripting`, and that origin. Keep the existing `permissions.contains` check on every apply. After a grant, retry the last denied item from memory, not from storage.

## Context used / assumptions

- User-provided context: `.context/backlog/items/client-resource-origin-grant.md`. Do not remove or bypass the client permission check. Do not reopen Phase 4.
- Session context: Phase 5 smoke step 4 is blocked because apply returns `permission_denied` on a fresh client. `permissions.request` requires a user gesture, so an inbound frame cannot grant.
- Code: `resourcePermission` is `{ permissions: ['cookies', 'scripting'], origins: [origin/*] }`. Host options already request that object from a selection handler. Client apply checks `permissions.contains` before `cookies.set` / `executeScript`.
- Assumption: the smoke operator can click Grant on the client between the host check and the client observation, or the retry after that click applies the held item before the observation.

## Scope

- Remember the last denied apply item in memory, keyed by origin. Do not write values to `chrome.storage` or logs.
- Client options, only when this profile is the authorized client, lists those origins and a Grant button.
- The button calls `chrome.permissions.request(resourcePermission(origin))`, then asks the worker to retry that origin.
- Retry runs the same apply path, including `hasPermission`. No grant, no write.
- Tests use synthetic values only.

## Out of scope

- Removing or short-circuiting `hasPermission` on apply.
- Adding `*://*/*` to `host_permissions`.
- Host-side grant changes, except that the host panel stays the host grant.
- Phase 4 envelope or identity changes.
- Phase 5 smoke execution and how-to rewrite. Those resume after this cycle.
- Auto-grant from an inbound frame.

## Affected files

- `src/shared/constants.ts` — client pending and retry message kinds.
- `src/background/apps/resources.ts` — in-memory denied item, pending origins, retry through the existing apply check.
- `src/background/connection.ts` — options-only, client-role routing. Host commands stay host-gated.
- `src/pages/resources/client-grant.tsx` — grant button.
- `src/pages/options/index.tsx` — mount the panel for an authorized client.
- `public/_locales/{en,ja,zh_TW}/messages.json` — button and explanation keys.
- `__tests__/resource-client-grant.test.ts` — deny records origin, retry without grant writes nothing, retry after contains applies, pending status has no values.

## Implementation steps

1. Hold the last `permission_denied` item in a `Map` inside `createResourceClient`. Expose pending origins and a retry that calls the existing apply function after the caller has requested permission.
2. Add `RESOURCE_CLIENT_PENDING` and `RESOURCE_CLIENT_RETRY`. Route them only from the options page and only when the connected role is client.
3. Render a client grant panel. The click handler requests `resourcePermission(origin)` and, only if that returns true, sends retry.
4. Add the regression tests above. Do not log or fixture real cookie values.

## Acceptance criteria

- [x] A fresh client apply with no origin grant still returns `permission_denied` and writes nothing.
- [x] The client options page shows that origin and a Grant control only for an authorized client.
- [x] Grant calls `chrome.permissions.request` with `cookies`, `scripting`, and `${origin}/*` from the click handler.
- [x] Retry after a granted `permissions.contains` applies the held item through the existing apply path.
- [x] Pending status and logs contain origins only, never cookie or storage values.
- [x] Host resource commands remain host-gated.

## Verification

- `pnpm exec vitest run __tests__/resource-client-grant.test.ts`
- `pnpm exec vitest run`
- `pnpm exec biome check` on the changed source and test files.

## Execution Instructions

This is a non-phased execution-ready plan. Treat the whole plan as one unit:
1. Run `/b-build` against this plan.
2. Run `/b-review` against this plan.
3. If review creates an `iterate-*.md` artifact, run `/b-iterate`, then re-run `/b-review`. Out-of-plan findings do not iterate. If review flags documentation impact, run `/b-docs` before `/b-save`.
4. Run `/b-save`.
5. Run `/b-commit` only after the intended files are staged.

## Risks

- Holding the denied item in memory means a worker restart drops the retry payload. The next host push still applies once the origin is granted. That is acceptable.
- A Grant click that the user denies must leave the check in place and write nothing.
