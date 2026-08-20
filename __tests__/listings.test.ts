import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    applyCardState,
    handleListingClick,
    type ListingSurfaceState,
    startListingOverlay,
    syncListingSurface
} from '@/content/listings';
import { hideItem, unhideItem } from '@/shared/hidden-items';

vi.mock('@/shared/hidden-items', () => ({
    hideItem: vi.fn(async (item: { id: string }) => item),
    unhideItem: vi.fn(async () => undefined)
}));

const cardHtml = `
<div id="srp-river-results">
    <ul class="srp-results srp-list">
        <li class="s-card s-card--horizontal" data-listingid="168624081916">
            <div class="su-card-container__media"></div>
            <a class="s-card__link" href="https://www.ebay.com/itm/168624081916">Keychron K2</a>
        </li>
        <li class="s-card s-card--horizontal" data-listingid="800459263916">
            <div class="su-card-container__media"></div>
            <a class="s-card__link" href="https://www.ebay.com/itm/800459263916">Logitech G Pro</a>
        </li>
    </ul>
</div>
`;

const baseState = (): ListingSurfaceState => ({
    hidden: {
        '168624081916': {
            id: '168624081916',
            title: 'Keychron K2',
            url: 'https://www.ebay.com/itm/168624081916',
            thumbnail: '',
            hiddenAt: 1
        }
    },
    settings: { hideMode: 'remove', showHideButtons: true },
    revealRemoved: false
});

const emptyState = (): ListingSurfaceState => ({
    hidden: {},
    settings: { hideMode: 'remove', showHideButtons: true },
    revealRemoved: false
});

const clickHideButton = async (state: ListingSurfaceState, selector = '.ee-hide-btn') => {
    const button = document.querySelector<HTMLButtonElement>(selector);
    if (!button) throw new Error('missing hide button');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    button.dispatchEvent(event);
    return handleListingClick(event, state);
};

describe('listing surface', () => {
    it('injects hide buttons and removes hidden cards', () => {
        document.body.innerHTML = cardHtml;
        const result = syncListingSurface(document, baseState());

        expect(result.cards).toBe(2);
        expect(result.hiddenOnPage).toBe(1);
        expect(document.querySelectorAll('.ee-hide-btn')).toHaveLength(2);
        expect(document.querySelector('[data-listingid="168624081916"]')?.classList.contains('ee-is-removed')).toBe(
            true
        );
        expect(document.querySelector('[data-listingid="800459263916"]')?.classList.contains('ee-is-removed')).toBe(
            false
        );
        expect(document.getElementById('ee-hidden-banner')?.hidden).toBe(false);
    });

    it('dims hidden cards instead of removing them', () => {
        document.body.innerHTML = cardHtml;
        const state = baseState();
        state.settings.hideMode = 'dim';
        syncListingSurface(document, state);

        const hiddenCard = document.querySelector('[data-listingid="168624081916"]');
        expect(hiddenCard?.classList.contains('ee-is-dimmed')).toBe(true);
        expect(hiddenCard?.classList.contains('ee-is-removed')).toBe(false);
        expect(document.getElementById('ee-hidden-banner')?.hidden).toBe(true);
    });

    it('updates button pressed state', () => {
        document.body.innerHTML = cardHtml;
        const card = document.querySelector<HTMLElement>('[data-listingid="168624081916"]');
        if (!card) throw new Error('missing card');
        syncListingSurface(document, baseState());
        applyCardState(card, true, 'dim', false);
        expect(card.querySelector('.ee-hide-btn')?.getAttribute('aria-pressed')).toBe('true');
    });

    it('hides a listing when the thumbnail X is clicked', async () => {
        document.body.innerHTML = cardHtml;
        const state: ListingSurfaceState = {
            hidden: {},
            settings: { hideMode: 'remove', showHideButtons: true },
            revealRemoved: false
        };
        syncListingSurface(document, state);

        const button = document.querySelector<HTMLButtonElement>('[data-listingid="800459263916"] .ee-hide-btn');
        if (!button) throw new Error('missing hide button');

        const event = new MouseEvent('click', { bubbles: true, cancelable: true });
        button.dispatchEvent(event);
        const handled = await handleListingClick(event, state);

        expect(handled).toBe(true);
        expect(event.defaultPrevented).toBe(true);
        expect(state.hidden['800459263916']?.id).toBe('800459263916');
        expect(document.querySelector('[data-listingid="800459263916"]')?.classList.contains('ee-is-removed')).toBe(
            true
        );
    });

    it('hides when the click target is the X text node', async () => {
        document.body.innerHTML = cardHtml;
        const state: ListingSurfaceState = {
            hidden: {},
            settings: { hideMode: 'remove', showHideButtons: true },
            revealRemoved: false
        };
        syncListingSurface(document, state);

        const button = document.querySelector<HTMLButtonElement>('[data-listingid="800459263916"] .ee-hide-btn');
        const glyph = button?.firstChild;
        if (!button || !glyph) throw new Error('missing hide button glyph');

        const event = new MouseEvent('click', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'target', { value: glyph });
        const handled = await handleListingClick(event, state);

        expect(handled).toBe(true);
        expect(state.hidden['800459263916']?.id).toBe('800459263916');
    });

    it('hides from a live carousel thumbnail X', async () => {
        document.body.innerHTML = `
            <div id="srp-river-results">
                <ul class="srp-results">
                    <li class="s-card s-card--horizontal" data-listingid="188813240456">
                        <div class="su-card-container__media">
                            <div class="su-media-carousel">
                                <ul class="carousel__list">
                                    <li class="carousel__snap-point su-media-carousel__item">
                                        <a class="s-card__link image-treatment" href="https://www.ebay.com/itm/188813240456">
                                            <img class="s-card__image" src="https://i.ebayimg.com/images/g/example/s-l500.webp" alt="" />
                                        </a>
                                    </li>
                                </ul>
                            </div>
                            <div class="su-media__action su-media__action--top-right">
                                <a class="s-card__watchheart-click" href="https://www.ebay.com/myb/WatchListAdd?item=188813240456">Watch</a>
                            </div>
                        </div>
                        <a class="s-card__link" href="https://www.ebay.com/itm/188813240456">Keychron K2 HE</a>
                    </li>
                </ul>
            </div>
        `;
        const state: ListingSurfaceState = {
            hidden: {},
            settings: { hideMode: 'remove', showHideButtons: true },
            revealRemoved: false
        };
        syncListingSurface(document, state);

        const button = document.querySelector<HTMLButtonElement>('.ee-hide-btn');
        if (!button) throw new Error('missing hide button');
        const event = new MouseEvent('click', { bubbles: true, cancelable: true });
        button.dispatchEvent(event);
        expect(await handleListingClick(event, state)).toBe(true);
        expect(document.querySelector('[data-listingid="188813240456"]')?.classList.contains('ee-is-removed')).toBe(
            true
        );
    });

    it('unhides a dimmed listing when the X is clicked again', async () => {
        document.body.innerHTML = cardHtml;
        const state = baseState();
        state.settings.hideMode = 'dim';
        syncListingSurface(document, state);

        expect(await clickHideButton(state, '[data-listingid="168624081916"] .ee-hide-btn')).toBe(true);
        expect(state.hidden['168624081916']).toBeUndefined();
        expect(document.querySelector('[data-listingid="168624081916"]')?.classList.contains('ee-is-dimmed')).toBe(
            false
        );
        expect(unhideItem).toHaveBeenCalledWith('168624081916');
    });

    it('hides from the button item id when the card has no item link', async () => {
        document.body.innerHTML = '<button class="ee-hide-btn" data-ee-item-id="188813240456" type="button">×</button>';
        const state = emptyState();
        const event = new MouseEvent('click', { bubbles: true, cancelable: true });
        document.querySelector('.ee-hide-btn')?.dispatchEvent(event);

        expect(await handleListingClick(event, state)).toBe(true);
        expect(state.hidden['188813240456']?.url).toBe('https://www.ebay.com/itm/188813240456');
        expect(hideItem).toHaveBeenCalledWith(
            expect.objectContaining({ id: '188813240456', url: 'https://www.ebay.com/itm/188813240456' })
        );
    });

    it('ignores clicks that are not on a hide control', async () => {
        document.body.innerHTML = cardHtml;
        const state = emptyState();
        syncListingSurface(document, state);

        const stray = new MouseEvent('click', { bubbles: true, cancelable: true });
        document.querySelector('.s-card__link')?.dispatchEvent(stray);
        expect(await handleListingClick(stray, state)).toBe(false);

        const blank = new Event('click');
        Object.defineProperty(blank, 'target', { value: null });
        expect(await handleListingClick(blank, state)).toBe(false);
    });

    it('removes hide buttons when the setting is off', () => {
        document.body.innerHTML = cardHtml;
        const state = emptyState();
        syncListingSurface(document, state);
        expect(document.querySelectorAll('.ee-hide-btn')).toHaveLength(2);

        state.settings.showHideButtons = false;
        syncListingSurface(document, state);
        expect(document.querySelectorAll('.ee-hide-btn')).toHaveLength(0);
    });

    it('reveals removed cards from the results banner', () => {
        document.body.innerHTML = cardHtml;
        const root = document.getElementById('srp-river-results');
        if (!root) throw new Error('missing results root');
        const state = baseState();
        syncListingSurface(root, state);

        const hiddenCard = document.querySelector('[data-listingid="168624081916"]');
        expect(hiddenCard?.classList.contains('ee-is-removed')).toBe(true);

        document.querySelector<HTMLButtonElement>('#ee-hidden-banner button')?.click();
        expect(state.revealRemoved).toBe(true);
        expect(hiddenCard?.classList.contains('ee-is-removed')).toBe(false);
        expect(hiddenCard?.classList.contains('ee-is-dimmed')).toBe(true);
    });

    it('undoes a hide from the toast', async () => {
        vi.useFakeTimers();
        document.body.innerHTML = cardHtml;
        const state = emptyState();
        syncListingSurface(document, state);

        expect(await clickHideButton(state, '[data-listingid="800459263916"] .ee-hide-btn')).toBe(true);
        const toastButton = document.querySelector<HTMLButtonElement>('#ee-toast button');
        toastButton?.click();
        expect(unhideItem).toHaveBeenCalledWith('800459263916');
        expect(document.getElementById('ee-toast')).toBeNull();

        document.body.innerHTML = cardHtml;
        syncListingSurface(document, state);
        await clickHideButton(state, '[data-listingid="168624081916"] .ee-hide-btn');
        expect(document.getElementById('ee-toast')).not.toBeNull();
        vi.advanceTimersByTime(4000);
        expect(document.getElementById('ee-toast')).toBeNull();
        vi.useRealTimers();
    });

    it('wires document clicks and rescan after overlay start', async () => {
        vi.useFakeTimers();
        document.body.innerHTML = '<div id="srp-river-results"><ul class="srp-results"></ul></div>';
        const state = emptyState();
        const stop = startListingOverlay(state);

        document.querySelector('ul.srp-results')?.insertAdjacentHTML(
            'beforeend',
            `<li class="s-card" data-listingid="800459263916">
                <div class="su-card-container__media"></div>
                <a class="s-card__link" href="https://www.ebay.com/itm/800459263916">Logitech G Pro</a>
            </li>`
        );
        await vi.advanceTimersByTimeAsync(80);
        expect(document.querySelectorAll('.ee-hide-btn')).toHaveLength(1);

        document
            .querySelector('.ee-hide-btn')
            ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        await Promise.resolve();
        expect(state.hidden['800459263916']?.id).toBe('800459263916');

        stop();
        vi.useRealTimers();
    });
});

afterEach(() => {
    vi.useRealTimers();
});
