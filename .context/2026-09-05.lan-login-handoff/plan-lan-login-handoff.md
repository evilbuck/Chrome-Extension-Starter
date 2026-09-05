---
status: active
date: 2026-09-05
subject: 2026-09-05.lan-login-handoff
topics: [chrome-extension, authentication, lan, tailscale, web-rtc, session-portability]
research: [research-auth-compatibility.md, research-extension-transport.md, research-zoom-compatibility.md]
iterations: []
spec: null
memory: [lan-login-handoff-planning-2026-09-05.md, lan-login-handoff-phasing-2026-09-05.md, lan-login-handoff-implementation-2026-09-05.md]
---

# Plan: Development-only host-controlled application authentication

## User Goal

Enable one person to use Microsoft 365, Zoom, and Slack web applications from another computer they own on a shared tailnet or internal LAN without repeated lengthy login/logout flows, using either the host's existing Okta authentication or its existing session in the requested application, while the host remains logged in.

## Goal

Turn the confirmed application-first workflow into a bounded development PoC. Preserve all three target applications and both starting cases. Establish real client authentication and continued host authentication before declaring any application supported.

Planning is complete; implementation has not started. The transport candidate and user-visible contract are bounded below. **Only the feasibility gates are immediately executable:** no researched source establishes the application-session handoff, so application integration remains conditional on an actual compatible mechanism and observed host preservation. A negative feasibility result is useful evidence, not completion of the requested feature.

## Context used / assumptions

- Source requirements: [brainstorm](brainstorm-lan-login-handoff.md), particularly its user goal, two application-first cases, and development trust exception.
- Source evidence: [authentication compatibility report](research-auth-compatibility.md). Its earlier IdP-first recommendation is superseded by the later application-first decision; its factual limits remain relevant. Its completed scope excludes Zoom.
- New evidence: [extension transport](research-extension-transport.md) and [Zoom compatibility](research-zoom-compatibility.md), including official Chrome, WebRTC, Tailscale, Zoom and Okta sources. Zoom is now documented at the public-source level, not verified in this tenant.
- Current repository: Preact/TypeScript MV3 starter, pnpm/Rsbuild, Biome, Vitest. Background handles action policy, migrations, and demo alarms. Popup/options are color/counter demos. No application-authentication or LAN transport implementation exists in the inspected runtime/UI paths.
- The user invoked B-Plan, superseding the earlier request to remain in brainstorming. Do not rewrite the brainstorm history as though planning had already occurred.
- Capability probe: full; source: active-session available-skills catalog; b-build, b-review, b-save all available; missing sentinels: none. b-phase and b-research also available.
- User-reported managed firewall: include Tailscale forwarding analogous to the existing OpenSSH setup. This concerns the peer channel, never proxying Slack, Zoom, Microsoft 365, or Okta website traffic.

## Confirmed scope

- A Chrome extension on host and client, for one person's computers.
- The client explicitly clicks `sync auth` for a named application/account/workspace and intended destination.
- Case 2: reuse the host's existing application session when usable.
- Case 1: otherwise orchestrate normal app-to-Okta-to-app sign-in in the host's Chrome, pausing for required human interaction, then reach the same application-specific handoff boundary.
- The host stays logged in; the client uses the application directly.
- Development-only private-network PoC: skip pairing and assume trusted clients; no per-request host approval. Later shipped versions require pairing. Reachability alone is not peer authentication.
- Prefer extension-only transport. A companion is acceptable only if research shows it is needed; no helper installation is authorized by this planning task.
- Tailscale forwarding is a candidate private peer-channel path when a policy-managed firewall prevents ordinary LAN connectivity. Actual Serve endpoint/backend requirements and extension WebRTC compatibility must be distinguished.
- Manual offer/answer exchange for each new peer connection is accepted. This is ephemeral connection setup, not durable pairing or host approval per `sync auth`.
- One host, one client and one in-flight authentication request at a time is the conservative PoC default. Additional client management and concurrency are not part of the first demonstration.

## Confirmed verification matrix

| Role / surface | Required target |
|---|---|
| Host | macOS, Chrome, existing Okta and/or application session |
| Client | Linux, Chrome, same person's intended account |
| Microsoft 365 | Outlook on the web; Teams and SharePoint are not this PoC's Microsoft acceptance targets |
| Slack | Signed-in Slack web workspace |
| Zoom | Signed-in Zoom Web App; portal-only or anonymous meeting access is not equivalent |
| Network | Private development environment; evaluate usable LAN/tailnet routes and Tailscale forwarding without changing managed firewall policy |

Exact Chrome versions, account/workspace identifiers and provider configuration are non-secret preflight inputs for the later experiment, not values to invent in this plan. Zoom Web App is the standard interpretation of the confirmed web-application goal, not a claim of compatibility.

## Out of scope

- Production distribution, shipped pairing/grants/revocation implementation, public ingress, Tailscale Funnel, or cloud application-traffic proxying.
- Continuous background authentication sync, whole-profile export, native-app credential copying, general Okta-session distribution, monitoring evasion, or bypassing required device/MFA/consent checks.
- Real login/session access, policy changes, firewall changes, Tailscale changes, source changes, or deployment during this planning session.

## Architecture decision

### Primary path: extension-only, manually connected

```text
Linux client popup ──manual sync──> client worker
                                      │
                               offscreen WebRTC
                                      │
                   direct usable LAN / tailnet route
                                      │
                               offscreen WebRTC
                                      │
macOS host Chrome <── app controller ── host worker
         │
         └── normal application / Okta requests

Linux application tab ────────────────> application directly
```

- **Options tab:** host/client role, create/apply connection descriptors, select exact application/account scope, disconnect and inspect non-secret status. Reuse the existing page; no side panel or separate setup app.
- **Offscreen document:** one `RTCPeerConnection`/ordered reliable data channel; `WEB_RTC` reason, bundled static HTML, no capture permissions, no external STUN/TURN. Complete candidate gathering before export. Descriptor version, role, connection ID, expiry and size are validated; descriptors stay ephemeral and may contain transport credentials, never application authentication state.
- **Worker:** create/check the offscreen context, validate internal callers and peer messages, own browser API calls and application orchestration. Use `runtime.getContexts()` with a Chrome 116 API floor rather than a legacy fallback; actual testing uses supported current stable Chrome. Offscreen has Web APIs but only `chrome.runtime` among extension APIs.
- **Popup:** explicit `sync auth`, cancel and current outcome. Closing it must not end a healthy connection or silently retry a request.
- **Application controllers:** Outlook web, Slack workspace and Zoom Web App. Case 2 inspects the correct host app session; Case 1 performs normal host-side sign-in and converges on the same application-specific completion. No generic “export all authentication” path.
- **Lifecycle:** the offscreen context owns live channel state; the worker can query it after revival. Persist only non-secret request/status metadata in local/session storage, not Chrome Sync. Loss of the offscreen context/browser terminates pending work; reconnect is explicit. Do not hold the worker alive with polling or automatically replay credentials.

Manual signaling uses a user-controlled transfer method; no clipboard permission is needed merely for selectable text and paste fields. Do not save/log SDP, ICE credentials, full candidate addresses or authentication payloads. DTLS protects the channel but does not establish durable peer identity.

### Fallback: loopback companion behind Tailscale Serve

The research supports trying extension-only first, not assuming the managed firewall permits it. After an observed policy/routing/mDNS/ICE failure, a companion may supply a host-side loopback HTTP/TCP service; the host extension connects locally and the Linux extension connects outbound through a narrowly permitted HTTPS tailnet endpoint. This is the OpenSSH-like forwarding option requested by the user.

Ordinary Serve HTTP/TCP forwarding requires a backend and is not a WebRTC relay. Tailscale also documents a Services layer-3 `--tun` mode, but it is Linux-only, requires extra OS/network configuration and does not provide a drop-in macOS-host solution. Do not introduce tagged Services/admin-policy changes or broad packet forwarding into this PoC. See the transport report for the scoped comparison.

Companion installation/protocol/registration is **not preallocated work**. If needed, record the exact failed gate, then finish a bounded companion-specific plan before implementation; the user's preference already permits that fallback. Do not ship speculative parallel transports. Preserve existing SSH Serve mappings and confirm the exact new endpoint/backend before any later exposure change. No Funnel, public listener, firewall weakening or global Serve reset.

## Request and trust contract

| Boundary | Contract |
|---|---|
| Client intent | Capture request ID, connection ID, application key, intended account/workspace, original tab and allowed return origin. Recheck tab/account before completion; no arbitrary peer-supplied navigation or remote code. |
| Internal messages | Extend existing `MSG` / `MESSAGE_SPEC` / `MessageMap` conventions. Validate unknown wire input at runtime and distinguish privileged extension pages/offscreen from content-script callers; matching `sender.id` alone is insufficient. |
| Peer messages | Versioned, size-bounded control envelopes; one active request. Reject wrong-role, expired, mismatched, malformed or duplicate requests without action. The specific application payload contract is decided by the compatibility gate, not a generic blob API. |
| Host scope | Serve only the explicitly selected app/account and permitted origins. Unknown/ambiguous scope is a visible rejection, not fallback to another account. PoC lacks durable peer enrollment; UI must not call the client securely paired. |
| Provider interaction | Pause for required MFA/consent/device proof and require explicit human completion. Never auto-approve prompts or present host authentication as client-device compliance. |
| Storage/errors | No application credentials in Chrome Sync/local durable storage, generic error `details`, stack traces, console logs or artifacts. Reuse current primitives only where their error/persistence behavior meets this boundary. |
| Completion | Only the client application's authenticated account view establishes success. Transport delivery, host login, redirects, API grants and available browser state are insufficient. |

State progression: `idle → checking_host → preparing_host` (Case 1 only, otherwise reuse) `→ completing_client → verifying → succeeded`. `waiting_for_user` pauses any provider-dependent step. Terminal non-success outcomes are `unsupported`, `host_unavailable`, `account_mismatch`, `disconnected`, `cancelled`, `expired` and `failed`.

Use one request deadline that pauses during explicit human interaction and a short bounded transport deadline; centralize the initial values rather than spread timers across UI/worker. Cancel or navigation changes invalidate later results. Cancellation cannot undo a provider action already completed; report the observed state and never attempt broad logout as rollback.

## Implementation steps and hard gates

1. **Record the experiment boundary.** Use the confirmed Mac-host/Linux-client, Outlook/Slack/Zoom matrix. Record supported Chrome versions, exact app/tenant/workspace and non-secret policy categories. Use disposable test accounts/profiles for initial no-pairing checks; the real tenant requires a separately authorized observation before claiming support there. Do not manufacture Case 1 by logging out the persistent host; use a separately prepared test state/profile.

2. **Prove extension-only transport with synthetic data.** Add the minimal offscreen entry and options-page signaling controls using existing build/page patterns. Exchange completed offer/answer descriptors, create one data channel, perform bidirectional non-secret request/response, then verify popup closure, worker termination/revival and explicit disconnect. Test the actual route under existing policy; no browser flags or firewall changes to force success. Record a concrete reason if the companion fallback is needed. A same-browser mock is not this gate.

3. **Resolve application-session compatibility before integration.** For each of Outlook web, Slack web and Zoom Web App, identify a permitted browser completion mechanism and document its required state category, minimal origin/permission scope, account isolation, validity, host effects and expiry behavior. Public-source research supplies constraints, not this missing mechanism. Use an isolated, explicitly authorized experiment and non-secret before/after observations. Stop if the mechanism would require replaying one-time assertions, faking device proof or defeating mandatory provider checks. An unsupported application stays a visible unmet requirement; do not silently drop it, substitute ordinary client login, or build an adapter stub.

4. **Replace the starter contract with scoped control.** Once the gates have evidence, implement the request/trust contract above using the existing message map and components. Keep non-secret configuration machine-local rather than syncing host/client roles through the starter's sync-backed settings. Validate storage failures before reporting saved state. Remove displaced `CHANGE_BG`, color/counter controls and their unused content/overlay/build wiring; remove demo alarms rather than converting them to automatic auth sync. Preserve unrelated reusable utilities/tests.

5. **Implement common host application-first preparation.** Reuse a verified host app/account session for Case 2. Otherwise open the normal allowlisted application sign-in in the host's own Chrome, pause for required interaction, and verify that exact application/account before proceeding. Zoom tenant portal SSO must lead to the Web App, not count as final client success. Preserve unrelated host tabs and never invoke provider-wide logout.

6. **Implement only evidence-backed client completion.** Create the concrete per-application controllers from step 3, with narrow optional host grants and only APIs the mechanism needs. Add the cookies permission only if a validated controller requires it; do not pre-authorize whole-profile inspection or claim that HttpOnly access establishes portability. Keep application state out of durable storage/logs, apply only to the original intended tab/account, and verify authenticated client access plus continued host access. If step 3 does not supply a complete contract, this step cannot start.

7. **Exercise failures and all six success scenarios.** Run the verification matrix below on the real two-machine setup. Check account/tab changes, cancelled/duplicate/stale messages, malformed or oversized input, provider interaction, expiry, route loss, worker/offscreen/browser lifecycle and ordinary host continuation. Add regression tests only for plausible behavioral failures; keep real-browser proof separate from mocked-unit coverage.

8. **Finish the demonstrated cutover.** After the real path works, remove obsolete demo entries/permissions and throwaway experiments; update setup, known compatibility/limits and teardown documentation plus changelog. No raw HAR, token dumps or session exports are retained. Run the resolved deterministic checks, production build and scoped review. Application requirements remain open if any required scenario cannot be demonstrated.

**Dependency shape:** step 1 precedes both feasibility investigations. The network test and mechanism investigation can proceed independently with separate ownership; the live cross-machine compatibility proof uses the chosen peer path. Steps 4–6 are gated on both results. Application controllers may be separate ownership slices only after their shared protocol is fixed; one integrator owns shared message/manifest/UI changes. Steps 7–8 close the integrated result. No autonomous loop is selected.

## Affected files

All paths below are proposed implementation paths relative to `impersonate/`; this planning session changes only `.context/`.

| Existing / proposed path | Bounded change |
|---|---|
| `public/manifest.json` | Add offscreen permission/API floor; remove all-page demo injection and broad grants at cutover; request app-specific permissions only after compatibility evidence. No nativeMessaging unless fallback is selected. |
| `rsbuild.config.ts`, proposed `public/offscreen.html`, `src/offscreen/index.ts` | Add static offscreen DOM entry; verify emitted paths match the manifest and runtime URL. No new build system. |
| `src/background/index.ts`, `runtime.ts`, proposed `connection.ts`, `sync.ts` | Restart-safe offscreen coordination, scoped request state and application orchestration; retain useful tab-action/migration behavior. |
| `src/background/alarms.ts`, `src/content/index.tsx`, `bridge.ts` and matching build/manifest entries | Remove displaced starter poll/color overlay/unused bridge once the replacement works. Add content scripting only where a validated controller needs a narrow app-scoped operation. |
| `src/shared/constants.ts`, `types.d.ts`, `config.ts`, relevant `src/shared/lib/{messaging,setting,storage,error}.ts` | Extend existing typed contracts with runtime validation and safe errors; separate local role/config from sync-backed demo settings. Before exported-symbol changes, run LSP references and migrate every caller. |
| Proposed `src/background/apps/{outlook,slack,zoom}.ts` | Concrete controllers only after per-app handoff contracts are known. These filenames reserve ownership, not permission to create placeholder integrations. |
| `src/pages/popup/index.tsx`, `src/pages/options/index.tsx` | Manual action/status/cancel and role/scope/manual signaling using existing Preact and component patterns. |
| `public/_locales/{en,ja,zh_TW}/messages.json` | Update supported locale catalogs for new controls/statuses and remove displaced demo strings; do not invent a second localization mechanism. |
| `__tests__/messaging.test.ts`, `setting.test.ts`, relevant storage/migration tests; focused new behavioral tests if needed | Update changed contracts; protect wrong-account, sender trust, cancellation/lifecycle and visible failure behavior. No snapshot/source-text tests just to show activity. |
| `README.md`, `CHANGELOG.md` | Development setup, compatibility evidence, no-pairing warning, disconnect/teardown and versioned behavior after implementation. No docs outside `.context/` are modified now. |

Observed source anchors: starter permissions/content scope at `public/manifest.json:27-43`; background imports at `src/background/index.ts:1-3`; sole demo message at `src/shared/constants.ts:10-22`; unchecked message casts at `src/shared/lib/messaging.ts:14-55,109-115`; sync-backed settings at `src/shared/lib/setting.ts:39-66`; popup demo action at `src/pages/popup/index.tsx:63-80`; options demo controls at `src/pages/options/index.tsx:123-230`; web/worker build entries at `rsbuild.config.ts:65-115`. These are planning-baseline locations, not future line-number guarantees.

## Acceptance criteria

- [ ] A real macOS host and Linux client connect through the selected private path; manual setup is sufficient and popup dismissal does not lose a healthy channel.
- [ ] All three required applications have an explicit compatibility record and **both** starting cases pass. An unsupported verdict does not count as feature completion.
- [ ] One client `sync auth` reaches the intended authenticated application/account without unnecessary client login, while the host remains usable.
- [ ] Ordinary client website traffic never travels through the host or an extension proxy.
- [ ] Required provider interaction pauses for explicit human completion; extension trust never substitutes for provider authentication.
- [ ] Wrong-account, changed-tab, malformed, oversized, duplicate, expired or cancelled requests cause no unintended application action.
- [ ] No application credentials/session values or connection descriptors enter logs, source control, notes, Chrome Sync, generic error details or whole-profile snapshots.
- [ ] Transport loss, host unavailability, expiry and unsupported completion are visible non-success outcomes; no background replay or forced host logout.
- [ ] The no-pairing mode is clearly development-only; later shipped pairing is not represented as implemented.
- [ ] Scoped deterministic checks, production packaging and real-browser verification pass; obsolete demo behavior is removed without deleting unrelated functionality.

## Verification

### Required success matrix

| Surface | Case 1: normal host SSO then completion | Case 2: existing host app session | Additional non-secret observation |
|---|---|---|---|
| Outlook web | Not run | Not run | Correct mailbox/account on Linux; host remains signed in after client refresh/navigation |
| Slack web | Not run | Not run | Correct workspace/account and authenticated read-only UI; no messages sent |
| Zoom Web App (`app.zoom.us/wc`) | Not run | Not run | Signed-in Web App account, not portal/guest join; no meeting started |

For each row, record exact surface, starting state, browser/OS versions, route category, result and host state before/after. Observation after refresh/navigation is distinct from long-term expiry/refresh support; record actual durations without inventing provider lifetime guarantees.

### Failure / lifecycle proof

- Close popup and terminate/revive the worker while connected: options/popup recover actual state rather than stale “connected” metadata.
- Close the browser/offscreen document, interrupt the network or cancel: pending work ends visibly; later packets cannot resume it automatically.
- Switch tab URL/account/workspace during a request: refuse stale completion rather than overwrite another account.
- Submit wrong-role/sender, duplicate, expired, oversized and malformed envelopes: no navigation or sensitive action.
- Encounter MFA, consent or receiving-device requirements: pause for explicit human action, or report unsupported; never auto-click approvals.
- Verify direct application traffic and limited peer data using non-secret destinations/categories only; no raw authenticated traffic capture retained.

### Deterministic and packaging checks at implementation time

Resolve the project check contract first: `guardrails.json` if present; otherwise the Buck ephemeral stack contract with an explicit no-durable-contract warning. The inspected package exposes `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm build:prod`; CI currently builds and runs coverage. These commands were **not run** during planning. Do not label mocked Chrome APIs as two-computer verification.

Load the built unpacked extension in actual supported Chrome on both systems. Verify manifest/worker/offscreen emitted paths, permissions, setup and all user-visible states. A fake authenticated response, a generic SSO redirect, exported cookie records or a passing build alone cannot satisfy the feature.

### Planning-session proof

Validate artifact frontmatter, relative links, reciprocal research/plan references, inherited user goal and confirmed scope. This session is documentation-only; no build/lint/unit tests, live connectivity, credentials, provider interactions or network configuration changes are part of its completion claim.

## Risks and unresolved decisions

- **Decisive unknown:** application-session handoff remains unverified for Outlook, Slack and Zoom. The plan is ready for feasibility work, not unrestricted integration build. Finish each mechanism contract before implementing it; do not hide this prerequisite behind a generic adapter.
- **Policy/routing:** existing firewall/browser policies may prevent direct ICE. Tailscale reachability does not automatically provide candidate resolution, signaling or provider approval. Prefer the documented fallback over weakening policy.
- **PoC trust:** no durable pairing means reachable/unverified peers can be dangerous. Use user-controlled signaling, explicit app/account scope and disposable test accounts; no claim of production safety.
- **Provider lifecycle:** Zoom device limits and other services' expiry/revocation can invalidate the host independently. No extension can promise immunity to service-side changes; actual preservation is acceptance evidence.
- **Profile isolation:** synced starter settings must not cross-contaminate host/client role or account selection. Permission grants and required state categories depend on the concrete per-app mechanism.
- **Rollback:** stop the peer connection, invalidate pending requests, remove only PoC-created local state/optional grants and any specifically added companion mapping. Do not clear the host browser's auth state or claim extension disconnect revokes provider sessions. Any cleanup that would sign out an existing client session requires explicit user instruction.
- **Preflight inputs:** exact Chrome versions, workspace/tenant aliases, authorized test profiles and existing Tailscale route/policy category are execution-time observations. They are not unanswered product choices or permission to collect secrets.

## Light Grill

- Q1: May the PoC use a local companion? → resolved: prefer extension only; companion acceptable if research establishes the need. The user's policy-firewall/Tailscale clarification expands the transport comparison, not the application-traffic scope.
- Q2: Which host/client platforms? → resolved: macOS host and Linux client.
- Q3: Which Microsoft 365 web surface? → resolved: Outlook on the web.
- Q4: Is manual offer/answer connection setup acceptable? → resolved: yes. No extra host confirmation is required per manual sync after connecting.
- Research adjudication: choose offscreen WebRTC first; preserve companion + tailnet-only Serve as an evidence-triggered fallback. Public docs do not settle application-session handoff, so the plan front-loads that gate rather than claiming support.

## Execution handoff

This plan needs phasing: auth-sensitive paths, multiple extension contexts, more than five files and a decisive feasibility unknown. Run `/skill:b-phase` against this plan to produce discrete execution contracts; do not start an all-in-one implementation or auto-enable a goal/workflow loop.

Recommended first work unit: the Mac-host/Linux-client synthetic transport gate and non-secret application-compatibility investigation, with their distinct pass/unsupported/unresolved outcomes. Use `/b-build-hard` for the bounded transport experiment after phasing and `/b-review` against its acceptance criteria. Application integration cannot start merely because the transport gate passes.

Subsequent phases follow build → review → in-plan iteration if needed → documentation when behavior changes → save → commit. A demonstrated need for a companion requires a concrete companion contract before that optional branch is built. No phase files or automated execution loop were created by this B-Plan session.
