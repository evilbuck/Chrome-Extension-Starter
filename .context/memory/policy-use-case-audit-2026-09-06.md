---
date: 2026-09-06
domains: [security, policy, authorization, documentation]
topics: [openai-usage-policy, session-replay, enterprise-authorization, account-transfer]
related:
  - .context/2026-09-06.policy-use-case-audit/research-policy-use-case-audit.md
  - .context/2026-09-05.lan-login-handoff/brainstorm-lan-login-handoff.md
  - .context/backlog/items/enforce-enterprise-owner-authorization.md
priority: high
status: completed
subject: 2026-09-06.policy-use-case-audit
artifacts:
  - research-policy-use-case-audit.md
  - research/notes-policy-use-case-audit.md
  - research/sources-policy-use-case-audit.md
  - index.md
---

# OpenAI usage-policy audit and authorization boundary

Audited the documented host–client authentication handoff against OpenAI’s Usage Policies. User-authorized cross-device continuity, synthetic WebRTC transport, five-character pairing, disposable-account research, and normal host-side SSO are not categorically prohibited. OpenAI prohibits unauthorized compromise/privacy invasion and deceit or impersonation; the policy does not create a blanket ban on a person managing their own accounts.

The material risk is the implemented Slack Case 2 flow: it replays real Enterprise Grid session state into another isolated Chrome profile. Repository records show user consent and technical guards, but not organization/service-owner authorization for that exact enterprise session-migration mechanism. A bounded Outlook probe also copied state but stopped before authentication completion; Zoom remains research-only. No policy breach is established by the artifacts, but further real organization-managed session transfer is paused pending documented owner authorization.

Added an explicit authorization boundary and no-evasion language to the canonical brainstorm. Pairing is device trust only; no-pairing is limited to synthetic/disposable tests; MFA, device binding, conditional access, session limits, alerts, and provider rejection are final boundaries. Registered a high-priority backlog item requiring documented owner authorization for exact account/tenant/workspace, devices, and mechanism before further real enterprise export/replay. This is a human/process gate; no automatic employer-approval verifier is requested.

Docs-only session: no source, configuration, test, or runtime behavior changed; the deterministic code-check gate does not apply.
