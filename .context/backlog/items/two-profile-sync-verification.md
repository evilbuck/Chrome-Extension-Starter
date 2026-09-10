---
title: Verify cross-device hide sync on two Chrome profiles
status: active
priority: medium
created: 2026-09-10
updated: 2026-09-10
completed: null
related:
  - src/shared/hidden-items.ts
  - ../2026-09-08.hidden-items-sync-strategy/plan-hidden-items-sync.md
---

# Verify cross-device hide sync on two Chrome profiles

The only unverified acceptance criterion of the hidden-items sync plan
(plan criterion 1, pre-acknowledged as "not yet verified live"). Mechanism
is unit-proven and SW-smoke-tested; Chrome-Sync propagation between real
profiles has never been observed.

## Steps

1. Two disposable Chrome profiles signed into one sync-enabled account
   (or two browsers on one profile), unpacked `dist/` loaded in both.
2. Hide an item on profile A; confirm within ~seconds it hides on B
   (search results + options list), with no thumbnail on B.
3. Restore on B; confirm A follows.
4. Check `chrome://extensions` SW console for unexpected sync errors.

## Acceptance

- Hide/restore propagates both directions without thumbnails crossing,
  and no shard/manifest mismatch errors are logged.
