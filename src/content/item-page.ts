import { extractItemPageMeta, isItemPage } from '@/shared/ebay';
import { hideItem, unhideItem } from '@/shared/hidden-items';
import type { HiddenItemsMap } from '@/shared/types';

const BAR_ID = 'ee-item-bar';

const label = (key: string, fallback: string): string => {
    try {
        return chrome.i18n.getMessage(key) || fallback;
    } catch {
        return fallback;
    }
};

export const syncItemPageBar = (doc: Document, href: string, hidden: HiddenItemsMap): HTMLElement | null => {
    document.getElementById(BAR_ID)?.remove();
    if (!isItemPage(href)) return null;

    const listing = extractItemPageMeta(doc, href);
    if (!listing) return null;

    const title = doc.querySelector('.x-item-title') ?? doc.querySelector('h1.x-item-title__mainTitle')?.parentElement;
    if (!title) return null;

    const isHidden = Boolean(hidden[listing.id]);
    const bar = doc.createElement('div');
    bar.id = BAR_ID;
    bar.className = 'ee-item-bar';
    bar.dataset.hidden = isHidden ? 'true' : 'false';
    bar.dataset.eeItemId = listing.id;

    const status = doc.createElement('span');
    status.textContent = isHidden
        ? label('itemPageHidden', 'You hid this listing.')
        : label('itemPageVisible', 'Not interested? Hide it from future search results.');

    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = isHidden
        ? label('unhideListing', 'Show this listing')
        : label('hideListing', 'Hide this listing');
    button.addEventListener('click', () => {
        if (isHidden) {
            void unhideItem(listing.id);
            return;
        }
        void hideItem(listing);
    });

    bar.append(status, button);
    title.insertAdjacentElement('afterend', bar);
    return bar;
};

export const startItemPageOverlay = (getHidden: () => HiddenItemsMap): { stop: () => void; refresh: () => void } => {
    let lastHref = '';

    const render = (force = false) => {
        const href = location.href;
        if (!force && href === lastHref && document.getElementById(BAR_ID)) return;
        lastHref = href;
        syncItemPageBar(document, href, getHidden());
    };

    const observer = new MutationObserver(() => {
        if (
            isItemPage(location.href) &&
            !document.getElementById(BAR_ID) &&
            document.querySelector('.x-item-title, h1')
        ) {
            lastHref = '';
            render();
        }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
    render();

    const timer = window.setInterval(() => {
        if (location.href !== lastHref) {
            lastHref = '';
            render();
        }
    }, 800);

    return {
        refresh: () => render(true),
        stop: () => {
            observer.disconnect();
            window.clearInterval(timer);
            document.getElementById(BAR_ID)?.remove();
        }
    };
};
