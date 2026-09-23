import { RESTRICTED, type RestrictedScheme } from '@/shared/constants';

export type CookiePartitionKey = {
    topLevelSite?: string;
    hasCrossSiteAncestor?: boolean;
};

export type CookieIdentity = {
    name: string;
    domain: string;
    path: string;
    partitionKey?: CookiePartitionKey;
    storeId: string;
};

export type LocalStorageIdentity = {
    origin: string;
    key: string;
};

export const cookieIdentityKey = (id: CookieIdentity): string => {
    const partition = id.partitionKey === undefined ? '' : JSON.stringify(id.partitionKey);
    return [id.name, id.domain, id.path, partition, id.storeId].join('\0');
};

export const localStorageIdentityKey = (origin: string, key: string): string => `${origin}\0${key}`;

export const resourcePermission = (origin: string): chrome.permissions.Permissions => ({
    permissions: ['cookies', 'scripting'],
    origins: [`${origin}/*`]
});

const httpOrigin = (raw: string): string | null => {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return null;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const scheme = raw.split(':', 1)[0]?.toLowerCase();
    if (RESTRICTED.schemes.includes(scheme as RestrictedScheme)) return null;
    const normalized = `${url.protocol}//${url.host}${url.pathname}`;
    if (RESTRICTED.hosts.some((rx) => rx.test(normalized))) return null;
    return url.origin;
};

export const uniqueHttpOriginsFromTabs = (tabs: ReadonlyArray<{ url?: string; incognito?: boolean }>): string[] => {
    const seen = new Set<string>();
    const origins: string[] = [];
    for (const tab of tabs) {
        if (tab.incognito) continue;
        if (!tab.url) continue;
        const origin = httpOrigin(tab.url);
        if (!origin || seen.has(origin)) continue;
        seen.add(origin);
        origins.push(origin);
    }
    return origins;
};
