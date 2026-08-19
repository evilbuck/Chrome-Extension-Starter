import { type Settings, settingsManager } from '@/shared/config';
import { FLAGS } from '@/shared/constants';
import { isEbayHost } from '@/shared/ebay';
import { loadHiddenItems, watchHiddenItems } from '@/shared/hidden-items';
import { kv } from '@/shared/lib/storage';
import { startItemPageOverlay } from './item-page';
import { startListingOverlay, syncListingSurface } from './listings';
import './overlay.css';

const boot = async (): Promise<void> => {
    if (!FLAGS.ENABLE_OVERLAY || !isEbayHost(location.hostname)) return;

    const state = {
        hidden: await loadHiddenItems(),
        settings: await settingsManager.load(),
        revealRemoved: false
    };

    startListingOverlay(state);
    const itemPage = startItemPageOverlay(() => state.hidden);

    watchHiddenItems((items) => {
        state.hidden = items;
        syncListingSurface(document, state);
        itemPage.refresh();
    });

    kv.watch('sync', 'settings', (current) => {
        if (!current || typeof current !== 'object') return;
        state.settings = current as Settings;
        syncListingSurface(document, state);
    });
};

void boot();
