# Forget a paired browser

Remove remembered trust before replacing the peer or changing the profile's role.

## Steps

1. Open Beam me up on the profile you want to unpair.
2. Click **Forget paired browser**.
3. If the other profile still displays its old remembered peer, click **Forget paired browser** there too.
4. **Eat:** the local remembered peer is gone, traffic is disconnected, and fresh pairing controls are available. When server revocation succeeds, the former pair cannot reconnect.

Local authorization is removed immediately. A service or storage failure is shown rather than reported as successful revocation; do not assume remote revocation succeeded while offline. The other browser can retain a stale local label even after the server has revoked the pair.

Forgetting does not sign out an already transferred Slack session. Clear Slack site data in the receiving profile if you also want to remove that session.

Next: [pair the intended browsers](pair-two-browsers.md).