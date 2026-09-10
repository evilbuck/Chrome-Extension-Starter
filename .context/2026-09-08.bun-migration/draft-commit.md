## Title
build: replace pnpm with bun 1.4 as package manager

## Body
Migrate the toolchain to bun: add bun.lock + trustedDependencies, delete
pnpm-lock.yaml/pnpm-workspace.yaml, switch package script and CI/release
workflows to bun, update README. Pin bun 1.4.2 via mise and packageManager.
Keep package.json "type": "module". Package script is bun-only (no rsbuild
fallback). Guardrails contract made bun-native (bun run test / test:cov,
bunx biome), lcov added to vitest reporters, AGENTS.md gains a bun
dev-commands table.
