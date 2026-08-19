# eBay Enhance

Chrome extension that lets you hide eBay listings you do not want. Stamp an **X** on a search card or hide the item from its listing page. Hidden IDs persist locally and stay out of later result pages.

## Use

1. `pnpm install`
2. `pnpm build`
3. Chrome → `chrome://extensions` → Developer mode → Load unpacked → select `dist/`
4. Open an eBay search. Each real card gets an X on the photo.
5. Open an item page to hide or restore that listing.

Popup: hide mode (remove vs faded stamp), recent hidden items, restore. Options page: full list, search, restore all.

## Stack

TypeScript, Preact, Tailwind, RSBuild, Vitest. Manifest V3.
