import type { Migration } from '@/shared/lib/migration';
import { SettingManager } from '@/shared/lib/setting';

export type HideMode = 'remove' | 'dim';

export interface Settings {
    hideMode: HideMode;
    showHideButtons: boolean;
}

const defaultSettings = (): Settings => ({
    hideMode: 'remove',
    showHideButtons: true
});

export const settingsManager = new SettingManager<Settings>(defaultSettings);

export const customMigrations: Migration[] = [];
