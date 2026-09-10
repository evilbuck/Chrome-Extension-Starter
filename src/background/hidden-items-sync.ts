import { ALARMS } from '@/shared/constants';
import { flushPendingHiddenIndex } from '@/shared/hidden-items';
import { logger } from '@/shared/lib/logger';

export const SYNC_FLUSH_MS = 1000;
export const SYNC_FALLBACK_MS = 30_000;

// Fast-path coalescing only. The local pending snapshot and named alarm are
// durable, so losing this timer with the service worker cannot lose work.
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const ensureFallbackAlarm = async (): Promise<void> => {
    const existing = await chrome.alarms.get(ALARMS.HIDDEN_ITEMS_SYNC);
    if (existing) return;
    await chrome.alarms.create(ALARMS.HIDDEN_ITEMS_SYNC, {
        when: Date.now() + SYNC_FALLBACK_MS
    });
};

const ensureFallbackAlarmSafely = async (): Promise<void> => {
    try {
        await ensureFallbackAlarm();
    } catch (error) {
        logger.error('[hidden-items-sync] fallback alarm failed', error);
    }
};

const flushPendingSafely = async (source: 'timer' | 'alarm' | 'recovery'): Promise<void> => {
    try {
        const hasMore = await flushPendingHiddenIndex();
        if (hasMore) {
            scheduleHiddenIndexFlush();
            return;
        }
        // Leave the one-shot fallback armed. Clearing it races a new pending
        // snapshot; Chrome removes the later no-op alarm after it fires.
    } catch (error) {
        logger.error(`[hidden-items-sync] ${source} flush failed`, error);
        await ensureFallbackAlarmSafely();
    }
};

export const scheduleHiddenIndexFlush = (): void => {
    if (flushTimer !== null) return;
    void ensureFallbackAlarmSafely();
    flushTimer = setTimeout(() => {
        flushTimer = null;
        void flushPendingSafely('timer');
    }, SYNC_FLUSH_MS);
};

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.pendingHiddenItemsIndex?.newValue !== undefined) {
        scheduleHiddenIndexFlush();
    }
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARMS.HIDDEN_ITEMS_SYNC) void flushPendingSafely('alarm');
});

// Module evaluation runs on every service-worker start, unlike
// runtime.onStartup, which only fires when the browser profile starts.
void flushPendingSafely('recovery');
