# Chrome Web Store Listing — eBay Enhance

> Last Updated: 2026-09-07

## Store Listing

**Extension Name** [REQUIRED]

eBay Enhance

**Short Description** [REQUIRED]

Hide unwanted eBay listings from search results and restore them whenever you change your mind.

**Detailed Description** [REQUIRED]

Declutter eBay search results by hiding listings you do not want to see again.

FEATURES
• Stamp an X on any search result to hide it
• Remove hidden listings completely or leave them faded for reference
• Hide an item directly from its listing page
• Review, search, and restore hidden listings from one place
• See your hidden-listing count from the toolbar

HOW TO USE
1. Open an eBay search or item page.
2. Select the X on a listing you do not want.
3. Use the extension popup to review recent hides, or open Manage all to search and restore the full list.

PRIVACY
Hidden listing details stay in local browser storage. Display preferences can sync through Chrome. The extension has no analytics, advertising, or developer-operated data service.

INDEPENDENT PRODUCT
eBay Enhance is an independent browser extension and is not affiliated with, endorsed by, or sponsored by eBay Inc.

**Category** [REQUIRED]

Shopping

**Single Purpose** [REQUIRED]

Hides unwanted eBay listings from search results until the user restores them.

**Primary Language** [REQUIRED]

English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------:|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `store-assets/store-icon-128.png` |
| Screenshot 1 [REQUIRED] | 1280×800 | ✅ Ready | `store-assets/screenshots/popup-overview-1280x800.png` |
| Screenshot 2 [RECOMMENDED] | 1280×800 | ✅ Ready | `store-assets/screenshots/manage-hidden-listings-1280x800.png` |
| Screenshot 3 [RECOMMENDED] | 1280×800 | ✅ Ready | `store-assets/screenshots/customize-hiding-1280x800.png` |
| Screenshot 4 | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 5 | 1280×800 or 640×400 | ⬜ Not created | |
| Small Promo Tile [REQUIRED] | 440×280 | ✅ Ready | `store-assets/promo/small-promo-440x280.png` |
| Marquee Promo Tile | 1400×560 | ✅ Ready | `store-assets/promo/marquee-1400x560.png` |

### Screenshot Notes

- Screenshot 1 presents the real popup UI inside a full-bleed listing graphic and communicates the hide, fade, and restore workflow.
- Screenshot 2 shows the real hidden-list management screen with representative, non-branded sample records.
- Screenshot 3 shows the real controls for removing versus fading listings and showing the X control.
- Screenshots were captured from the locally built extension. Representative records were stored only in a throwaway browser profile; image generation was not used to invent product UI.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Saves hidden listing IDs, titles, links, and thumbnails locally so they stay hidden and can be restored. Saves the user's two display preferences through Chrome sync. |
| `tabs` | permissions | Reads tab URLs so the toolbar action can be enabled on supported web pages and the popup can tell the user whether an eBay page is active. It also refreshes supported open tabs after extension updates. |
| `alarms` | permissions | Restores scheduled extension housekeeping after Chrome restarts and clears temporary session values each day. |
| Supported eBay marketplace domains | host_permissions | Adds the user-invoked hide or restore controls to eBay search results and item pages across the regional eBay sites declared in the manifest. No other sites are accessed. |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

The extension does not transmit browsing activity or listing data to the developer or to third-party services. Hidden listing IDs, titles, URLs, and thumbnail URLs are stored locally in Chrome. The two display preferences are stored with Chrome sync when the browser provides it.

### Data Use Certification

- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** [REQUIRED]

[TODO: publish a public privacy policy and add its URL before submission]

## Distribution

**Visibility**: Public

**Regions**: All regions supported by the manifest

## Developer Info

**Publisher Name** [REQUIRED]

[TODO]

**Contact Email** [REQUIRED]

[TODO]

**Support URL / Email** [RECOMMENDED]

[TODO]

**Homepage URL** [RECOMMENDED]

[TODO]

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.0.0 | 2026-09-07 | Prepared launch screenshots and promotional artwork; refined the store icon around the hide-listing action. | Draft |

## Review Notes

### Known Issues / Limitations

- The listing cannot be submitted until the privacy policy URL, publisher name, contact email, and support destination are completed.
- The `alarms` permission includes a frequent diagnostic poll that currently performs no user-visible work. Review whether it can be removed before submission to keep permissions minimal.

### Rejection History

None.
