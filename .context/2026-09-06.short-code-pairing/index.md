---
status: completed
created: 2026-09-06
updated: 2026-09-06
subject: 2026-09-06.short-code-pairing
---

# Automatic five-character pairing

The user requested an orchestrated b-plan → b-build → b-review workflow replacing repeated manual WebRTC descriptor exchange with a discoverable, unique five-character alphanumeric code and explicit confirmation in the other Chrome instance.

[Approved pairing plan](plan-short-code-pairing.md) and [orchestrated phases](plan-short-code-pairing-phases.md) completed the user's **Hosted service** choice. The personal-account Worker is deployed at `https://beam-me-up-pairing.buck-f11.workers.dev`. Two disposable Chrome profiles paired, exchanged a direct echo, retained trust over reload, reconnected without a code and forgot successfully. See [review](review-short-code-pairing.md), [exact proof and limits](pairing-runtime-evidence.json), and [how-tos](../../docs/howto/README.md). Physical Mac/Linux and application compatibility gates remain separate.
