# Chrome Web Store image kit

This folder contains the finished Chrome Web Store graphics for eBay Enhance.

## Deliverables

| Asset | File | Notes |
|-------|------|-------|
| Store icon | `store-icon-128.png` | 128×128 PNG; the visible square occupies 96×96 px with transparent padding. |
| Small promo tile | `promo/small-promo-440x280.png` | Required 440×280 full-bleed tile. |
| Marquee promo tile | `promo/marquee-1400x560.png` | Optional 1400×560 full-bleed feature tile. |
| Popup overview | `screenshots/popup-overview-1280x800.png` | Real popup capture presented with concise feature callouts. |
| Hidden-list manager | `screenshots/manage-hidden-listings-1280x800.png` | Direct capture of the built options UI with representative local-only records. |
| Display controls | `screenshots/customize-hiding-1280x800.png` | Direct capture of the built options UI settings state. |

Chrome's image requirements are documented at <https://developer.chrome.com/docs/webstore/images>.

## Brand direction

The kit extends the product's existing visual language: stamp red `#B42318`, warm parchment `#F3ECDF`, cream `#FFFAF3`, near-black brown `#1C1612`, and a muted blue accent. The icon combines a marketplace listing card with the X stamp so its purpose is recognizable without text.

The extension icon is source-controlled as `public/icons/icon.svg`. The manifest PNGs at 16, 32, 48, and 128 px are rasterized from that vector so every referenced file is sharp at its declared size.

## Screenshot integrity

The screenshots use the locally built extension. The representative listing names and simple non-branded thumbnails were seeded into a throwaway Chromium profile solely to demonstrate populated product states. The promotional image model was not used to fabricate the popup or options interface.

## Promotional image prompts

Both promo illustrations were generated with the built-in image generation workflow, then center-cropped and resized to their exact store dimensions.

### Small promo tile

```text
Use case: ads-marketing
Asset type: Chrome Web Store small promotional tile
Primary request: Create a polished, brand-led illustration for a browser extension that helps online shoppers dismiss unwanted marketplace listings with one red X and keeps them out of future results. Show a simplified front-facing browser window containing a clean product-card grid; one unwanted card is visibly being stamped with a bold red X and gently fading/sliding away, while the remaining cards settle into a calm, orderly layout. Communicate instant decluttering and control at a glance.
Style/medium: premium flat editorial vector illustration with crisp geometric shapes, subtle paper texture, restrained depth, and strong commercial polish; not a screenshot and not photorealistic.
Composition/framing: horizontal 11:7 composition designed for a 440x280 tile; one dominant focal action, minimal detail, full bleed, clearly readable at half size, well-defined outer edges.
Color palette: saturated stamp red #B42318, warm parchment #F3ECDF, near-black brown #1C1612, cream #FFFAF3, with a small muted blue accent for balance.
Constraints: no text, no letters, no numbers, no logos, no eBay branding, no Chrome branding, no trademarks, no badges, no claims, no watermark. Keep product cards generic and abstract. Avoid white or light-gray-dominant empty space.
```

### Marquee promo tile

```text
Use case: ads-marketing
Asset type: Chrome Web Store marquee promotional image
Primary request: Create a premium ultra-wide brand illustration for a browser extension that helps online shoppers dismiss unwanted marketplace listings with a single red X and keeps those listings hidden. Depict a wide, simplified browser results grid flowing from busy clutter on the left into a calm curated set of product cards on the right; at the transition, one generic unwanted card is marked by a bold circular red X stamp and recedes/fades away. The story should read instantly as “clear unwanted listings and focus on what matters.”
Style/medium: sophisticated flat editorial vector illustration, crisp geometric shapes, subtle tactile paper texture, restrained shadows, confident commercial polish; not a screenshot and not photorealistic.
Composition/framing: panoramic 5:2 composition designed for 1400x560; strong central transition with balanced detail across the full width, uncluttered, full bleed, legible at half size, well-defined edges. Do not reserve empty copy space.
Color palette: saturated stamp red #B42318, warm parchment #F3ECDF, near-black brown #1C1612, cream #FFFAF3, and a small muted blue accent.
Constraints: no text, no letters, no numbers, no logos, no eBay branding, no Chrome branding, no trademarks, no badges, no claims, no watermark. Keep all product cards generic and abstract. Avoid white or light-gray-dominant empty space.
```
