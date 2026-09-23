---
status: completed
date: 2026-09-23
subject: 2026-09-22.host-site-resource-sync
phase: 5
---

# Phase 5 verification results

## Deterministic suite

- `pnpm exec vitest run`: pass — 23 files, 471 tests.
- Three consecutive fresh runs of `node /home/buckleyrobinson/projects/development_tools/buck-workflow-pi/skills/b-guardrails-check/scripts/check.mjs --cwd` this repo returned durable status pass.
  - Unit: pass.
  - Functional: skipped (no configured command).
  - Lint: pass, diff-scoped.
  - Coverage: 91.6%, above the 91.07% ratchet baseline.
  - Patch gate: pass.
  - Complexity: pass; no new violations.

## Hygiene inspection

- No logging calls were found in the resource sync implementation or its focused tests.
- Resource fixtures use `syn-*` / `synthetic-*` values. No real cookie or storage values were found.
- The options warning says checked items, including credentials, are copied live to the paired client.
- `docs/howto/sync-site-resources.md` states that pairing does not replace service-owner authorization and must not be used to bypass that gate.

## Two-profile smoke

Status: completed in two disposable Chromium profiles against the built extension.

- Fresh host and client paired and connected.
- Host `https://example.com` listed cookie `teleport_smoke` and localStorage `teleport_smoke_key`.
- Initial client values were both `host_v1`.
- A live host change propagated both to `host_v2`.
- Unchecking the cookie, then changing the host value to `host_v3`, left the client at `host_v2`.
- Rechecking restored sync.
- After the host site tab closed, the panel showed "Paused until a same-site tab is open". The cookie subscription remained stored, and the client received `host_v4` for that still-subscribed cookie.
- Reopening the host origin resumed localStorage. The client received `host_v3`, then `host_v4`.
- The client Grant UI appeared after a fail-closed `permission_denied`, and its button was clicked.
- Chromium headless cannot accept the native optional-permission prompt. After exercising that user-gesture path, only the disposable client profile was restarted with the same permissions seeded. Production permission checks were not bypassed.

## Follow-up found by the smoke

The first granted reconnect opened two inactive `https://example.com` tabs (255641197 and 255641198) while replaying one localStorage subscription. `openDocument` now keeps one per-origin promise through document readiness for a tracked, existing, or newly created tab, and records `opened` only for a tab this feature creates. A loading non-origin URL is not rejected. The race regression waits for the fourth `aborted` call, immediately before `openDocument`, asserts one `tabs.create`, then emits completion. Its `executeScript` mock returns `{ result: true }` so the assertion does not depend on ambient jsdom `localStorage`.

## Documentation

- Added `docs/howto/sync-site-resources.md` with pairing, host selection, grant, item selection, client confirmation, live-update, pause/resume, value-visibility, uncheck, size-limit, and enterprise-authorization guidance.
- Updated `docs/quickstart.md` so the client Grant click is the permission step, not a missing-grant limitation.
- The how-to tells the client to click Grant and accept Chrome's prompt. It does not present the feature as a bypass of the owner-authorization gate.
