# Sync site resources between paired browsers

Use **Site resources** to copy selected cookies and `localStorage` entries from a host Chrome profile to its paired client. Checked items stay subscribed: later host changes are sent again while the item remains checked.

## Before you start

- Use browser profiles you control and [pair them](pair-two-browsers.md). Both profiles must show **Connected**.
- Select **Host** on the profile containing the source site and **Client** on the receiving profile.
- Open the source site in a normal, non-incognito host tab. Only open `http:` and `https:` origins appear.
- Treat every selected item as sensitive. Checked items, including credentials, are copied to the paired client.
- Pairing proves which browser is connected; it does not authorize transfer of organization-managed sessions. Do not use this feature to bypass a service owner's authorization gate.

On the client, if a site arrives before that profile has allowed it, the options page shows **Allow a site on this client** and a **Grant** button. Click Grant and accept Chrome's permission prompt. Nothing is written until that prompt is allowed. The check stays in place; do not bypass it.

## Select and sync items

1. On the host, open **Beam me up → Options**.
2. In **Copy site resources**, choose the site's origin from **Open site**.
3. Approve Chrome's request for cookie, scripting, and site access. If access is denied, the extension lists no resources for that origin.
4. Review the **Cookies** and **localStorage** lists. The panel shows identities and metadata such as names, domains, paths, flags, and sizes. It never displays cookie or storage values.
5. Check each item you intend to copy. The current value is sent to the authorized paired client, and later host changes are sent while the item remains checked.
6. Confirm the result on the client only after the client has explicitly granted the same access:
   - For a cookie, inspect the destination site's Application panel or call `chrome.cookies.get` from the extension service-worker console with the cookie URL and name.
   - For `localStorage`, inspect the destination site's Application panel. The extension reuses an existing same-origin tab or opens an inactive tab for the origin.

A successful initial copy is not proof that future changes are syncing. Change the selected value on the host and confirm the client receives the new value.

## Pause or stop syncing

- **Uncheck an item** to stop future host changes from being sent. Unchecking is not a remote delete: the client's last copied cookie or `localStorage` value remains in place.
- If the host closes the site's last open tab, cookie subscriptions remain live. `localStorage` entries show **Paused until a same-site tab is open** because reading them requires a document.
- Reopen the same origin on the host to resume its `localStorage` subscriptions and push the current values.
- Disconnecting or forgetting the pair stops sends but preserves subscription identities. No values are stored in the extension's subscription record.

## Troubleshooting

- **Site access was not granted:** approve the origin-specific Chrome permission on the profile performing the operation. The extension fails closed instead of applying without permission.
- **The latest value could not be sent:** confirm both profiles still show **Connected** and are the expected host/client pair.
- **localStorage is unreadable:** keep a normal same-origin host tab open. Some sites may not expose their storage to the extension's isolated script world.
- **Paused localStorage:** reopen a non-incognito tab at the selected origin.
- **Large item rejected:** one resource item is limited to 48 KiB. The extension does not split oversized values.

Never paste real cookie or storage values into logs, screenshots, issue reports, or test fixtures.
