import { describe, expect, it } from 'vitest';
import { applyCardState, type ListingSurfaceState, syncListingSurface } from '@/content/listings';

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
});
