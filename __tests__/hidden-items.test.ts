import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    flushPendingHiddenIndex,
    hideItem,
    isHidden,
    listHiddenItems,
    loadHiddenItems,
    saveHiddenItems,
    unhideAll,
    unhideItem,
    watchHiddenItems
} from '@/shared/hidden-items';
import type {
    HiddenItemsIndexManifest,
    HiddenItemsIndexMap,
    HiddenItemsMap,
    PendingHiddenItemsIndex
} from '@/shared/types';

const syncStore: Record<string, unknown> = {};
const localStore: Record<string, unknown> = {};
const localGetKeys: string[] = [];
const runtimeState = {
    lastError: undefined as { message: string } | undefined
};

type ChangeListener = (changes: Record<string, { newValue?: unknown }>, area: string) => void;
const changeListeners = new Set<ChangeListener>();

const makeArea = (store: Record<string, unknown>, getKeys?: string[]) => ({
    get: vi.fn((keys: string[] | Record<string, unknown>, callback: (value: Record<string, unknown>) => void) => {
        if (Array.isArray(keys)) {
            getKeys?.push(...keys);
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
const mockLocal = makeArea(localStore, localGetKeys);

global.chrome = {
    runtime: runtimeState,
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
    }
} as unknown as typeof chrome;

const fireChange = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    for (const fn of changeListeners) fn(changes, area);
};

const sample = {
    id: '168624081916',
    title: 'Keychron K2',
    url: 'https://www.ebay.com/itm/168624081916',
    thumbnail: 'https://i.ebayimg.com/x.jpg',
    hiddenAt: 42
};

const sampleIndex = {
    id: sample.id,
    title: sample.title,
    url: sample.url,
    hiddenAt: sample.hiddenAt
};

const pendingSnapshot = (): PendingHiddenItemsIndex => {
    const pending = localStore.pendingHiddenItemsIndex as PendingHiddenItemsIndex | undefined;
    if (!pending) throw new Error('Expected a pending hidden-items snapshot.');
    return pending;
};

const syncedManifest = (): HiddenItemsIndexManifest => {
    const manifest = syncStore.hiddenItemsIndexManifest as HiddenItemsIndexManifest | undefined;
    if (!manifest) throw new Error('Expected a synced hidden-items manifest.');
    return manifest;
};

const readSyncedIndex = (): HiddenItemsIndexMap => {
    const manifest = syncedManifest();
    const index: HiddenItemsIndexMap = {};
    for (let shardIndex = 0; shardIndex < manifest.shardCount; shardIndex += 1) {
        const shard = syncStore[`hiddenItemsIndex:${shardIndex}`] as HiddenItemsIndexMap | undefined;
        Object.assign(index, shard ?? {});
    }
    return index;
};

const syncItemBytes = (key: string): number =>
    new TextEncoder().encode(JSON.stringify({ [key]: syncStore[key] })).byteLength;

describe('hidden items store', () => {
    beforeEach(() => {
        for (const key of Object.keys(syncStore)) delete syncStore[key];
        for (const key of Object.keys(localStore)) delete localStore[key];
        localGetKeys.length = 0;
        changeListeners.clear();
        runtimeState.lastError = undefined;
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(async () => {
        await vi.runAllTimersAsync();
        vi.useRealTimers();
    });

    it('hides an item and reports it as hidden', async () => {
        await hideItem({
            id: '168624081916',
            title: 'Keychron K2',
            url: 'https://www.ebay.com/itm/168624081916',
            thumbnail: 'https://i.ebayimg.com/x.jpg'
        });

        expect(await isHidden('168624081916')).toBe(true);
        expect(await isHidden('800459263916')).toBe(false);
        expect(await loadHiddenItems()).toMatchObject({
            '168624081916': {
                id: '168624081916',
                title: 'Keychron K2'
            }
        });
    });

    it('replaces metadata for the same id', async () => {
        await hideItem({
            id: '168624081916',
            title: 'Old title',
            url: 'https://www.ebay.com/itm/168624081916',
            thumbnail: '',
            hiddenAt: 1
        });
        await hideItem({
            id: '168624081916',
            title: 'New title',
            url: 'https://www.ebay.com/itm/168624081916',
            thumbnail: 'https://i.ebayimg.com/x.jpg',
            hiddenAt: 2
        });

        const items = await loadHiddenItems();
        expect(items['168624081916']?.title).toBe('New title');
        expect(items['168624081916']?.hiddenAt).toBe(2);
    });

    it('unhides a single item and can clear the list', async () => {
        await hideItem({
            id: '1',
            title: 'A',
            url: 'https://www.ebay.com/itm/111111111111',
            thumbnail: '',
            hiddenAt: 10
        });
        await hideItem({
            id: '2',
            title: 'B',
            url: 'https://www.ebay.com/itm/222222222222',
            thumbnail: '',
            hiddenAt: 20
        });

        await unhideItem('1');
        expect(await isHidden('1')).toBe(false);
        expect(await isHidden('2')).toBe(true);

        await unhideAll();
        expect(await loadHiddenItems()).toEqual({});
    });

    it('lists items newest first', async () => {
        await hideItem({
            id: 'old',
            title: 'Old',
            url: 'https://www.ebay.com/itm/111111111111',
            thumbnail: '',
            hiddenAt: 10
        });
        await hideItem({
            id: 'new',
            title: 'New',
            url: 'https://www.ebay.com/itm/222222222222',
            thumbnail: '',
            hiddenAt: 20
        });

        const listed = listHiddenItems(await loadHiddenItems());
        expect(listed.map((item) => item.id)).toEqual(['new', 'old']);
    });

    it('stores a revisioned pending index locally and acknowledges it after sync', async () => {
        await hideItem(sample);
        const pending = pendingSnapshot();

        expect(pending.index).toEqual({ [sample.id]: sampleIndex });
        expect(pending.revision).toEqual(expect.any(String));
        expect(localStore.thumbnails).toEqual({ [sample.id]: sample.thumbnail });
        expect(syncStore.hiddenItemsIndexManifest).toBeUndefined();
        expect(localGetKeys).not.toContain('hiddenItems');

        await flushPendingHiddenIndex();

        expect(readSyncedIndex()).toEqual({ [sample.id]: sampleIndex });
        expect(localStore.pendingHiddenItemsIndex).toEqual(pending);
        expect(localStore.syncedHiddenItemsRevision).toBe(pending.revision);
        expect(localStore.thumbnails).toEqual({ [sample.id]: sample.thumbnail });
    });

    it('keeps a hide after the calling context is gone before the sync flush', async () => {
        await hideItem(sample);
        await vi.advanceTimersByTimeAsync(1500);

        expect(mockSync.set).not.toHaveBeenCalled();
        expect(pendingSnapshot().index).toEqual({ [sample.id]: sampleIndex });
        expect(await isHidden(sample.id)).toBe(true);

        await flushPendingHiddenIndex();
        expect(readSyncedIndex()).toEqual({ [sample.id]: sampleIndex });
    });

    it('falls back to an empty thumbnail when the local entry is missing', async () => {
        syncStore.hiddenItemsIndexManifest = { revision: 'remote-1', shardCount: 1 };
        syncStore['hiddenItemsIndex:0'] = {
            orphan: { id: 'orphan', title: 'Orphan', url: 'https://www.ebay.com/itm/1', hiddenAt: 7 }
        };

        const items = await loadHiddenItems();
        expect(items.orphan?.thumbnail).toBe('');
    });

    it('unhide and unhideAll update sync shards and local thumbnails', async () => {
        await hideItem({ id: '1', title: 'A', url: 'https://u/1', thumbnail: 't1', hiddenAt: 1 });
        await hideItem({ id: '2', title: 'B', url: 'https://u/2', thumbnail: 't2', hiddenAt: 2 });

        await unhideItem('1');
        await flushPendingHiddenIndex();
        expect(readSyncedIndex()).toEqual({
            '2': { id: '2', title: 'B', url: 'https://u/2', hiddenAt: 2 }
        });
        expect(localStore.thumbnails).toEqual({ '2': 't2' });

        await unhideAll();
        await flushPendingHiddenIndex();
        expect(readSyncedIndex()).toEqual({});
        expect(localStore.thumbnails).toEqual({});
    });

    it('coalesces rapid hides into a single sync write', async () => {
        await hideItem({ id: '1', title: 'A', url: 'https://u/1', thumbnail: '', hiddenAt: 1 });
        await hideItem({ id: '2', title: 'B', url: 'https://u/2', thumbnail: '', hiddenAt: 2 });
        await hideItem({ id: '3', title: 'C', url: 'https://u/3', thumbnail: '', hiddenAt: 3 });

        expect(mockSync.set).not.toHaveBeenCalled();
        await flushPendingHiddenIndex();

        expect(mockSync.set).toHaveBeenCalledTimes(1);
        expect(Object.keys(readSyncedIndex())).toEqual(['1', '2', '3']);
    });

    it('retains pending data when Chrome rejects a sync write', async () => {
        await hideItem(sample);
        const pending = pendingSnapshot();
        mockSync.set.mockImplementationOnce((_items, callback) => {
            runtimeState.lastError = { message: 'quota exceeded' };
            callback?.();
            runtimeState.lastError = undefined;
        });

        await expect(flushPendingHiddenIndex()).rejects.toThrow('quota exceeded');

        expect(localStore.pendingHiddenItemsIndex).toEqual(pending);
        expect(localStore.syncedHiddenItemsRevision).toBeUndefined();
        expect(syncStore.hiddenItemsIndexManifest).toBeUndefined();
    });

    it('does not acknowledge a newer snapshot when an older flush finishes', async () => {
        await hideItem({ id: '1', title: 'A', url: 'https://u/1', thumbnail: 't1', hiddenAt: 1 });
        const firstPending = pendingSnapshot();
        let finishSyncWrite: (() => void) | undefined;
        let markSyncStarted: () => void = () => undefined;
        const syncStarted = new Promise<void>((resolve) => {
            markSyncStarted = resolve;
        });
        mockSync.set.mockImplementationOnce((items, callback) => {
            Object.assign(syncStore, items);
            finishSyncWrite = callback ?? (() => undefined);
            markSyncStarted();
        });

        const firstFlush = flushPendingHiddenIndex();
        await syncStarted;
        await hideItem({ id: '2', title: 'B', url: 'https://u/2', thumbnail: 't2', hiddenAt: 2 });
        const newerPending = pendingSnapshot();
        finishSyncWrite?.();

        await expect(firstFlush).resolves.toBe(true);
        expect(localStore.pendingHiddenItemsIndex).toEqual(newerPending);
        expect(localStore.syncedHiddenItemsRevision).toBe(firstPending.revision);

        await expect(flushPendingHiddenIndex()).resolves.toBe(false);
        expect(readSyncedIndex()).toEqual({
            '1': { id: '1', title: 'A', url: 'https://u/1', hiddenAt: 1 },
            '2': { id: '2', title: 'B', url: 'https://u/2', hiddenAt: 2 }
        });
        expect(localStore.syncedHiddenItemsRevision).toBe(newerPending.revision);
    });

    it('shards a large index below Chrome sync per-item quota', async () => {
        const items: HiddenItemsMap = {};
        for (let itemIndex = 0; itemIndex < 100; itemIndex += 1) {
            const id = String(100000000000 + itemIndex);
            items[id] = {
                id,
                title: `Mechanical keyboard ${itemIndex} ${'x'.repeat(80)}`,
                url: `https://www.ebay.com/itm/${id}`,
                thumbnail: '',
                hiddenAt: itemIndex
            };
        }

        await saveHiddenItems(items);
        await flushPendingHiddenIndex();

        const manifest = syncedManifest();
        expect(manifest.shardCount).toBeGreaterThan(1);
        for (let shardIndex = 0; shardIndex < manifest.shardCount; shardIndex += 1) {
            expect(syncItemBytes(`hiddenItemsIndex:${shardIndex}`)).toBeLessThanOrEqual(8192);
        }
        expect(Object.keys(readSyncedIndex())).toHaveLength(100);
        expect(mockSync.set).toHaveBeenCalledTimes(1);
    });

    it('splits a boundary-sized index before its serialized sync item exceeds quota', async () => {
        const title = 'x'.repeat(4012);
        const items: HiddenItemsMap = {
            first: {
                id: 'first',
                title,
                url: 'https://u/first',
                thumbnail: '',
                hiddenAt: 1
            },
            second: {
                id: 'second',
                title,
                url: 'https://u/second',
                thumbnail: '',
                hiddenAt: 2
            }
        };
        const combinedIndex: HiddenItemsIndexMap = {
            first: { id: 'first', title, url: 'https://u/first', hiddenAt: 1 },
            second: { id: 'second', title, url: 'https://u/second', hiddenAt: 2 }
        };
        const combinedItemBytes = new TextEncoder().encode(
            JSON.stringify({ 'hiddenItemsIndex:0': combinedIndex })
        ).byteLength;

        expect(combinedItemBytes).toBe(8193);

        await saveHiddenItems(items);
        await flushPendingHiddenIndex();

        const manifest = syncedManifest();
        expect(manifest.shardCount).toBe(2);
        for (let shardIndex = 0; shardIndex < manifest.shardCount; shardIndex += 1) {
            expect(syncItemBytes(`hiddenItemsIndex:${shardIndex}`)).toBeLessThanOrEqual(8192);
        }
    });
    it('rejects an individually oversized index entry without acknowledging it', async () => {
        await hideItem({ ...sample, id: 'oversized', title: 'x'.repeat(9000) });
        const pending = pendingSnapshot();

        await expect(flushPendingHiddenIndex()).rejects.toThrow('per-item quota');

        expect(localStore.pendingHiddenItemsIndex).toEqual(pending);
        expect(localStore.syncedHiddenItemsRevision).toBeUndefined();
        expect(mockSync.set).not.toHaveBeenCalled();
    });

    it('watches the sync manifest and joins thumbnails on change', async () => {
        localStore.thumbnails = { r1: 'thumb-r1' };
        const seen: unknown[] = [];
        const stop = watchHiddenItems((items) => {
            seen.push(items);
        });

        syncStore.hiddenItemsIndexManifest = { revision: 'remote-1', shardCount: 1 };
        syncStore['hiddenItemsIndex:0'] = {
            r1: { id: 'r1', title: 'Remote', url: 'https://u/r1', hiddenAt: 9 }
        };
        fireChange({ hiddenItemsIndexManifest: { newValue: syncStore.hiddenItemsIndexManifest } }, 'sync');
        await vi.advanceTimersByTimeAsync(0);

        expect(seen).toEqual([
            { r1: { id: 'r1', title: 'Remote', url: 'https://u/r1', hiddenAt: 9, thumbnail: 'thumb-r1' } }
        ]);

        fireChange({ hiddenItemsIndexManifest: { newValue: {} } }, 'session');
        await vi.advanceTimersByTimeAsync(0);
        expect(seen).toHaveLength(1);

        localStore.pendingHiddenItemsIndex = {
            revision: 'pending-1',
            index: {
                r1: { id: 'r1', title: 'Pending', url: 'https://u/r1', hiddenAt: 9 }
            }
        };
        fireChange({ pendingHiddenItemsIndex: { newValue: localStore.pendingHiddenItemsIndex } }, 'local');
        await vi.advanceTimersByTimeAsync(0);
        expect(seen).toHaveLength(2);
        expect(seen[1]).toEqual({
            r1: { id: 'r1', title: 'Pending', url: 'https://u/r1', hiddenAt: 9, thumbnail: 'thumb-r1' }
        });

        stop();
    });
});
