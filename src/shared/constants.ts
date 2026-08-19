export const FLAGS = {
    ENABLE_OVERLAY: true
} as const;

export const ALARMS = {
    POLL: 'poll',
    DAILY_CLEANUP: 'daily_cleanup'
} as const;

export enum MSG {
    HIDDEN_CHANGED = 'HIDDEN_CHANGED'
}

export const MESSAGE_SPEC = {
    [MSG.HIDDEN_CHANGED]: {
        req: {} as { count: number },
        res: {} as { ok: boolean }
    }
} as const;

export const RESTRICTED = {
    schemes: ['chrome', 'chrome-extension', 'chrome-untrusted', 'devtools', 'edge', 'about'],
    hosts: [
        /^(?:https?:\/\/)?chrome\.google\.com\/webstore\/?/i,
        /^(?:https?:\/\/)?microsoftedge\.microsoft\.com\/addons\/?/i
    ]
} as const;

export type RestrictedScheme = (typeof RESTRICTED.schemes)[number];

export const EBAY_MATCHES = [
    '*://*.ebay.com/*',
    '*://ebay.com/*',
    '*://*.ebay.co.uk/*',
    '*://ebay.co.uk/*',
    '*://*.ebay.com.au/*',
    '*://ebay.com.au/*',
    '*://*.ebay.ca/*',
    '*://ebay.ca/*',
    '*://*.ebay.de/*',
    '*://ebay.de/*',
    '*://*.ebay.fr/*',
    '*://ebay.fr/*',
    '*://*.ebay.it/*',
    '*://ebay.it/*',
    '*://*.ebay.es/*',
    '*://ebay.es/*',
    '*://*.ebay.nl/*',
    '*://ebay.nl/*',
    '*://*.ebay.be/*',
    '*://ebay.be/*',
    '*://*.ebay.at/*',
    '*://ebay.at/*',
    '*://*.ebay.ch/*',
    '*://ebay.ch/*',
    '*://*.ebay.ie/*',
    '*://ebay.ie/*',
    '*://*.ebay.pl/*',
    '*://ebay.pl/*',
    '*://*.ebay.com.sg/*',
    '*://ebay.com.sg/*',
    '*://*.ebay.com.hk/*',
    '*://ebay.com.hk/*',
    '*://*.ebay.com.my/*',
    '*://ebay.com.my/*',
    '*://*.ebay.ph/*',
    '*://ebay.ph/*',
    '*://*.ebay.in/*',
    '*://ebay.in/*'
];
