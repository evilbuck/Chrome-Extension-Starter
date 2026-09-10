---
date: 2026-09-10
domains: [storage, chrome-extension, docs, review]
topics: [hidden-items, chrome-storage-sync, b-review, b-docs, adr, guardrails]
related:
  - ../2026-09-08.hidden-items-sync-strategy/plan-hidden-items-sync.md
  - ../2026-09-08.hidden-items-sync-strategy/iterate-hidden-items-sync.md
  - ../2026-09-08.hidden-items-sync-strategy/iterate-hidden-items-sync-2.md
  - hidden-items-sync-durability-2026-09-09.md
priority: high
status: completed
subject: 2026-09-08.hidden-items-sync-strategy
artifacts:
  - plan-hidden-items-sync.md
  - iterate-hidden-items-sync.md
  - iterate-hidden-items-sync-2.md
  - draft-commit.md
---

# Hidden-items sync closure: review pass + living docs (2026-09-10)

Final `/b-review` against `plan-hidden-items-sync.md` after both iterate
rounds, then `/b-docs`.

## Review verdict: pass with warnings

- No in-plan defects. All 5 implementation steps verified with direct
  current-state evidence; no live reads of legacy `local.hiddenItems`
  remain (grep-verified).
- Guardrails (durable v2): all gates pass — 137 unit tests, diff-scoped
  Biome clean on 12 files, patch coverage 98% (≥90), global ratchet 82.73%
  (≥82.7), no new complexity hotspots. `bun run typecheck` and
  `bun run build` exit 0 (run directly; not gate-covered).
- Sole warning: cross-device live check (acceptance criterion 1)
  not-verifiable — no two disposable sync-enabled profiles. Plan itself
  pre-acknowledged this; mechanism fully implemented and unit-proven.
- Plan closed `status: completed`; follow-ups routed to backlog, not
  iterated (out-of-plan by b-review classification).

## Out-of-plan follow-ups (backlog)

1. `items/sync-flush-failure-observability.md` — repeated same-revision
   flush failures (poison entry, quota/MAX_ITEMS overflow — 511 shard cap
   + manifest + settings/version brushes the 512-item limit) retry every
   ~30 s with console-only visibility; needs backoff and/or a user-facing
   sync-failure surface. Includes the `{}` shard-tombstone cleanup
   question.
2. `items/two-profile-sync-verification.md` — manual two-profile live
   verification of hide propagation when accounts are available.

## Living docs created (b-docs)

- `docs/adr/0001-hidden-items-sync-durability.md` — local-first revisioned
  pending + SW-coordinated sharded sync; rejected alternatives and
  consequences.
- `docs/architecture.md` — surfaces map, storage-key table, write/read
  paths (mermaid), LWW conflict semantics.
- `AGENTS.md` — `b-docs:conventions` managed block: no content-script
  debounce of user-visible storage writes; sync items ≤8192 B with
  envelope margin; leave one-shot fallback alarms armed; never
  `chrome.alarms.clearAll()`.

## Notes

- Guardrails ratchet proposes baseline raise 82.7 → 82.73; apply at next
  `/b-init-guardrails` refresh or when committing.
- Iterate round-1 artifact prose ("clears fallback alarm") is stale
  relative to code (alarm deliberately left armed, round-2 fix); code and
  tests are authoritative.
