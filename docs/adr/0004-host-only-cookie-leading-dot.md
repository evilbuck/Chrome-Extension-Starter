# ADR 0004: Host-only cookies are a missing leading dot

A site-resource cookie item has no `hostOnly` field. On the wire, a domain that starts with `.` is a domain cookie; any other domain is host-only. The client passes a leading-dot domain to `chrome.cookies.set` and omits `domain` otherwise, so Chrome creates a host-only cookie.

Chrome's `cookie.domain` never includes that leading dot, including for domain cookies. Senders must not forward it unchanged — that applies every cookie as host-only. `wireCookieDomain` strips a leading dot when `hostOnly` is true and prefixes `.` when `hostOnly` is false and the domain has none.

## Considered options

An explicit `hostOnly` boolean on the Phase 1 item. Rejected: the item shape is already closed, and both sides already have to read `domain`. The leading dot is the discriminator.

## Consequences

Subscription identity keeps Chrome's `cookie.domain` (no leading dot). Apply uses the upsert item's encoded domain, not the subscription identity. Do not strip dots before `chrome.cookies.set`, and do not forward `cookie.domain` as the wire domain.

See [ADR 0003](0003-typed-resource-upsert-on-peer-envelope.md) for the envelope this item travels on.
