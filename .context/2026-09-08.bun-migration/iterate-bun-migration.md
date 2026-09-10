---
status: completed
date: 2026-09-08
updated: 2026-09-08
subject: 2026-09-08.bun-migration
topics: [review, iteration]
informs: []
addresses: plan-bun-migration.md
completed: 2026-09-08
from_review: b-review
---

# Iteration: bun-migration

## Source
- Reviewed after: `/b-build`
- Plan: `plan-bun-migration.md`
- Spec: none

## Critical Issues

### 1. Accidental removal of `"type": "module"`
- **File**: `package.json`
- **Problem**: Plan step 2 was add `packageManager` and `trustedDependencies`. The edit replaced the existing `"type": "module"` line with `"packageManager": "bun@1.4.2"`. `rsbuild.config.ts` uses `import.meta.url` (`createRequire(import.meta.url)`). Current RSBuild/Vitest TS loaders still build and tests pass, so this is latent, not currently red — but it is an unintended package.json contract change.
- **Proposed fix**: Keep both fields:

```json
"type": "module",
"packageManager": "bun@1.4.2",
```

## Warnings

### 1. Package script still has a hybrid presence check
- **File**: `scripts/package-extension.sh`
- **Problem**: Plan asked for a single path (`bun run build:prod`, no fallback chain). The script still gates on `./node_modules/.bin/rsbuild` **or** `bun` on PATH, then always runs `bun run build:prod`. If rsbuild exists and bun does not, the success branch still fails at `bun run`.
- **Suggested approach**: Gate only on `command -v bun`, then `bun run build:prod`. Drop the rsbuild-binary OR.

## Recommended Workflow

Start with `/b-iterate` — it will pick up this file automatically.
Then re-run `/b-review` against `plan-bun-migration.md`.
Inside an OMP execution session, the iterate artifact is not done until it is completed, review passes, and `/b-save` has recorded durable state.
For larger rework, use `/b-build` or `/b-build-hard`.
