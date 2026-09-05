# Quickstart — impersonate LAN auth-handoff PoC

> **Read this first.** It is the end-user walkthrough for the unpacked Chrome
> extension in this repo. If anything here disagrees with what the extension
> actually does in Chrome, file a bug — this doc is the source of truth for
> how a person uses the PoC, not the parent plan or the implementation.

## What this is

A development-only proof of concept Chrome extension that lets a host machine
share its existing Microsoft 365 / Slack / Zoom web application session with a
client machine on the same LAN or Tailscale tailnet. Two extensions — one on
each computer — open a direct WebRTC data channel between the two browsers,
manually negotiated via copy-paste of a connection descriptor.

## What this is NOT

- **Not production.** The two endpoints trust each other without pairing.
  Anything that can reach the extension's offscreen document can drive
  `sync auth`. Internal LAN / tailnet use only.
- **Not a session-stealing tool.** It does not extract credentials. It does not
  bypass MFA / device proof / consent. The provider still controls who is
  signed in. If a step needs human interaction (MFA push, Okta consent,
  Zoom login) the extension waits for you.
- **Not multi-application.** Only Outlook on the web, a signed-in Slack web
  workspace, and the Zoom Workplace Web App at `app.zoom.us/wc` are in scope.
  Microsoft Teams, SharePoint, native Zoom client, the Zoom web portal, and
  anonymous guest joins are explicitly **not** supported surfaces.
- **Not automatic.** Every cross-machine authentication handoff is initiated
  by a manual button click.

## Prerequisites

You need:

| What | Minimum | Why |
|---|---|---|
| Mac | Apple silicon, macOS 13+ | The host machine (you load the extension here) |
| Linux box **or** a Linux VM with bridged networking | Ubuntu 22.04+ arm64 or x86_64 | The client machine |
| Network | Direct LAN reachability **or** both machines on the same Tailscale tailnet | Host-only ICE will not punch through a NAT |
| Chrome | 116 or newer on both machines | The extension's MV3 offscreen-document + `runtime.getContexts` floor is 116 |
| macOS user account | Administrator (to install `brew`) and able to load unpacked extensions | One-time |
| Linux user account | sudo (to install Chrome + Tart) | One-time |

A `brew`, `pnpm`, and `tart` install on the Mac takes ~5 minutes and ~2 GB.

## One-time setup on the Mac

```sh
# 1. Install Homebrew (skip if already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Install Tart (Cirrus Labs' CLI for Apple Silicon Linux VMs)
brew install cirruslabs/tap/tart

# 3. Install pnpm 9 (project requires pnpm-workspace packages field)
corepack enable
corepack prepare pnpm@9.15.0 --activate

# 4. Get the code and install dependencies
git clone <repo-url> impersonate
cd impersonate
pnpm install

# 5. Build the unpacked extension
pnpm build:prod
# → produces impersonate/dist/
```

Load it into Chrome:

1. Open Chrome 116+.
2. Navigate to `chrome://extensions`.
3. Toggle **Developer mode** (top right).
4. Click **Load unpacked** and select `impersonate/dist/`.
5. Note the extension ID shown under the extension name — you will need it later.

If you see "Manifest version 2 is deprecated, but extension is still installed"
or a version field below `116`, you are on an old Chrome. Update Chrome and
reload.

## Bring up the Linux client

The closest faithful substitute for bare-metal Linux is a Tart VM with bridged
networking on the same physical LAN as the Mac. A plain Docker container will
**not** work — it sits in a separate NAT namespace and the WebRTC ICE candidates
cannot reach the Mac.

```sh
# On the Mac (same machine, after the one-time setup):

# 1. Pull a small Linux image
tart clone ghcr.io/cirruslabs/ubuntu:24.04-arm64 impersonate-ubuntu

# 2. Run with bridged networking so the VM gets a real LAN IP
tart run impersonate-ubuntu --net-bridged

# (Inside the VM)
# 3. Install Chrome
wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt install -y ./google-chrome-stable_current_amd64.deb

# 4. Install pnpm + git
sudo apt install -y git
corepack enable
corepack prepare pnpm@9.15.0 --activate

# 5. Clone the repo (use the same URL as on the Mac)
git clone <repo-url> impersonate
cd impersonate
pnpm install
pnpm build:prod
```

Open Chrome inside the VM and load `dist/` as an unpacked extension (same steps
as on the Mac). Use a **separate Chrome profile** from any other Chrome running
in the VM — Chrome profiles share state when they overlap, which corrupts the
test.

Confirm the VM is on the same LAN as the Mac:

```sh
# In the VM:
ip -4 addr show en0 | grep inet
# → should print something like 192.168.x.y

# On the Mac:
ping <that-ip>
# → should succeed without Tailscale magic
```

If `ping` times out, your router or Tailscale ACL is blocking the path. Fix
that **before** loading the extension — WebRTC ICE cannot work around a
network policy you have not opened.

## Run the smoke test

The smoke test is a manual six-step exchange of two descriptors and one echo.
It is intentionally not automated; you need eyes on the state transitions.

### Step 1 — Host creates an offer

On the **Mac**, open the extension options page (right-click the extension icon →
**Options**, or `chrome://extensions` → your extension → **Service worker** →
**Inspect views** is not the right place; use **Extension options** in the
card menu).

You will see:

- A status panel showing `State: idle`, `Role: —`, no connection ID.
- A button row: **Start host (create offer)** / **Start client (accept
  offer)** / **Apply remote answer** / **Send echo** / **Disconnect**.
- A large text area labelled **Remote descriptor (paste from peer)**.

Click **Start host (create offer)**. Within a couple of seconds the status
panel should show `State: signaling` and a new section **Local descriptor**
appears with a base64-looking JSON blob. Copy the entire contents of that
textarea (it is large — Cmd+A then Cmd+C).

If the status panel shows `Error: …` or stays `idle`, click it again. If it
still fails, see [Troubleshooting](#troubleshooting) below.

### Step 2 — Client accepts the offer

Switch to the **Linux VM**, open the same options page. Paste the descriptor
into the **Remote descriptor** textarea. Click **Start client (accept
offer)**. Status becomes `signaling`; a new **Local descriptor** appears.
Copy the client's local descriptor.

### Step 3 — Host applies the answer

On the **Mac**, paste the client's local descriptor into the **Remote
descriptor** field. Click **Apply remote answer**. The Mac's status should
transition through `connecting` to `connected`. The Linux VM's status should
also reach `connected`.

If either side stalls in `connecting` for more than ~10 seconds, see
[Troubleshooting](#troubleshooting).

### Step 4 — Send an echo

On either side, click **Send echo**. A synthetic `ECHO` frame crosses the
data channel. The receiving side auto-replies with an `echo_response` whose
`replyTo` is the request ID of the outbound echo. Both sides should report the
round-trip with no error.

If the round-trip fails, check `chrome://webrtc-internals` on the host for the
data channel state.

### Step 5 — Close the popup and reopen it

Click anywhere outside the options page to dismiss it. Reopen the options
page. The status should match what you last saw (`connected`, with the same
connection ID) — not `idle`, not `connected (cached)`. The popup/options page
must always ask the offscreen document for the live state; it must never
cache.

### Step 6 — Disconnect cleanly

Click **Disconnect**. Both sides should transition to `idle`. The Linux VM's
options page status panel should report `idle` within a second. Reopen Chrome's
offscreen-document list at `chrome://extensions` → service worker details —
the offscreen document should be gone.

### Step 7 — Repeat on a fresh connection

Open the options page on both sides again and repeat Steps 1–6. The
connection IDs must differ. The same connection ID across two consecutive
sessions means the offscreen document is being reused when it should be torn
down — a Phase 5 invariant, not a Phase 2 invariant.

## What to record

After each successful smoke run, copy the following into
`.context/2026-09-05.lan-login-handoff/phase-2-evidence.md` (the human-readable
evidence file). The fields below match the seven-row cross-machine checklist:

| Field | Where it came from |
|---|---|
| `chrome://version` on the Mac | top line of `chrome://version` |
| `chrome://version` on the Linux VM | same |
| `uname -r` on the Linux VM | `uname -r` |
| TCP reachability test | `nc -vz <vm-ip> 0` from the Mac (should succeed) |
| `chrome://webrtc-internals` ICE candidate types | observed host candidate (e.g. `host` / `srflx` / `relay`) |
| Round-trip latency | observed time between clicking **Send echo** and the response appearing |
| Popup-closure state | did the reopened options page match the previous state? (yes / no) |
| Worker-revival state | did stopping the service worker and reopening the page keep status accurate? |
| Disconnect final state | did both sides reach `idle`? (yes / no) |
| Network-loss behaviour | did disabling Tailscale produce a visible failure (not a silent hang)? |

If anything in those rows fails, **do not** declare the PoC working — record
the actual observed behaviour and start a follow-up plan.

## Troubleshooting

### Status panel stays `idle` after clicking Start host

- Open `chrome://extensions` → service worker (the **Service worker** link
  under your extension) → check the console for red errors. Most likely
  cause: Chrome < 116 or the offscreen permission was stripped by an
  extension update.
- Verify `chrome://policy` does not block `WebRtcIPHandling`.

### Status panel says `Error: create_document_failed`

`chrome.offscreen.createDocument` rejected. The most common cause is another
extension (yours or a third party) having already opened an offscreen document
under the same extension ID. Open `chrome://extensions` → service worker →
**Inspect views: offscreen document** and close any other docs.

### Both sides reach `signaling` but neither reaches `connected`

- Open `chrome://webrtc-internals` on both sides; check the **ICE candidate
  pairs** table. If both sides show only `host` candidates with mismatched
  addresses, your network blocks direct UDP. If they show `srflx` candidates,
  your NAT or firewall is rewriting ports. If they show `relay`, you have a
  TURN server configured but ICE is going through it anyway — that should
  still connect.
- On macOS, confirm the Mac firewall allows Chrome incoming UDP: **System
  Settings → Network → Firewall → Options → Allow incoming connections** for
  Chrome. (This is rarely the actual problem on macOS Sonoma+ but is worth
  checking.)

### Send echo returns `Error: deadline_exceeded`

- The reply never came back. Open `chrome://webrtc-internals` and confirm the
  data channel is `open` on both sides. If it is, your `deadlineMs` is too
  short (default is 5000 ms). If the data channel is `closed`, the disconnect
  path failed — file a bug.

### After Disconnect, the Linux side reports a different connection ID

The Phase 5 cleanup invariant was not satisfied; the offscreen document is
reused. Reload the extension on both sides and try again. If it persists,
capture `chrome://extensions` → service worker → **Inspect views** screenshots
on both sides.

## After the smoke

When all seven rows above pass, the transport is proved on your network. The
PoC is now ready for Phase 3 (Application Compatibility Gate), which exercises
Outlook / Slack / Zoom web application session handoff on top of this verified
transport.

When any row fails, the transport is **not** proved on your network. Do not
proceed to Phase 3. Open a follow-up plan against the failure mode (most
common: companion loopback service behind Tailscale Serve, exactly the
fallback path described in `research-extension-transport.md`).

## Uninstalling

To remove the extension entirely: `chrome://extensions` → your extension →
**Remove**. The offscreen document is torn down automatically. There is no
persistent storage to clean up — the PoC keeps everything in the offscreen
document's memory only.

## See also

- `.context/2026-09-05.lan-login-handoff/plan-lan-login-handoff.md` — the
  parent plan (for the agent or a reviewer following up)
- `.context/2026-09-05.lan-login-handoff/phase-2-evidence.md` — the
  acceptance matrix and cross-machine checklist (for the agent or reviewer)
- `docs/adr/0001-extension-only-transport.md` — the Mac-vs-Linux verdict
  behind the "use Tart with bridged networking" recommendation