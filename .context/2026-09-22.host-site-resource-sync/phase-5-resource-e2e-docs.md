---
status: completed
phase: 5
order: 5
plan: plan-host-site-resource-sync.md
phases_overview: plan-host-site-resource-sync-phases.md
difficulty: easy
model_hint: smaller/faster general model is fine
buck_hint: /b-build
goal: "Prove the feature end to end — full deterministic suite, guardrails verdict, two-profile manual smoke — and ship the user-facing docs."
files:
  - docs/howto/sync-site-resources.md
  - docs/quickstart.md
from_plan_steps: [9, 10]
depends_on: [1, 2, 3, 4]
dependency_type: HARD
acceptance_criteria:
  - "[x] Full vitest suite green: resource-sync + envelope cases plus the existing Slack/pairing suites."
  - "[x] `/b-guardrails-check` returns `status: pass` against the repo's durable `guardrails.json` contract."
  - "[x] Manual two-profile smoke per the plan's Verification steps 1–8 executed, with results recorded in this subject folder."
  - "[x] `docs/howto/sync-site-resources.md` documents pair → host options → pick site → grant permission → check items → confirm client cookie/key; records that values are never shown in the panel and that uncheck is not a remote delete."
  - "[x] `docs/quickstart.md` mentions the resource panel."
  - "[x] Cookie/storage values are absent from logs and test fixtures (synthetic values only) — verified by inspection; enterprise warning copy present, and the how-to does not present the feature as a bypass of the owner-authorization gate."
completed_at: 2026-09-23
completed_by: b-build
---

# Phase 5: End-to-end verification and docs

## Context

Parent user goal (inherited from [plan-host-site-resource-sync.md](plan-host-site-resource-sync.md)): host picks an open site, then copies chosen cookies/localStorage onto the paired client, live while checked.

All code phases (1–4) are done. This phase closes the loop: full deterministic verification, the manual two-profile smoke that proves the user goal, and the user-facing documentation. Same-machine two profiles suffice — this is not the Mac/Linux network gate.

## Implementation Details

From plan steps 9 (rollup) and 10:

1. **Deterministic sweep.** Run the full vitest suite; fix any in-scope failures (out-of-scope findings route to a separate `/b-plan`, they do not block). Run `/b-guardrails-check` and record the verdict.
2. **Manual smoke** (from the plan's Verification section):
   1. Pair host and client.
   2. On the host, open `https://example.com` (or a local test origin) and set a distinguishable cookie + localStorage key in DevTools.
   3. Host options: select that origin, grant permission, check both items.
   4. Client: cookie present via `chrome.cookies.get`; localStorage present in the auto-opened (or existing) tab.
   5. Change the host cookie and the localStorage value; client reflects both.
   6. Uncheck the cookie; change it on the host; client value stays at the last synced value.
   7. Close the host tab: cookie subscription still live; localStorage paused in the panel.
   8. Reopen the host origin: localStorage resumes and pushes.
   Record outcomes (e.g. a short results note or evidence file) in this subject folder.
3. **Docs.** Write `docs/howto/sync-site-resources.md` per the acceptance list, including the enterprise warning framing and the uncheck-is-not-delete guarantee. Add a brief resource-panel mention to `docs/quickstart.md`.
4. **Hygiene.** Confirm no real values in logs/fixtures; confirm the how-to doesn't document an owner-authorization bypass.

## Risks

- **Smoke reveals a cross-phase integration bug** (most likely cookie fidelity or tab lifecycle): fix in the owning module if in-scope; route to a new plan if it opens scope.
- **Docs overpromising.** The how-to must not market this as enterprise session export; the owner-authorization gate still applies to planned enterprise transfer.

## Verification

This phase *is* verification: green suite + passing guardrails verdict + recorded smoke results + docs reviewed are the deliverable.

Evidence is in [verification-phase-5-results.md](verification-phase-5-results.md). The two-profile smoke is recorded there, including the headless permission-prompt limitation.

## Per-Phase Execution Loop

If executing this phase inside an OMP execution session:
1. Run `/b-build` for this phase only.
2. Run `/b-review` against this phase file.
3. If review creates an `iterate-*.md` artifact (in-plan issues), run `/b-iterate`, then re-run `/b-review`. If review surfaces **out-of-plan issues** (new scope beyond this phase), do not iterate — route them to a separate `/b-plan` → `/b-build` follow-up; they do not block this phase. If `/b-review` flags documentation impact, run `/b-docs` before `/b-save`.
4. Run `/b-save` to consolidate memory, draft commits, and phase state.
5. Run `/b-commit` to checkpoint durable state.
6. If the phase is incomplete, leave `status: in-progress` so the session resumes here next turn.
