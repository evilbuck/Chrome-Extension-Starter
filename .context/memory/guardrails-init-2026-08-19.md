---
date: 2026-08-19
domains: [quality, testing, tooling]
topics: [guardrails, coverage, complexity, biome, vitest]
related: []
priority: medium
status: completed
artifacts:
  - ../../guardrails.json
  - ../../AGENTS.md
---

# Guardrails initialized (create mode)

No prior `guardrails.json`. Detected TypeScript only (`package.json`, `tsconfig.json`, `*.ts`). Compare branch: `origin/master`.

Approved tooling:
- unit: `vitest run` (110/110 pass)
- coverage: `vitest run --coverage --coverage.reporter=lcov` — lines 63.65% (303/476)
- lint: `biome check` (paths) — whole-repo exit 0, `baseline_lint_clean: true`
- functional: none (no Playwright/Cypress)
- complexity: `lizard -C 10 -w --csv …` — 7 functions CCN > 10
- patch: `diff-cover` vs `origin/master` (tool installed via `uv tool`)

Hard-ceiling (CCN > 15) already in baseline: `runMigrations` 22, `SelectContent` 19. New functions above 10/15 will fail the check; these two do not fail day one.

Installed on this machine: `lizard==1.24.0`, `diff-cover==10.5.1` (`uv tool install`).
