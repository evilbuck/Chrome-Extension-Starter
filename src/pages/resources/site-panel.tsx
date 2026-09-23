import { useEffect, useRef, useState } from 'preact/hooks';
import type {
    LocalStorageMetadata,
    ResourceCookieMetadata,
    ResourceStatusItem,
    ResourceSubscriptionInput
} from '@/background/apps/resources';
import { MSG } from '@/shared/constants';
import { t } from '@/shared/lib/i18n';
import { cookieIdentityKey, localStorageIdentityKey, resourcePermission } from '@/shared/lib/resources';

type ListedItems = {
    cookies: ResourceCookieMetadata[];
    localStorage: { readable: boolean; items: LocalStorageMetadata[] };
};

const EMPTY_ITEMS: ListedItems = {
    cookies: [],
    localStorage: { readable: true, items: [] }
};

const isStringArray = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === 'string');

const send = async (type: MSG, payload?: unknown): Promise<unknown> =>
    chrome.runtime.sendMessage(payload === undefined ? { type } : { type, payload });

const isOkResponse = (value: unknown): value is Record<string, unknown> & { ok: true } =>
    !!value && typeof value === 'object' && !Array.isArray(value) && 'ok' in value && value.ok === true;

const parseListedItems = (value: unknown): ListedItems | null => {
    if (!isOkResponse(value)) return null;
    const cookies = Array.isArray(value.cookies) ? (value.cookies as ResourceCookieMetadata[]) : [];
    const storage = value.localStorage;
    if (
        !storage ||
        typeof storage !== 'object' ||
        Array.isArray(storage) ||
        !('readable' in storage) ||
        typeof storage.readable !== 'boolean' ||
        !('items' in storage) ||
        !Array.isArray(storage.items)
    ) {
        return { cookies, localStorage: { readable: false, items: [] } };
    }
    return {
        cookies,
        localStorage: {
            readable: storage.readable,
            items: storage.items as LocalStorageMetadata[]
        }
    };
};

const isResourceStatusItem = (item: unknown): item is ResourceStatusItem => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const candidate = item as Record<string, unknown>;
    const knownType = candidate.type === 'cookie' || candidate.type === 'localStorage';
    return typeof candidate.origin === 'string' && knownType && typeof candidate.paused === 'boolean';
};

const parseStatus = (value: unknown): ResourceStatusItem[] => {
    if (!isOkResponse(value) || !('items' in value) || !Array.isArray(value.items)) return [];
    return value.items.filter(isResourceStatusItem);
};

type LoadResult =
    | { ok: true; items: ListedItems; status: ResourceStatusItem[] }
    | { ok: false; error: 'permission_denied' | 'failed' };

const requestResourceItems = async (origin: string): Promise<LoadResult> => {
    try {
        if (!(await chrome.permissions.request(resourcePermission(origin)))) {
            return { ok: false, error: 'permission_denied' };
        }
    } catch {
        return { ok: false, error: 'permission_denied' };
    }
    try {
        const enabled = await send(MSG.RESOURCE_ENABLE, { origin });
        if (!isOkResponse(enabled)) return { ok: false, error: 'permission_denied' };
        const [listedResponse, statusResponse] = await Promise.all([
            send(MSG.RESOURCE_LIST_ITEMS, { origin }),
            send(MSG.RESOURCE_STATUS)
        ]);
        const items = parseListedItems(listedResponse);
        return items ? { ok: true, items, status: parseStatus(statusResponse) } : { ok: false, error: 'failed' };
    } catch {
        return { ok: false, error: 'failed' };
    }
};

const flagsFor = (cookie: ResourceCookieMetadata): string => {
    const partition = cookie.partitionKey
        ? `Partitioned${cookie.partitionKey.topLevelSite ? `: ${cookie.partitionKey.topLevelSite}` : ''}`
        : false;
    const flags = [
        cookie.secure && 'Secure',
        cookie.httpOnly && 'HttpOnly',
        cookie.session && 'Session',
        cookie.sameSite,
        partition
    ]
        .filter(Boolean)
        .join(' · ');
    return flags || '—';
};

type ResourceRowProps = {
    checked: boolean;
    status?: ResourceStatusItem;
    onChange: (checked: boolean) => void;
};

const ItemStatus = ({ status }: { status?: ResourceStatusItem }) => {
    if (status?.paused) return <span className="block text-xs font-medium text-amber-700">{t('resourcePaused')}</span>;
    if (status?.error) return <span className="block text-xs font-medium text-red-700">{t('resourceSyncFailed')}</span>;
    return null;
};

const CookieRow = ({ cookie, checked, status, onChange }: ResourceRowProps & { cookie: ResourceCookieMetadata }) => (
    <li className="rounded-xl border border-gray-200 p-3">
        <label className="flex items-start gap-3">
            <input
                className="mt-1 rounded border-gray-300"
                type="checkbox"
                aria-label={cookie.name}
                checked={checked}
                onChange={(event) => onChange(event.currentTarget.checked)}
            />
            <span className="min-w-0 space-y-1">
                <strong className="block break-all text-sm text-gray-900">{cookie.name}</strong>
                <span className="block break-all font-mono text-xs text-gray-600">
                    {cookie.domain} {cookie.path}
                </span>
                <span className="block text-xs text-gray-500">
                    {flagsFor(cookie)} · {cookie.size} B
                </span>
                <ItemStatus status={status} />
            </span>
        </label>
    </li>
);

const LocalStorageRow = ({ item, checked, status, onChange }: ResourceRowProps & { item: LocalStorageMetadata }) => (
    <li className="rounded-xl border border-gray-200 p-3">
        <label className="flex items-start gap-3">
            <input
                className="mt-1 rounded border-gray-300"
                type="checkbox"
                aria-label={item.key}
                checked={checked}
                onChange={(event) => onChange(event.currentTarget.checked)}
            />
            <span className="min-w-0 space-y-1">
                <strong className="block break-all text-sm text-gray-900">{item.key}</strong>
                <span className="block text-xs text-gray-500">{item.size} B</span>
                <ItemStatus status={status} />
            </span>
        </label>
    </li>
);

export const ResourceSitePanel = () => {
    const [origins, setOrigins] = useState<string[]>([]);
    const [selectedOrigin, setSelectedOrigin] = useState('');
    const [items, setItems] = useState<ListedItems>(EMPTY_ITEMS);
    const [status, setStatus] = useState<ResourceStatusItem[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const selectionRequest = useRef(0);

    useEffect(() => {
        let active = true;
        void send(MSG.RESOURCE_LIST_SITES)
            .then((response) => {
                if (!active || !response || typeof response !== 'object' || !('ok' in response) || response.ok !== true)
                    return;
                const listed = 'origins' in response ? response.origins : null;
                if (isStringArray(listed)) setOrigins(listed);
            })
            .catch(() => {
                if (active) setError(t('resourceLoadFailed'));
            });
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (!selectedOrigin) return;
        let active = true;
        const requestId = selectionRequest.current;
        const timer = window.setInterval(() => {
            void send(MSG.RESOURCE_STATUS)
                .then((response) => {
                    if (active && requestId === selectionRequest.current) setStatus(parseStatus(response));
                })
                .catch(() => {
                    // The current item state stays visible until the worker is reachable again.
                });
        }, 2_000);
        return () => {
            active = false;
            window.clearInterval(timer);
        };
    }, [selectedOrigin]);

    const selectOrigin = async (origin: string): Promise<void> => {
        const requestId = ++selectionRequest.current;
        setSelectedOrigin(origin);
        setItems(EMPTY_ITEMS);
        setStatus([]);
        setError(null);
        if (!origin) {
            setBusy(false);
            return;
        }
        setBusy(true);
        const result = await requestResourceItems(origin);
        if (requestId !== selectionRequest.current) return;
        if (result.ok) {
            setItems(result.items);
            setStatus(result.status);
        } else {
            setError(t(result.error === 'permission_denied' ? 'resourcePermissionDenied' : 'resourceLoadFailed'));
        }
        setBusy(false);
    };

    const statusFor = (item: ResourceSubscriptionInput): ResourceStatusItem | undefined =>
        status.find((candidate) => {
            if (candidate.origin !== selectedOrigin || candidate.type !== item.type) return false;
            if (candidate.type === 'localStorage' && item.type === 'localStorage') {
                return (
                    localStorageIdentityKey(candidate.origin, candidate.key) ===
                    localStorageIdentityKey(selectedOrigin, item.key)
                );
            }
            return candidate.type === 'cookie' && item.type === 'cookie'
                ? cookieIdentityKey(candidate) === cookieIdentityKey(item)
                : false;
        });

    const toggle = async (item: ResourceSubscriptionInput, checked: boolean): Promise<void> => {
        const requestId = selectionRequest.current;
        const origin = selectedOrigin;
        const type = checked ? MSG.RESOURCE_SUBSCRIBE : MSG.RESOURCE_UNSUBSCRIBE;
        try {
            const response = await send(type, { origin, item });
            if (requestId !== selectionRequest.current) return;
            if (!isOkResponse(response)) {
                setError(t('resourceSyncFailed'));
                return;
            }
            const nextStatus = parseStatus(await send(MSG.RESOURCE_STATUS));
            if (requestId === selectionRequest.current) setStatus(nextStatus);
        } catch {
            if (requestId === selectionRequest.current) setError(t('resourceSyncFailed'));
        }
    };

    return (
        <section
            className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7"
            aria-labelledby="resource-title"
            data-testid="resource-site-panel">
            <div>
                <p className="mb-2 font-mono text-xs font-semibold uppercase tracking-widest text-primary-600">
                    03 / {t('resourceSectionLabel')}
                </p>
                <h2 id="resource-title" className="text-xl font-semibold">
                    {t('resourceTitle')}
                </h2>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-gray-600">{t('resourceWarning')}</p>
            <label className="block max-w-xl space-y-2">
                <span className="text-sm font-medium text-gray-800">{t('resourceSiteLabel')}</span>
                <select
                    className="w-full rounded-lg border-gray-300 text-sm"
                    aria-label={t('resourceSiteLabel')}
                    value={selectedOrigin}
                    disabled={busy}
                    onChange={(event) => void selectOrigin(event.currentTarget.value)}>
                    <option value="">{t('resourceChooseSite')}</option>
                    {origins.map((origin) => (
                        <option key={origin} value={origin}>
                            {origin}
                        </option>
                    ))}
                </select>
            </label>
            {error && (
                <p className="text-sm text-red-700" role="alert">
                    {error}
                </p>
            )}
            {selectedOrigin && !error && (
                <div className="grid gap-5 md:grid-cols-2">
                    <section aria-labelledby="resource-cookies-title">
                        <h3 id="resource-cookies-title" className="mb-3 font-semibold text-gray-900">
                            {t('resourceCookiesTitle')}
                        </h3>
                        <ul className="space-y-2">
                            {items.cookies.map((cookie) => {
                                const identity: ResourceSubscriptionInput = {
                                    type: 'cookie',
                                    name: cookie.name,
                                    domain: cookie.domain,
                                    path: cookie.path,
                                    storeId: cookie.storeId,
                                    ...(cookie.partitionKey ? { partitionKey: cookie.partitionKey } : {})
                                };
                                const itemStatus = statusFor(identity);
                                return (
                                    <CookieRow
                                        key={cookieIdentityKey(cookie)}
                                        cookie={cookie}
                                        checked={itemStatus !== undefined}
                                        status={itemStatus}
                                        onChange={(checked) => void toggle(identity, checked)}
                                    />
                                );
                            })}
                        </ul>
                    </section>
                    <section aria-labelledby="resource-storage-title">
                        <h3 id="resource-storage-title" className="mb-3 font-semibold text-gray-900">
                            {t('resourceStorageTitle')}
                        </h3>
                        {!items.localStorage.readable && (
                            <p className="text-sm text-amber-700" role="status">
                                {t('resourceStorageUnreadable')}
                            </p>
                        )}
                        <ul className="space-y-2">
                            {items.localStorage.items.map((item) => {
                                const identity: ResourceSubscriptionInput = {
                                    type: 'localStorage',
                                    key: item.key
                                };
                                const itemStatus = statusFor(identity);
                                return (
                                    <LocalStorageRow
                                        key={item.key}
                                        item={item}
                                        checked={itemStatus !== undefined}
                                        status={itemStatus}
                                        onChange={(checked) => void toggle(identity, checked)}
                                    />
                                );
                            })}
                        </ul>
                    </section>
                </div>
            )}
        </section>
    );
};
