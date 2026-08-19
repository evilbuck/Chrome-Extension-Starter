import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hideItem, isHidden, listHiddenItems, loadHiddenItems, unhideAll, unhideItem } from '@/shared/hidden-items';

const store: Record<string, unknown> = {};

const mockLocal = {
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
    remove: vi.fn()
};

global.chrome = {
    storage: {
        local: mockLocal,
        sync: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
        session: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
        managed: { get: vi.fn() },
        onChanged: {
            addListener: vi.fn(),
            removeListener: vi.fn()
        }
    }
} as unknown as typeof chrome;

describe('hidden items store', () => {
    beforeEach(() => {
        for (const key of Object.keys(store)) delete store[key];
        vi.clearAllMocks();
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
});
