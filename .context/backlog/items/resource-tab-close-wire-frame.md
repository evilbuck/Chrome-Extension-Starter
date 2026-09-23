---
title: Resource tab-close signal for auto-opened client tabs
status: active
priority: medium
created: 2026-09-23
updated: 2026-09-23
completed: null
related:
  - .context/2026-09-22.host-site-resource-sync/review-zz-buck-loop-2026-09-23T04-38-07-709Z.md
  - .context/2026-09-22.host-site-resource-sync/phase-4-resource-client-apply.md
---

# Resource tab-close signal for auto-opened client tabs

Phase 4 review, out of plan. `releaseLocalStorage` closes only a feature-opened tab, and only after the last applied localStorage key for that origin is released. Nothing in the production inbound path calls it. Host uncheck still sends no frame, so the client cannot see a host subscription end. Auto-opened tabs stay open for the life of the client profile.

A cross-profile close needs a new wire frame. It is not a Phase 4 defect and is not in Phase 5's written acceptance criteria. Needs a separate `/b-plan` if product wants host uncheck to close the background tab.
