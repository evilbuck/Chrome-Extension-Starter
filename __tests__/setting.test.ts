import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Settings } from '@/shared/config';
import { SettingManager } from '@/shared/lib/setting';

const mockStorage = {
    sync: {
        get: vi.fn(),
        set: vi.fn()
    }
};

global.chrome = {
    storage: mockStorage
} as unknown as typeof chrome;

interface TestSettings extends Settings {
    theme: string;
    enabled: boolean;
    count: number;
}

const defaultSettings = (): TestSettings => ({
    hideMode: 'remove',
    showHideButtons: true,
    theme: 'dark',
    enabled: true,
    count: 0
});

describe('SettingManager', () => {
    let manager: SettingManager<TestSettings>;

    beforeEach(() => {
        vi.clearAllMocks();
        manager = new SettingManager<TestSettings>(defaultSettings);
    });

    describe('reset()', () => {
        it('should reset settings to defaults', async () => {
            mockStorage.sync.set.mockImplementation((_items, callback) => callback?.());

            const result = await manager.reset();

            expect(result).toEqual(defaultSettings());
            expect(mockStorage.sync.set).toHaveBeenCalledWith({ settings: defaultSettings() }, expect.any(Function));
        });
    });

    describe('load()', () => {
        it('should load existing settings when properly stored', async () => {
            const storedSettings = {
                hideMode: 'dim',
                showHideButtons: false,
                theme: 'light',
                enabled: false,
                count: 5
            };

            mockStorage.sync.get.mockImplementation((_keys, callback) => {
                callback?.({ settings: storedSettings });
            });

            const result = await manager.load();

            expect(result).toEqual(storedSettings);
        });

        it('should initialize if settings are missing', async () => {
            mockStorage.sync.get.mockImplementation((_keys, callback) => {
                callback?.({});
            });
            mockStorage.sync.set.mockImplementation((_items, callback) => callback?.());

            const result = await manager.load();

            expect(result).toEqual(defaultSettings());
            expect(mockStorage.sync.set).toHaveBeenCalled();
        });

        it('should initialize if settings are corrupted', async () => {
            mockStorage.sync.get.mockImplementation((_keys, callback) => {
                callback?.({ settings: 'invalid' });
            });
            mockStorage.sync.set.mockImplementation((_items, callback) => callback?.());

            const result = await manager.load();

            expect(result).toEqual(defaultSettings());
        });

        it('should handle errors gracefully', async () => {
            mockStorage.sync.get.mockImplementation(() => {
                throw new Error('Storage error');
            });
            mockStorage.sync.set.mockImplementation((_items, callback) => callback?.());

            const result = await manager.load();

            expect(result).toEqual(defaultSettings());
        });
    });

    describe('save()', () => {
        it('should save settings to sync storage', async () => {
            const newSettings: TestSettings = {
                hideMode: 'dim',
                showHideButtons: true,
                theme: 'light',
                enabled: false,
                count: 10
            };
            mockStorage.sync.set.mockImplementation((_items, callback) => callback?.());

            await manager.save(newSettings);

            expect(mockStorage.sync.set).toHaveBeenCalledWith({ settings: newSettings }, expect.any(Function));
        });
    });
});
