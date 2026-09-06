---
status: completed
date: 2026-09-06
subject: 2026-09-06.policy-use-case-audit
topics: [openai-usage-policy, authorization, session-transfer, enterprise-access, clarification]
informs: []
---

# OpenAI Usage Policy Audit — Host–Client Authentication Handoff

## Decision

The project is **not categorically prohibited by OpenAI’s Usage Policies merely because it supports user-authorized cross-device continuity**. Its synthetic WebRTC transport, pairing, normal host-side SSO, and disposable-account research are not malicious cyber activity as documented.

The implemented Slack Case 2 flow is materially different: it transfers replayable authenticated browser state—two Slack cookies and minimal account configuration—from a real Enterprise Grid workspace into a second profile. That capability can be reasonably described as **session cloning/replay**. It is policy-safe only when the same person controls the account *and* the service/system owner has explicitly authorized this exact multi-device session-transfer mechanism. Personal consent, device ownership, a paired browser, or ordinary application access does not establish authorization for an employer/enterprise tenant.

No OpenAI policy violation is established by the repository evidence. But the current records do **not** establish organization-owner approval for the real Outlook or Slack environments. Treat further real enterprise session export/replay as paused until that approval is recorded. Do not infer approval from a user’s statement that the written policy permits multi-device use.

This is a policy assessment, not legal advice and not a determination of Microsoft, Slack, Zoom, Okta, or employer terms.

## Policy baseline

The authoritative [OpenAI Usage Policies](https://openai.com/policies/usage-policies/) (effective 2025-10-29) prohibit, among other things:

- illicit activity and destruction, compromise, or breach of another party’s system or property, including malicious or abusive cyber activity;
- compromise of another person’s privacy without authorization; and
- deceit, fraud, scams, or impersonation.

They do not state a blanket ban on a user managing access to their own accounts. The practical question is whether this project transfers an authenticated session outside the authorization and security controls of the account/service owner.

## Documented use cases and audit

| Use case in `.context/` | Evidence | Policy assessment | Required boundary |
| --- | --- | --- | --- |
| **Synthetic extension-to-extension transport** | Phase 2 carries only generated IDs and a fixed non-secret payload. | **Within policy.** Generic local transport is not cyber abuse. | Keep it synthetic; never add a generic auth-state/blob field. |
| **Five-character pairing and pinned reconnection** | Short-code pairing is two disposable Chrome profiles, bilateral confirmation, direct echo, and forget/reconnect. | **Within policy.** It pairs extension instances, not application identities. | Pairing is device trust only; it must not be presented as account- or tenant-owner authorization. |
| **Case 1: normal application → Okta → application flow in the host browser** | The host follows normal SSO and pauses for MFA, consent, and device checks. | **Conditionally within policy.** Normal user sign-in is not a bypass. | Do not automate approval, copy device-bound proof, or use the host session to evade a required client-device check. Require account/service-owner authorization for enterprise use. |
| **Case 2: reuse an existing host application session** | The brainstorm names browser-state copying as a possible mechanism; Slack local transfer proved cookie/config replay. | **High-risk, conditionally permissible only.** This is authenticated-session replay, which may become unauthorized access, privacy compromise, or impersonation if the receiving browser/account/tenant is not expressly authorized. | Allow only a specific approved provider/account/tenant contract. Fail closed when device binding, conditional access, MFA, session limits, or provider rejection applies. |
| **Disposable account / throwaway profile feasibility work** | Phase 1 and Outlook research recommend disposable environments; test profiles are removed. | **Within policy and preferred.** It reduces third-party data and organizational-authority risk. | Use only accounts controlled for testing; keep no raw credentials, messages, or profile exports. |
| **Outlook real-account bounded state probe** | A later record says state was copied into an isolated client, then stopped at Microsoft authentication; no IdP cookies, MFA, device key, or final identity verification. | **Not established as compliant for enterprise use.** The user’s authorization does not demonstrate tenant-owner authorization. The stop boundary and lack of completion reduced harm but do not cure the authorization gap. | No further real Outlook export/replay or active experiment without written tenant/service-owner authorization; use a controlled tenant otherwise. |
| **Slack Enterprise Grid two-profile transfer** | Real workspace state was transferred into a second isolated profile. The record acknowledges broader Enterprise Grid scope may be authorized. | **Material policy risk.** This is the strongest basis for a misuse interpretation because it duplicates an active enterprise session. The repository records user consent, not an employer/workspace-owner approval. | Pause further real-workspace transfers. Require authorization from the workspace/tenant owner for the exact account, scopes, devices, and session-migration method; preserve the direct no-message/no-mutation rule. |
| **Zoom session-handoff research** | Public-doc research only; no cookie permission or live handoff. | **No present policy violation.** | Do not implement without a concrete provider contract and the same owner-authorization gate. |
| **Internal-LAN, no-pairing development PoC** | The plan correctly says reachability is not authentication and recommends disposable accounts. | **Security risk, not automatically an OpenAI-policy violation.** An unintended LAN peer could obtain a session, turning this into unauthorized access. | Restrict no-pairing operation to synthetic/disposable tests. Real application state requires pairing plus explicit account/service-owner authorization. |
| **“False positive” / monitoring hypothesis** | The brainstorm raises whether host authentication might reduce login alerts, then disavows evasion. | **Must remain prohibited by project scope.** Work that hides a new device, suppresses alerts, avoids detection, or defeats enforcement can map to malicious cyber activity or deceit. | Replace the ambiguous hypothesis with an explicit no-evasion rule. Provider/security monitoring remains authoritative. |

## Evidence that reduces risk

The documentation already contains important safeguards:

- stated one-person / user-owned-device purpose and direct client-to-provider traffic;
- exact application/account/workspace scope instead of a profile-wide exporter;
- explicit no-proxy, no whole-profile export, no generic credential blob, no raw credential logging, and no public ingress;
- account/origin/tab/deadline validation, cancellation, expiry, empty-client rejection, and cleanup ownership safeguards;
- required human completion for MFA, consent, and device proof; and
- honest `unresolved` outcomes for Outlook/Zoom and unproven physical cross-machine Slack behavior.

These controls establish narrow intent and reduce harm. They do **not** replace authorization from an enterprise service owner, nor do they make provider session restrictions optional.

## Clarification required in project scope

The canonical plan must say all of the following explicitly:

1. **Authorization is two-layered.** Device ownership and a user’s account access are necessary but insufficient. For an organization-managed service, session migration requires documented authorization from the organization/service owner for that account, tenant/workspace, device set, and transfer mechanism.
2. **Pairing is not authorization.** Pairing authenticates the extension endpoint; it never confers the right to copy an account session.
3. **Provider controls are final.** Device binding, MFA, conditional access, concurrent-session limits, reauthentication, sign-in alerts, and service rejection are unsupported boundaries—not bugs to bypass.
4. **No concealment objective.** The extension must not hide a client device, suppress security alerts, evade monitoring, impersonate another person, or make a provider believe a client is the host.
5. **No-pairing is test-only.** It applies only to synthetic traffic or disposable accounts. It never permits transfer of real personal, employer, customer, or enterprise authentication state.
6. **Fail closed.** A missing authorization record, ambiguous identity/scope, occupied client, scope mismatch, or provider challenge must result in no session transfer.

## Conclusion

The project’s stated goal—one person using their own accounts across their own devices—is not itself cybercrime or an OpenAI-policy breach. The **session-replay implementation** makes the external authorization boundary decisive. The existing documentation needs the clarification above because an enterprise-session copier can be misconstrued, and can in fact become prohibited, when owner authorization or provider security controls are absent.

## Sources

- [OpenAI Usage Policies](https://openai.com/policies/usage-policies/) — first-party policy, accessed 2026-09-06.
- `.context/2026-09-05.lan-login-handoff/brainstorm-lan-login-handoff.md`
- `.context/2026-09-05.lan-login-handoff/phase-2-extension-transport-gate.md`
- `.context/2026-09-05.lan-login-handoff/phase-3-application-compatibility-gate.md`
- `.context/2026-09-05.lan-login-handoff/compatibility-{outlook,slack,zoom}.md`
- `.context/2026-09-05.lan-login-handoff/slack-session-transport-experiment.json`
- `.context/2026-09-06.short-code-pairing/index.md`
