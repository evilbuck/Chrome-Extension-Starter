---
status: completed
date: 2026-09-06
subject: 2026-09-06.short-code-pairing
plan: plan-short-code-pairing.md
memory:
  - short-code-pairing-2026-09-06.md
---

# Pairing review

Verdict: in-scope blocking findings resolved. Independent broker/security and extension-lifecycle reviewers inspected the implementation; Main applied remediation and exercised the resulting behavior. This is a code review and local/runtime proof, not a physical-network or external security audit.

| Severity | Finding | Resolution and evidence |
|---|---|---|
| Critical | Chrome offscreen exposes runtime, not `chrome.storage`; direct trust storage made real pairing fail. | Added exact-offscreen-sender-checked background storage messages. Real profiles subsequently paired, retained trust across extension reload, and reconnected. Private keys remain in IndexedDB. |
| High | Forget parsed the server's `{ok:true}` acknowledgement as reconnect credentials. | Split acknowledgement/credential parsing and preserve attempt-generation checks. Actual local forget, remote reconnect refusal, and the remote profile's later idempotent forget succeeded. |
| High | Background event filtering discarded a new connection ID after reconnect. | Accept current offscreen lifecycle updates, invalidating pending application work when the connection changes or authorization closes. Repeated disconnect/reconnect produced a new authorized epoch and successful echo. |
| Medium | Slack readiness treated transport `connected` as sufficient without `authorized`. | Require both fields and clear readiness on failures. Pairing is still separate from optional Slack permissions and shared-session consent. |
| Medium | A delayed cleanup alarm allowed confirmation after invitation expiry. | Added deadline checks at join/socket/confirmation/pairing transitions. The delayed-alarm regression failed before the fix and passed afterward; real hosted two-minute expiry also refused joining. |

Additional hardening: re-read room state after asynchronous key/signature validation; reject stale connection/socket signal completions; ignore closed sockets; replace unconsumed tickets after token generation; authorize idempotent forget only for pinned members. Tests cover member/stranger revocation and stale or invalid attempts.

## Boundaries retained

- The trusted hosted service introduces keys on first pair. Five characters plus manual approval is not PAKE or malicious-bootstrap resistance.
- WebRTC carries application data directly; the rendezvous is not a Slack credential proxy or TURN server.
- Proof is two disposable Chrome profiles on Linux. Physical Mac/Linux and restrictive-network behavior remain the original separate transport gate.
- No durable guardrails configuration exists. Detected checks, service workerd tests, type checks, production build and scoped Biome checks are recorded in the execution evidence; no coverage/complexity baseline is claimed.

See [runtime evidence](pairing-runtime-evidence.json) and [usage procedures](../../docs/howto/README.md).