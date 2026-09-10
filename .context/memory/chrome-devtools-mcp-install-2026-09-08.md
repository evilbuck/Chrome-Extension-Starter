---
date: 2026-09-08
domains: [tooling, devtools]
topics: [chrome-devtools-mcp, mcp, omp, chromium, debugging]
subject: 2026-09-08.chrome-devtools-mcp-install
artifacts: []
related: []
priority: medium
status: completed
---

# Installed chrome-devtools-mcp v1.9.0 for OMP

Installed the Chrome DevTools for agents suite (MCP server + agentic skills)
from `https://developer.chrome.com/docs/devtools/agents/get-started` for the
ebay-enhance project. Scope: live browser debugging of the extension's
content/popup/options surfaces without manual Chromium juggling.

## What shipped

- **MCP server** registered in `~/.omp/agent/mcp.json` under `mcpServers.chrome-devtools`.
  Auto-launches a persistent Chromium instance on first tool call.
- **Persistent profile** at `~/.cache/chrome-devtools-mcp/chromium-profile`
  (logins survive MCP restarts; profile starts empty — log in once).
- **Agentic skills** installed in `~/.omp/agent/managed-skills/` from
  `chrome-devtools-mcp-v1.9.0` tarball: `chrome-devtools`,
  `chrome-devtools-cli`, `troubleshooting`, `debug-optimize-lcp`. Skipped
  `a11y-debugging`, `cookie-debugging`, `memory-leak-debugging`. Provenance
  recorded at `~/.omp/agent/managed-skills/.provenance/chrome-devtools.json`.
- **Project doc** added at `AGENTS.md` in a `BEGIN chrome-devtools-mcp`
  block — covers launch settings, skill inventory, the Developer-mode
  reload gotcha, and the update procedure.

## Final config (`~/.omp/agent/mcp.json`)

```json
"chrome-devtools": {
  "command": "npx",
  "args": [
    "-y", "chrome-devtools-mcp@latest",
    "--executable-path=/usr/bin/chromium",
    "--user-data-dir=/home/buckleyrobinson/.cache/chrome-devtools-mcp/chromium-profile",
    "--chrome-arg=--no-sandbox",
    "--chrome-arg=--disable-setuid-sandbox",
    "--viewport=1280x720"
  ]
}
```

## Non-obvious lessons

- **Flag-name trap:** `--no-sandbox` is not a chrome-devtools-mcp flag —
  the package logs `Unknown arguments: --sandbox` and exits 1. Correct
  form is `--chrome-arg=--no-sandbox`. Same for `--disable-setuid-sandbox`.
  The package's own help banner shows the working form:
  `npx chrome-devtools-mcp@latest --chrome-arg='--no-sandbox' --chrome-arg='--disable-setuid-sandbox'`.
- **Auto-launch path differs from attach path:** the package defaults to
  `/opt/google/chrome/chrome`, which is not installed on this Omarchy host.
  Only `/usr/bin/chromium` exists. `--executable-path` is required.
- **Persistent profile is opt-in:** the default `--user-data-dir` lives
  under `$HOME/.cache/chrome-devtools-mcp/` and survives MCP restarts;
  `--isolated` would create a temp dir cleaned up on browser close
  (loses logins every session).
- **Usage statistics warning is harmless:** the package prints
  "turning off usage statistics" when `CI` or
  `CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS` env vars are set; this is
  automatic opt-out, not a misconfiguration.

## Verification (run, not asserted)

- `npx chrome-devtools-mcp@latest` (with the registered args) booted and
  reached its stdio wait point with exit 0 and no warnings.
- `/usr/bin/chromium` (151.0.7922.173) launched headless with the
  configured `--user-data-dir` and dumped `https://example.com` DOM in
  ~1 s — confirming the binary, profile path, and `--no-sandbox` chrome
  args are correct end-to-end.
- `jq . ~/.omp/agent/mcp.json` validated the JSON structure.

## Caveats to know

- **First MCP tool call will spawn Chromium with an empty profile** —
  log into the test eBay account once. If you want to reuse an existing
  Work/test profile from a prior Chromium, change `--user-data-dir` to
  point at that profile (or copy it into the new path).
- **Developer mode must be on** in `chrome://extensions` before
  `chrome.runtime.reload` on the unpacked extension; otherwise reload
  disables it with `disableReasons.unsupportedDeveloperExtension=true`
  and `chrome-extension://.../options.html` fails with
  `ERR_BLOCKED_BY_CLIENT` (memory from 2026-09-06 Slack smoke test).
- **Skills are global, not per-project.** They live under
  `~/.omp/agent/managed-skills/` and are surfaced for all sessions in
  OMP. Update procedure lives in the new `AGENTS.md` block.

## Next session

Ask the assistant: *"Check the performance of https://developers.chrome.com"*
to verify end-to-end (or run any `xd://chrome-devtools_*` tool). The
in-package smoke test prompt from the get-started doc.
