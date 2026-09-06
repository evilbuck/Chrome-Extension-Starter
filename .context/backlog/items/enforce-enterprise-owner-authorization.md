---
title: Enforce owner authorization before enterprise session transfer
status: active
priority: high
created: 2026-09-06
updated: 2026-09-06
completed: null
related:
  - .context/2026-09-06.policy-use-case-audit/research-policy-use-case-audit.md
  - .context/2026-09-05.lan-login-handoff/plan-lan-login-handoff.md
  - .context/2026-09-05.lan-login-handoff/brainstorm-lan-login-handoff.md
  - .context/2026-09-05.lan-login-handoff/phase-3-application-compatibility-gate.md
  - .context/2026-09-05.lan-login-handoff/slack-session-transport-experiment.json
---

# Enforce owner authorization before enterprise session transfer

Individual user consent, device ownership, pairing, and ordinary application access do not prove that an enterprise service owner authorized session export or replay. The policy audit paused further real enterprise transfer until that authorization is recorded. This item is a human/process precondition: obtain and keep a written owner grant. Do not build an automatic employer-approval verifier.

## Acceptance criteria

- [ ] Before any further real enterprise application-session export or replay, a written organization/service-owner authorization names the exact account, tenant/workspace, device set, and transfer mechanism.
- [ ] The record states that normal user account access, personal consent, and device ownership are necessary but not sufficient for an organization-managed service.
- [ ] Pairing is treated only as device trust of the extension endpoint and is never presented as account, tenant, or owner authorization.
- [ ] Absent, ambiguous, or revoked owner authorization fails closed: no real session transfer proceeds (unsupported / blocked).
- [ ] Provider MFA, device binding, conditional access, concurrent-session limits, reauthentication, sign-in alerts, and service rejection remain final boundaries, not defects to bypass.
- [ ] No-pairing operation is restricted to synthetic traffic or disposable testing accounts; it never carries real personal, employer, customer, or enterprise authentication state.
- [ ] No automatic employer-approval detector, scanner, or verifier is requested or implemented; the gate is a documented owner grant, not inferred from user statements or product policy text.
