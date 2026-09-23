---
title: Resources Phase 5: End-to-end verification and docs
status: active
priority: medium
created: 2026-09-22
updated: 2026-09-22
completed: null
related:
  - .context/2026-09-22.host-site-resource-sync/phase-5-resource-e2e-docs.md
  - .context/2026-09-22.host-site-resource-sync/plan-host-site-resource-sync-phases.md
---

# Resources Phase 5: End-to-end verification and docs

Full vitest suite + `/b-guardrails-check` pass; manual two-profile smoke (pair → check items → client copy → live change → uncheck keeps last value → host-tab close pauses localStorage only → reopen resumes) with results recorded in the subject folder; write `docs/howto/sync-site-resources.md` (values never shown; uncheck is not a remote delete; not an owner-authorization bypass) and update `docs/quickstart.md`.

Full details and acceptance criteria: [phase-5-resource-e2e-docs.md](../../2026-09-22.host-site-resource-sync/phase-5-resource-e2e-docs.md). Execute with `/b-build`. HARD-depends on Phases 1–4.
