// Tiny UUID v4 helpers used across the Phase 2 transport.
//
// `crypto.randomUUID` is available in Chrome 92+ in extension pages and
// service workers. We wrap it so tests can stub it via vitest's
// `vi.spyOn(crypto, 'randomUUID')`.

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Generate a RFC 4122 v4 UUID using the runtime crypto primitive. */
export const randomUuid = (): string => {
    const c = (globalThis as { crypto?: Crypto }).crypto;
    if (!c || typeof c.randomUUID !== 'function') {
        throw new Error('crypto.randomUUID is not available; Chrome >= 92 required');
    }
    return c.randomUUID();
};

/** Returns true iff `value` is a syntactically valid RFC 4122 v4 UUID. */
export const isUuidV4 = (value: unknown): value is string => {
    return typeof value === 'string' && UUID_V4_RE.test(value);
};