# Deploy the pairing service

Update the configured Cloudflare Worker from the repository root. This procedure is for the service maintainer; extension users do not run a local signaling server.

## Steps

1. Run `pnpm install`.
2. Run `pnpm --filter beam-me-up-pairing typecheck`. This generates the Worker binding/runtime types before checking the service.
3. Run `pnpm --filter beam-me-up-pairing test`.
4. Run `pnpm --filter beam-me-up-pairing exec wrangler whoami`. Verify access to the personal account selected by `services/pairing/wrangler.jsonc`; do not deploy this service into PartyPix.
5. Run `pnpm --filter beam-me-up-pairing exec wrangler deploy --dry-run`.
6. Run `pnpm --filter beam-me-up-pairing run deploy`. The `run` is required: bare `pnpm deploy` is a different built-in command.
7. **Eat:** Wrangler reports `https://beam-me-up-pairing.buck-f11.workers.dev`, and two current extension profiles can [pair and return an echo](pair-two-browsers.md).

Keep the configured endpoint, extension host permission and CSP in sync if deliberately moving the service. Existing pairs live in the current Durable Object namespace and do not migrate merely by changing the URL.

Do not enable request/body logging or log codes, tickets, SDP or application data. Worker tests use Cloudflare's shared-storage WebSocket mode with distinct per-test object IDs and rate-limit keys; resetting live WebSocket objects between cases crashes the tested workerd runtime.