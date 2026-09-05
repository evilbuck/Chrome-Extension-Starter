---
status: pending
phase: 10
order: 10
plan: plan-lan-login-handoff.md
phases_overview: plan-lan-login-handoff-phases.md
difficulty: medium
model_hint: Capable general model preferred — cross-cutting cleanup, localization, packaging and evidence-accurate documentation
buck_hint: /b-build
goal: "Remove experiment/starter residue, localize and document only demonstrated behavior, and produce a clean verified development package."
omp_execution: none
files:
  - public/manifest.json
  - public/_locales/en/messages.json
  - public/_locales/ja/messages.json
  - public/_locales/zh_TW/messages.json
  - rsbuild.config.ts
  - src/background/alarms.ts
  - src/content/index.tsx
  - src/content/bridge.ts
  - src/pages/popup/index.tsx
  - src/pages/options/index.tsx
  - README.md
  - CHANGELOG.md
from_plan_steps: [8]
depends_on: [9]
dependency_type: HARD
acceptance_criteria:
  - "[ ] Throwaway experiments and obsolete starter messages, controls, alarms, content/build wiring, permissions and strings are removed without deleting unrelated reusable code."
  - "[ ] Manifest permissions and advertised support exactly match Phase 9 evidence; unmet requirements remain explicit."
  - "[ ] English, Japanese and Traditional Chinese catalogs cover all shipped controls/statuses and contain no displaced demo strings."
  - "[ ] README covers actual Mac/Linux setup, manual signaling, development-only no-pairing risk, supported matrix, limits, disconnect and teardown."
  - "[ ] CHANGELOG describes demonstrated behavior without claiming shipped pairing, universal portability or unsupported apps."
  - "[ ] No raw HAR, token, cookie/session export, SDP/ICE descriptor, full candidate address or credential remains."
  - "[ ] Deterministic checks, typecheck, production build/package inspection and built-extension smoke pass."
completed_at: null
completed_by: null
memory:
  - lan-login-handoff-implementation-2026-09-05.md
  - lan-login-handoff-planning-2026-09-05.md
  - lan-login-handoff-phasing-2026-09-05.md

---

# Phase 10: Demonstrated Cutover

## Context

Inherited user goal (from [plan-lan-login-handoff.md](plan-lan-login-handoff.md)): enable one person to use Microsoft 365, Zoom and Slack web applications from another computer they own on a shared tailnet or internal LAN without repeated lengthy login/logout flows, using either the host's existing Okta authentication or its existing session in the requested application, while the host remains logged in.

Phase 9 is a HARD dependency: cleanup, permissions and claims follow observed results. This phase adds no new auth mechanism. If any required row remains unmet, it may package/document a partial experiment, but the parent plan/subject remains active.

## Implementation Details

1. Use LSP references before removing exported demo symbols/files. Remove starter color/counter controls, `CHANGE_BG`, demo alarms, obsolete overlay/bridge/build entries, probes and debug controls; preserve unrelated utilities/tests.
2. Minimize final manifest/build entries and permissions to demonstrated controllers. No `<all_urls>`, public ingress, Funnel, speculative native messaging or companion permission.
3. Update English, Japanese and Traditional Chinese locale catalogs for shipped controls/status/failures/trust warnings; remove demo strings through the existing i18n mechanism.
4. Update README with supported Chrome floor, Mac host/Linux client setup, unpacked build loading, development-only private-network/no-pairing warning, manual offer/answer, exact app/account scope, supported matrix, provider/device/expiry limits, direct client traffic, disconnect/reconnect and non-destructive teardown.
5. Update CHANGELOG from Phase 9 evidence only. Do not claim production pairing, universal Okta sharing, native-app support, monitoring evasion or unsupported cases.
6. Remove throwaway scripts and sensitive artifacts. Retain only non-secret compatibility/verification records.
7. Resolve and run the Deterministic Check Contract, plus `pnpm typecheck`, `pnpm build:prod`, emitted manifest/page/worker/offscreen inspection and built setup → connect → supported sync → disconnect smoke.
8. Mark the parent plan/subject completed only if every original criterion and required matrix row passes; otherwise leave them active with explicit unmet requirements.

## Risks

- Evidence can be overclaimed in README/CHANGELOG; compare each claim to the matrix.
- Cleanup can break emitted MV3 paths; load the production build afterward.
- Experimental permission residue increases blast radius; every final origin/API needs a live caller.
- Teardown must never clear host auth or reset global Tailscale Serve state.

## Verification

- Run deterministic checks, typecheck, production build, package inspection and built-extension smoke.
- Verify all used locale keys exist in all three catalogs and demo keys have no callers.
- Review README/CHANGELOG row-by-row against Phase 9 and confirm sensitive artifact absence.
- Run `/b-review`; if documentation impact is flagged, run `/b-docs` before `/b-save`.

## Per-Phase Execution Loop

If executing this phase inside an OMP execution session:
1. Run `/b-build` for this phase only. (`omp_execution: none` — start a plain first turn; escalate if architecture ambiguity appears.)
2. Run `/b-review` against this phase file.
3. For in-plan findings run `/b-iterate` then `/b-review`; out-of-plan issues use a separate plan/build cycle. Run `/b-docs` if review flags documentation impact.
4. Run `/b-save`.
5. Run `/b-commit`; one phase completion equals one commit.
6. If incomplete, leave `status: in-progress` for resume.
