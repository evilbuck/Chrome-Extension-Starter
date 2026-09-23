# ADR 0003: Typed resource upserts on the existing peer envelope

Site **Resources** (one cookie or one localStorage item) travel on the same authorized WebRTC envelope as Slack and echo, as `resource_upsert` / `resource_applied` / `resource_error`. They are not generic credential blobs and not a second send path.

A parallel channel would split authorization, size caps, and pairing gates. An untyped blob would contradict the envelope’s fail-closed parse. Typed slots reuse `sendRequest`, `PEER_MAX_BYTES` (96 KiB), and `pairing.isAuthorized(connectionId)`. A single item whose JSON exceeds 48 KiB is rejected; v1 does not chunk.

Optional site access stays off the always-on `host_permissions` list: `*://*/*` is optional host permission; `cookies` and `scripting` remain optional permissions granted per origin.

Logs and tests stay value-free (synthetic fixtures only).
