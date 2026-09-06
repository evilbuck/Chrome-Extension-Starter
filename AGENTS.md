<!-- BEGIN b-init-guardrails -->
# Quality Guardrails (managed block)

This block is managed by `b-init-guardrails`. Do not edit manually; re-run the skill to refresh.

## When to Run Guardrails Checks

The **mainline agent** owns dispatch. Run a guardrails check **at coherent points** — after a completed edit batch, never per-file. Examples:
- After finishing a feature or bug fix
- Before committing
- When the mainline agent is about to yield

If the session touched code, the check is **blocking** for completion. A session is docs-only when every changed path is `.md`, `.mdx`, `.txt`, `LICENSE`, or under `.context/`, `docs/`, or `presentations/` — those skip the gate with one line of explanation. Any other change (source, `package.json`, lockfiles, CI YAML) makes the session code-touching and the gate mandatory.

Do **not** run mid-edit; the working tree may be in an inconsistent state and yield false failures. `b-guardrails-check` only measures — it never dispatches itself and never edits.

## How to Read a Verdict

`/b-guardrails-check` resolves its contract via `skills/b-guardrails-check/docs/contract-resolution.md` and returns a structured verdict:

```json
{
  "status": "pass",
  "contract": "durable",
  "contract_version": 2,
  "tests": {
    "unit_gate": "pass",
    "unit_exit_code": 0,
    "functional_gate": "skipped",
    "functional_exit_code": null
  },
  "lint": {
    "lint_gate": "pass",
    "mode": "diff-scoped",
    "files_linted": 3,
    "exit_code": 0
  },
  "coverage": {
    "current": 45.2,
    "baseline": 42.5,
    "target": 75,
    "patch": 92.0,
    "patch_threshold": 90,
    "patch_gate": "pass"
  },
  "complexity": {
    "hotspots_remaining": 10,
    "baseline_size": 12,
    "new_violations": [],
    "hard_ceiling_violations": [],
    "complexity_gate": "pass"
  },
  "gates": {
    "unit_test_gate": "pass",
    "functional_test_gate": "skipped",
    "lint_gate": "pass",
    "patch_gate": "pass",
    "global_ratchet": "pass",
    "complexity_gate": "pass"
  },
  "ratchet_update": {
    "baseline_coverage_rewrites": true,
    "new_baseline_coverage": 45.2,
    "complexity_inventory_rewrites": true,
    "new_complexity_baseline_size": 10,
    "complexity_baseline_file": null
  }
}
```

- `status: pass` — all gates passed. Continue.
- `status: fail` — one or more gates failed. The verdict shows which gate failed and by how much.
- `contract` — one of `durable`, `ephemeral`, `suggested`, `none`. A `none` or `suggested` result means the repo needs `/b-init-guardrails` to record a real contract.
- `ratchet_update` — a proposed update only. The check skill is read-only; the mainline agent or `/b-init-guardrails` refresh applies approved baseline raises and complexity-inventory shrinkage at a coherent point.

## What to Do on Failure

**Unit / functional test failure** (gate `fail`):
- Fix the test or the code under test before committing.
- Never delete the test, never record `null` to silence the gate, never widen ignores.

**Lint gate failure** (gate `fail`, mode `diff-scoped` or `whole-repo-enforced`):
- Fix the reported lint errors in the files you changed.
- Never widen the lint ignore config to silence the gate. If a lint_cmd is genuinely wrong, re-run `/b-init-guardrails` to refresh.

**Patch gate failure** (changed lines < 90% covered):
- Add tests for the changed lines before committing.
- Do not lower the threshold; the patch gate is non-negotiable.

**Global ratchet failure** (coverage regressed below baseline):
- Add tests to bring coverage back to or above the baseline.
- Do not re-baseline unless explicitly approved by the user (re-baseline is a manual opt-in, not automatic).

**Complexity violation** (new function > 10 cyclomatic):
- Refactor the function before committing.
- If the function is legitimately complex, document the exception and add it to the baseline via explicit re-baseline (manual opt-in).

**v1 contract detected** (`contract_version: 1`):
- Run `/b-init-guardrails` to upgrade to v2 and add lint and functional-test gates.

## Contract Resolution

`/b-guardrails-check` resolves the check contract in this order, first hit wins. **Resolution never writes a file.**

1. `guardrails.json` at repo root → authoritative. Run all gates. Verdict `contract: "durable"`.
2. Managed block present but `guardrails.json` missing → warn the contract is broken, continue to step 3.
3. `b-init-guardrails`' `scripts/detect-stack.ts` reports ≥ 1 ecosystem → ephemeral contract; run lint and test gates only. Verdict `contract: "ephemeral"`.
4. No ecosystem detected → surface any `README.md` testing/development command block as unverified suggestions. Do not execute them. Verdict `contract: "suggested"`.
5. Nothing found → warn and offer `/b-init-guardrails`. Verdict `contract: "none"`.

Full chain: `skills/b-guardrails-check/docs/contract-resolution.md`.

## Dispatch Modes

**Caller owns the mode.** Choose by harness; do not assume a bare slash command is non-blocking.

**OMP (async):** fire a background `task` that runs the measurement procedure, then keep working until the verdict auto-delivers:
```typescript
task({
  tasks: [{
    task: "Run b-guardrails-check in the current repo and return the structured verdict JSON",
    agent: "task"
  }]
})
```
Equivalent: load `skills/b-guardrails-check/SKILL.md` (or `skill://b-guardrails-check`) inside that background task. A foreground `/b-guardrails-check` is still a normal blocking skill run.

**Portable (blocking):** at a coherent checkpoint, run `/b-guardrails-check` (or load the skill) synchronously and wait for the verdict before proceeding.

## Coherent-Point Dispatch Rule

The mainline agent must dispatch checks **at coherent points** — after a completed edit batch, never per-file. This avoids false failures from tree contention (the check reading a half-written tree).

If a check fails, re-verify before escalating:
1. Ensure the working tree is in a consistent state (no mid-edit files).
2. Re-run the check.
3. If it fails again, treat it as a real failure and act on the verdict.

<!-- END b-init-guardrails -->
