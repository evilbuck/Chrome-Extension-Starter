---
status: completed
date: 2026-09-22
subject: 2026-09-22.host-site-resource-sync
topics: [options-page, cookies, localStorage, live-sync, host-client, webrtc]
research: []
iterations: [iterate-host-site-resource-sync.md]
spec: null
memory: [host-site-resource-sync-phase-1-2026-09-22.md, host-site-resource-sync-phase-2-2026-09-22.md, host-site-resource-sync-phase-3-2026-09-22.md, host-site-resource-sync-iterate-2026-09-22.md, host-site-resource-sync-phase-4-2026-09-23.md]
---

# Plan: Host options site resource sync

## User Goal

Host picks an open site, then copies chosen cookies/localStorage onto the paired client.

The host options page is the control surface. Checking an item starts a live subscription: later host changes are pushed again while it stays checked. Unchecking stops future updates and does not delete the client copy.

## Goal

Add a host-only options panel that:

1. Lists sites from the host's open `http:`/`https:` tabs (unique origin).
2. On site select, requests optional `cookies` + `scripting` + that origin, then shows every cookie and every localStorage key (identity + metadata, not classified).
3. On check: persist the subscription, send the current value over the existing paired WebRTC channel, and keep pushing host-side changes.
4. On the client: write cookies via `chrome.cookies.set`; write localStorage by reusing a same-origin tab or opening a background tab.

This is a generic resource subscription, not another Slack-style application controller. Do not reuse `REQUEST_START` / the Slack state machine.

## Context used / assumptions

- User-provided context: options page; choose a site from host opens; panel lists all cookies and localStorage; user chooses items manually; selected items sync to the client.
- Session decisions:
  - Live sync while checked (not one-shot, not a batch button).
  - Client auto-opens a background tab when localStorage needs a document.
  - Host tab closed: cookies keep syncing; localStorage pauses until a same-origin host tab exists.
- Artifacts used: current options page (`src/pages/options/index.tsx`), Slack optional-permission pattern (`SLACK_ENABLE` / `SLACK_PERMISSIONS`), envelope/payload kinds (`src/shared/lib/envelope.ts`, `PAYLOAD_KIND`), transport ADR 0001 (application data stays on the direct WebRTC channel), enterprise-authorization backlog item (process gate, not a classifier).
- Assumptions:
  - Host role + authorized pair required to list/subscribe. Client role only applies inbound frames. No picker on the client options page in this plan.
  - Site = origin derived from open host tabs, not one row per tab.
  - Panel shows name/domain/path/flags/size, not values. Values travel on the data channel only.
  - Uncheck does not delete client cookies or keys.
  - `sessionStorage`, IndexedDB, Cache Storage, and service workers are out of scope.
  - Incognito and `RESTRICTED` schemes are skipped, same as Slack.
  - Optional host permission is requested per selected origin (`${origin}/*`), not always-on `<all_urls>` in `host_permissions`.
  - Cookie live path is `chrome.cookies.onChanged`. localStorage live path is worker polling of subscribed keys via `chrome.scripting.executeScript` (same isolated-world pattern Slack already uses for `localConfig_v2`), plus a rescan when a same-origin host tab completes load. Not a MAIN-world `localStorage` prototype patch.
  - Subscriptions persist in `chrome.storage.local` and re-arm after worker revival / reconnect. They do not send while unpaired or unauthorized.
  - Auto-opened client tabs stay while that origin still has localStorage subscriptions; closing the last localStorage subscription for an origin may close only tabs this feature opened (never a tab the user opened).
  - Existing Slack handoff, pairing, and enterprise-owner-authorization backlog stay unchanged. This UI does not classify enterprise vs personal; a visible warning states that checked items (including credentials) are copied to the paired client.

## Scope

- Options page site picker + resource panel (host).
- Manifest: add `*://*/*` (or `<all_urls>`) to `optional_host_permissions` only. Keep `cookies` and `scripting` optional.
- New worker module for site list, item list, subscribe/unsubscribe, cookie listener, localStorage poll/pause, client apply.
- New peer payload kinds for upsert + apply ack/error. Strict parse, size cap, no values in logs.
- Persist subscription identities (not values) in `chrome.storage.local`.
- Tests for identity, permission-denied, subscribe/uncheck, cookie change push, localStorage pause/resume, oversized reject, envelope parse, client apply, no delete on uncheck.
- User-facing copy in `public/_locales/{en,ja,zh_TW}/messages.json` (ja/zh may reuse English until translated).

## Out of scope

- Classifying cookies/keys as auth vs preference.
- sessionStorage, IndexedDB, Cache Storage, service workers, file inputs.
- Uncheck deletes on the client; bidirectional client→host sync.
- Popup UI; client-side picker.
- Slack/Outlook/Zoom/Claude controllers and session-constitution research.
- Employer / organization-managed session export (existing process gate; no auto-detector).
- Always-on `<all_urls>` in `host_permissions`.
- Changing pairing, STUN/TURN, or the pairing Worker.
- Showing secret values in the options UI.

## Affected files

New:

- `src/pages/resources/site-panel.tsx` — host options UI
- `src/background/apps/resources.ts` — list, subscribe, watch, apply
- `src/shared/lib/resources.ts` — identities, guards, permission shape
- `__tests__/resource-sync.test.ts` — subscription/watch/apply behavior

Change:

- `public/manifest.json` — `optional_host_permissions`
- `src/pages/options/index.tsx` — mount panel for host + authorized pair
- `src/shared/constants.ts` — `MSG`, `PAYLOAD_KIND`, `PAYLOAD_RESPONSE_KIND`, error kinds
- `src/shared/types.d.ts` — `StorageSchema.local` subscription record
- `src/shared/lib/envelope.ts` — parse/encode new payloads; reject oversize
- `src/shared/lib/peer.ts` — allow the new kinds through existing sendRequest
- `src/background/connection.ts` — options-only commands; inbound apply on client; do not mix with Slack pipeline
- `src/offscreen/index.ts` — forward new app kinds on the authorized connection
- `__tests__/envelope.test.ts` — malformed/oversize/unknown kind
- `public/_locales/en/messages.json` (and ja, zh_TW keys)
- `docs/quickstart.md` and a howto after implementation (`docs/howto/sync-site-resources.md`) — documentation impact, not this plan's code

Do not edit `src/background/apps/slack.ts` except if a shared helper must move; prefer a new module.

## Wire contract

Cookie identity (subscription key): `name + domain + path + partitionKey + storeId`.

localStorage identity: `origin + key`.

Host → client upsert (one item per frame):

```ts
{
  kind: 'resource_upsert',
  origin: string, // https://example.com
  item:
    | {
        type: 'cookie',
        name, domain, path, secure, httpOnly, sameSite,
        session: boolean,
        expirationDate?: number,
        partitionKey?: chrome.cookies.CookiePartitionKey,
        value: string
      }
    | { type: 'localStorage', key: string, value: string }
}
```

Client → host ack: `{ kind: 'resource_applied', replyTo, origin, type, id }` or `{ kind: 'resource_error', replyTo, error }` where `error` is a closed enum (`permission_denied` | `oversized` | `no_document` | `disconnected` | `malformed` | `failed`).

Caps:

- Reuse `PEER_MAX_BYTES` (96 KiB) as the hard envelope cap.
- Reject a single item whose JSON payload would exceed 48 KiB. UI: item stays unchecked / shows error; do not partial-write.

UI → worker messages (options.html sender only, same `isAllowedUiPage` gate):

| MSG | Role | Purpose |
|---|---|---|
| `RESOURCE_LIST_SITES` | host | Open-tab origins |
| `RESOURCE_ENABLE` | host | After `chrome.permissions.request` in the options page (user gesture) |
| `RESOURCE_LIST_ITEMS` | host | Cookie metadata + localStorage keys for one origin |
| `RESOURCE_SUBSCRIBE` | host | Check |
| `RESOURCE_UNSUBSCRIBE` | host | Uncheck; stop pushes; do not send a delete |
| `RESOURCE_STATUS` | host | Subscriptions + paused/error per item |

`chrome.permissions.request` stays in the options page. The worker only `contains()` / fails `permission_denied`.

## Implementation steps

1. **Permissions and identities.** Add optional `*://*/*`. Shared types for cookie/storage ids, origin filter (`RESTRICTED` + non-http(s) + incognito), permission object `{ permissions: ['cookies','scripting'], origins: [`${origin}/*`] }`.
2. **Host site list + panel shell.** Options page (host + authorized): list origins from `chrome.tabs.query`. Selecting a site runs `permissions.request`, then `RESOURCE_ENABLE` + `RESOURCE_LIST_ITEMS`. Render two unlabeled lists (Cookies, localStorage) with checkboxes and metadata. Warning copy: checked items are copied live to the paired client; the extension does not decide what matters.
3. **Envelope + offscreen.** Add upsert/applied/error kinds. Fail closed on unknown fields, missing origin, oversize, unpaired `connectionId`. Offscreen sends only when `pairing.isAuthorized(connectionId)`.
4. **Subscribe persistence.** Store identities in `chrome.storage.local`. Check snapshots current value and sends upsert. Uncheck removes identity only.
5. **Cookie watch.** `chrome.cookies.onChanged` filtered to subscribed ids. Cause `overwrite`/`explicit` with a cookie → upsert. Removals on the host do not delete on the client (subscription still checked; next set will upsert). Worker revival re-adds the listener.
6. **localStorage watch.** While a same-origin non-incognito host tab exists, poll subscribed keys (executeScript `localStorage.getItem`) and upsert on value change. `tabs.onRemoved` / `onUpdated`: if no remaining same-origin host tab, mark those items `paused` and stop polling; do not uncheck. A later same-origin tab resumes polling and pushes current values.
7. **Client apply.** Inbound upsert on client role: cookies via `chrome.cookies.set` (preserve host-only by omitting `domain` when the source was host-only; pass `partitionKey` when present). localStorage: reuse a same-origin client tab, else `tabs.create({ url: origin + '/', active: false })`, wait for complete, `executeScript` `setItem`. Ack or error. Track auto-opened tab ids so later writes reuse them.
8. **Lifecycle.** Disconnect / unauthorized: stop sending, keep subscriptions. Reconnect: resume cookie listener and localStorage poll. Forget pair: keep subscriptions, do not send until a new authorized pair exists. Do not apply inbound upserts on the host role.
9. **Tests.** Behavior only: site filter; permission denied; subscribe sends current value; uncheck stops further upserts and does not `cookies.remove` / `removeItem`; cookie `onChanged` upsert; localStorage pause/resume; oversized reject; envelope malformed; client opens background tab once per origin; auto-opened tab reuse. No wording/mock-echo tests.
10. **Docs after review.** How-to: pair → host options → pick site → grant permission → check items → confirm client cookie/key. Record that values are not shown in the panel and that uncheck is not a remote delete.

## Acceptance criteria

- [x] Host options page, when this profile is host and paired/authorized, lists unique http(s) origins from open host tabs.
- [x] Selecting a site prompts for optional cookies/scripting/origin permission; denial lists nothing and does not throw in the worker.
- [x] The panel lists all cookies `chrome.cookies.getAll` returns for that URL (including httpOnly) and all page `localStorage` keys from a same-origin host tab, without classifying them.
- [x] Checking an item writes it on the paired client; a later host change to that item is written again while checked.
- [x] Unchecking stops later pushes and leaves the client copy in place.
- [x] Closing the host tab does not uncheck; cookies continue; localStorage shows paused until a same-origin host tab exists, then resumes.
- [x] If the client has no tab for that origin, it opens a background tab to apply localStorage and reuses it for later keys on the same origin.
- [x] Unpaired, unauthorized, wrong-role, oversize, and missing-permission paths fail closed; cookie/storage values are absent from logs and test fixtures (use synthetic values).
- [x] Slack pairing/handoff tests still pass; this feature does not start a Slack request.

## Verification

Deterministic:

- Targeted vitest for `resources` + envelope cases above.
- Existing Slack/pairing/envelope suites still green.
- `/b-guardrails-check` after the code batch (repo has durable `guardrails.json`).

Manual two-profile smoke (same machine is enough for this feature; not a Mac/Linux network gate):

1. Pair host and client.
2. On the host, open `https://example.com` (or a local test origin) and set a distinguishable cookie + localStorage key in DevTools.
3. Host options: select that origin, grant permission, check both items.
4. Client: cookie present via `chrome.cookies.get`; localStorage present in the auto-opened (or existing) tab.
5. Change the host cookie and the localStorage value; client reflects both.
6. Uncheck the cookie; change it on the host; client value stays at the last synced value.
7. Close the host tab: cookie subscription still live; localStorage paused in the panel.
8. Reopen the host origin: localStorage resumes and pushes.

## Execution Instructions

This plan is large enough to benefit from phasing. Run `/skill:b-phase` before implementation.

It exceeds the phase thresholds: more than eight steps, more than five files, UI + worker + offscreen + envelope layers, and a credential-on-the-wire path.

<!-- OMP opt-in: if executed as one persistent objective without phasing, recommended mode is goal. Confirm before invoking. Budget hint: 50k (permissions/UI medium, envelope/transport hard, host watch medium, client apply hard). -->

Do not start `/b-build` against this whole file in one session if phasing is available.

## Risks

- **Generic credential frames.** Today `PAYLOAD_KIND` comments forbid generic blobs; Slack sends a typed session. This plan adds an explicit, user-checked item upsert. Keep parse strict, log-free, and pairing-authorized.
- **Enterprise cookies.** A user can check org-managed cookies. Do not build a classifier. The existing owner-authorization backlog still blocks *planned* enterprise session transfer; this UI must not be documented as a way around it. Warning copy is required.
- **`PEER_MAX_BYTES`.** Large localStorage values fail closed at 48 KiB/item rather than chunking in v1.
- **Permission UX.** `permissions.request` needs a user gesture; must run in the options page, not the worker.
- **Client background tabs.** Auto-open can surprise; reuse and only auto-close tabs this feature created.
- **Partitioned / host-only / session cookies.** Copying name+value without domain/path/sameSite/partition creates a different cookie. The upsert must carry those fields.
- **localStorage poll lag.** Changes can take one poll interval to land. Accept for v1; do not patch page JS.
- **executeScript world.** Follow the working Slack `localStorage.getItem` path; if a site isolates storage from the isolated world, record it as unsupported rather than silently listing an empty store.
