---
date: 2026-09-06
domains: [quality, tooling]
topics: [guardrails, ratchet, coverage, complexity, lizard]
related: [guardrails-init-2026-09-06.md, patch-coverage-2026-09-06.md]
priority: medium
status: completed
subject: null
artifacts: [guardrails.json]
---

# Guardrails baseline fix — coverage floor and test-free complexity

User approved applying the check-run recommendations: raise the coverage floor to match measured reality; stop counting tests as complexity hotspots; do not grow the complexity list.

## Contract changes (`guardrails.json`)

- `ratchet.baseline_coverage`: 64.48 → **91.07** (2274/2497 lines).
- `complexity_cmd`: added lizard excludes `*/__tests__/*`, `*.test.ts`, `*.test.tsx`, `*/test/*`.
- `baseline_complexity_inventory`: 64 → **62**. Removed the two `services/pairing/test/pairing.test.ts` entries (`pairSession` 12, `(anonymous)` 13). Production hotspots unchanged.

## Why

The 64.48 floor would have allowed a large coverage drop. Test `it()` blocks were failing the complexity gate (new `__tests__/pairing-ui.test.tsx` anonymous CCN 13) while production monsters stayed grandfathered.

## Recheck

All gates pass: unit 403, lint diff-scoped exit 0, patch 92% vs `origin/master`, global ratchet 91.07, complexity 62/62 no new/worsened.
