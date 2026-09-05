// Phase 4 background runtime: per-tab action policy + onInstalled hook.
// Migration machinery was removed in Phase 4 because the sync-backed
// Settings it migrated is gone.

import { RESTRICTED, type RestrictedScheme } from '@/shared/constants';
import { logger } from '@/shared/lib/logger';

/** Check if URL should disable popup/action */
const isRestrictedUrl = (raw?: string | null): boolean => {
    if (!raw) return true;
    const scheme = raw.split(':', 1)[0]?.toLowerCase();
    if (RESTRICTED.schemes.includes(scheme as RestrictedScheme)) return true;

    if (scheme === 'http' || scheme === 'https') {
        try {
            const u = new URL(raw);
            const normalized = `${u.protocol}//${u.host}${u.pathname}`;
            if (RESTRICTED.hosts.some((rx) => rx.test(normalized))) return true;
            return false;
        } catch {
            return true;
        }
    }
    return true;
};

/** Apply enable/disable + popup per tab */
const applyActionPolicy = async (tabId: number, url?: string | null): Promise<void> => {
    if (isRestrictedUrl(url)) {
        await chrome.action.disable(tabId);
    } else {
        await chrome.action.enable(tabId);
        await chrome.action.setPopup({ tabId, popup: 'popup.html' });
    }
};

chrome.runtime.onStartup.addListener(() => {
    logger.info('[background] Browser startup');
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    try {
        const tab = await chrome.tabs.get(tabId);
        await applyActionPolicy(tabId, tab.url);
    } catch (error: unknown) {
        if (error instanceof Error && error.message?.includes('No tab with id')) {
            logger.debug(`[runtime] Tab ${tabId} closed before activation handler completed`);
            return;
        }
        await applyActionPolicy(tabId, null);
    }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' || changeInfo.url) {
        await applyActionPolicy(tabId, changeInfo.url ?? tab.url);
    }
});

chrome.runtime.onInstalled.addListener(async (details) => {
    logger.info(`[background] Extension installed (reason: ${details.reason})`);
    const tabs = await chrome.tabs.query({});
    await Promise.allSettled(
        tabs.filter((t) => t.id != null).map((t) => applyActionPolicy(t.id as number, t.url))
    );
});