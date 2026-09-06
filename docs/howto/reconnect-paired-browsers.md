# Reconnect paired browsers

Reconnect the same profiles without exchanging another code or repeating first-pair confirmation.

## Steps

1. Open Beam me up on both previously paired Chrome profiles.
2. Click **Connect to paired browser** on each browser. The first can wait while you connect the second.
3. Wait for **Connected** on both. Open Options if you want to run **Send echo**.
4. **Eat:** both show **Connected**; an echo returns successfully without a new code.

Closing the popup or Options does not disconnect the offscreen connection. Extension reload closes the connection but retains the remembered peer.

If either profile has forgotten the pair, reconnect is refused. [Forget the old record](forget-paired-browser.md) on the other profile, then [pair again](pair-two-browsers.md).