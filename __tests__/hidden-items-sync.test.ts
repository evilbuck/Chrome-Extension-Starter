import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PendingHiddenItemsIndex } from '@/shared/types';

type ChangeListener = (changes: Record<string, { newValue?: unknown }>, area: string) => void;
type AlarmListener = (alarm: { name: string }) => void;

const harness = vi.hoisted(() => {
    const syncStore: Record<string, unknown> = {};
    const localStore: Record<string, unknown> = {};
    const alarms = new Map<string, { when: number }>();
    const changeListeners = new Set<ChangeListener>();
    const alarmListeners = new Set<AlarmListener>();
    const runtimeState = {
        lastError: undefined as { message: string } | undefined
    };

    const makeArea = (store: Record<string, unknown>) => ({
        get: vi.fn((keys: string[] | Record<string, unknown>, callback: (value: Record<string, unknown>) => void) => {
            if (Array.isArray(keys)) {
                const out: Record<string, unknown> = {};
                for (const key of keys) {
                    if (key in store) out[key] = store[key];
                }
                callback(out);
                return;
            }
            callback({ ...store });
        }),
        set: vi.fn((items: Record<string, unknown>, callback?: () => void) => {
            Object.assign(store, items);
            callback?.();
        }),
        remove: vi.fn((keys: string | string[], callback?: () => void) => {
            for (const key of Array.isArray(keys) ? keys : [keys]) delete store[key];
            callback?.();
        })
    });

    const mockSync = makeArea(syncStore);
    const mockLocal = makeArea(localStore);

    global.chrome = {
        storage: {
            local: mockLocal,
            sync: mockSync,
            session: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
            managed: { get: vi.fn() },
            onChanged: {
                addListener: vi.fn((fn: ChangeListener) => {
                    changeListeners.add(fn);
                }),
                removeListener: vi.fn((fn: ChangeListener) => {
                    changeListeners.delete(fn);
                })
            }
        },
        runtime: runtimeState,
        alarms: {
            get: vi.fn(async (name: string) => alarms.get(name) ?? undefined),
            create: vi.fn(async (name: string, info: { when: number }) => {
                alarms.set(name, { when: info.when });
            }),
            clear: vi.fn(async (name: string) => alarms.delete(name)),
            onAlarm: {
                addListener: vi.fn((fn: AlarmListener) => {
                    alarmListeners.add(fn);
                })
            }
        }
    } as unknown as typeof chrome;

    return {
        syncStore,
        localStore,
        alarms,
        mockSync,
        mockLocal,
        changeListeners,
        alarmListeners,
        runtimeState
    };
});

const loadCoordinator = async () => {
    vi.resetModules();
    harness.changeListeners.clear();
    harness.alarmListeners.clear();
    return import('@/background/hidden-items-sync');
};

const flushMicrotasks = async (turns = 25) => {
    for (let turn = 0; turn < turns; turn += 1) await Promise.resolve();
};

const fireLocalPending = async (value: unknown) => {
    for (const fn of harness.changeListeners) {
        fn({ pendingHiddenItemsIndex: { newValue: value } }, 'local');
    }
    // scheduleHiddenIndexFlush creates the fallback alarm asynchronously.
    await flushMicrotasks();
};

const fireAlarm = (name: string) => {
    harness.alarms.delete(name);
    for (const fn of harness.alarmListeners) fn({ name });
};

const readSyncedIndex = () => {
    const manifest = harness.syncStore.hiddenItemsIndexManifest as { shardCount: number } | undefined;
    if (!manifest) return {};
    const index: Record<string, unknown> = {};
    for (let shardIndex = 0; shardIndex < manifest.shardCount; shardIndex += 1) {
        Object.assign(index, harness.syncStore[`hiddenItemsIndex:${shardIndex}`] ?? {});
    }
    return index;
};

describe('hidden items sync coordinator', () => {
    beforeEach(() => {
        for (const key of Object.keys(harness.syncStore)) delete harness.syncStore[key];
        for (const key of Object.keys(harness.localStore)) delete harness.localStore[key];
        harness.alarms.clear();
        harness.changeListeners.clear();
        harness.alarmListeners.clear();
        harness.runtimeState.lastError = undefined;
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(async () => {
        await vi.runAllTimersAsync();
        vi.useRealTimers();
    });

    it('flushes the local snapshot to sync once after the debounce window', async () => {
        const { SYNC_FLUSH_MS } = await loadCoordinator();
        const { hideItem } = await import('@/shared/hidden-items');

        await hideItem({ id: '1', title: 'A', url: 'https://u/1', thumbnail: 't1', hiddenAt: 1 });
        await fireLocalPending(harness.localStore.pendingHiddenItemsIndex);
        await hideItem({ id: '2', title: 'B', url: 'https://u/2', thumbnail: 't2', hiddenAt: 2 });
        await fireLocalPending(harness.localStore.pendingHiddenItemsIndex);

        expect(harness.mockSync.set).not.toHaveBeenCalled();
        expect(harness.alarms.has('hidden_items_sync')).toBe(true);

        await vi.advanceTimersByTimeAsync(SYNC_FLUSH_MS);

        expect(harness.mockSync.set).toHaveBeenCalledTimes(1);
        expect(readSyncedIndex()).toEqual({
            '1': { id: '1', title: 'A', url: 'https://u/1', hiddenAt: 1 },
            '2': { id: '2', title: 'B', url: 'https://u/2', hiddenAt: 2 }
        });
        expect(harness.localStore.syncedHiddenItemsRevision).toEqual(
            (harness.localStore.pendingHiddenItemsIndex as PendingHiddenItemsIndex).revision
        );
        expect(harness.alarms.has('hidden_items_sync')).toBe(true);
    });

    it('keeps the one-shot fallback for a later snapshot after a timer flush', async () => {
        const { SYNC_FLUSH_MS } = await loadCoordinator();
        const { hideItem } = await import('@/shared/hidden-items');

        await hideItem({ id: '5', title: 'First', url: 'https://u/5', thumbnail: 't5', hiddenAt: 5 });
        await fireLocalPending(harness.localStore.pendingHiddenItemsIndex);
        await vi.advanceTimersByTimeAsync(SYNC_FLUSH_MS);

        expect(harness.mockSync.set).toHaveBeenCalledTimes(1);
        expect(harness.alarms.has('hidden_items_sync')).toBe(true);

        await hideItem({ id: '6', title: 'Second', url: 'https://u/6', thumbnail: 't6', hiddenAt: 6 });
        await fireLocalPending(harness.localStore.pendingHiddenItemsIndex);
        vi.clearAllTimers();
        fireAlarm('hidden_items_sync');
        await flushMicrotasks();

        expect(harness.mockSync.set).toHaveBeenCalledTimes(2);
        expect(readSyncedIndex()).toEqual({
            '5': { id: '5', title: 'First', url: 'https://u/5', hiddenAt: 5 },
            '6': { id: '6', title: 'Second', url: 'https://u/6', hiddenAt: 6 }
        });
        expect(harness.alarms.has('hidden_items_sync')).toBe(false);
    });
    it('recovers a pending snapshot when the service worker starts cold', async () => {
        harness.localStore.pendingHiddenItemsIndex = {
            revision: 'cold-start',
            index: {
                '9': { id: '9', title: 'Cold', url: 'https://u/9', hiddenAt: 9 }
            }
        };

        await loadCoordinator();
        await vi.advanceTimersByTimeAsync(0);

        expect(harness.mockSync.set).toHaveBeenCalledTimes(1);
        expect(readSyncedIndex()).toEqual({
            '9': { id: '9', title: 'Cold', url: 'https://u/9', hiddenAt: 9 }
        });
        expect(harness.localStore.syncedHiddenItemsRevision).toBe('cold-start');
    });

    it('uses the named alarm fallback when the in-memory timer is gone', async () => {
        await loadCoordinator();
        const { hideItem } = await import('@/shared/hidden-items');

        await hideItem({ id: '3', title: 'C', url: 'https://u/3', thumbnail: 't3', hiddenAt: 3 });
        await fireLocalPending(harness.localStore.pendingHiddenItemsIndex);

        expect(harness.alarms.has('hidden_items_sync')).toBe(true);
        expect(harness.mockSync.set).not.toHaveBeenCalled();

        // Service-worker death drops the coalescing timer while the named alarm remains.
        vi.clearAllTimers();
        fireAlarm('hidden_items_sync');
        await flushMicrotasks();

        expect(harness.mockSync.set).toHaveBeenCalledTimes(1);

        expect(readSyncedIndex()).toEqual({
            '3': { id: '3', title: 'C', url: 'https://u/3', hiddenAt: 3 }
        });
        expect(harness.alarms.has('hidden_items_sync')).toBe(false);
    });

    it('keeps the fallback alarm when a sync write fails', async () => {
        const { SYNC_FLUSH_MS } = await loadCoordinator();
        const { hideItem } = await import('@/shared/hidden-items');

        await hideItem({ id: '4', title: 'D', url: 'https://u/4', thumbnail: 't4', hiddenAt: 4 });
        const pending = harness.localStore.pendingHiddenItemsIndex as PendingHiddenItemsIndex;
        await fireLocalPending(pending);

        harness.mockSync.set.mockImplementationOnce((_items, callback) => {
            harness.runtimeState.lastError = { message: 'quota exceeded' };
            callback?.();
            harness.runtimeState.lastError = undefined;
        });

        await vi.advanceTimersByTimeAsync(SYNC_FLUSH_MS);

        expect(harness.localStore.pendingHiddenItemsIndex).toEqual(pending);
        expect(harness.localStore.syncedHiddenItemsRevision).toBeUndefined();
        expect(harness.alarms.has('hidden_items_sync')).toBe(true);
        expect(readSyncedIndex()).toEqual({});
    });
});
