---
date: 2026-09-22
domains: [chrome-extension, wire-contract, testing]
topics: [resource-sync, envelope, optional-host-permissions, offscreen, resource-upsert]
related: [host-site-resource-sync-phasing-2026-09-22.md]
priority: high
status: completed
subject: 2026-09-22.host-site-resource-sync
artifacts:
  - phase-1-resource-wire-contract.md
  - plan-host-site-resource-sync-phases.md
  - plan-host-site-resource-sync.md
  - draft-commit.md
  - review-zz-buck-loop-2026-09-23T00-49-19-417Z.md
---

# Host site resource sync — Phase 1 wire contract landed

Executed nested `/b-build-hard` for `phase-1-resource-wire-contract.md` (not the unphased parent plan). Review pass with warnings; no `iterate-*.md`. `/b-save` this checkpoint; `/b-commit` still pending.

## Shipped

- `public/manifest.json`: `*://*/*` in `optional_host_permissions` only; `host_permissions` still pairing Worker.
- `src/shared/lib/resources.ts`: cookie identity (`name+domain+path+partitionKey+storeId`), localStorage identity (`origin+key`), origin filter (http(s), skip `RESTRICTED` + incognito), permission object `{ permissions: ['cookies','scripting'], origins: [\`${origin}/*\`] }`.
- `MSG` `RESOURCE_*` kinds; `resource_upsert` / `resource_applied` / `resource_error`; closed error enum.
- Envelope encode/parse fail-closed (unknown fields, missing `origin`, unpaired `connectionId`); 48 KiB item / `PEER_MAX_BYTES` 96 KiB envelope.
- `peer.ts` unchanged: `sendRequest(PeerPayload)` already covers new kinds.
- Offscreen forwards resource kinds only when `pairing.isAuthorized(connectionId)`.

## Verification

- Guardrails durable v2 **pass** (unit, lint, patch, ratchet ≥ 91.07, complexity).
- `pnpm build:prod` succeeded.
- Review: **Pass with warnings** — host `handleAppRequest` casts `item` instead of `parseResourceItem` before send; receive-side still fail-closed. Not in-plan; not iterated.

## Lifecycle / backlog

- Phase 1 `status: completed` + `completed_at: 2026-09-22`. Overview table + checklist match.
- Phases 2–5 still `pending`. Subject remains `active`; `close-verified` refused (later phases incomplete).
- Backlog item `phase-1-resource-wire-contract` archived. Next execution: Phase 2 site picker/panel.

## User goal

Parent plan has `## User Goal`. Product copy-live not met; this phase is contract-only. Phases overview lacks its own `## User Goal` (inherited).
