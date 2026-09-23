---
date: 2026-09-22
domains: [chrome-extension, resource-sync, frontend, testing]
topics: [subscriptions, cookies, localStorage, live-watch, pause-resume, authorized-transport, persistence-normalization]
related: [host-site-resource-sync-phase-2-2026-09-22.md]
priority: high
status: completed
subject: 2026-09-22.host-site-resource-sync
artifacts:
  - phase-3-resource-live-watches.md
  - plan-host-site-resource-sync-phases.md
  - draft-commit.md
  - iterate-host-site-resource-sync.md
---

# Host site resource sync — Phase 3 live watches completed

Implemented only `phase-3-resource-live-watches.md`. Client-side application remains Phase 4.

## Shipped

- Identity-only cookie and localStorage subscriptions persist in `chrome.storage.local`; worker startup reloads them, synchronous top-level listeners catch revival events, and a durable one-minute `chrome.alarms` wakeup replaces service-worker timers.
- Subscribe snapshots and sends the current value through the authorized `resource_upsert` app channel. Cookie frames preserve domain, path, security flags, SameSite, session/expiration, and partition metadata.
- Unsubscribe removes only the host subscription. No cookie/localStorage delete operation or delete frame exists.
- Cookie change events push subscribed sets and ignore removals while preserving the subscription.
- localStorage keys poll through `executeScript(localStorage.getItem)`, pause while no same-origin non-incognito tab exists, and resume/push on reopen or completed navigation.
- `RESOURCE_STATUS` exposes checked, paused, and error state. The options panel renders controlled checkboxes and paused/send-failure labels.
- Disconnect/unauthorized transport returns `disconnected` without emitting an app frame; subscriptions remain. Authorized reconnect refreshes current values.
- Overlapping reconnect refreshes queue a full follow-up pass, so a stale connection's in-flight send cannot consume the refresh needed by the next authorized connection.
- Options-page status polling is selection-scoped; a delayed response for an old origin cannot clear the new origin's persisted checkbox state.

## Verification

- TDD RED reproduced three final review defects: an in-flight cookie snapshot sent after unsubscribe, persisted subscription values leaked into status, and zero-subscription revival left the durable polling alarm untouched.
- Targeted regressions reproduced and now cover queued refresh delivery plus stale cross-origin status polling.
- Final light iteration gates pass: all 455 unit tests and diff-scoped Biome checks across all 11 changed code files.
- The production bundle succeeds after making the stale-status-poll timer mock return a `NodeJS.Timeout`-compatible handle; the targeted regression passes independently.
- The latest durable guardrails v2 review pass remains recorded at 91.40% coverage versus the 91.07% baseline, with no new complexity violation.
- Earlier review regressions continue to cover worker revival, out-of-order selection, denied-then-successful selection, alarm suspension/resumption, stale localStorage/cookie refresh after unsubscribe, persisted identity normalization, and stale toggle completion.
- Full paired-client visual confirmation is intentionally deferred to Phase 5 because Phase 4 client apply is not implemented. Browser behavior is covered through panel interaction regressions and the production bundle build.

## Decisions

- Subscriptions persist only identities; current values and localStorage comparison baselines remain in worker memory.
- Failed sends do not advance the localStorage comparison baseline, so reconnect/rescan retries the current value.
- Host-side cookie/localStorage removal sends no delete and leaves the subscription checked.
- The options panel polls `RESOURCE_STATUS` while a site is selected so tab-close pause and retry errors become visible without a new event contract.
- Site selection uses a monotonic request identity; only the latest request may update rows, status, errors, or busy state.
- The durable localStorage poll alarm exists only while at least one subscription has a same-origin non-incognito tab; synchronous tab listeners re-arm it on resume.
- Toggle responses are scoped to the selection request that initiated them, matching the existing stale-load protection.
- Worker revival clears the named durable alarm whenever every localStorage subscription is paused, regardless of process-local scheduling state.
- A localStorage refresh revalidates exact subscription membership after its asynchronous page read, so an unsubscribe completed during the read prevents the stale upsert.
- Cookie refresh revalidates exact subscription membership after its asynchronous lookup, matching the localStorage stale-read boundary.
- Revival reconciles the named durable alarm even when no localStorage subscriptions remain.
- Loaded subscriptions are reconstructed through the parser so unknown fields and stale values never enter worker state or the next persistence write.

- Refresh requests that arrive while a pass is active set a dirty flag; the active promise owns repeated full passes until no request remains queued.
- Status polling captures the selection request active when its interval was created and ignores responses after cleanup or a newer selection.
- The status-poll regression uses a non-scheduled, type-compatible timer handle so tests stay deterministic while satisfying the project's merged DOM/Node timer declarations.

## Files modified

- `src/background/apps/resources.ts`
- `src/background/connection.ts`
- `src/pages/resources/site-panel.tsx`
- `src/shared/constants.ts`
- `src/shared/types.d.ts`
- `public/_locales/{en,ja,zh_TW}/messages.json`
- `public/manifest.json`
- `__tests__/resource-sync.test.ts`
- `__tests__/connection-routing.test.ts`
- Phase, overview, backlog, memory, and draft-commit artifacts under `.context/`

## Next

Phase 4 applies inbound resource upserts on the client and returns typed acknowledgements/errors.
