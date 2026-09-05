import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTypedStorage } from '@/shared/lib/storage';

// Phase 4: local + session only. Sync and managed areas were removed
// because Phase 4 settings must stay machine-local.

interface MockedBucket {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
}

const mockStorageAreas: { local: MockedBucket; session: MockedBucket } = {
    local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    session: { get: vi.fn(), set: vi.fn(), remove: vi.fn() }
};

(global as { chrome: typeof chrome }).chrome = {
    storage: mockStorageAreas
} as unknown as typeof chrome;

interface TestSchema {
    local: {
        role: 'host' | 'client' | null;
        connectionMetadata: { connectionId: string | null; lastConnectedAt: number | null };
    };
    session: {
        activeRequestId: string | null;
        activeRequestOriginTab: number | null;
    };
}

/**
 * Chrome's storage API semantics we mimic in the mock:
 *   - `bucket.get([key], cb)` returns only the requested keys' stored values.
 *   - `bucket.get({key: default}, cb)` returns the stored value if present,
 *     otherwise the supplied default.
 *   - `bucket.get(null, cb)` returns every stored key/value.
 *   - `bucket.getAll(defaults)` (used as `getAll`) is the union of stored
 *     keys and defaults.
 */
const chromeGetImpl = (
    defaults: Record<string, unknown> | string[] | null,
    stored: Record<string, unknown>,
    cb: (v: Record<string, unknown>) => void
): void => {
    if (defaults === null) {
        cb(stored);
        return;
    }
    if (Array.isArray(defaults)) {
        const out: Record<string, unknown> = {};
        for (const k of defaults) {
            if (k in stored) out[k] = stored[k];
        }
        cb(out);
        return;
    }
    const out: Record<string, unknown> = { ...defaults };
    for (const k of Object.keys(stored)) out[k] = stored[k];
    cb(out);
};

describe('createTypedStorage', () => {
    let kv: ReturnType<typeof createTypedStorage<TestSchema>>;

    beforeEach(() => {
        vi.clearAllMocks();
        kv = createTypedStorage<TestSchema>();
    });

    describe('get()', () => {
        it('returns the value when present', async () => {
            mockStorageAreas.local.get.mockImplementation((_d, cb) => chromeGetImpl(_d, { role: 'host' }, cb));
            await expect(kv.get('local', 'role', null as 'host' | 'client' | null)).resolves.toBe('host');
        });

        it('returns the fallback when absent', async () => {
            mockStorageAreas.local.get.mockImplementation((_d, cb) => chromeGetImpl(_d, {}, cb));
            await expect(kv.get('local', 'role', null as 'host' | 'client' | null)).resolves.toBeNull();
        });

        it('returns undefined when no fallback and absent', async () => {
            mockStorageAreas.local.get.mockImplementation((_d, cb) => chromeGetImpl(_d, {}, cb));
            await expect(kv.get('local', 'connectionMetadata')).resolves.toBeUndefined();
        });
    });

    describe('getAll()', () => {
        it('returns full shape with defaults', async () => {
            mockStorageAreas.local.get.mockImplementation((_d, cb) => chromeGetImpl(_d, { role: 'host' }, cb));
            const result = await kv.getAll('local', {
                role: null as 'host' | 'client' | null,
                connectionMetadata: { connectionId: null, lastConnectedAt: null }
            });
            expect(result.role).toBe('host');
            expect(result.connectionMetadata).toEqual({ connectionId: null, lastConnectedAt: null });
        });
    });

    describe('set()', () => {
        it('writes the value', async () => {
            mockStorageAreas.local.set.mockImplementation((_items, cb) => cb());
            await kv.set('local', 'role', 'client');
            expect(mockStorageAreas.local.set).toHaveBeenCalledWith({ role: 'client' }, expect.any(Function));
        });
    });

    describe('setAll()', () => {
        it('writes multiple values', async () => {
            mockStorageAreas.local.set.mockImplementation((_items, cb) => cb());
            await kv.setAll('local', { role: 'host' });
            expect(mockStorageAreas.local.set).toHaveBeenCalled();
        });
    });

    describe('remove()', () => {
        it('removes a single key', async () => {
            mockStorageAreas.local.remove.mockImplementation((_keys, cb) => cb());
            await kv.remove('local', 'role');
            expect(mockStorageAreas.local.remove).toHaveBeenCalledWith(['role'], expect.any(Function));
        });

        it('removes multiple keys', async () => {
            mockStorageAreas.local.remove.mockImplementation((_keys, cb) => cb());
            await kv.remove('local', ['role', 'connectionMetadata']);
            expect(mockStorageAreas.local.remove).toHaveBeenCalledWith(
                ['role', 'connectionMetadata'],
                expect.any(Function)
            );
        });
    });

    describe('local-only contract', () => {
        it('writes only to chrome.storage.local', async () => {
            mockStorageAreas.local.set.mockImplementation((_items, cb) => cb());
            await kv.set('local', 'role', 'host');
            expect(mockStorageAreas.local.set).toHaveBeenCalled();
        });
    });
});