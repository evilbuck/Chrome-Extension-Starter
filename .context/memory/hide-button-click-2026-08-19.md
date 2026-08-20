---
date: 2026-08-19
domains: [chrome-extension, ebay, content-script]
topics: [hide-button, listings, click-handler]
related: [ebay-hide-listings-2026-08-18.md]
priority: high
status: completed
subject: 2026-08-19.hide-button-click
artifacts:
  - ../../src/content/listings.ts
  - ../../__tests__/listings.test.ts
---

# Thumbnail X click did nothing

Search-card X was injected and hit-testable, but `handleListingClick` returned false.

Cause: `ensureHideButton` sets `button.dataset.eeItemId`, then the handler did `button.closest('[data-ee-item-id], …')`. `closest` includes the element itself, so the "card" was the button. `listingFromCard(button)` found no `/itm/` link and bailed before hide.

Live SRP 2026-08-19: real cards still `li.s-card[data-listingid]`; thumbnail is a carousel plus `su-media__action--top-right` watchheart. Button sits on top of the heart at `z-index: 30`.

Fix: resolve the card from `button.parentElement.closest(...)`, accept text-node click targets, stop the event as soon as the X is identified.
