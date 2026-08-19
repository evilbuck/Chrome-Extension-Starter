import type { Settings } from '@/shared/config';
import { collectListingCards, listingFromCard } from '@/shared/ebay';
import { hideItem, unhideItem } from '@/shared/hidden-items';
import type { HiddenItemsMap } from '@/shared/types';

const BTN_CLASS = 'ee-hide-btn';
const BANNER_ID = 'ee-hidden-banner';
const TOAST_ID = 'ee-toast';

export interface ListingSurfaceState {
    hidden: HiddenItemsMap;
    settings: Settings;
    revealRemoved: boolean;
}

const label = (key: string, fallback: string, substitutions?: string | string[]): string => {
    try {
        const value = chrome.i18n.getMessage(key, substitutions);
        return value || fallback;
    } catch {
        return fallback;
    }
};

const resolveButtonHost = (card: HTMLElement): HTMLElement => {
    const media = card.querySelector<HTMLElement>(
        '.su-card-container__media, .s-card__media-wrapper, .s-item__image-wrapper, .s-item__image'
    );
    const host = media ?? card;
    host.classList.add('ee-card-anchor');
    return host;
};

export const applyCardState = (
    card: HTMLElement,
    hidden: boolean,
    mode: Settings['hideMode'],
    revealRemoved: boolean
): void => {
    const remove = hidden && mode === 'remove' && !revealRemoved;
    card.classList.toggle('ee-is-removed', remove);
    card.classList.toggle('ee-is-dimmed', hidden && (mode === 'dim' || revealRemoved));
    const button = card.querySelector<HTMLButtonElement>(`.${BTN_CLASS}`);
    if (!button) return;
    button.dataset.hidden = hidden ? 'true' : 'false';
    button.setAttribute('aria-pressed', hidden ? 'true' : 'false');
    button.setAttribute(
        'aria-label',
        hidden ? label('unhideListing', 'Show this listing') : label('hideListing', 'Hide this listing')
    );
    button.title = button.getAttribute('aria-label') ?? '';
    button.textContent = '×';
};

const ensureHideButton = (card: HTMLElement, itemId: string, showButtons: boolean): void => {
    const existing = card.querySelector<HTMLButtonElement>(`.${BTN_CLASS}`);
    if (!showButtons) {
        existing?.remove();
        return;
    }
    if (existing) {
        existing.dataset.eeItemId = itemId;
        return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = BTN_CLASS;
    button.dataset.eeItemId = itemId;
    button.textContent = '×';
    resolveButtonHost(card).appendChild(button);
};

const countHiddenOnPage = (root: ParentNode, hidden: HiddenItemsMap): number => {
    let count = 0;
    for (const card of collectListingCards(root)) {
        const listing = listingFromCard(card);
        if (listing && hidden[listing.id]) count += 1;
    }
    return count;
};

export const syncResultsBanner = (root: ParentNode, state: ListingSurfaceState): void => {
    const mount =
        (root instanceof Document ? root : root.ownerDocument)?.getElementById('srp-river-results') ??
        (root instanceof Element
            ? root.querySelector('#srp-river-results, ul.srp-results')
            : document.querySelector('#srp-river-results, ul.srp-results'));

    if (!(mount instanceof HTMLElement)) return;

    let banner = document.getElementById(BANNER_ID);
    if (!banner) {
        banner = document.createElement('div');
        banner.id = BANNER_ID;
        banner.className = 'ee-hidden-banner';
        banner.innerHTML = '<span data-ee-copy></span><button type="button" data-ee-reveal></button>';
        mount.prepend(banner);
        banner.querySelector('button')?.addEventListener('click', () => {
            state.revealRemoved = !state.revealRemoved;
            syncListingSurface(document, state);
        });
    }

    const hiddenCount = countHiddenOnPage(document, state.hidden);
    const show = hiddenCount > 0 && state.settings.hideMode === 'remove';
    banner.hidden = !show;
    const copy = banner.querySelector('[data-ee-copy]');
    const action = banner.querySelector('[data-ee-reveal]');
    if (copy) {
        copy.textContent = label('hiddenCount', `${hiddenCount} hidden`, String(hiddenCount));
    }
    if (action) {
        action.textContent = state.revealRemoved
            ? label('hideAgain', 'Hide them again')
            : label('showHidden', 'Show hidden listings');
    }
};

export const syncListingSurface = (
    root: ParentNode,
    state: ListingSurfaceState
): { cards: number; hiddenOnPage: number } => {
    const cards = collectListingCards(root);
    let hiddenOnPage = 0;

    for (const card of cards) {
        const listing = listingFromCard(card);
        if (!listing) continue;
        card.dataset.eeItemId = listing.id;
        const hidden = Boolean(state.hidden[listing.id]);
        if (hidden) hiddenOnPage += 1;
        ensureHideButton(card, listing.id, state.settings.showHideButtons);
        applyCardState(card, hidden, state.settings.hideMode, state.revealRemoved);
    }

    syncResultsBanner(root, state);
    return { cards: cards.length, hiddenOnPage };
};

const showUndoToast = (onUndo: () => void): void => {
    document.getElementById(TOAST_ID)?.remove();
    const toast = document.createElement('div');
    toast.id = TOAST_ID;
    toast.className = 'ee-toast';
    toast.innerHTML = `<span>${label('itemHiddenToast', 'Hidden from your listings')}</span><button type="button">${label('undo', 'Undo')}</button>`;
    const hide = () => toast.remove();
    toast.querySelector('button')?.addEventListener('click', () => {
        onUndo();
        hide();
    });
    document.body.appendChild(toast);
    window.setTimeout(() => {
        if (toast.isConnected) hide();
    }, 4000);
};

export const handleListingClick = async (event: Event, state: ListingSurfaceState): Promise<boolean> => {
    const target = event.target;
    if (!(target instanceof Element)) return false;
    const button = target.closest<HTMLButtonElement>(`.${BTN_CLASS}`);
    if (!button) return false;

    const card = button.closest<HTMLElement>('[data-ee-item-id], li.s-card, li.s-item, [data-listingid]');
    const listing = card ? listingFromCard(card) : null;
    if (!listing) return false;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (state.hidden[listing.id]) {
        delete state.hidden[listing.id];
        syncListingSurface(document, state);
        await unhideItem(listing.id);
        return true;
    }

    state.hidden[listing.id] = { ...listing, hiddenAt: Date.now() };
    syncListingSurface(document, state);
    await hideItem(listing);
    showUndoToast(() => {
        void unhideItem(listing.id);
    });
    return true;
};

export const startListingOverlay = (state: ListingSurfaceState): (() => void) => {
    let scanTimer = 0;
    const scheduleScan = () => {
        window.clearTimeout(scanTimer);
        scanTimer = window.setTimeout(() => {
            syncListingSurface(document, state);
        }, 80);
    };

    const onClick = (event: Event) => {
        void handleListingClick(event, state);
    };

    const observer = new MutationObserver((mutations) => {
        const relevant = mutations.some((mutation) =>
            [...mutation.addedNodes].some((node) => {
                if (!(node instanceof Element)) return false;
                if (node.id === BANNER_ID || node.id === TOAST_ID || node.classList.contains(BTN_CLASS)) return false;
                return Boolean(
                    node.matches?.('li.s-card, li.s-item, [data-listingid], ul.srp-results') ||
                        node.querySelector?.('li.s-card, li.s-item, [data-listingid]')
                );
            })
        );
        if (relevant) scheduleScan();
    });

    document.addEventListener('click', onClick, true);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    syncListingSurface(document, state);

    return () => {
        document.removeEventListener('click', onClick, true);
        observer.disconnect();
        window.clearTimeout(scanTimer);
    };
};
