---
status: completed
research: []
spec:
memory: []
---

# Plan: hide eBay listings

## Goal

Turn the starter template into **eBay Enhance**: persist a personal reject list of eBay item IDs so unwanted listings stay out of the way.

## UX

- Every real listing card gets a stamp-X on the image.
- Default mode `remove`: card disappears from results.
- Alternate mode `dim`: card stays, greyed, stamped Hidden, X undoes.
- After hide: undo toast.
- Results river: "N hidden · Show" banner when cards are removed.
- Item page: action bar under `h1.x-item-title__mainTitle`.
- Popup: count, mode, recent hidden, restore.
- Options: full list, search, clear all, settings.

## Data

- `chrome.storage.local.hiddenItems`: `Record<itemId, HiddenItem>`
- `chrome.storage.sync.settings`: `{ hideMode: 'remove' | 'dim', showHideButtons: boolean }`
- Item identity: `/itm/{9-16 digit id}` (skip `/itm/123456` placeholder)

## Live DOM (2026-08-18)

- Search: `li.s-card[data-listingid]` in `ul.srp-results`
- Media host for the X: `.su-card-container__media` (card is `position: relative`)
- Item page: `/itm/{id}`, title `h1.x-item-title__mainTitle`, og:image

## Non-goals

- Seller-level hide, keyword hide, export/import, marketplace sites other than eBay.
