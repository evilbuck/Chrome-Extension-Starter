import { HIDDEN_ITEMS_SYNC_MANIFEST_KEY, loadHiddenItems } from '@/shared/hidden-items';
import { logger } from '@/shared/lib/logger';

const STAMP = '#B42318';

export const refreshHiddenBadge = async (): Promise<void> => {
    const count = Object.keys(await loadHiddenItems()).length;
    await chrome.action.setBadgeBackgroundColor({ color: STAMP });
    await chrome.action.setBadgeText({ text: count > 0 ? (count > 99 ? '99+' : String(count)) : '' });
};

const refreshHiddenBadgeSafely = async (): Promise<void> => {
    try {
        await refreshHiddenBadge();
    } catch (error) {
        logger.error('[badge] refresh failed', error);
    }
};

chrome.storage.onChanged.addListener((changes, area) => {
    const syncedIndexChanged = area === 'sync' && Boolean(changes[HIDDEN_ITEMS_SYNC_MANIFEST_KEY]);
    const pendingIndexChanged = area === 'local' && Boolean(changes.pendingHiddenItemsIndex);
    if (syncedIndexChanged || pendingIndexChanged) void refreshHiddenBadgeSafely();
});

chrome.runtime.onInstalled.addListener(() => {
    void refreshHiddenBadgeSafely();
});

chrome.runtime.onStartup.addListener(() => {
    void refreshHiddenBadgeSafely();
});
