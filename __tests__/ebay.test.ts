import { describe, expect, it } from 'vitest';
import {
    canonicalItemUrl,
    collectListingCards,
    extractItemId,
    extractItemPageMeta,
    isEbayHost,
    isItemPage,
    listingFromCard,
    normalizeTitle
} from '@/shared/ebay';

const listingCard = (id: string, title: string, href: string, listingId = id) => `
<li class="s-card s-card--horizontal" data-listingid="${listingId}" id="item${id}">
    <div class="su-card-container__media">
        <img class="s-card__image" src="https://i.ebayimg.com/images/g/example/s-l500.webp" alt="" />
    </div>
    <a class="s-card__link" href="${href}">${title}</a>
</li>`;

describe('extractItemId', () => {
    it('reads a bare /itm/{id} path', () => {
        expect(extractItemId('https://www.ebay.com/itm/168624081916')).toBe('168624081916');
    });

    it('reads a slug + id path', () => {
        expect(extractItemId('https://www.ebay.com/itm/Customized-Keychron/168624081916')).toBe('168624081916');
    });

    it('reads an id from query string', () => {
        expect(extractItemId('https://www.ebay.com/itm/?item=398204502459')).toBe('398204502459');
    });

    it('accepts a raw 9-16 digit id', () => {
        expect(extractItemId('800459263916')).toBe('800459263916');
    });

    it('ignores the Shop on eBay placeholder', () => {
        expect(extractItemId('https://ebay.com/itm/123456?hash=item123546')).toBeNull();
    });

    it('rejects short or empty values', () => {
        expect(extractItemId('')).toBeNull();
        expect(extractItemId('12345678')).toBeNull();
        expect(extractItemId('https://www.ebay.com/sch/i.html?_nkw=keyboard')).toBeNull();
    });
});

describe('page and host helpers', () => {
    it('recognizes eBay hosts', () => {
        expect(isEbayHost('www.ebay.com')).toBe(true);
        expect(isEbayHost('ebay.co.uk')).toBe(true);
        expect(isEbayHost('signin.ebay.com')).toBe(true);
        expect(isEbayHost('www.google.com')).toBe(false);
    });

    it('detects item pages', () => {
        expect(isItemPage('https://www.ebay.com/itm/168624081916')).toBe(true);
        expect(isItemPage('https://www.ebay.com/sch/i.html?_nkw=keyboard')).toBe(false);
        expect(isItemPage('https://ebay.com/itm/123456')).toBe(false);
    });

    it('builds a canonical item url from the current host', () => {
        expect(canonicalItemUrl('https://www.ebay.co.uk/itm/168624081916?hash=abc', '168624081916')).toBe(
            'https://www.ebay.co.uk/itm/168624081916'
        );
    });

    it('strips the new-tab suffix from titles', () => {
        expect(normalizeTitle('Keychron K2 Opens in a new window or tab')).toBe('Keychron K2');
    });
});

describe('listing cards', () => {
    it('skips the placeholder card and reads a real listing', () => {
        document.body.innerHTML = `
            <ul class="srp-results srp-list">
                ${listingCard('2500219655424533', 'Shop on eBay', 'https://ebay.com/itm/123456')}
                ${listingCard('168624081916', 'Customized Keychron K2 Opens in a new window or tab', 'https://www.ebay.com/itm/168624081916?hash=abc')}
            </ul>
        `;

        const cards = collectListingCards(document);
        expect(cards).toHaveLength(1);

        const listing = listingFromCard(cards[0]);
        expect(listing).toEqual({
            id: '168624081916',
            title: 'Customized Keychron K2',
            url: 'https://www.ebay.com/itm/168624081916',
            thumbnail: 'https://i.ebayimg.com/images/g/example/s-l500.webp'
        });
    });

    it('does not treat carousel slides as cards', () => {
        document.body.innerHTML = `
            <li class="carousel__snap-point su-media-carousel__item">
                <a class="s-card__link image-treatment" href="https://www.ebay.com/itm/168624081916">
                    <img src="https://i.ebayimg.com/images/g/example/s-l500.webp" />
                </a>
            </li>
        `;

        expect(collectListingCards(document)).toHaveLength(0);
    });
});

describe('extractItemPageMeta', () => {
    it('reads the live item-page title and image', () => {
        document.head.innerHTML = '<meta property="og:image" content="https://i.ebayimg.com/images/g/x/s-l400.jpg" />';
        document.body.innerHTML = `
            <div class="vim x-item-title">
                <h1 class="x-item-title__mainTitle">Customized Keychron K2 Mechanical Keyboard</h1>
            </div>
        `;

        expect(extractItemPageMeta(document, 'https://www.ebay.com/itm/168624081916')).toEqual({
            id: '168624081916',
            title: 'Customized Keychron K2 Mechanical Keyboard',
            url: 'https://www.ebay.com/itm/168624081916',
            thumbnail: 'https://i.ebayimg.com/images/g/x/s-l400.jpg'
        });
    });
});
