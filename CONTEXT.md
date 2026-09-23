# Beam me up

Two Chrome profiles the user controls: a **Host** copies chosen site **Resources** onto a paired **Client** over the existing authorized peer channel. Slack session transfer remains a separate controller.

## Language

**Host**:
The Chrome profile that already has the site session and offers **Resources**.
_Avoid_: sender, source browser

**Client**:
The Chrome profile that receives **Resources**.
_Avoid_: receiver, target browser

**Resource**:
One cookie or one localStorage entry the **Host** may copy. Identified, never a generic blob.
_Avoid_: credential blob, secret, token dump

**Cookie identity**:
`name + domain + path + partitionKey + storeId`. Distinguishes one cookie from another on the same origin.
_Avoid_: cookie name alone

**localStorage identity**:
`origin + key`.
_Avoid_: key alone

**Resource upsert**:
The typed peer request that carries one **Resource** for a single http(s) origin. Same envelope as Slack/echo; not a parallel send path.
_Avoid_: resource blob, generic payload

**Resource applied / Resource error**:
Closed acks. Applied names origin, type, and id (no values). Error is one of `permission_denied | oversized | no_document | disconnected | malformed | failed`.
_Avoid_: Slack error kinds for resource frames

**Optional site access**:
`cookies` and `scripting` stay optional permissions; `*://*/*` is optional host permission only. Granted per origin via `{ permissions: ['cookies', 'scripting'], origins: ['${origin}/*'] }`.
_Avoid_: installing `*://*/*` in `host_permissions`

## Relationships

- A **Host** and **Client** share one authorized pairing before any **Resource upsert**.
- A **Resource** belongs to one origin; origin filter keeps unique http(s) tabs and excludes restricted schemes and incognito.
- One **Resource upsert** carries one **Resource**; oversize items are rejected, not chunked.
- Slack session transfer is not a **Resource**; it uses Slack payload kinds on the same channel.

## Example dialogue

> **Dev:** "Can we send a bag of cookies as a generic frame?"
> **Domain expert:** "No. Each **Resource** is one cookie or one localStorage key, sent as a **Resource upsert**. Unknown fields fail closed."
>
> **Dev:** "Should we put `*://*/*` in `host_permissions` so listing sites works?"
> **Domain expert:** "No. That is **Optional site access**. The user grants one origin at a time."

## Flagged ambiguities

- **"Client"** here is the receiving Chrome profile, not a paying customer.
- **"Session"** in Slack transfer is application-owned identity, not a **Resource**.
