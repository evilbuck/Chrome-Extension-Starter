---
date: 2026-08-18
domains: [chrome-extension, ebay, content-script]
topics: [hide-listings, item-page, chrome-storage]
related: [2026-08-18.ebay-hide-listings/plan-hide-listings.md]
priority: high
status: completed
subject: 2026-08-18.ebay-hide-listings
artifacts:
  - plan-hide-listings.md
---

# eBay Enhance hide listings

Starter template turned into an eBay-only MV3 extension.

Hidden item IDs live in `chrome.storage.local.hiddenItems`. Settings (`hideMode`, `showHideButtons`) live in sync storage.

Live DOM 2026-08-18: search cards are `li.s-card[data-listingid]` in `ul.srp-results`. Skip `/itm/123456`. Item page title is `h1.x-item-title__mainTitle`.

Verified: 110 unit tests, biome, tsc, `rsbuild` → `dist/`. Live SRP inject: 60 real cards got X buttons, click hid 1. Item page bar mounted and toggled to hidden.
