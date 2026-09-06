import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [
        cloudflareTest({
            wrangler: { configPath: './wrangler.jsonc' }
        })
    ],
    test: {
        dir: './test',
        name: { label: 'pairing', color: 'cyan' },
        // DO WebSockets require shared storage; tests use distinct object IDs and rate-limit keys.
        // https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/#websockets
        fileParallelism: false,
        isolate: false,
        maxWorkers: 1
    }
});
