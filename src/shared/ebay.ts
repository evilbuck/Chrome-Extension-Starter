export interface ListingRef {
    id: string;
    title: string;
    url: string;
    thumbnail: string;
}

const ITEM_ID = /(\d{9,16})/;
const ITEM_PATH = /\/itm\/(?:[^/?#]+\/)?(\d{9,16})(?:[/?#]|$)/i;
const CARD_SELECTOR = 'li.s-card[data-listingid], li.s-item, [data-listingid]';
const CARD_CLOSEST = 'li.s-card, li.s-item, [data-listingid]';

export const isEbayHost = (hostname: string): boolean => {
    const host = hostname.toLowerCase();
    return host === 'ebay.com' || host.endsWith('.ebay.com') || /(^|\.)ebay\.[a-z.]+$/.test(host);
};

export const extractItemId = (input: string): string | null => {
    const trimmed = input.trim();
    if (!trimmed) return null;

    try {
        const url =
            trimmed.includes('://') || trimmed.startsWith('/') ? new URL(trimmed, 'https://www.ebay.com') : null;
        if (url) {
            const fromPath = url.pathname.match(ITEM_PATH);
            if (fromPath?.[1]) return fromPath[1];
            const fromQuery = url.searchParams.get('item');
            if (fromQuery && ITEM_ID.test(fromQuery) && fromQuery.length >= 9 && fromQuery.length <= 16) {
                return fromQuery;
            }
        }
    } catch {
        // Fall through to raw matching.
    }

    const fromText = trimmed.match(ITEM_PATH);
    if (fromText?.[1]) return fromText[1];
    if (/^\d{9,16}$/.test(trimmed)) return trimmed;
    return null;
};

export const canonicalItemUrl = (href: string, id: string): string => {
    try {
        const url = new URL(href, 'https://www.ebay.com');
        return `${url.origin}/itm/${id}`;
    } catch {
        return `https://www.ebay.com/itm/${id}`;
    }
};

export const isItemPage = (href: string = typeof location === 'undefined' ? '' : location.href): boolean => {
    try {
        const url = new URL(href, 'https://www.ebay.com');
        return /\/itm\//i.test(url.pathname) && extractItemId(`${url.pathname}${url.search}`) !== null;
    } catch {
        return false;
    }
};

export const normalizeTitle = (raw: string): string =>
    raw
        .replace(/\s*Opens in a new window or tab\s*/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

export const findRealItemHref = (root: Element): string | null => {
    for (const anchor of root.querySelectorAll<HTMLAnchorElement>('a[href*="/itm/"]')) {
        if (extractItemId(anchor.href)) return anchor.href;
    }
    return null;
};

export const listingFromCard = (card: Element): ListingRef | null => {
    const href = findRealItemHref(card);
    if (!href) return null;
    const id = extractItemId(href);
    if (!id) return null;

    const titleLink = [...card.querySelectorAll<HTMLAnchorElement>('a[href*="/itm/"]')].find((anchor) => {
        const text = normalizeTitle(anchor.textContent ?? '');
        return text.length > 0 && !anchor.classList.contains('image-treatment');
    });
    const title = normalizeTitle(titleLink?.textContent ?? '');
    const image = card.querySelector<HTMLImageElement>('img.s-card__image, img.s-item__image, img');
    const thumbnail = image?.currentSrc || image?.src || image?.getAttribute('data-src') || '';

    return {
        id,
        title,
        url: canonicalItemUrl(href, id),
        thumbnail
    };
};

export const closestListingCard = (el: Element | null): HTMLElement | null =>
    el?.closest<HTMLElement>(CARD_CLOSEST) ?? null;

export const collectListingCards = (root: ParentNode = document): HTMLElement[] => {
    const found = new Set<HTMLElement>();

    if (root instanceof Element) {
        const self = closestListingCard(root);
        if (self && listingFromCard(self)) found.add(self);
    }

    for (const el of root.querySelectorAll<HTMLElement>(CARD_SELECTOR)) {
        if (listingFromCard(el)) found.add(el);
    }

    return [...found];
};

export const extractItemPageMeta = (
    doc: Document = document,
    href: string = typeof location === 'undefined' ? '' : location.href
): ListingRef | null => {
    const id = extractItemId(href);
    if (!id) return null;

    const heading =
        doc.querySelector('h1.x-item-title__mainTitle') ??
        doc.querySelector('.x-item-title h1') ??
        doc.querySelector('h1');
    const title = normalizeTitle(heading?.textContent ?? '');
    const thumbnail = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? '';

    return {
        id,
        title,
        url: canonicalItemUrl(href, id),
        thumbnail
    };
};
