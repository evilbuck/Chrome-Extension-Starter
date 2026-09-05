---
title: Resolve application handoff and host preservation
status: active
priority: high
created: 2026-09-05
updated: 2026-09-05
completed: null
related:
  - .context/2026-09-05.lan-login-handoff/plan-lan-login-handoff.md
  - .context/2026-09-05.lan-login-handoff/research-auth-compatibility.md
  - .context/2026-09-05.lan-login-handoff/research-zoom-compatibility.md
---

# Resolve application handoff and host preservation

Public documentation establishes normal browser SSO but not the application's cross-machine completion mechanism. Resolve this before building app adapters. Required targets: Outlook web, Slack web and authenticated Zoom Web App; macOS host, Linux client; both existing-host-session and normal-host-SSO starting cases.

## Acceptance criteria

- [ ] For each target, record a concrete permissible completion contract or a specific unsupported/unresolved boundary; no generic cookie/blob adapter substitutes for the missing mechanism.
- [ ] A proposed contract identifies minimal origin/state/permission scope, account isolation, validity, expiry behavior and possible host effects without recording any credential values.
- [ ] With explicit authorization for each live account/session operation, observe intended client account access and host preservation for both cases; use disposable isolated profiles first and do not force logout of the persistent host.
- [ ] Do not count a portal, guest meeting, API grant, transport round trip or SSO redirect as authenticated application completion.
- [ ] Required provider checks remain explicitly human-completed; no device-proof bypass, one-time assertion replay or policy change.
- [ ] Findings distinguish an investigation result from the feature's unmet acceptance criteria. Any unsupported required target keeps the overall feature incomplete.

The source/contract investigation can proceed independently of transport. Its real cross-machine demonstration requires the selected peer path. No live session operation is authorized by this backlog entry alone.
