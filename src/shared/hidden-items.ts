import { logger } from '@/shared/lib/logger';
import { kv } from '@/shared/lib/storage';
import type {
    HiddenItem,
    HiddenItemsIndexMap,
    HiddenItemsIndexShardKey,
    HiddenItemsMap,
    PendingHiddenItemsIndex,
    StorageSchema
} from '@/shared/types';

export type { HiddenItem, HiddenItemsMap };

export const HIDDEN_ITEMS_SYNC_MANIFEST_KEY = 'hiddenItemsIndexManifest' as const;
const HIDDEN_ITEMS_SYNC_SHARD_PREFIX = 'hiddenItemsIndex:';
const SYNC_ITEM_MAX_BYTES = 8192;
const SYNC_ITEM_SERIALIZATION_MARGIN_BYTES = 8;
const MAX_SYNC_SHARDS = 511;
const utf8 = new TextEncoder();

export const emptyHiddenItems = (): HiddenItemsMap => ({});

// NOTE (fresh start, 2026-09-08): the legacy `local.hiddenItems` key is no
// longer read. It is left untouched on disk — existing users re-hide items
// and the new split store takes over. Do not re-add reads of that key.

// Saves persist a revisioned index to local before returning. The service
// worker writes bounded sync shards, then acknowledges exactly that revision.
// A newer local revision therefore remains pending even when an older flush
// finishes later. Conflict semantics remain whole-list last-write-wins.

const syncShardKey = (index: number): HiddenItemsIndexShardKey => `${HIDDEN_ITEMS_SYNC_SHARD_PREFIX}${index}`;

const splitItems = (items: HiddenItemsMap): { index: HiddenItemsIndexMap; thumbnails: Record<string, string> } => {
    const index: HiddenItemsIndexMap = {};
    const thumbnails: Record<string, string> = {};
    for (const [id, item] of Object.entries(items)) {
        index[id] = { id: item.id, title: item.title, url: item.url, hiddenAt: item.hiddenAt };
        if (item.thumbnail) thumbnails[id] = item.thumbnail;
    }
    return { index, thumbnails };
};

const joinItems = (index: HiddenItemsIndexMap, thumbnails: Record<string, string>): HiddenItemsMap => {
    const items: HiddenItemsMap = {};
    for (const [id, entry] of Object.entries(index)) {
        items[id] = { ...entry, thumbnail: thumbnails[id] ?? '' };
    }
    return items;
};

// The fragments below omit the storage item's JSON envelope. Reserve eight
// bytes for that envelope and a one-byte margin against quota accounting.
const storageItemEnvelopeBytes = (key: string): number =>
    utf8.encode(key).byteLength + SYNC_ITEM_SERIALIZATION_MARGIN_BYTES;

const splitIndexIntoShards = (index: HiddenItemsIndexMap): HiddenItemsIndexMap[] => {
    const shards: HiddenItemsIndexMap[] = [];
    let shard: HiddenItemsIndexMap = {};
    let shardEntries = 0;
    let shardBytes = storageItemEnvelopeBytes(syncShardKey(0));

    for (const [id, entry] of Object.entries(index).sort(([left], [right]) => left.localeCompare(right))) {
        const fragmentBytes = utf8.encode(`${JSON.stringify(id)}:${JSON.stringify(entry)}`).byteLength;
        const separatorBytes = shardEntries === 0 ? 0 : 1;

        if (shardEntries > 0 && shardBytes + separatorBytes + fragmentBytes > SYNC_ITEM_MAX_BYTES) {
            shards.push(shard);
            if (shards.length >= MAX_SYNC_SHARDS) {
                throw new Error('Hidden item index exceeds chrome.storage.sync item capacity.');
            }
            shard = {};
            shardEntries = 0;
            shardBytes = storageItemEnvelopeBytes(syncShardKey(shards.length));
        }

        const nextSeparatorBytes = shardEntries === 0 ? 0 : 1;
        if (shardBytes + nextSeparatorBytes + fragmentBytes > SYNC_ITEM_MAX_BYTES) {
            throw new Error(`Hidden item ${id} exceeds the chrome.storage.sync per-item quota.`);
        }

        shard[id] = entry;
        shardEntries += 1;
        shardBytes += nextSeparatorBytes + fragmentBytes;
    }

    if (shardEntries > 0) shards.push(shard);
    return shards;
};

const validShardCount = (value: number | undefined): number =>
    Number.isSafeInteger(value) && value !== undefined && value >= 0 && value <= MAX_SYNC_SHARDS ? value : 0;

const loadSyncedIndex = async (): Promise<HiddenItemsIndexMap> => {
    const manifest = await kv.get('sync', HIDDEN_ITEMS_SYNC_MANIFEST_KEY);
    const shardCount = validShardCount(manifest?.shardCount);
    if (shardCount === 0) return {};

    const shards = await Promise.all(
        Array.from({ length: shardCount }, (_, index) => kv.get('sync', syncShardKey(index)))
    );
    return Object.assign({}, ...shards.map((shard) => shard ?? {}));
};

const writeSyncedIndex = async (pending: PendingHiddenItemsIndex): Promise<void> => {
    const shards = splitIndexIntoShards(pending.index);
    const previousManifest = await kv.get('sync', HIDDEN_ITEMS_SYNC_MANIFEST_KEY);
    const slots = Math.max(shards.length, validShardCount(previousManifest?.shardCount));
    const update: Partial<StorageSchema['sync']> = {
        hiddenItemsIndexManifest: {
            revision: pending.revision,
            shardCount: shards.length
        }
    };

    for (let index = 0; index < slots; index += 1) {
        update[syncShardKey(index)] = shards[index] ?? {};
    }
    await kv.setAll('sync', update);
};

export const loadHiddenItems = async (): Promise<HiddenItemsMap> => {
    const [pending, syncedRevision, syncedIndex, thumbnails] = await Promise.all([
        kv.get('local', 'pendingHiddenItemsIndex'),
        kv.get('local', 'syncedHiddenItemsRevision'),
        loadSyncedIndex(),
        kv.get('local', 'thumbnails')
    ]);
    const index = pending && pending.revision !== syncedRevision ? pending.index : syncedIndex;
    return joinItems(index, thumbnails ?? {});
};

export const saveHiddenItems = async (items: HiddenItemsMap): Promise<void> => {
    const { index, thumbnails } = splitItems(items);
    await kv.setAll('local', {
        pendingHiddenItemsIndex: {
            revision: crypto.randomUUID(),
            index
        },
        thumbnails
    });
};

export const flushPendingHiddenIndex = async (): Promise<boolean> => {
    const [pending, syncedRevision] = await Promise.all([
        kv.get('local', 'pendingHiddenItemsIndex'),
        kv.get('local', 'syncedHiddenItemsRevision')
    ]);
    if (!pending || pending.revision === syncedRevision) return false;

    await writeSyncedIndex(pending);
    await kv.set('local', 'syncedHiddenItemsRevision', pending.revision);

    const latest = await kv.get('local', 'pendingHiddenItemsIndex');
    return Boolean(latest && latest.revision !== pending.revision);
};

export const isHidden = async (id: string): Promise<boolean> => {
    const items = await loadHiddenItems();
    return Boolean(items[id]);
};

export const hideItem = async (item: Omit<HiddenItem, 'hiddenAt'> & { hiddenAt?: number }): Promise<HiddenItem> => {
    const items = await loadHiddenItems();
    const record: HiddenItem = {
        id: item.id,
        title: item.title,
        url: item.url,
        thumbnail: item.thumbnail,
        hiddenAt: item.hiddenAt ?? Date.now()
    };
    items[item.id] = record;
    await saveHiddenItems(items);
    return record;
};

export const unhideItem = async (id: string): Promise<void> => {
    const items = await loadHiddenItems();
    if (!(id in items)) return;
    delete items[id];
    await saveHiddenItems(items);
};

export const unhideAll = async (): Promise<void> => {
    await saveHiddenItems(emptyHiddenItems());
};

export const listHiddenItems = (items: HiddenItemsMap): HiddenItem[] =>
    Object.values(items).sort((a, b) => b.hiddenAt - a.hiddenAt);

export const countHidden = (items: HiddenItemsMap): number => Object.keys(items).length;

export const watchHiddenItems = (onChange: (items: HiddenItemsMap) => void): (() => void) => {
    const emit = async () => {
        try {
            onChange(await loadHiddenItems());
        } catch (error) {
            logger.error('[hidden-items] failed to refresh watched state', error);
        }
    };
    const onStorageChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
        if (area !== 'sync') return;
        if (!(HIDDEN_ITEMS_SYNC_MANIFEST_KEY in changes)) return;
        void emit();
    };
    chrome.storage.onChanged.addListener(onStorageChange);
    const stopPending = kv.watch('local', 'pendingHiddenItemsIndex', () => {
        void emit();
    });
    return () => {
        chrome.storage.onChanged.removeListener(onStorageChange);
        stopPending();
    };
};
