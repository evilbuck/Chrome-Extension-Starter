import { RESOURCE_ERROR, type ResourceError } from '@/shared/constants';
import { resourcePermission, uniqueHttpOriginsFromTabs } from '@/shared/lib/resources';

export type ResourceCookieMetadata = {
    name: string;
    domain: string;
    path: string;
    secure: boolean;
    httpOnly: boolean;
    sameSite: chrome.cookies.Cookie['sameSite'];
    session: boolean;
    expirationDate?: number;
    partitionKey?: chrome.cookies.CookiePartitionKey;
    storeId: string;
    size: number;
};

export type LocalStorageMetadata = {
    key: string;
    size: number;
};

export type ResourceItemsResult =
    | {
          ok: true;
          cookies: ResourceCookieMetadata[];
          localStorage: { readable: boolean; items: LocalStorageMetadata[] };
      }
    | { ok: false; error: ResourceError };

type ResourceSitesResult = { ok: true; origins: string[] } | { ok: false; error: ResourceError };
type ResourceEnableResult = { ok: true } | { ok: false; error: ResourceError };

const canonicalOrigin = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const origins = uniqueHttpOriginsFromTabs([{ url: value }]);
    return origins.length === 1 && origins[0] === value ? value : null;
};

const hasPermission = async (origin: string): Promise<boolean> => {
    try {
        return await chrome.permissions.contains(resourcePermission(origin));
    } catch {
        return false;
    }
};

const cookieMetadata = (cookie: chrome.cookies.Cookie): ResourceCookieMetadata => {
    const encoder = new TextEncoder();
    const metadata: ResourceCookieMetadata = {
        name: cookie.name,
        domain: cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        session: cookie.session,
        storeId: cookie.storeId,
        size: encoder.encode(cookie.name).byteLength + encoder.encode(cookie.value).byteLength
    };
    if (cookie.expirationDate !== undefined) metadata.expirationDate = cookie.expirationDate;
    if (cookie.partitionKey !== undefined) metadata.partitionKey = cookie.partitionKey;
    return metadata;
};

// Serialized by executeScript. Keep every dependency inside this function.
const inspectLocalStorage = (): { readable: boolean; items: LocalStorageMetadata[] } => {
    try {
        const encoder = new TextEncoder();
        const items: LocalStorageMetadata[] = [];
        for (let index = 0; index < localStorage.length; index++) {
            const key = localStorage.key(index);
            if (key === null) continue;
            const value = localStorage.getItem(key) ?? '';
            items.push({ key, size: encoder.encode(key).byteLength + encoder.encode(value).byteLength });
        }
        return { readable: true, items };
    } catch {
        return { readable: false, items: [] };
    }
};

const sameOriginTab = (tabs: chrome.tabs.Tab[], origin: string): chrome.tabs.Tab | undefined =>
    tabs.find((tab) => {
        if (tab.incognito || tab.id === undefined || !tab.url) return false;
        try {
            return new URL(tab.url).origin === origin;
        } catch {
            return false;
        }
    });

export const listResourceSites = async (): Promise<ResourceSitesResult> => {
    try {
        const tabs = await chrome.tabs.query({});
        return { ok: true, origins: uniqueHttpOriginsFromTabs(tabs) };
    } catch {
        return { ok: false, error: RESOURCE_ERROR.FAILED };
    }
};

export const enableResourceOrigin = async (rawOrigin: unknown): Promise<ResourceEnableResult> => {
    const origin = canonicalOrigin(rawOrigin);
    if (!origin) return { ok: false, error: RESOURCE_ERROR.MALFORMED };
    if (!(await hasPermission(origin))) return { ok: false, error: RESOURCE_ERROR.PERMISSION_DENIED };
    return { ok: true };
};

export const listResourceItems = async (rawOrigin: unknown): Promise<ResourceItemsResult> => {
    const origin = canonicalOrigin(rawOrigin);
    if (!origin) return { ok: false, error: RESOURCE_ERROR.MALFORMED };
    if (!(await hasPermission(origin))) return { ok: false, error: RESOURCE_ERROR.PERMISSION_DENIED };

    try {
        const [cookies, tabs] = await Promise.all([
            chrome.cookies.getAll({ url: `${origin}/` }),
            chrome.tabs.query({})
        ]);
        const tab = sameOriginTab(tabs, origin);
        let localStorageResult: { readable: boolean; items: LocalStorageMetadata[] } = {
            readable: false,
            items: []
        };
        if (tab?.id !== undefined) {
            try {
                const result = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: inspectLocalStorage
                });
                const inspected = result[0]?.result;
                if (inspected && typeof inspected.readable === 'boolean' && Array.isArray(inspected.items)) {
                    localStorageResult = inspected;
                }
            } catch {
                // Unreadable is distinct from an empty, readable store.
            }
        }
        return {
            ok: true,
            cookies: cookies.map(cookieMetadata),
            localStorage: localStorageResult
        };
    } catch {
        return { ok: false, error: RESOURCE_ERROR.FAILED };
    }
};
