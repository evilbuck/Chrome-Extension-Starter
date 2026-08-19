import { loadHiddenItems } from '@/shared/hidden-items';
import { logger } from '@/shared/lib/logger';

const STAMP = '#B42318';

export const refreshHiddenBadge = async (): Promise<void> => {
    const count = Object.keys(await loadHiddenItems()).length;
    await chrome.action.setBadgeBackgroundColor({ color: STAMP });
    await chrome.action.setBadgeText({ text: count > 0 ? (count > 99 ? '99+' : String(count)) : '' });
};

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.hiddenItems) {
        void refreshHiddenBadge();
    }
});

chrome.runtime.onInstalled.addListener(() => {
    void refreshHiddenBadge().catch((error) => logger.error('[badge] refresh failed', error));
});

chrome.runtime.onStartup.addListener(() => {
    void refreshHiddenBadge().catch((error) => logger.error('[badge] refresh failed', error));
});
