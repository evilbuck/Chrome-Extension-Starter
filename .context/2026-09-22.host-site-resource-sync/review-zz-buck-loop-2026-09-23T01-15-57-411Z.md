## Plan Path Review: Phase 2 — Host site picker and resource panel

### Plan Source
- File: `.context/2026-09-22.host-site-resource-sync/phase-2-resource-site-panel.md`
- Goal: Authorized hosts can select open-tab origins, grant per-origin permissions, and inspect cookie/localStorage metadata without exposing values.
- Baseline: `9e32a4e` — Phase 1 implementation; reviewed current uncommitted Phase 2 state.

### Evidence Sources
- Git status: Phase 2 implementation and workflow artifacts are uncommitted.
- Recent relevant commit: `9e32a4e feat(resources): land wire contract and optional host permissions`
- Implementation inspected:
  - `src/pages/resources/site-panel.tsx`
  - `src/pages/options/index.tsx`
  - `src/background/apps/resources.ts`
  - `src/background/connection.ts`
  - `src/shared/lib/resources.ts`
  - `src/shared/constants.ts`
  - locale and test changes
- Actual UI evidence: `/tmp/teleport-resource-panel.png`
- Production build: passed.
- Durable guardrails: passed.

### Completion Matrix

| Step | Status | Evidence |
|---|---|---|
| Panel component | 🔄 partial | Picker, warning, cookie/localStorage lists, unreadable state, and metadata-only rendering exist in `site-panel.tsx:111-219`. Cookie row identity omits `partitionKey` at lines 192–196. |
| Authorized-host-only mount | ✅ complete | `options/index.tsx:56-72`; host/authorized/client transitions covered in `pairing-ui.test.tsx`. |
| Worker listing module | ✅ complete | Permission recheck, unique site list, cookie metadata, isolated-world localStorage inspection, and unreadable state in `resources.ts:34-146`. |
| Options-only routing | ✅ complete | Exact options sender gate plus authorized host check in `connection.ts:523-556,827-930`. |
| Locale copy | ✅ complete | Required warning and panel keys exist in en/ja/zh_TW; UI screenshot shows the English warning. |
| Site-filter and denial tests | ✅ complete | `resource-sync.test.ts:59-97,172-210`; guardrails unit gate passed. |
| Production verification | ✅ complete | `pnpm build:prod` built worker and web bundles successfully; screenshot shows the authorized host panel with synthetic cookie and localStorage metadata. |

### Review Axes
- **Spec axis worst finding:** Distinct partitioned cookies can share the same Preact key and appear indistinguishable because `partitionKey` is omitted from the row key and visible flags.
- **Standards axis worst finding:** `site-panel.tsx:192-196` reimplements cookie identity incompletely instead of reusing the existing `cookieIdentityKey` domain helper. Sequential fallback pass used with TypeScript/React, security, error-handling, and relevant code-smell guides.
- Cross-axis ranking: none.

### Verification Status
- Goal achieved: **partial**
- Phase user-facing goal: Picker and metadata listing work, but partition-aware cookie representation is incomplete.
- Scope adhered: yes.
- Out-of-scope changes: none identified.
- Slack pipeline: untouched.

### Guardrails Verdict
- Contract: `durable`
- Contract version: `2`
- Status: `pass`
- Gates:
  - `unit_test_gate=pass`
  - `functional_test_gate=skipped`
  - `lint_gate=pass`
  - `patch_gate=pass`
  - `global_ratchet=pass`
  - `complexity_gate=pass`
- Coverage: `91.10%`, baseline `91.07%`
- Production build: passed.

### User Goal Analysis
- Goal: Host picks an open site, then copies chosen cookies/localStorage onto the paired client.
- Met in this phase: authorized-host picker, permission acquisition, and metadata-only resource discovery.
- Partial: partitioned cookies are not represented with their complete identity.
- Missing by design: subscriptions and client copying belong to Phases 3–4.
- Verdict: partially met as expected for Phase 2, with one Phase 2 defect.

### Documentation Impact
- No architecture, convention, or domain-language impact requiring living-document updates in this phase.
- Recommended: none.

### How-to Impact
- The new site-selection action will need user documentation, but Phase 5 explicitly owns the completed end-to-end how-to.
- Recommended: no Phase 2 documentation action.

### Issue Classification
- **In-plan issue:** `site-panel.tsx:192-196` omits `partitionKey` from cookie row identity and displayed metadata. Cookies differing only by partition can receive duplicate keys and become indistinguishable or reconcile incorrectly.
- **Out-of-plan issues:** none.

### Verdict
**Needs work** — one in-plan correctness issue.

Iteration artifact written:

`.context/2026-09-22.host-site-resource-sync/iterate-host-site-resource-sync.md`

The supervisor owns the next loop transition.
