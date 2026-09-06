---
status: completed
created: 2026-09-06
updated: 2026-09-06
subject: 2026-09-06.patch-coverage
---

# Lift patch coverage vs origin/master to 90%

Technical chore. `/b-guardrails-check` failed the patch gate: 1633/2546 changed lines covered (64.1%). Need ≥2292 covered (~659 more lines). No production behavior change.

## Approach

Characterization tests against public APIs. Do not edit production source. Match existing vitest/chrome-mock style.

## File owners

| Test file | Source gap | Missing lines |
|---|---|---|
| `__tests__/connection-routing.test.ts` | `connection.ts` + `offscreen/index.ts` | 239 + 122 |
| `__tests__/slack-session.test.ts` | `src/background/apps/slack.ts` + remaining `shared/lib/slack.ts` | 166 + 7 |
| `__tests__/offscreen-pairing.test.ts` | `src/offscreen/pairing.ts` | 114 |
| `__tests__/peer.test.ts` | `src/shared/lib/peer.ts` | 90 |
| `__tests__/pairing-ui.test.tsx` | `pairing-panel.tsx` + options locked-role line | 78 + 1 |
| `__tests__/request.test.ts` + lib tests | request, envelope, storage, uuid, error, pairing-protocol, identity-storage | ~95 |

## Done when

`diff-cover coverage/lcov.info --compare-branch=origin/master --fail-under=90` exits 0.
