---
date: 2026-09-08
domains: [build, tooling]
topics: [bun, pnpm, migration, ci, packaging, iterate]
related: []
priority: medium
status: completed
subject: 2026-09-08.bun-migration
artifacts: [plan-bun-migration.md, draft-commit.md, iterate-bun-migration.md]
---

# Bun migration (pnpm → bun 1.4)

## What was done
- mise global pin: `bun@1.4.2` (`mise use -g bun@1.4.2`).
- `package.json`: `"type": "module"` restored alongside `packageManager: "bun@1.4.2"` (b-review: the original edit replaced the type field). `trustedDependencies: ["@tailwindcss/oxide", "esbuild"]` (core-js intentionally excluded — funding-banner postinstall; bun blocks it: `bun pm untrusted` confirms).
- Deleted `pnpm-workspace.yaml` and `pnpm-lock.yaml`; `bun install` created `bun.lock` (text).
- `scripts/package-extension.sh`: single path — fail if bun missing, then `bun run build:prod` (dropped the rsbuild-binary OR).
- README quickstart/package section now bun commands, bun 1.4+ requirement.
- biome.json files.includes: `!**/pnpm-lock.yaml` → `!**/bun.lock`.
- `.gitignore`: removed `pnpm-debug.log*`.
- CI discovery (plan assumed none): `.github/workflows/ci.yml` + `release.yml` converted from `pnpm/action-setup@v5` to `oven-sh/setup-bun@v2` (bun-version 1.4.2), `bun install --frozen-lockfile`, `bun run build`/`build:prod`/`test:cov`. setup-node retained (tooling may still expect Node).
- Guardrails follow-up (user request): guardrails.json commands made bun-native — `test_runner: "bun run test"`, `coverage_tool: "bun run test:cov"`, `lint_cmd: "bunx biome check"`. Discovery: vitest 4 throws CACError on the kebab `--coverage-reporter` flag the check skill appends; fixed by adding `'lcov'` to vitest.config.ts reporters (plain `bun run test:cov` emits coverage/lcov.info) and recording `coverage_tool_note` in guardrails.json forbidding the append. Second guardrails dispatch: pass, all gates green.
- AGENTS.md: added `## Development commands` section (bun 1.4+ table: install/build/watch/test/lint/typecheck/package) between the two managed blocks; managed blocks untouched (no pnpm references existed in them).

## Verification
- `bun run build` (dev) + `build:prod`: dist valid, sizes consistent.
- `bun run package`: releases/ebay-enhance-v1.0.0.zip, manifest at root.
- `bun run test`: 120/120 pass (11 files). `typecheck`: pass. `lint`: pass (one auto-fix: import sort in src/shared/types.d.ts).
- Iterate: `bunx biome check package.json` clean; `bun run test` 120/120.
- Repo-wide pnpm grep: zero hits outside `.context/` history.
- `bun run test:cov` standalone: coverage/lcov.info emitted; exit 0.

## Abandoned approaches
- None; plan followed directly. Plan's "no CI" assumption was wrong — workflows updated in-scope as breakage prevention.

## Final review
- Re-review passed on 2026-09-08: durable guardrails v2 passed (120 tests, diff-scoped Biome, 77.41% line coverage, 100% patch coverage, no new complexity violations).
- `bun --version` reported 1.4.2; frozen install, development build, production package, and typecheck all passed. The package archive contains `manifest.json` at its root and no source maps.
- An isolated Chromium instance loaded `dist/` unpacked on an eBay search page. It injected 76 hide controls across 78 listing cards; visual inspection confirmed the controls on listing thumbnails.
- The completed iteration restored `"type": "module"` and made the packaging preflight Bun-only. No in-plan review findings remain.
