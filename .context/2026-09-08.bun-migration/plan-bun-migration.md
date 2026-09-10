---
status: completed
date: 2026-09-08
subject: 2026-09-08.bun-migration
topics: [bun, pnpm, build, migration, package-manager]
research: []
iterations: [iterate-bun-migration.md]
spec: null
memory: [memory-bun-migration-2026-09-08.md]
---

# Plan: Migrate build toolchain from pnpm to bun 1.4

## User Goal
Replace pnpm with bun as the sole package manager and script runner for ebay-enhance, pinned to bun 1.4, so installs are faster and the toolchain has a single runner. Contributors run `bun install` / `bun run build` instead of pnpm.

## Goal
Remove pnpm from every surface: lockfile, install config, npm scripts, packaging script, README, guardrails lint scope, and project documentation/memory conventions. Pin bun to 1.4.

## Context used / assumptions
- User-provided: convert to bun build, remove pnpm; interjection pins bun 1.4.
- Session/code context:
  - Installed bun is 1.3.14 via mise shims → must upgrade/pin to 1.4 first.
  - `pnpm-workspace.yaml` carries `allowBuilds` (pnpm-11-specific). Bun's equivalent is `trustedDependencies` in `package.json` (or bunfig). Current map: `@tailwindcss/oxide: true`, `core-js: false`, `esbuild: true`.
  - `scripts/package-extension.sh` prefers `pnpm` then falls back to `./node_modules/.bin/rsbuild`.
  - `guardrails.json` v2 `lint_cmd: "biome check"` — package-manager-agnostic, but lint scoping/diff mode may reference pnpm paths (verify at build time). `test_runner: "vitest run"` unaffected.
  - README references `pnpm install` / `pnpm build` / `pnpm package` (lines 7–8, 17).
  - No `engines`/`packageManager` pin exists today; this migration should add `packageManager: "bun@1.4.x"` (and optionally mise pin) to make the pin durable.
  - Assumption: bun 1.4 is released and available via mise at build time (installed bun is 1.3.14 — if mise has no 1.4 yet, block and report rather than downgrade the goal).
- Memory: prior verified behavior — `bun package` already produced an identical zip via the fallback path (2026-09-07).

## Scope
- Upgrade/pin bun to 1.4 (mise).
- `bun install` → generate `bun.lock` (text lockfile), delete `pnpm-lock.yaml` and `pnpm-workspace.yaml`.
- Add `trustedDependencies` to `package.json` for native-postinstall deps (`@tailwindcss/oxide`, `esbuild`; explicitly omit core-js).
- Rewrite `scripts/package-extension.sh` to use `bun run build:prod` (drop pnpm preference chain).
- Update README quickstart + package notes to bun commands; document bun 1.4 requirement.
- Add `packageManager` pin to `package.json`.
- Update `.context/` conventions docs (AGENTS.md conventions block if it names pnpm; memory mental-model refresh happens via b-save).
- Verify: dev build, prod build, package zip, vitest suite, biome lint all pass under bun.

## Out of scope
- Migrating RSBuild → Bun's bundler (bun build stays "bun as PM/runner"; RSBuild remains the bundler).
- Changing vitest/biome/tsc invocations beyond the runner.
- CI changes (no CI config exists in repo).
- Chrome Web Store submission work.

## Affected files
- `package.json` — scripts unchanged (names preserved), add `packageManager`, `trustedDependencies`
- `pnpm-workspace.yaml` — delete
- `pnpm-lock.yaml` — delete (replaced by `bun.lock`)
- `scripts/package-extension.sh` — swap pnpm → bun
- `README.md` — bun quickstart
- `.gitignore` — no change expected (dist/ and releases/ already ignored)
- `.context/2026-09-08.bun-migration/*` — artifacts
- mise config (`~/.config/mise/config.toml`) — bun 1.4 pin (host-level, noted not committed)

## Implementation steps
1. Pin bun 1.4 via mise (`mise use bun@1.4` in repo or `mise use -g bun@1.4`); verify `bun --version` ≥ 1.4. If mise lacks 1.4, stop and report.
2. Delete `pnpm-workspace.yaml`; add to `package.json`:
   - `"packageManager": "bun@<resolved-1.4-version>"`
   - `"trustedDependencies": ["@tailwindcss/oxide", "esbuild"]` (core-js intentionally omitted — funding banner only)
3. Remove `node_modules` and `pnpm-lock.yaml`; run `bun install` → creates `bun.lock`; confirm no `ERR`/ignored-builds warnings and native builds (`@tailwindcss/oxide`, `esbuild`) succeed.
4. Run `bun run build` (dev) and `bun run build:prod`; confirm `dist/manifest.json` and bundle output identical in shape to pnpm builds.
5. Rewrite `scripts/package-extension.sh` build step to `bun run build:prod` (single path, no fallback chain); run `bun run package` and verify zip: manifest at root, no `*.map`.
6. Run `bun run test`, `bun run lint`, `bun run typecheck` — all green.
7. Update README (install/build/package commands, bun 1.4 prerequisite); sweep remaining `pnpm` references repo-wide (`grep -rn pnpm` excluding `.context/memory` history).
8. Update AGENTS.md conventions block / project docs if they still instruct pnpm.
9. Write session memory + refresh mental-model conventions via b-save.

## Acceptance criteria
- [x] `bun --version` reports 1.4.x; `packageManager` pin present.
- [x] No `pnpm-lock.yaml`, `pnpm-workspace.yaml`; `bun.lock` committed.
- [x] `bun install` from clean checkout produces a working `node_modules` with native deps built.
- [x] `bun run build`, `build:prod`, `test`, `lint`, `typecheck` all pass.
- [x] `bun run package` produces `releases/ebay-enhance-v1.0.0.zip` with `manifest.json` at archive root.
- [x] Repo contains no actionable pnpm references (README, scripts, configs).
- [x] Guardrails verdict: pass (lint diff-scoped, unit tests, patch coverage).

## Verification
1. Clean-checkout simulation: `rm -rf node_modules && bun install && bun run build:prod` → dist valid.
2. `unzip -l releases/ebay-enhance-v1.0.0.zip | head` → manifest.json at root.
3. `bun run test && bun run lint && bun run typecheck` → exit 0.
4. Load unpacked `dist/` in the dev Chromium profile; confirm X-hide behavior on an eBay search page (chrome-devtools MCP).
5. `grep -rn pnpm` over repo (excluding `.context/memory/`, `bun.lock`) → zero hits.

## Risks
- **bun 1.4 availability**: installed bun is 1.3.14; if mise has no 1.4 release, step 1 blocks. Mitigation: check `mise ls-remote bun` before starting; report instead of silently pinning 1.3.
- **Lockfile drift**: bun's resolution may pick newer transitive versions than pnpm-lock. Mitigation: run full test suite + real build; visually verify extension behavior.
- **trustedDependencies semantics differ from allowBuilds** (bun blocks postinstalls by default at 1.x for non-allowlisted). Mitigation: confirm build succeeds and no `blocked postinstall` warnings.
- **Guardrails lint scoping**: `b-guardrails-check` diff-scoped lint assumed package-agnostic; verify during check.
- **Rollback**: keep the pnpm commit on a branch or rely on git history — reverting restores `pnpm-lock.yaml` + `pnpm-workspace.yaml` from HEAD~.

## Execution Instructions

This is a non-phased execution-ready plan. Treat the whole plan as one unit:
1. Run `/b-build` (or `/b-build-hard` if ambiguity appears) against this plan.
2. Run `/b-review` against this plan.
3. If review creates an `iterate-*.md` artifact (in-plan issues), run `/b-iterate`, then re-run `/b-review`. If review surfaces **out-of-plan issues**, route them to a separate `/b-plan` → `/b-build` follow-up. If `/b-review` flags documentation impact, run `/b-docs` before `/b-save`.
4. Run `/b-save` to consolidate memory, draft commits, and review/iteration artifacts.
5. Run `/b-commit` to checkpoint durable state.
