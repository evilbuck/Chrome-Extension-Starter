---
status: pending
phase: 2
order: 2
plan: plan-host-site-resource-sync.md
phases_overview: plan-host-site-resource-sync-phases.md
difficulty: medium
model_hint: capable general model preferred
buck_hint: /b-build
goal: "Host options page lists open-tab origins, requests per-origin optional permissions from a user gesture, and renders the unclassified cookie/localStorage panel with warning copy."
files:
  - src/pages/resources/site-panel.tsx
  - src/pages/options/index.tsx
  - src/background/apps/resources.ts
  - src/background/connection.ts
  - public/_locales/en/messages.json
  - public/_locales/ja/messages.json
  - public/_locales/zh_TW/messages.json
  - __tests__/resource-sync.test.ts
from_plan_steps: [2]
depends_on: [1]
dependency_type: HARD
acceptance_criteria:
  - "[ ] Panel is mounted on the options page only when this profile is host and the pair is authorized; client role sees no picker."
  - "[ ] Site list shows unique http(s) origins derived from open host tabs (one row per origin, not per tab); incognito and `RESTRICTED` schemes are skipped."
  - "[ ] Selecting a site runs `chrome.permissions.request` in the options page (user gesture), then sends `RESOURCE_ENABLE` + `RESOURCE_LIST_ITEMS`; on denial the panel lists nothing and the worker returns `permission_denied` without throwing."
  - "[ ] Panel lists every cookie `chrome.cookies.getAll` returns for that URL (including httpOnly) and every localStorage key readable from a same-origin host tab, with name/domain/path/flags/size metadata — unclassified, no values rendered."
  - "[ ] Warning copy present in `en` (ja/zh_TW keys exist; English text acceptable until translated): checked items — including credentials — are copied live to the paired client; the extension does not decide what matters."
  - "[ ] `src/background/apps/resources.ts` handles `RESOURCE_LIST_SITES` / `RESOURCE_ENABLE` / `RESOURCE_LIST_ITEMS` behind the existing `isAllowedUiPage` sender gate; the Slack pipeline is untouched."
  - "[ ] Tests pass for the site filter and the permission-denied path (synthetic values only)."
completed_at: null
completed_by: null
---

# Phase 2: Host site picker and resource panel

## Context

Parent user goal (inherited from [plan-host-site-resource-sync.md](plan-host-site-resource-sync.md)): host picks an open site, then copies chosen cookies/localStorage onto the paired client, live while checked.

This phase builds the host-side control surface on top of Phase 1's contract: the site picker, the optional-permission flow, and the two unlabeled resource lists. Checkboxes render here but do not subscribe yet — subscription and live sync are Phase 3.

## Implementation Details

From plan step 2:

1. **Panel component** (`src/pages/resources/site-panel.tsx`, new): site `<select>` populated from `RESOURCE_LIST_SITES`; two lists (Cookies, localStorage) with checkboxes and metadata (name, domain, path, flags, size). Never render values.
2. **Mount** (`src/pages/options/index.tsx`): show the panel only for host role + authorized pair. Follow the existing `SLACK_ENABLE` / `SLACK_PERMISSIONS` optional-permission UI pattern.
3. **Worker module** (`src/background/apps/resources.ts`, new): handle `RESOURCE_LIST_SITES` (`chrome.tabs.query` → unique origins via Phase 1's filter), `RESOURCE_ENABLE` (`chrome.permissions.contains` only — the worker never calls `request`), `RESOURCE_LIST_ITEMS` (`chrome.cookies.getAll` for the origin URL + localStorage keys via `executeScript` `localStorage` enumeration from a same-origin host tab, using the isolated-world pattern Slack already uses for `localConfig_v2`). If a site isolates storage from the isolated world, surface "unreadable" rather than an empty list.
4. **Routing** (`src/background/connection.ts`): wire the three options-only commands behind `isAllowedUiPage`; keep them out of the Slack pipeline.
5. **Locales** (`public/_locales/{en,ja,zh_TW}/messages.json`): site-picker labels, list headers, and the required warning copy.
6. **Tests** (`__tests__/resource-sync.test.ts`, new file): origin filtering (unique, http(s) only, incognito/restricted skipped); permission-denied returns empty list without throwing. Synthetic values only.

## Risks

- **Permission UX.** `chrome.permissions.request` requires a user gesture — it must run in the options page, never in the worker. Keep the worker on `contains()` only.
- **Value leakage in UI.** The panel must show identity + metadata only; a value column is a defect.
- **Empty ≠ unreadable.** An isolated-world storage read failure must be distinct from a genuinely empty store.

## Verification

- Targeted vitest for site filter and permission-denied passes; Slack suites stay green.
- Manual: `pnpm build:prod`, load `dist/`, pair host+client; on host options page confirm the picker lists open origins, granting permission lists cookies + localStorage keys, denying lists nothing without errors.

## Per-Phase Execution Loop

If executing this phase inside an OMP execution session:
1. Run `/b-build` for this phase only (escalate to `/b-build-hard` if ambiguity appears).
2. Run `/b-review` against this phase file.
3. If review creates an `iterate-*.md` artifact (in-plan issues), run `/b-iterate`, then re-run `/b-review`. If review surfaces **out-of-plan issues** (new scope beyond this phase), do not iterate — route them to a separate `/b-plan` → `/b-build` follow-up; they do not block this phase. If `/b-review` flags documentation impact, run `/b-docs` before `/b-save`.
4. Run `/b-save` to consolidate memory, draft commits, and phase state.
5. Run `/b-commit` to checkpoint durable state.
6. If the phase is incomplete, leave `status: in-progress` so the session resumes here next turn.
