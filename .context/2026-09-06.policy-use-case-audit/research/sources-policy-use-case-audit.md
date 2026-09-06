# Sources — policy use-case audit

## OpenAI Usage Policies

- **URL:** https://openai.com/policies/usage-policies/
- **Accessed:** 2026-09-06
- **Authority:** First-party policy; effective 2025-10-29.
- **Relevant provisions:** Prohibits illicit activities; destruction, compromise, or breach of another's system/property including malicious or abusive cyber activity; privacy compromise without authorization; and deceit, fraud, scams, or impersonation.
- **Audit use:** Applied as the governing policy boundary. The policy describes prohibited outcomes, not a blanket prohibition on a user managing access to their own accounts.

## Repository evidence

- **Artifacts accessed:** `.context/2026-09-05.lan-login-handoff/brainstorm-lan-login-handoff.md`; `phase-2-extension-transport-gate.md`; `phase-3-application-compatibility-gate.md`; `phase-4-evidence.md`; application compatibility records and evidence surfaced by `.context/` searches.
- **Accessed:** 2026-09-06
- **Authority:** Primary repository records of intended scope, implementation controls, and observed experiments.
- **Audit use:** Determines actual documented use cases and whether the proposed/implemented behavior conflicts with the policy boundary.

## Specific capability evidence

- **Artifacts accessed:** `.context/2026-09-05.lan-login-handoff/slack-session-transport-experiment.json`; `compatibility-outlook.md`; `compatibility-slack.md`; `compatibility-zoom.md`; `phase-3-application-compatibility-gate.md`; `.context/2026-09-06.short-code-pairing/index.md`.
- **Accessed:** 2026-09-06
- **Authority:** Primary records of observed session-handling behavior and planned provider boundaries.
- **Key facts:** Slack Case 2 transferred replayable session state into another profile; Outlook stopped before authentication completion; Zoom has no live session transfer; pairing did not transfer application identities.
- **Audit use:** Separates benign transport/pairing from the implemented authenticated-session replay capability that requires external authorization.
