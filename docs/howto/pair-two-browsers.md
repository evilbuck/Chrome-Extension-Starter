# Pair two Chrome browsers

Pair the host and receiving Chrome profiles once. Use browsers you control and approve only the pairing you just initiated.

## Steps

1. Load the same current `dist/` build into both Chrome profiles. See [Quickstart](../quickstart.md#load-the-extension).
2. Open **Beam me up → Options** on both browsers.
3. Select **Host** on the source profile and **Client** on the receiving profile.
4. On the host, click **Generate code**.
5. On the client, type the five-character **Pairing code** once and click **Find**. Lowercase letters are accepted.
6. On the client, check the pending host and click **Confirm this browser**.
7. On the host, check the pending client and click **Confirm this browser**. Use **Reject** if this is not the attempt you initiated.
8. Wait for **Connected** on both browsers, then click **Send echo** in Options.
9. **Eat:** both browsers show **Connected** and the sender reports **Test message returned successfully.** No SDP or answer needs copying.

Codes expire after two minutes and admit only one client. If a code is expired, rejected, cancelled or already claimed, start a fresh attempt on the host. **Cancel pairing** abandons a waiting invitation.

Discovery uses the hosted service; the data channel still needs direct LAN/tailnet reachability. If discovery works but connection fails, check [network troubleshooting](../quickstart.md#troubleshooting).

Next time, [reconnect the remembered browsers](reconnect-paired-browsers.md); do not generate another code.