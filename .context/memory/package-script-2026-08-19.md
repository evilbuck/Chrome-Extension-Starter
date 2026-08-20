---
date: 2026-08-19
domains: [tooling, release]
topics: [package, zip, chrome-web-store, build]
related: []
priority: medium
status: completed
---

# Local CWS package script

`pnpm package` runs `scripts/package-extension.sh`: production RSBuild (`pnpm build:prod`, falls back to `./node_modules/.bin/rsbuild`) then zips `dist/` contents to `releases/ebay-enhance-v<manifest.version>.zip`.

Zip root is `dist/` (manifest at top). Excludes `*.map` and `.DS_Store`. Fails if `dist/manifest.json` is missing or not at the archive root. `/releases` is gitignored.

Verified 2026-08-19: `releases/ebay-enhance-v1.0.0.zip` (65K), `manifest.json` at root, no maps/src/node_modules.

Guardrails (durable v2) after this change: unit/lint/complexity/global ratchet pass. `patch_gate` fail 70% vs 90% is the existing branch vs `origin/master` (`src/content/listings.ts` and friends) — not these packaging files (shell + json + md).

