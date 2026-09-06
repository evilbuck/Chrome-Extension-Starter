---
date: 2026-09-06
domains: [quality, tooling]
topics: [guardrails, ratchet, biome, vitest, lizard, diff-cover, guardrails-init]
related: []
priority: medium
status: completed
artifacts: [guardrails.json, AGENTS.md]
---

# Guardrails v2 initialization — session-shift worktree

One-shot `/b-init-guardrails` (create mode) on branch `new-ext/impersonate` in the `session-shift.wt` worktree. User approved the tooling proposal as-is.

## Recorded contract (guardrails.json, version 2)

- Test runner: `vitest run` — 15 files / 187 tests, exit 0 at init.
- Coverage: `vitest run --coverage --coverage.reporter=lcov`; baseline_coverage **64.48% lines** (1607/2492; statements 59.7%, branches 50.11%, functions 66.97%).
- Lint: `biome check`, `lint_accepts_paths: true` → diff-scoped gate. Whole-repo run exited 1 → `baseline_lint_clean: false`. Errors are mostly `.context/*.json` artifact formatting noise plus 4 source findings (`src/shared/lib/peer.ts` optional-chain, `services/pairing/src/pair-room.ts` unused param, 2 test-file style).
- Functional tests: none detected → gate skipped.
- Complexity: `lizard -C 10 -w --csv` (standard excludes). **64 functions > 10** recorded inline (under the 200-entry split threshold); **29 exceed the hard ceiling of 15** — tolerated as baseline debt, burn-down goal 0. Worst: `handleSignal` pair-room.ts (93), `fetch` pair-room.ts (65), `isSlackSession` slack.ts (57), `webSocketMessage` pair-room.ts (53), `handleConfirm` pair-room.ts (51), `channel.onmessage` peer.ts (42).
- Patch gate: `diff-cover coverage/lcov.info --compare-branch=origin/master --fail-under=90`. Smoke-tested at init: branch diff is 2546 lines at **64% patch coverage** → the first real check will fail the patch gate until feature-branch lines gain tests. Plumbing verified working.
- `git_compare_branch: origin/master`.

## Notes

- Repo has no AGENTS.md/CLAUDE.md; created AGENTS.md containing only the managed block (same as ebay-enhance precedent).
- detect-stack.ts again failed to resolve biome (only probes eslint/oxlint); `biome check` was supplied manually.
- Committed only `guardrails.json` + `AGENTS.md`; pre-existing uncommitted `.context/` work left untouched.
- Next steps: `/b-guardrails-check` at coherent points; add tests to lift patch coverage on the branch diff; burn down the 29 above-ceiling hotspots.
