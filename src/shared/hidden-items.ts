import { kv } from '@/shared/lib/storage';
import type { HiddenItem, HiddenItemsMap } from '@/shared/types';

export type { HiddenItem, HiddenItemsMap };

export const emptyHiddenItems = (): HiddenItemsMap => ({});

export const loadHiddenItems = async (): Promise<HiddenItemsMap> => {
    const stored = await kv.get('local', 'hiddenItems');
    if (!stored || typeof stored !== 'object') return emptyHiddenItems();
    return stored;
};

export const saveHiddenItems = async (items: HiddenItemsMap): Promise<void> => {
    await kv.set('local', 'hiddenItems', items);
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

export const watchHiddenItems = (onChange: (items: HiddenItemsMap) => void): (() => void) =>
    kv.watch('local', 'hiddenItems', (current) => {
        onChange(current ?? emptyHiddenItems());
    });
