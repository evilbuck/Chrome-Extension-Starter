import { PAYLOAD_KIND, RESOURCE_ERROR, type ResourceError } from '@/shared/constants';
import type { ResourceCookieItem, ResourceUpsertPayload } from '@/shared/lib/envelope';
import {
    type CookieIdentity,
    cookieIdentityKey,
    localStorageIdentityKey,
    resourcePermission,
    uniqueHttpOriginsFromTabs
} from '@/shared/lib/resources';

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

export type ResourceSubscription =
    | ({ type: 'cookie'; origin: string } & CookieIdentity)
    | { type: 'localStorage'; origin: string; key: string };

export type ResourceSubscriptionInput = ({ type: 'cookie' } & CookieIdentity) | { type: 'localStorage'; key: string };

export type ResourceStatusItem = ResourceSubscription & {
    paused: boolean;
    error: ResourceError | null;
};

type ResourceSend = (payload: ResourceUpsertPayload) => Promise<ResourceError | null>;

const RESOURCE_SUBSCRIPTIONS_KEY = 'resourceSubscriptions' as const;
const RESOURCE_POLL_ALARM = 'resource-local-storage-poll';

const subscriptionKey = (subscription: ResourceSubscription): string =>
    subscription.type === 'cookie'
        ? `cookie\0${subscription.origin}\0${cookieIdentityKey(subscription)}`
        : `localStorage\0${localStorageIdentityKey(subscription.origin, subscription.key)}`;

const validPartitionKey = (value: unknown): value is chrome.cookies.CookiePartitionKey => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const key = value as Record<string, unknown>;
    return (
        (key.topLevelSite === undefined || typeof key.topLevelSite === 'string') &&
        (key.hasCrossSiteAncestor === undefined || typeof key.hasCrossSiteAncestor === 'boolean')
    );
};
const parseCookieSubscription = (
    origin: string,
    item: Record<string, unknown>
): Extract<ResourceSubscription, { type: 'cookie' }> | null => {
    if (item.type !== 'cookie') return null;
    if (![item.name, item.domain, item.path, item.storeId].every((field) => typeof field === 'string')) return null;
    if (item.partitionKey !== undefined && !validPartitionKey(item.partitionKey)) return null;
    const subscription: Extract<ResourceSubscription, { type: 'cookie' }> = {
        type: 'cookie',
        origin,
        name: item.name as string,
        domain: item.domain as string,
        path: item.path as string,
        storeId: item.storeId as string
    };
    if (item.partitionKey !== undefined) subscription.partitionKey = item.partitionKey;
    return subscription;
};

const parseSubscription = (rawOrigin: unknown, value: unknown): ResourceSubscription | null => {
    const origin = canonicalOrigin(rawOrigin);
    if (!origin) return null;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const item = value as Record<string, unknown>;
    if (item.type === 'localStorage') {
        return typeof item.key === 'string' && item.key.length > 0
            ? { type: 'localStorage', origin, key: item.key }
            : null;
    }
    return parseCookieSubscription(origin, item);
};
const parseStoredSubscription = (value: unknown): ResourceSubscription | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const item = value as Record<string, unknown>;
    return parseSubscription(item.origin, item);
};

const cookieItem = (cookie: chrome.cookies.Cookie): ResourceCookieItem => {
    const item: ResourceCookieItem = {
        type: 'cookie',
        name: cookie.name,
        domain: cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        session: cookie.session,
        value: cookie.value
    };
    if (cookie.expirationDate !== undefined) item.expirationDate = cookie.expirationDate;
    if (cookie.partitionKey !== undefined) item.partitionKey = cookie.partitionKey;
    return item;
};

const sameCookie = (subscription: Extract<ResourceSubscription, { type: 'cookie' }>, cookie: chrome.cookies.Cookie) =>
    cookieIdentityKey(subscription) === cookieIdentityKey(cookie);

// Serialized by executeScript. Keep every dependency inside this function.
const readLocalStorageValue = (key: string): string | null => {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
};

export const createResourceSync = (send: ResourceSend, pollIntervalMs = 60_000) => {
    let subscriptions: ResourceSubscription[] = [];
    let started = false;
    let ready: Promise<void> | null = null;
    let listenersRegistered = false;
    let alarmScheduled = false;
    let refreshPromise: Promise<void> | null = null;
    let refreshQueued = false;
    const paused = new Set<string>();
    const errors = new Map<string, ResourceError>();
    const localValues = new Map<string, string | null>();

    const persist = async (): Promise<void> => {
        await chrome.storage.local.set({ [RESOURCE_SUBSCRIPTIONS_KEY]: subscriptions });
    };

    const load = async (): Promise<void> => {
        const stored = await chrome.storage.local.get(RESOURCE_SUBSCRIPTIONS_KEY);
        const value = stored[RESOURCE_SUBSCRIPTIONS_KEY];
        subscriptions = [];
        if (!Array.isArray(value)) return;
        for (const item of value) {
            const subscription = parseStoredSubscription(item);
            if (subscription) subscriptions.push(subscription);
        }
    };

    const sendPayload = async (subscription: ResourceSubscription, item: ResourceUpsertPayload['item']) => {
        const key = subscriptionKey(subscription);
        let error: ResourceError | null;
        try {
            error = await send({ kind: PAYLOAD_KIND.RESOURCE_UPSERT, origin: subscription.origin, item });
        } catch {
            error = RESOURCE_ERROR.FAILED;
        }
        if (error === null) errors.delete(key);
        else errors.set(key, error);
        return error;
    };

    const findCookie = async (
        subscription: Extract<ResourceSubscription, { type: 'cookie' }>
    ): Promise<chrome.cookies.Cookie | null> => {
        const query: chrome.cookies.GetAllDetails = {
            url: `${subscription.origin}/`,
            name: subscription.name,
            storeId: subscription.storeId
        };
        if (subscription.partitionKey !== undefined) query.partitionKey = subscription.partitionKey;
        const cookies = await chrome.cookies.getAll(query);
        return cookies.find((cookie) => sameCookie(subscription, cookie)) ?? null;
    };

    const pushCookie = async (subscription: Extract<ResourceSubscription, { type: 'cookie' }>): Promise<void> => {
        const key = subscriptionKey(subscription);
        try {
            const cookie = await findCookie(subscription);
            if (cookie && subscriptions.some((item) => subscriptionKey(item) === key)) {
                await sendPayload(subscription, cookieItem(cookie));
            }
        } catch {
            errors.set(key, RESOURCE_ERROR.FAILED);
        }
    };

    const readStorage = async (
        tabId: number,
        subscription: Extract<ResourceSubscription, { type: 'localStorage' }>
    ): Promise<string | null> => {
        const result = await chrome.scripting.executeScript({
            target: { tabId },
            func: readLocalStorageValue,
            args: [subscription.key]
        });
        const value = result[0]?.result;
        return typeof value === 'string' ? value : null;
    };

    const updatePollAlarm = (): void => {
        const needsPoll = subscriptions.some(
            (item) => item.type === 'localStorage' && !paused.has(subscriptionKey(item))
        );
        if (needsPoll && !alarmScheduled) {
            chrome.alarms.create(RESOURCE_POLL_ALARM, {
                periodInMinutes: Math.max(1, pollIntervalMs / 60_000)
            });
            alarmScheduled = true;
        } else if (!needsPoll) {
            void chrome.alarms.clear(RESOURCE_POLL_ALARM);
            alarmScheduled = false;
        }
    };

    const refreshLocalStorageSubscription = async (
        subscription: Extract<ResourceSubscription, { type: 'localStorage' }>,
        tabs: chrome.tabs.Tab[]
    ): Promise<void> => {
        const key = subscriptionKey(subscription);
        const tab = sameOriginTab(tabs, subscription.origin);
        if (tab?.id === undefined) {
            paused.add(key);
            return;
        }
        paused.delete(key);
        try {
            const value = await readStorage(tab.id, subscription);
            if (!subscriptions.some((item) => subscriptionKey(item) === key)) return;
            const previous = localValues.get(key);
            if (value === null) {
                localValues.set(key, null);
                return;
            }
            if (previous === value) return;
            const error = await sendPayload(subscription, {
                type: 'localStorage',
                key: subscription.key,
                value
            });
            if (error === null) localValues.set(key, value);
        } catch {
            errors.set(key, RESOURCE_ERROR.FAILED);
        }
    };

    const refreshLocalStorage = async (): Promise<void> => {
        const localSubscriptions = subscriptions.filter(
            (item): item is Extract<ResourceSubscription, { type: 'localStorage' }> => item.type === 'localStorage'
        );
        if (localSubscriptions.length === 0) {
            updatePollAlarm();
            return;
        }
        let tabs: chrome.tabs.Tab[];
        try {
            tabs = await chrome.tabs.query({});
        } catch {
            for (const subscription of localSubscriptions) {
                errors.set(subscriptionKey(subscription), RESOURCE_ERROR.FAILED);
            }
            return;
        }
        for (const subscription of localSubscriptions) {
            await refreshLocalStorageSubscription(subscription, tabs);
        }
        updatePollAlarm();
    };

    const refreshNow = async (): Promise<void> => {
        if (refreshPromise) {
            refreshQueued = true;
            return refreshPromise;
        }
        refreshPromise = (async () => {
            do {
                refreshQueued = false;
                await Promise.all(
                    subscriptions
                        .filter(
                            (item): item is Extract<ResourceSubscription, { type: 'cookie' }> => item.type === 'cookie'
                        )
                        .map(pushCookie)
                );
                await refreshLocalStorage();
            } while (refreshQueued);
        })().finally(() => {
            refreshPromise = null;
        });
        return refreshPromise;
    };

    const processCookieChange = async (change: chrome.cookies.CookieChangeInfo): Promise<void> => {
        await start();
        if (change.removed || (change.cause !== 'explicit' && change.cause !== 'overwrite')) return;
        const matches = subscriptions.filter(
            (subscription): subscription is Extract<ResourceSubscription, { type: 'cookie' }> =>
                subscription.type === 'cookie' && sameCookie(subscription, change.cookie)
        );
        await Promise.all(matches.map((subscription) => sendPayload(subscription, cookieItem(change.cookie))));
    };

    const onCookieChanged = (change: chrome.cookies.CookieChangeInfo): void => {
        void processCookieChange(change);
    };

    const onTabRemoved = (): void => {
        void start().then(refreshLocalStorage);
    };

    const onTabUpdated = (
        _tabId: number,
        changeInfo: { status?: string; url?: string },
        _tab: chrome.tabs.Tab
    ): void => {
        if (changeInfo.status === 'complete' || changeInfo.url !== undefined) {
            void start().then(refreshLocalStorage);
        }
    };

    const onAlarm = (alarm: chrome.alarms.Alarm): void => {
        if (alarm.name === RESOURCE_POLL_ALARM) void start().then(refreshLocalStorage);
    };

    const registerListeners = (): void => {
        if (listenersRegistered) return;
        chrome.cookies?.onChanged?.addListener(onCookieChanged);
        chrome.tabs?.onRemoved?.addListener(onTabRemoved);
        chrome.tabs?.onUpdated?.addListener(onTabUpdated);
        chrome.alarms?.onAlarm.addListener(onAlarm);
        listenersRegistered = true;
    };

    const start = (): Promise<void> => {
        registerListeners();
        if (ready) return ready;
        started = true;
        ready = (async () => {
            await load();
            await refreshNow();
        })().catch((error: unknown) => {
            ready = null;
            started = false;
            throw error;
        });
        return ready;
    };

    const stop = (): void => {
        if (!started && !listenersRegistered) return;
        started = false;
        if (listenersRegistered) {
            chrome.cookies?.onChanged?.removeListener(onCookieChanged);
            chrome.tabs?.onRemoved?.removeListener(onTabRemoved);
            chrome.tabs?.onUpdated?.removeListener(onTabUpdated);
            chrome.alarms?.onAlarm.removeListener(onAlarm);
            listenersRegistered = false;
        }
        if (alarmScheduled) void chrome.alarms.clear(RESOURCE_POLL_ALARM);
        alarmScheduled = false;
        ready = null;
    };

    const subscribe = async (
        rawOrigin: unknown,
        rawItem: unknown
    ): Promise<{ ok: true } | { ok: false; error: ResourceError }> => {
        await start();
        const subscription = parseSubscription(rawOrigin, rawItem);
        if (!subscription) return { ok: false, error: RESOURCE_ERROR.MALFORMED };
        if (!(await hasPermission(subscription.origin))) {
            return { ok: false, error: RESOURCE_ERROR.PERMISSION_DENIED };
        }
        const key = subscriptionKey(subscription);
        if (!subscriptions.some((item) => subscriptionKey(item) === key)) {
            subscriptions = [...subscriptions, subscription];
            await persist();
        }
        if (subscription.type === 'cookie') {
            await pushCookie(subscription);
        } else {
            await refreshLocalStorage();
        }
        return { ok: true };
    };

    const unsubscribe = async (
        rawOrigin: unknown,
        rawItem: unknown
    ): Promise<{ ok: true } | { ok: false; error: ResourceError }> => {
        const subscription = parseSubscription(rawOrigin, rawItem);
        await start();
        if (!subscription) return { ok: false, error: RESOURCE_ERROR.MALFORMED };
        const key = subscriptionKey(subscription);
        subscriptions = subscriptions.filter((item) => subscriptionKey(item) !== key);
        paused.delete(key);
        errors.delete(key);
        localValues.delete(key);
        await persist();
        updatePollAlarm();
        return { ok: true };
    };

    const status = async (): Promise<{ ok: true; items: ResourceStatusItem[] }> => {
        await start();
        return {
            ok: true,
            items: subscriptions.map((subscription) => {
                const key = subscriptionKey(subscription);
                return {
                    ...subscription,
                    paused: subscription.type === 'localStorage' && paused.has(key),
                    error: errors.get(key) ?? null
                };
            })
        };
    };

    const refresh = async (): Promise<void> => {
        await start();
        await refreshNow();
    };

    registerListeners();
    return { start, stop, subscribe, unsubscribe, status, refresh };
};
