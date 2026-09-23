---
title: Client origin grant before resource apply
status: active
priority: high
created: 2026-09-23
updated: 2026-09-23
completed: null
related:
  - .context/2026-09-22.host-site-resource-sync/review-zz-buck-loop-2026-09-23T04-38-07-709Z.md
  - .context/2026-09-22.host-site-resource-sync/phase-5-resource-e2e-docs.md
  - .context/2026-09-22.host-site-resource-sync/phase-4-resource-client-apply.md
---

# Client origin grant before resource apply

Phase 4 review, out of plan. Apply checks `{ permissions: ['cookies', 'scripting'], origins: [origin/*] }`. That grant is requested only from the host options panel. `permissions.request` needs a user gesture, so an inbound frame cannot grant it. A fresh client fails closed with `permission_denied` and writes nothing.

Do not remove the check. Without it, `cookies.set` / `executeScript` still fail, and the check is what stops a paired host from opening tabs before the user allows that origin.

Phase 5 smoke step 4 will not pass until a client grant exists. Needs a separate `/b-plan` → `/b-build`. Does not reopen Phase 4.
