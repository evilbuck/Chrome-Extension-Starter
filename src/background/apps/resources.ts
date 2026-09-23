import {
    PAYLOAD_KIND,
    PAYLOAD_RESPONSE_KIND,
    RESOURCE_ERROR,
    RESOURCE_ITEM_MAX_BYTES,
    type ResourceError,
    ROLE,
    type Role
} from '@/shared/constants';
import type { ResourceCookieItem, ResourceLocalStorageItem, ResourceUpsertPayload } from '@/shared/lib/envelope';
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

const wireCookieDomain = (cookie: chrome.cookies.Cookie): string => {
    if (cookie.hostOnly === true) return cookie.domain.replace(/^\./, '');
    if (cookie.hostOnly === false && !cookie.domain.startsWith('.')) return `.${cookie.domain}`;
    return cookie.domain;
};

const cookieItem = (cookie: chrome.cookies.Cookie): ResourceCookieItem => {
    const item: ResourceCookieItem = {
        type: 'cookie',
        name: cookie.name,
        domain: wireCookieDomain(cookie),
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        session: cookie.session,
        value: cookie.value
    };
    if (!cookie.session && cookie.expirationDate !== undefined) item.expirationDate = cookie.expirationDate;
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
    let storageEpoch = 0;
    let storageTail: Promise<void> = Promise.resolve();
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

    const commitPause = (key: string, epoch: number, isPaused: boolean): void => {
        if (epoch !== storageEpoch) return;
        if (isPaused) paused.add(key);
        else paused.delete(key);
    };

    const refreshLocalStorageSubscription = async (
        subscription: Extract<ResourceSubscription, { type: 'localStorage' }>,
        tabs: chrome.tabs.Tab[],
        epoch: number
    ): Promise<void> => {
        const key = subscriptionKey(subscription);
        const tab = sameOriginTab(tabs, subscription.origin);
        if (tab?.id === undefined) {
            commitPause(key, epoch, true);
            return;
        }
        commitPause(key, epoch, false);
        try {
            const value = await readStorage(tab.id, subscription);
            if (!subscriptions.some((item) => subscriptionKey(item) === key)) return;
            const previous = localValues.get(key);
            if (value === null) {
                if (epoch === storageEpoch) localValues.set(key, null);
                return;
            }
            if (previous === value) return;
            const error = await sendPayload(subscription, {
                type: 'localStorage',
                key: subscription.key,
                value
            });
            if (error === null) localValues.set(key, value);
            commitPause(key, epoch, false);
        } catch {
            if (epoch !== storageEpoch) return;
            errors.set(key, RESOURCE_ERROR.FAILED);
        }
    };

    const runLocalStorageRefresh = async (epoch: number): Promise<void> => {
        const localSubscriptions = subscriptions.filter(
            (item): item is Extract<ResourceSubscription, { type: 'localStorage' }> => item.type === 'localStorage'
        );
        if (localSubscriptions.length === 0) {
            if (epoch === storageEpoch) updatePollAlarm();
            return;
        }
        let tabs: chrome.tabs.Tab[];
        try {
            tabs = await chrome.tabs.query({});
        } catch {
            if (epoch !== storageEpoch) return;
            for (const subscription of localSubscriptions) {
                errors.set(subscriptionKey(subscription), RESOURCE_ERROR.FAILED);
            }
            return;
        }
        for (const subscription of localSubscriptions) {
            await refreshLocalStorageSubscription(subscription, tabs, epoch);
        }
        if (epoch === storageEpoch) updatePollAlarm();
    };

    const refreshLocalStorage = (): Promise<void> => {
        const epoch = ++storageEpoch;
        const run = storageTail.then(() => runLocalStorageRefresh(epoch));
        storageTail = run.then(
            () => undefined,
            () => undefined
        );
        return run;
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

const COOKIE_SAME_SITE = ['no_restriction', 'lax', 'strict', 'unspecified'] as const;
const COOKIE_ITEM_KEYS = [
    'type',
    'name',
    'domain',
    'path',
    'secure',
    'httpOnly',
    'sameSite',
    'session',
    'value',
    'expirationDate',
    'partitionKey'
] as const;
const STORAGE_ITEM_KEYS = ['type', 'key', 'value'] as const;
const DOCUMENT_LOAD_MS = 10_000;

const onlyOwnKeys = (obj: Record<string, unknown>, keys: readonly string[]): boolean =>
    Object.keys(obj).every((key) => keys.includes(key));

const isSameSite = (value: unknown): value is (typeof COOKIE_SAME_SITE)[number] =>
    typeof value === 'string' && (COOKIE_SAME_SITE as readonly string[]).includes(value);

const partitionFrom = (value: unknown): chrome.cookies.CookiePartitionKey | ResourceError => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return RESOURCE_ERROR.MALFORMED;
    const fields = value as Record<string, unknown>;
    if (!onlyOwnKeys(fields, ['topLevelSite', 'hasCrossSiteAncestor'])) return RESOURCE_ERROR.MALFORMED;
    const partition: chrome.cookies.CookiePartitionKey = {};
    if (fields.topLevelSite !== undefined) {
        if (typeof fields.topLevelSite !== 'string') return RESOURCE_ERROR.MALFORMED;
        partition.topLevelSite = fields.topLevelSite;
    }
    if (fields.hasCrossSiteAncestor !== undefined) {
        if (typeof fields.hasCrossSiteAncestor !== 'boolean') return RESOURCE_ERROR.MALFORMED;
        partition.hasCrossSiteAncestor = fields.hasCrossSiteAncestor;
    }
    return partition;
};

const cookieFlags = (
    obj: Record<string, unknown>
): { secure: boolean; httpOnly: boolean; session: boolean } | ResourceError => {
    const { secure, httpOnly, session } = obj;
    if (typeof secure !== 'boolean' || typeof httpOnly !== 'boolean' || typeof session !== 'boolean') {
        return RESOURCE_ERROR.MALFORMED;
    }
    return { secure, httpOnly, session };
};

const withExpiration = (item: ResourceCookieItem, raw: unknown): ResourceError | null => {
    if (item.session || raw === undefined) return null;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return RESOURCE_ERROR.MALFORMED;
    item.expirationDate = raw;
    return null;
};

const withPartition = (item: ResourceCookieItem, raw: unknown): ResourceError | null => {
    if (raw === undefined) return null;
    const partitionKey = partitionFrom(raw);
    if (typeof partitionKey === 'string') return partitionKey;
    item.partitionKey = partitionKey;
    return null;
};

const cookieApplyFields = (
    obj: Record<string, unknown>
):
    | {
          name: string;
          domain: string;
          path: string;
          value: string;
          sameSite: (typeof COOKIE_SAME_SITE)[number];
      }
    | ResourceError => {
    if (typeof obj.name !== 'string' || typeof obj.domain !== 'string') return RESOURCE_ERROR.MALFORMED;
    if (typeof obj.path !== 'string' || !obj.path.startsWith('/')) return RESOURCE_ERROR.MALFORMED;
    if (typeof obj.value !== 'string' || !isSameSite(obj.sameSite)) return RESOURCE_ERROR.MALFORMED;
    return {
        name: obj.name,
        domain: obj.domain,
        path: obj.path,
        value: obj.value,
        sameSite: obj.sameSite
    };
};

const parseCookieApplyItem = (obj: Record<string, unknown>): ResourceCookieItem | ResourceError => {
    if (!onlyOwnKeys(obj, COOKIE_ITEM_KEYS)) return RESOURCE_ERROR.MALFORMED;
    const flags = cookieFlags(obj);
    if (typeof flags === 'string') return flags;
    const fields = cookieApplyFields(obj);
    if (typeof fields === 'string') return fields;
    const item: ResourceCookieItem = {
        type: 'cookie',
        name: fields.name,
        domain: fields.domain,
        path: fields.path,
        secure: flags.secure,
        httpOnly: flags.httpOnly,
        sameSite: fields.sameSite,
        session: flags.session,
        value: fields.value
    };
    const expiration = withExpiration(item, obj.expirationDate);
    if (expiration) return expiration;
    const partition = withPartition(item, obj.partitionKey);
    if (partition) return partition;
    return item;
};

const parseStorageApplyItem = (obj: Record<string, unknown>): ResourceLocalStorageItem | ResourceError => {
    if (!onlyOwnKeys(obj, STORAGE_ITEM_KEYS)) return RESOURCE_ERROR.MALFORMED;
    if (typeof obj.key !== 'string' || typeof obj.value !== 'string') return RESOURCE_ERROR.MALFORMED;
    return { type: 'localStorage', key: obj.key, value: obj.value };
};

const parseApplyItem = (value: unknown): ResourceCookieItem | ResourceLocalStorageItem | ResourceError => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return RESOURCE_ERROR.MALFORMED;
    const item = value as Record<string, unknown>;
    if (new TextEncoder().encode(JSON.stringify(item)).byteLength > RESOURCE_ITEM_MAX_BYTES) {
        return RESOURCE_ERROR.OVERSIZED;
    }
    if (item.type === 'cookie') return parseCookieApplyItem(item);
    if (item.type === 'localStorage') return parseStorageApplyItem(item);
    return RESOURCE_ERROR.MALFORMED;
};

const errorReply = (replyTo: string, error: ResourceError) => ({
    kind: PAYLOAD_RESPONSE_KIND.RESOURCE_ERROR as const,
    replyTo,
    error
});

const appliedReply = (replyTo: string, origin: string, type: 'cookie' | 'localStorage', id: string) => ({
    kind: PAYLOAD_RESPONSE_KIND.RESOURCE_APPLIED as const,
    replyTo,
    origin,
    type,
    id
});

const cookieDetails = (origin: string, item: ResourceCookieItem): chrome.cookies.SetDetails => {
    const details: chrome.cookies.SetDetails = {
        url: `${origin}${item.path}`,
        name: item.name,
        value: item.value,
        path: item.path,
        secure: item.secure,
        httpOnly: item.httpOnly,
        sameSite: item.sameSite
    };
    if (item.domain.startsWith('.')) details.domain = item.domain;
    if (item.expirationDate !== undefined) details.expirationDate = item.expirationDate;
    if (item.partitionKey !== undefined) details.partitionKey = item.partitionKey;
    return details;
};

const tabOrigin = (url: string | undefined): string | null => {
    if (!url) return null;
    try {
        return new URL(url).origin;
    } catch {
        return null;
    }
};

const isOriginTab = (tab: chrome.tabs.Tab | undefined, origin: string): tab is chrome.tabs.Tab & { id: number } =>
    tab?.id !== undefined && tab.incognito !== true && tabOrigin(tab.url) === origin;

// Serialized by executeScript. Keep every dependency inside this function.
const writeLocalStorageValue = (key: string, value: string): boolean => {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
};

const waitForDocument = (tabId: number, origin: string, timeoutMs: number): Promise<boolean> => {
    const { promise, resolve } = Promise.withResolvers<boolean>();
    let settled = false;
    const finish = (ready: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve(ready);
    };
    const onUpdated = (id: number, info: { status?: string }, tab: chrome.tabs.Tab) => {
        if (id !== tabId || info.status !== 'complete') return;
        finish(isOriginTab(tab, origin));
    };
    const timer = setTimeout(() => {
        void chrome.tabs.get(tabId).then(
            (tab) => finish(isOriginTab(tab, origin) && tab.status === 'complete'),
            () => finish(false)
        );
    }, timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
    void chrome.tabs.get(tabId).then(
        (tab) => {
            if (!isOriginTab(tab, origin)) finish(false);
            else if (tab.status === 'complete') finish(true);
        },
        () => finish(false)
    );
    return promise;
};

const readTrackedTab = async (opened: Map<string, number>, origin: string): Promise<number | null> => {
    const id = opened.get(origin);
    if (id === undefined) return null;
    try {
        const tab = await chrome.tabs.get(id);
        if (isOriginTab(tab, origin)) return tab.id;
    } catch {
        // The tracked tab is gone. Fall through and open another document.
    }
    opened.delete(origin);
    return null;
};

const openDocument = async (opened: Map<string, number>, origin: string): Promise<number | null> => {
    const tracked = await readTrackedTab(opened, origin);
    if (tracked !== null) return tracked;
    const existing = sameOriginTab(await chrome.tabs.query({}), origin);
    if (existing?.id !== undefined) return existing.id;
    const created = await chrome.tabs.create({ url: `${origin}/`, active: false });
    if (created.id === undefined) return null;
    opened.set(origin, created.id);
    return created.id;
};

export type ResourceApplyResult =
    | {
          kind: typeof PAYLOAD_RESPONSE_KIND.RESOURCE_APPLIED;
          replyTo: string;
          origin: string;
          type: 'cookie' | 'localStorage';
          id: string;
      }
    | {
          kind: typeof PAYLOAD_RESPONSE_KIND.RESOURCE_ERROR;
          replyTo: string;
          error: ResourceError;
      };

const applyCookie = async (
    replyTo: string,
    origin: string,
    item: ResourceCookieItem,
    aborted: () => boolean = () => false
): Promise<ResourceApplyResult> => {
    if (aborted()) return errorReply(replyTo, RESOURCE_ERROR.DISCONNECTED);
    try {
        const installed = await chrome.cookies.set(cookieDetails(origin, item));
        if (!installed) return errorReply(replyTo, RESOURCE_ERROR.PERMISSION_DENIED);
    } catch {
        return errorReply(replyTo, RESOURCE_ERROR.FAILED);
    }
    return appliedReply(replyTo, origin, 'cookie', item.name);
};

const writeHeldStorage = async (
    replyTo: string,
    origin: string,
    item: ResourceLocalStorageItem,
    tabId: number,
    held: Map<string, Set<string>>,
    aborted: () => boolean
): Promise<ResourceApplyResult> => {
    if (aborted()) return errorReply(replyTo, RESOURCE_ERROR.DISCONNECTED);
    try {
        const result = await chrome.scripting.executeScript({
            target: { tabId },
            func: writeLocalStorageValue,
            args: [item.key, item.value]
        });
        if (result[0]?.result !== true) return errorReply(replyTo, RESOURCE_ERROR.FAILED);
    } catch {
        return errorReply(replyTo, RESOURCE_ERROR.NO_DOCUMENT);
    }
    const keys = held.get(origin) ?? new Set<string>();
    keys.add(item.key);
    held.set(origin, keys);
    return appliedReply(replyTo, origin, 'localStorage', item.key);
};

const applyStorage = async (
    replyTo: string,
    origin: string,
    item: ResourceLocalStorageItem,
    opened: Map<string, number>,
    held: Map<string, Set<string>>,
    timeoutMs: number,
    aborted: () => boolean = () => false
): Promise<ResourceApplyResult> => {
    if (aborted()) return errorReply(replyTo, RESOURCE_ERROR.DISCONNECTED);
    let tabId: number | null;
    try {
        tabId = await openDocument(opened, origin);
    } catch {
        return errorReply(replyTo, RESOURCE_ERROR.NO_DOCUMENT);
    }
    if (tabId === null || !(await waitForDocument(tabId, origin, timeoutMs))) {
        return errorReply(replyTo, RESOURCE_ERROR.NO_DOCUMENT);
    }
    return writeHeldStorage(replyTo, origin, item, tabId, held, aborted);
};

export type ResourceApplyRequest = {
    role: Role;
    authorized: boolean;
    replyTo: string;
    origin: unknown;
    item: unknown;
    connectionId?: string;
};

export const createResourceClient = (loadTimeoutMs = DOCUMENT_LOAD_MS) => {
    const opened = new Map<string, number>();
    const held = new Map<string, Set<string>>();
    const denied = new Map<
        string,
        { connectionId: string; items: Map<string, ResourceCookieItem | ResourceLocalStorageItem> }
    >();
    let deniedEpoch = 0;
    const forgetOpened = (tabId: number): void => {
        for (const [origin, id] of opened) {
            if (id === tabId) opened.delete(origin);
        }
    };
    chrome.tabs?.onRemoved?.addListener(forgetOpened);

    const deniedKey = (item: ResourceCookieItem | ResourceLocalStorageItem): string =>
        item.type === 'cookie'
            ? `cookie\0${cookieIdentityKey({
                  name: item.name,
                  domain: item.domain,
                  path: item.path,
                  partitionKey: item.partitionKey,
                  storeId: ''
              })}`
            : `storage\0${item.key}`;

    const rememberDenied = (
        connectionId: string,
        origin: string,
        item: ResourceCookieItem | ResourceLocalStorageItem
    ): void => {
        for (const [key, hold] of denied) {
            if (hold.connectionId !== connectionId) denied.delete(key);
        }
        const existing = denied.get(origin);
        const items = existing?.connectionId === connectionId ? existing.items : new Map();
        items.set(deniedKey(item), item);
        denied.set(origin, { connectionId, items });
    };

    const forgetDeniedItem = (
        connectionId: string,
        origin: string,
        item: ResourceCookieItem | ResourceLocalStorageItem
    ): void => {
        const hold = denied.get(origin);
        if (!hold || hold.connectionId !== connectionId) return;
        hold.items.delete(deniedKey(item));
        if (hold.items.size === 0) denied.delete(origin);
    };

    const rejectApplyRole = (request: ResourceApplyRequest, replyTo: string): ResourceApplyResult | null => {
        if (request.role === ROLE.CLIENT && request.authorized === true) return null;
        return errorReply(replyTo, request.authorized === true ? RESOURCE_ERROR.FAILED : RESOURCE_ERROR.DISCONNECTED);
    };

    const writeApplied = (
        replyTo: string,
        origin: string,
        item: ResourceCookieItem | ResourceLocalStorageItem,
        aborted: () => boolean
    ): Promise<ResourceApplyResult> =>
        item.type === 'cookie'
            ? applyCookie(replyTo, origin, item, aborted)
            : applyStorage(replyTo, origin, item, opened, held, loadTimeoutMs, aborted);

    const applyPermitted = async (
        replyTo: string,
        origin: string,
        item: ResourceCookieItem | ResourceLocalStorageItem,
        connectionId: string | undefined,
        aborted: () => boolean
    ): Promise<ResourceApplyResult> => {
        if (aborted()) return errorReply(replyTo, RESOURCE_ERROR.DISCONNECTED);
        if (!(await hasPermission(origin))) {
            if (typeof connectionId === 'string') rememberDenied(connectionId, origin, item);
            return errorReply(replyTo, RESOURCE_ERROR.PERMISSION_DENIED);
        }
        if (aborted()) return errorReply(replyTo, RESOURCE_ERROR.DISCONNECTED);
        const result = await writeApplied(replyTo, origin, item, aborted);
        if (result.kind === PAYLOAD_RESPONSE_KIND.RESOURCE_APPLIED && typeof connectionId === 'string') {
            forgetDeniedItem(connectionId, origin, item);
        }
        return result;
    };

    const apply = async (request: ResourceApplyRequest, aborted: () => boolean = () => false) => {
        const replyTo = typeof request.replyTo === 'string' ? request.replyTo : '';
        if (aborted()) return errorReply(replyTo, RESOURCE_ERROR.DISCONNECTED);
        const rejected = rejectApplyRole(request, replyTo);
        if (rejected) return rejected;
        const origin = canonicalOrigin(request.origin);
        if (!origin) return errorReply(replyTo, RESOURCE_ERROR.MALFORMED);
        const item = parseApplyItem(request.item);
        if (typeof item === 'string') return errorReply(replyTo, item);
        return applyPermitted(replyTo, origin, item, request.connectionId, aborted);
    };

    const pendingOrigins = (connectionId: string): string[] =>
        [...denied.entries()]
            .filter(([, hold]) => hold.connectionId === connectionId && hold.items.size > 0)
            .map(([origin]) => origin);

    const replayHeld = async (
        connectionId: string,
        origin: string,
        items: Array<ResourceCookieItem | ResourceLocalStorageItem>,
        aborted: () => boolean
    ): Promise<ResourceError | null> => {
        let failure: ResourceError | null = null;
        for (const item of items) {
            if (aborted() || denied.get(origin)?.connectionId !== connectionId) return RESOURCE_ERROR.DISCONNECTED;
            const result = await apply(
                {
                    role: ROLE.CLIENT,
                    authorized: true,
                    replyTo: 'client-grant',
                    origin,
                    item,
                    connectionId
                },
                aborted
            );
            if (aborted()) return RESOURCE_ERROR.DISCONNECTED;
            if (result.kind !== PAYLOAD_RESPONSE_KIND.RESOURCE_ERROR) continue;
            failure = result.error;
            if (result.error === RESOURCE_ERROR.PERMISSION_DENIED) break;
        }
        return failure;
    };

    const retryDenied = async (
        connectionId: string,
        originValue: unknown
    ): Promise<{ ok: true } | { ok: false; error: ResourceError }> => {
        const origin = canonicalOrigin(originValue);
        if (!origin) return { ok: false, error: RESOURCE_ERROR.MALFORMED };
        const hold = denied.get(origin);
        if (!hold || hold.connectionId !== connectionId) {
            if (hold) denied.delete(origin);
            return { ok: false, error: RESOURCE_ERROR.DISCONNECTED };
        }
        const epoch = deniedEpoch;
        const failure = await replayHeld(connectionId, origin, [...hold.items.values()], () => deniedEpoch !== epoch);
        if (failure) return { ok: false, error: failure };
        return { ok: true };
    };

    const clearDenied = (): void => {
        deniedEpoch += 1;
        denied.clear();
    };

    const releaseLocalStorage = async (origin: string, key: string): Promise<void> => {
        const keys = held.get(origin);
        if (!keys?.delete(key) || keys.size > 0) return;
        held.delete(origin);
        const tabId = opened.get(origin);
        opened.delete(origin);
        if (tabId === undefined) return;
        try {
            await chrome.tabs.remove(tabId);
        } catch {
            // Already closed, or it was never a tab this feature may close.
        }
    };

    return { apply, releaseLocalStorage, pendingOrigins, retryDenied, clearDenied };
};
