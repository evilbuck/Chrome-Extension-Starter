import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { h } from 'preact';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import {
    createResourceClient,
    createResourceSync,
    enableResourceOrigin,
    listResourceItems,
    listResourceSites
} from '@/background/apps/resources';
import { ResourceSitePanel } from '@/pages/resources/site-panel';
import { MSG } from '@/shared/constants';

const event = <T extends (...args: never[]) => void>() => {
    const listeners = new Set<T>();
    return {
        addListener: vi.fn((listener: T) => listeners.add(listener)),
        removeListener: vi.fn((listener: T) => listeners.delete(listener)),
        emit: (...args: Parameters<T>) => {
            for (const listener of listeners) listener(...args);
        }
    };
};

const syntheticCookie = {
    name: 'syn-cookie',
    value: 'synthetic-cookie-value',
    domain: '.example.com',
    hostOnly: false,
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'lax' as const,
    session: false,
    expirationDate: 2_000_000_000,
    partitionKey: { topLevelSite: 'https://example.com' },
    storeId: '0'
};

const makeChrome = () => {
    const cookieChanges = event<(info: chrome.cookies.CookieChangeInfo) => void>();
    const tabRemoved = event<(tabId: number) => void>();
    const tabUpdated =
        event<(tabId: number, changeInfo: { status?: string; url?: string }, tab: chrome.tabs.Tab) => void>();
    const alarm = event<(alarm: chrome.alarms.Alarm) => void>();
    const stored: Record<string, unknown> = {};
    const tabs = [
        { id: 1, url: 'https://example.com/account', incognito: false },
        { id: 2, url: 'https://example.com/other', incognito: false },
        { id: 3, url: 'http://other.example/path', incognito: false },
        { id: 4, url: 'chrome://extensions', incognito: false },
        { id: 5, url: 'https://private.example/', incognito: true }
    ];
    return {
        tabs: {
            query: vi.fn().mockImplementation(async () => tabs),
            onRemoved: tabRemoved,
            onUpdated: tabUpdated
        },
        permissions: {
            contains: vi.fn().mockResolvedValue(true),
            request: vi.fn().mockResolvedValue(true)
        },
        cookies: {
            getAll: vi.fn().mockResolvedValue([syntheticCookie]),
            remove: vi.fn(),
            onChanged: cookieChanges
        },
        alarms: {
            create: vi.fn(),
            clear: vi.fn().mockResolvedValue(true),
            onAlarm: alarm
        },
        scripting: {
            executeScript: vi.fn(async ({ func, args }: { func: (...args: string[]) => unknown; args?: string[] }) => [
                { result: func(...(args ?? [])) }
            ])
        },
        storage: {
            local: {
                get: vi.fn(async (key: string) => ({ [key]: stored[key] })),
                set: vi.fn(async (values: Record<string, unknown>) => Object.assign(stored, values))
            }
        },
        runtime: {
            sendMessage: vi.fn()
        },
        i18n: {
            getMessage: (key: string) => key
        },
        __events: { alarm, cookieChanges, tabRemoved, tabUpdated },
        __stored: stored,
        __tabs: tabs
    };
};

describe('resource worker listing', () => {
    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem('syn-key', 'syn-value');
        vi.stubGlobal('chrome', makeChrome());
    });
    afterEach(() => vi.unstubAllGlobals());

    it('lists each eligible open origin once', async () => {
        await expect(listResourceSites()).resolves.toEqual({
            ok: true,
            origins: ['https://example.com', 'http://other.example']
        });
    });

    it('rejects malformed origins and reports browser API failures', async () => {
        await expect(enableResourceOrigin('https://example.com/path')).resolves.toEqual({
            ok: false,
            error: 'malformed'
        });
        await expect(listResourceItems(null)).resolves.toEqual({ ok: false, error: 'malformed' });

        (chrome.tabs.query as Mock).mockRejectedValue(new Error('tabs unavailable'));
        await expect(listResourceSites()).resolves.toEqual({ ok: false, error: 'failed' });
    });

    it('confirms a granted origin and contains read failures', async () => {
        await expect(enableResourceOrigin('https://example.com')).resolves.toEqual({ ok: true });

        (chrome.cookies.getAll as Mock).mockRejectedValue(new Error('cookies unavailable'));
        await expect(listResourceItems('https://example.com')).resolves.toEqual({ ok: false, error: 'failed' });
    });

    it('returns permission_denied without reading resources', async () => {
        (chrome.permissions.contains as Mock).mockResolvedValue(false);

        await expect(enableResourceOrigin('https://example.com')).resolves.toEqual({
            ok: false,
            error: 'permission_denied'
        });
        await expect(listResourceItems('https://example.com')).resolves.toEqual({
            ok: false,
            error: 'permission_denied'
        });
        expect(chrome.cookies.getAll).not.toHaveBeenCalled();
        expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
    });

    it('returns cookie and localStorage metadata without values', async () => {
        const result = await listResourceItems('https://example.com');

        expect(result).toEqual({
            ok: true,
            cookies: [
                {
                    name: 'syn-cookie',
                    domain: '.example.com',
                    path: '/',
                    secure: true,
                    httpOnly: true,
                    sameSite: 'lax',
                    session: false,
                    expirationDate: 2_000_000_000,
                    storeId: '0',
                    partitionKey: { topLevelSite: 'https://example.com' },
                    size: 32
                }
            ],
            localStorage: {
                readable: true,
                items: [{ key: 'syn-key', size: 16 }]
            }
        });
        expect(JSON.stringify(result)).not.toContain('synthetic-cookie-value');
    });

    it('distinguishes unreadable localStorage from an empty store', async () => {
        vi.mocked(chrome.scripting.executeScript).mockRejectedValue(new Error('blocked'));

        await expect(listResourceItems('https://example.com')).resolves.toMatchObject({
            ok: true,
            localStorage: { readable: false, items: [] }
        });
    });
});

describe('resource subscriptions and live watches', () => {
    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem('syn-key', 'syn-value');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('persists a cookie identity and sends its current full value', async () => {
        const api = makeChrome();
        vi.stubGlobal('chrome', api);
        const sent = vi.fn().mockResolvedValue(null);
        const sync = createResourceSync(sent, 60_000);
        await sync.start();

        await expect(
            sync.subscribe('https://example.com', {
                type: 'cookie',
                name: syntheticCookie.name,
                domain: syntheticCookie.domain,
                path: syntheticCookie.path,
                partitionKey: syntheticCookie.partitionKey,
                storeId: syntheticCookie.storeId
            })
        ).resolves.toEqual({ ok: true });

        expect(api.__stored.resourceSubscriptions).toEqual([
            {
                type: 'cookie',
                origin: 'https://example.com',
                name: 'syn-cookie',
                domain: '.example.com',
                path: '/',
                partitionKey: { topLevelSite: 'https://example.com' },
                storeId: '0'
            }
        ]);
        expect(sent).toHaveBeenCalledWith({
            kind: 'resource_upsert',
            origin: 'https://example.com',
            item: {
                type: 'cookie',
                name: 'syn-cookie',
                domain: '.example.com',
                path: '/',
                secure: true,
                httpOnly: true,
                sameSite: 'lax',
                session: false,
                expirationDate: 2_000_000_000,
                partitionKey: { topLevelSite: 'https://example.com' },
                value: 'synthetic-cookie-value'
            }
        });
        sync.stop();
    });

    it('unsubscribes without deleting and ignores later cookie changes', async () => {
        const api = makeChrome();
        vi.stubGlobal('chrome', api);
        const sent = vi.fn().mockResolvedValue(null);
        const sync = createResourceSync(sent, 60_000);
        await sync.start();
        const identity = {
            type: 'cookie' as const,
            name: syntheticCookie.name,
            domain: syntheticCookie.domain,
            path: syntheticCookie.path,
            partitionKey: syntheticCookie.partitionKey,
            storeId: syntheticCookie.storeId
        };
        await sync.subscribe('https://example.com', identity);
        sent.mockClear();

        await expect(sync.unsubscribe('https://example.com', identity)).resolves.toEqual({ ok: true });
        api.__events.cookieChanges.emit({ removed: false, cause: 'explicit', cookie: syntheticCookie });

        await waitFor(() => expect(sent).not.toHaveBeenCalled());
        expect(api.cookies.remove).not.toHaveBeenCalled();
        expect(api.__stored.resourceSubscriptions).toEqual([]);
        sync.stop();
    });

    it('does not send an in-flight localStorage read after unsubscribe completes', async () => {
        const api = makeChrome();
        vi.stubGlobal('chrome', api);
        const sent = vi.fn().mockResolvedValue(null);
        const sync = createResourceSync(sent, 60_000);
        await sync.start();
        const identity = { type: 'localStorage' as const, key: 'syn-key' };
        await sync.subscribe('https://example.com', identity);
        sent.mockClear();

        const read = Promise.withResolvers<Array<{ result: string }>>();
        api.scripting.executeScript.mockReturnValueOnce(read.promise);
        const refresh = sync.refresh();
        await waitFor(() => expect(api.scripting.executeScript).toHaveBeenCalledTimes(2));

        await expect(sync.unsubscribe('https://example.com', identity)).resolves.toEqual({ ok: true });
        read.resolve([{ result: 'synthetic-value-read-before-unsubscribe' }]);
        await refresh;

        expect(sent).not.toHaveBeenCalled();
        sync.stop();
    });

    it('does not send an in-flight cookie snapshot after unsubscribe completes', async () => {
        const api = makeChrome();
        vi.stubGlobal('chrome', api);
        const sent = vi.fn().mockResolvedValue(null);
        const sync = createResourceSync(sent, 60_000);
        await sync.start();
        const identity = {
            type: 'cookie' as const,
            name: syntheticCookie.name,
            domain: syntheticCookie.domain,
            path: syntheticCookie.path,
            partitionKey: syntheticCookie.partitionKey,
            storeId: syntheticCookie.storeId
        };
        await sync.subscribe('https://example.com', identity);
        sent.mockClear();

        const read = Promise.withResolvers<chrome.cookies.Cookie[]>();
        api.cookies.getAll.mockReturnValueOnce(read.promise);
        const refresh = sync.refresh();
        await waitFor(() => expect(api.cookies.getAll).toHaveBeenCalledTimes(2));

        await expect(sync.unsubscribe('https://example.com', identity)).resolves.toEqual({ ok: true });
        read.resolve([syntheticCookie]);
        await refresh;

        expect(sent).not.toHaveBeenCalled();
        sync.stop();
    });

    it('pushes subscribed cookie sets and ignores removals without unsubscribing', async () => {
        const api = makeChrome();
        vi.stubGlobal('chrome', api);
        const sent = vi.fn().mockResolvedValue(null);
        const sync = createResourceSync(sent, 60_000);
        await sync.start();
        await sync.subscribe('https://example.com', {
            type: 'cookie',
            name: syntheticCookie.name,
            domain: syntheticCookie.domain,
            path: syntheticCookie.path,
            partitionKey: syntheticCookie.partitionKey,
            storeId: syntheticCookie.storeId
        });
        sent.mockClear();

        api.__events.cookieChanges.emit({ removed: true, cause: 'explicit', cookie: syntheticCookie });
        api.__events.cookieChanges.emit({
            removed: false,
            cause: 'overwrite',
            cookie: { ...syntheticCookie, value: 'synthetic-cookie-updated' }
        });

        await waitFor(() => expect(sent).toHaveBeenCalledTimes(1));
        expect(sent).toHaveBeenCalledWith(
            expect.objectContaining({ item: expect.objectContaining({ value: 'synthetic-cookie-updated' }) })
        );
        expect((await sync.status()).items).toEqual([
            expect.objectContaining({ type: 'cookie', error: null, paused: false })
        ]);
        sync.stop();
    });

    it('pauses localStorage without a host tab and resumes with the current value', async () => {
        const api = makeChrome();
        vi.stubGlobal('chrome', api);
        const sent = vi.fn().mockResolvedValue(null);
        const sync = createResourceSync(sent, 60_000);
        await sync.start();
        const identity = { type: 'localStorage' as const, key: 'syn-key' };
        await sync.subscribe('https://example.com', identity);
        sent.mockClear();
        api.alarms.create.mockClear();
        api.alarms.clear.mockClear();

        api.__tabs.splice(0, 2);
        api.__events.tabRemoved.emit(1);
        await waitFor(async () =>
            expect(await sync.status()).toEqual({
                ok: true,
                items: [
                    {
                        type: 'localStorage',
                        origin: 'https://example.com',
                        key: 'syn-key',
                        paused: true,
                        error: null
                    }
                ]
            })
        );
        expect(api.alarms.clear).toHaveBeenCalledWith('resource-local-storage-poll');

        localStorage.setItem('syn-key', 'syn-value-resumed');
        api.__tabs.push({ id: 8, url: 'https://example.com/reopened', incognito: false });
        api.__events.tabUpdated.emit(8, { status: 'complete' }, api.__tabs.at(-1) as chrome.tabs.Tab);

        await waitFor(() =>
            expect(sent).toHaveBeenCalledWith({
                kind: 'resource_upsert',
                origin: 'https://example.com',
                item: { type: 'localStorage', key: 'syn-key', value: 'syn-value-resumed' }
            })
        );
        expect((await sync.status()).items[0]).toMatchObject({ paused: false, error: null });
        expect(api.alarms.create).toHaveBeenCalledWith('resource-local-storage-poll', {
            periodInMinutes: 1
        });
        sync.stop();
    });

    it('keeps a tab-close pause when it lands during an in-flight storage read', async () => {
        const api = makeChrome();
        vi.stubGlobal('chrome', api);
        const sent = vi.fn().mockResolvedValue(null);
        const sync = createResourceSync(sent, 60_000);
        await sync.start();
        await sync.subscribe('https://example.com', { type: 'localStorage', key: 'syn-key' });
        sent.mockClear();
        api.alarms.create.mockClear();
        api.alarms.clear.mockClear();

        const read = Promise.withResolvers<Array<{ result: string }>>();
        api.scripting.executeScript.mockReturnValueOnce(read.promise);
        api.__events.alarm.emit({ name: 'resource-local-storage-poll', scheduledTime: Date.now() });
        await waitFor(() => expect(api.scripting.executeScript).toHaveBeenCalled());

        api.__tabs.splice(0, api.__tabs.length);
        api.__events.tabRemoved.emit(1);
        read.resolve([{ result: 'syn-value-held' }]);
        await waitFor(async () => expect((await sync.status()).items[0]).toMatchObject({ paused: true, error: null }));

        expect(sent).toHaveBeenCalledWith({
            kind: 'resource_upsert',
            origin: 'https://example.com',
            item: { type: 'localStorage', key: 'syn-key', value: 'syn-value-held' }
        });
        expect((await sync.status()).items[0]).toMatchObject({ paused: true, error: null });
        expect(api.alarms.clear).toHaveBeenCalledWith('resource-local-storage-poll');
        expect(api.alarms.create).not.toHaveBeenCalled();
        sync.stop();
    });

    it('keeps subscriptions while unpaired and sends the current value after reconnect', async () => {
        const api = makeChrome();
        vi.stubGlobal('chrome', api);
        let authorized = false;
        const outbound: unknown[] = [];
        const send = vi.fn(async (payload: unknown) => {
            if (!authorized) return 'disconnected' as const;
            outbound.push(payload);
            return null;
        });
        const sync = createResourceSync(send, 60_000);
        await sync.start();
        await sync.subscribe('https://example.com', { type: 'localStorage', key: 'syn-key' });

        expect(outbound).toEqual([]);
        expect(api.__stored.resourceSubscriptions).toEqual([
            { type: 'localStorage', origin: 'https://example.com', key: 'syn-key' }
        ]);

        authorized = true;
        await sync.refresh();

        expect(outbound).toEqual([
            {
                kind: 'resource_upsert',
                origin: 'https://example.com',
                item: { type: 'localStorage', key: 'syn-key', value: 'syn-value' }
            }
        ]);
        sync.stop();
    });

    it('runs a queued refresh after an overlapping reconnect refresh settles', async () => {
        const api = makeChrome();
        vi.stubGlobal('chrome', api);
        const firstRefresh = Promise.withResolvers<'disconnected'>();
        const sent = vi
            .fn()
            .mockResolvedValueOnce(null)
            .mockReturnValueOnce(firstRefresh.promise)
            .mockResolvedValueOnce(null);
        const sync = createResourceSync(sent, 60_000);
        await sync.start();
        await sync.subscribe('https://example.com', {
            type: 'cookie',
            name: syntheticCookie.name,
            domain: syntheticCookie.domain,
            path: syntheticCookie.path,
            partitionKey: syntheticCookie.partitionKey,
            storeId: syntheticCookie.storeId
        });
        sent.mockClear();

        const staleRefresh = sync.refresh();
        await waitFor(() => expect(sent).toHaveBeenCalledTimes(1));
        const reconnectRefresh = sync.refresh();
        firstRefresh.resolve('disconnected');
        await Promise.all([staleRefresh, reconnectRefresh]);

        expect(sent).toHaveBeenCalledTimes(2);
        expect(sent).toHaveBeenLastCalledWith(
            expect.objectContaining({
                kind: 'resource_upsert',
                item: expect.objectContaining({ type: 'cookie', value: 'synthetic-cookie-value' })
            })
        );
        sync.stop();
    });

    it('reloads persisted subscriptions and pushes from a durable alarm wakeup', async () => {
        const api = makeChrome();
        api.__stored.resourceSubscriptions = [{ type: 'localStorage', origin: 'https://example.com', key: 'syn-key' }];
        vi.stubGlobal('chrome', api);
        const sent = vi.fn().mockResolvedValue(null);

        const sync = createResourceSync(sent, 60_000);
        api.__events.alarm.emit({ name: 'resource-local-storage-poll', scheduledTime: Date.now() });

        await waitFor(() =>
            expect(sent).toHaveBeenCalledWith({
                kind: 'resource_upsert',
                origin: 'https://example.com',
                item: { type: 'localStorage', key: 'syn-key', value: 'syn-value' }
            })
        );
        expect(api.alarms.create).toHaveBeenCalledWith('resource-local-storage-poll', {
            periodInMinutes: 1
        });
        sync.stop();
    });

    it('normalizes persisted subscriptions before exposing or persisting them', async () => {
        const api = makeChrome();
        api.__stored.resourceSubscriptions = [
            {
                type: 'cookie',
                origin: 'https://example.com',
                name: syntheticCookie.name,
                domain: syntheticCookie.domain,
                path: syntheticCookie.path,
                partitionKey: syntheticCookie.partitionKey,
                storeId: syntheticCookie.storeId,
                value: 'stored-cookie-value'
            },
            {
                type: 'localStorage',
                origin: 'https://example.com',
                key: 'syn-key',
                value: 'stored-local-value'
            }
        ];
        vi.stubGlobal('chrome', api);
        const sync = createResourceSync(vi.fn().mockResolvedValue(null), 60_000);

        expect(await sync.status()).toEqual({
            ok: true,
            items: [
                {
                    type: 'cookie',
                    origin: 'https://example.com',
                    name: 'syn-cookie',
                    domain: '.example.com',
                    path: '/',
                    partitionKey: { topLevelSite: 'https://example.com' },
                    storeId: '0',
                    paused: false,
                    error: null
                },
                {
                    type: 'localStorage',
                    origin: 'https://example.com',
                    key: 'syn-key',
                    paused: false,
                    error: null
                }
            ]
        });

        await sync.unsubscribe('https://example.com', {
            type: 'cookie',
            name: syntheticCookie.name,
            domain: syntheticCookie.domain,
            path: syntheticCookie.path,
            partitionKey: syntheticCookie.partitionKey,
            storeId: syntheticCookie.storeId
        });
        expect(api.__stored.resourceSubscriptions).toEqual([
            { type: 'localStorage', origin: 'https://example.com', key: 'syn-key' }
        ]);
        sync.stop();
    });

    it('clears a durable polling alarm when revival has no localStorage subscriptions', async () => {
        const api = makeChrome();
        vi.stubGlobal('chrome', api);
        const sync = createResourceSync(vi.fn().mockResolvedValue(null), 60_000);

        await sync.start();

        expect(api.alarms.clear).toHaveBeenCalledWith('resource-local-storage-poll');
        expect(api.alarms.create).not.toHaveBeenCalled();
        sync.stop();
    });

    it('clears a durable polling alarm when revival finds every subscription paused', async () => {
        const api = makeChrome();
        api.__stored.resourceSubscriptions = [{ type: 'localStorage', origin: 'https://example.com', key: 'syn-key' }];
        api.__tabs.splice(0, 2);
        vi.stubGlobal('chrome', api);
        const sync = createResourceSync(vi.fn().mockResolvedValue(null), 60_000);

        await sync.start();

        expect(api.alarms.clear).toHaveBeenCalledWith('resource-local-storage-poll');
        expect(api.alarms.create).not.toHaveBeenCalled();
        sync.stop();
    });

    it('rejects new subscriptions when the origin permission is gone', async () => {
        const api = makeChrome();
        api.permissions.contains.mockResolvedValue(false);
        vi.stubGlobal('chrome', api);
        const sent = vi.fn().mockResolvedValue(null);
        const sync = createResourceSync(sent, 60_000);
        await sync.start();

        await expect(sync.subscribe('https://example.com', { type: 'localStorage', key: 'syn-key' })).resolves.toEqual({
            ok: false,
            error: 'permission_denied'
        });
        expect(api.storage.local.set).not.toHaveBeenCalled();
        expect(sent).not.toHaveBeenCalled();
        sync.stop();
    });
});

describe('client resource apply', () => {
    const replyTo = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';

    const clientChrome = () => {
        const api = makeChrome();
        const created = new Map<number, { id: number; url: string; incognito: boolean; status: string }>();
        return {
            ...api,
            cookies: {
                ...api.cookies,
                set: vi.fn(async (details: chrome.cookies.SetDetails) => details)
            },
            tabs: {
                ...api.tabs,
                get: vi.fn(async (id: number) => {
                    const found = api.__tabs.find((tab) => tab.id === id) ?? created.get(id);
                    if (!found) throw new Error('missing tab');
                    return found;
                }),
                create: vi.fn(async ({ url }: { url: string }) => {
                    const tab = { id: 90 + created.size, url, incognito: false, status: 'complete' };
                    created.set(tab.id, tab);
                    return tab;
                }),
                remove: vi.fn(async () => undefined)
            }
        };
    };

    const request = (role: 'host' | 'client', item: unknown, authorized = true) => ({
        role,
        authorized,
        replyTo,
        origin: 'https://example.com',
        item
    });

    it('writes a domain cookie with partition and expiry, and a host-only session cookie without domain', async () => {
        const api = clientChrome();
        vi.stubGlobal('chrome', api);
        const client = createResourceClient();

        await expect(
            client.apply(
                request('client', {
                    type: 'cookie',
                    name: 'syn-cookie',
                    domain: '.example.com',
                    path: '/account',
                    secure: true,
                    httpOnly: true,
                    sameSite: 'lax',
                    session: false,
                    expirationDate: 2_000_000_000,
                    partitionKey: { topLevelSite: 'https://example.com', hasCrossSiteAncestor: false },
                    value: 'synthetic-cookie-value'
                })
            )
        ).resolves.toEqual({
            kind: 'resource_applied',
            replyTo,
            origin: 'https://example.com',
            type: 'cookie',
            id: 'syn-cookie'
        });
        expect(api.cookies.set).toHaveBeenCalledWith({
            url: 'https://example.com/account',
            domain: '.example.com',
            name: 'syn-cookie',
            value: 'synthetic-cookie-value',
            path: '/account',
            secure: true,
            httpOnly: true,
            sameSite: 'lax',
            expirationDate: 2_000_000_000,
            partitionKey: { topLevelSite: 'https://example.com', hasCrossSiteAncestor: false }
        });

        await client.apply(
            request('client', {
                type: 'cookie',
                name: 'syn-host',
                domain: 'example.com',
                path: '/',
                secure: true,
                httpOnly: true,
                sameSite: 'strict',
                session: true,
                expirationDate: 2_000_000_000,
                partitionKey: { topLevelSite: 'https://example.com' },
                value: 'synthetic-host-value'
            })
        );
        expect(api.cookies.set).toHaveBeenLastCalledWith({
            url: 'https://example.com/',
            name: 'syn-host',
            value: 'synthetic-host-value',
            path: '/',
            secure: true,
            httpOnly: true,
            sameSite: 'strict',
            partitionKey: { topLevelSite: 'https://example.com' }
        });
    });

    it('does not write when the role is host, the peer is unauthorized, or the item is malformed', async () => {
        const api = clientChrome();
        vi.stubGlobal('chrome', api);
        const client = createResourceClient();
        const item = {
            type: 'cookie',
            name: 'syn-cookie',
            domain: '.example.com',
            path: '/',
            secure: true,
            httpOnly: true,
            sameSite: 'lax',
            session: true,
            value: 'synthetic-cookie-value'
        };

        await expect(client.apply(request('host', item))).resolves.toEqual({
            kind: 'resource_error',
            replyTo,
            error: 'failed'
        });
        await expect(client.apply(request('client', item, false))).resolves.toEqual({
            kind: 'resource_error',
            replyTo,
            error: 'disconnected'
        });
        await expect(client.apply(request('client', { ...item, extra: true }))).resolves.toMatchObject({
            kind: 'resource_error',
            error: 'malformed'
        });
        expect(api.cookies.set).not.toHaveBeenCalled();
        expect(api.tabs.create).not.toHaveBeenCalled();
    });

    it('rejects an oversize item before opening a tab or writing a cookie', async () => {
        const api = clientChrome();
        api.tabs.query.mockResolvedValue([]);
        vi.stubGlobal('chrome', api);
        const client = createResourceClient();
        const value = 'x'.repeat(49 * 1024);

        await expect(
            client.apply(
                request('client', {
                    type: 'cookie',
                    name: 'syn-cookie',
                    domain: '.example.com',
                    path: '/',
                    secure: true,
                    httpOnly: true,
                    sameSite: 'lax',
                    session: true,
                    value
                })
            )
        ).resolves.toMatchObject({ kind: 'resource_error', error: 'oversized' });
        await expect(
            client.apply(request('client', { type: 'localStorage', key: 'syn-key', value }))
        ).resolves.toMatchObject({ kind: 'resource_error', error: 'oversized' });

        expect(api.cookies.set).not.toHaveBeenCalled();
        expect(api.tabs.create).not.toHaveBeenCalled();
        expect(api.scripting.executeScript).not.toHaveBeenCalled();
    });

    it('opens one background tab per origin, reuses it, and closes only that tab when the last key is released', async () => {
        const api = clientChrome();
        api.tabs.query.mockResolvedValue([]);
        vi.stubGlobal('chrome', api);
        const client = createResourceClient();
        const item = (key: string) => ({ type: 'localStorage', key, value: 'synthetic-storage-value' });

        await expect(client.apply(request('client', item('syn-a')))).resolves.toEqual({
            kind: 'resource_applied',
            replyTo,
            origin: 'https://example.com',
            type: 'localStorage',
            id: 'syn-a'
        });
        await expect(client.apply(request('client', item('syn-b')))).resolves.toMatchObject({
            kind: 'resource_applied',
            id: 'syn-b'
        });

        expect(api.tabs.create).toHaveBeenCalledTimes(1);
        expect(api.tabs.create).toHaveBeenCalledWith({ url: 'https://example.com/', active: false });
        expect(api.scripting.executeScript).toHaveBeenCalledTimes(2);

        await client.releaseLocalStorage('https://example.com', 'syn-a');
        expect(api.tabs.remove).not.toHaveBeenCalled();
        await client.releaseLocalStorage('https://example.com', 'syn-b');
        expect(api.tabs.remove).toHaveBeenCalledTimes(1);
        expect(api.tabs.remove).toHaveBeenCalledWith(90);
    });

    it('shares one in-flight tab open when two same-origin applies race', async () => {
        const api = clientChrome();
        api.tabs.query.mockResolvedValue([]);
        const loading = { id: 90, url: 'about:blank', incognito: false, status: 'loading' };
        api.tabs.create.mockResolvedValue(loading);
        api.tabs.get.mockResolvedValue(loading);
        vi.stubGlobal('chrome', api);
        const client = createResourceClient();
        const item = (key: string) => ({ type: 'localStorage', key, value: 'synthetic-storage-value' });

        const first = client.apply(request('client', item('syn-a')));
        await vi.waitFor(() => expect(api.tabs.get).toHaveBeenCalled());
        expect(api.tabs.create).toHaveBeenCalledTimes(1);
        const second = client.apply(request('client', item('syn-b')));
        await Promise.resolve();
        expect(api.tabs.create).toHaveBeenCalledTimes(1);

        const ready = { id: 90, url: 'https://example.com/', incognito: false, status: 'complete' };
        api.tabs.get.mockResolvedValue(ready);
        api.tabs.onUpdated.emit(90, { status: 'complete' }, ready);

        await expect(first).resolves.toMatchObject({ kind: 'resource_applied', id: 'syn-a' });
        await expect(second).resolves.toMatchObject({ kind: 'resource_applied', id: 'syn-b' });
        expect(api.tabs.create).toHaveBeenCalledTimes(1);
        expect(api.scripting.executeScript).toHaveBeenCalledTimes(2);
    });

    it('reuses a user tab and never closes it when the last localStorage key is released', async () => {
        const api = clientChrome();
        api.__tabs[0] = { ...api.__tabs[0], status: 'complete' } as (typeof api.__tabs)[number];
        vi.stubGlobal('chrome', api);
        const client = createResourceClient();

        await expect(
            client.apply(request('client', { type: 'localStorage', key: 'syn-key', value: 'synthetic-storage-value' }))
        ).resolves.toMatchObject({ kind: 'resource_applied', id: 'syn-key' });

        expect(api.tabs.create).not.toHaveBeenCalled();
        expect(api.scripting.executeScript).toHaveBeenCalledWith(
            expect.objectContaining({ target: { tabId: 1 }, args: ['syn-key', 'synthetic-storage-value'] })
        );
        await client.releaseLocalStorage('https://example.com', 'syn-key');
        expect(api.tabs.remove).not.toHaveBeenCalled();
    });

    it('returns no_document and does not write when the opened tab never finishes loading', async () => {
        const api = clientChrome();
        const loading = { id: 44, url: 'https://example.com/', incognito: false, status: 'loading' };
        api.tabs.query.mockResolvedValue([]);
        api.tabs.create.mockResolvedValue(loading);
        api.tabs.get.mockResolvedValue(loading);
        vi.stubGlobal('chrome', api);
        const client = createResourceClient(20);

        await expect(
            client.apply(request('client', { type: 'localStorage', key: 'syn-key', value: 'synthetic-storage-value' }))
        ).resolves.toEqual({
            kind: 'resource_error',
            replyTo,
            error: 'no_document'
        });
        expect(api.scripting.executeScript).not.toHaveBeenCalled();
    });

    it('sends host-only cookies without a leading dot or expiry, and prefixes domain cookies', async () => {
        const api = makeChrome();
        api.cookies.getAll.mockResolvedValue([
            { ...syntheticCookie, domain: 'example.com', hostOnly: true, session: true, partitionKey: undefined }
        ]);
        vi.stubGlobal('chrome', api);
        const sent = vi.fn().mockResolvedValue(null);
        const sync = createResourceSync(sent, 60_000);
        await sync.start();
        await sync.subscribe('https://example.com', {
            type: 'cookie',
            name: syntheticCookie.name,
            domain: 'example.com',
            path: syntheticCookie.path,
            storeId: syntheticCookie.storeId
        });

        expect(sent.mock.calls[0][0].item.domain).toBe('example.com');
        expect(sent.mock.calls[0][0].item).not.toHaveProperty('expirationDate');
        sync.stop();

        sent.mockClear();
        api.cookies.getAll.mockResolvedValue([
            { ...syntheticCookie, domain: 'example.com', hostOnly: false, partitionKey: undefined }
        ]);
        const domainSync = createResourceSync(sent, 60_000);
        await domainSync.start();
        await domainSync.subscribe('https://example.com', {
            type: 'cookie',
            name: syntheticCookie.name,
            domain: 'example.com',
            path: syntheticCookie.path,
            storeId: syntheticCookie.storeId
        });
        expect(sent.mock.calls[0][0].item.domain).toBe('.example.com');
        domainSync.stop();
    });
});

describe('ResourceSitePanel', () => {
    beforeEach(() => {
        const api = makeChrome();
        api.runtime.sendMessage.mockImplementation(async ({ type }: { type: MSG }) => {
            if (type === MSG.RESOURCE_LIST_SITES) return { ok: true, origins: ['https://example.com'] };
            if (type === MSG.RESOURCE_ENABLE) return { ok: true };
            if (type === MSG.RESOURCE_LIST_ITEMS) {
                return {
                    ok: true,
                    cookies: [
                        {
                            name: 'syn-cookie',
                            domain: '.example.com',
                            path: '/',
                            secure: true,
                            httpOnly: true,
                            sameSite: 'lax',
                            session: false,
                            storeId: '0',
                            size: 36
                        }
                    ],
                    localStorage: { readable: true, items: [{ key: 'syn-key', size: 24 }] }
                };
            }
            return { ok: false, error: 'failed' };
        });
        vi.stubGlobal('chrome', api);
    });

    it('shows persisted status and routes checkbox changes without remote deletes', async () => {
        (chrome.runtime.sendMessage as Mock).mockImplementation(async ({ type }: { type: MSG; payload?: unknown }) => {
            if (type === MSG.RESOURCE_LIST_SITES) return { ok: true, origins: ['https://example.com'] };
            if (type === MSG.RESOURCE_ENABLE || type === MSG.RESOURCE_SUBSCRIBE || type === MSG.RESOURCE_UNSUBSCRIBE) {
                return { ok: true };
            }
            if (type === MSG.RESOURCE_LIST_ITEMS) {
                return {
                    ok: true,
                    cookies: [
                        {
                            name: 'syn-cookie',
                            domain: '.example.com',
                            path: '/',
                            secure: true,
                            httpOnly: true,
                            sameSite: 'lax',
                            session: false,
                            storeId: '0',
                            size: 36
                        }
                    ],
                    localStorage: {
                        readable: true,
                        items: [
                            { key: 'syn-key', size: 24 },
                            { key: 'new-key', size: 16 }
                        ]
                    }
                };
            }
            if (type === MSG.RESOURCE_STATUS) {
                return {
                    ok: true,
                    items: [
                        {
                            type: 'cookie',
                            origin: 'https://example.com',
                            name: 'syn-cookie',
                            domain: '.example.com',
                            path: '/',
                            storeId: '0',
                            paused: false,
                            error: null
                        },
                        {
                            type: 'localStorage',
                            origin: 'https://example.com',
                            key: 'syn-key',
                            paused: true,
                            error: null
                        }
                    ]
                };
            }
            return { ok: false, error: 'failed' };
        });
        render(h(ResourceSitePanel, {}));
        fireEvent.change(await screen.findByRole('combobox'), {
            target: { value: 'https://example.com' }
        });

        const cookie = await screen.findByRole('checkbox', { name: 'syn-cookie' });
        const pausedStorage = screen.getByRole('checkbox', { name: 'syn-key' });
        const newStorage = screen.getByRole('checkbox', { name: 'new-key' });
        expect((cookie as HTMLInputElement).checked).toBe(true);
        expect((pausedStorage as HTMLInputElement).checked).toBe(true);
        expect((newStorage as HTMLInputElement).checked).toBe(false);
        expect(screen.getByText('resourcePaused')).toBeTruthy();

        fireEvent.click(cookie);
        fireEvent.click(newStorage);

        await waitFor(() =>
            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
                type: MSG.RESOURCE_UNSUBSCRIBE,
                payload: {
                    origin: 'https://example.com',
                    item: {
                        type: 'cookie',
                        name: 'syn-cookie',
                        domain: '.example.com',
                        path: '/',
                        storeId: '0'
                    }
                }
            })
        );
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            type: MSG.RESOURCE_SUBSCRIBE,
            payload: {
                origin: 'https://example.com',
                item: { type: 'localStorage', key: 'new-key' }
            }
        });
        expect(chrome.cookies.remove).not.toHaveBeenCalled();
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('requests site access from selection and renders metadata but no values', async () => {
        render(h(ResourceSitePanel, {}));
        const select = await screen.findByRole('combobox', { name: 'resourceSiteLabel' });

        fireEvent.change(select, { target: { value: 'https://example.com' } });

        await waitFor(() =>
            expect(chrome.permissions.request).toHaveBeenCalledWith({
                permissions: ['cookies', 'scripting'],
                origins: ['https://example.com/*']
            })
        );
        await screen.findByText('syn-cookie');
        expect(screen.getByText('syn-key')).toBeTruthy();
        expect(document.body.textContent).not.toContain('synthetic-cookie-value');
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            type: MSG.RESOURCE_ENABLE,
            payload: { origin: 'https://example.com' }
        });
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            type: MSG.RESOURCE_LIST_ITEMS,
            payload: { origin: 'https://example.com' }
        });
    });

    it('keeps partitioned cookies distinct across rerenders', async () => {
        (chrome.runtime.sendMessage as Mock).mockImplementation(async ({ type }: { type: MSG }) => {
            if (type === MSG.RESOURCE_LIST_SITES) return { ok: true, origins: ['https://example.com'] };
            if (type === MSG.RESOURCE_ENABLE) return { ok: true };
            return {
                ok: true,
                cookies: [
                    {
                        name: 'partitioned-cookie',
                        domain: '.example.com',
                        path: '/',
                        secure: true,
                        httpOnly: true,
                        sameSite: 'no_restriction',
                        session: false,
                        storeId: '0',
                        partitionKey: { topLevelSite: 'https://first.example' },
                        size: 24
                    },
                    {
                        name: 'partitioned-cookie',
                        domain: '.example.com',
                        path: '/',
                        secure: true,
                        httpOnly: true,
                        sameSite: 'no_restriction',
                        session: false,
                        storeId: '0',
                        partitionKey: { topLevelSite: 'https://second.example' },
                        size: 24
                    }
                ],
                localStorage: { readable: true, items: [] }
            };
        });
        const view = render(h(ResourceSitePanel, {}));
        fireEvent.change(await screen.findByRole('combobox'), {
            target: { value: 'https://example.com' }
        });
        await screen.findAllByText('partitioned-cookie');

        view.rerender(h(ResourceSitePanel, {}));

        expect(screen.getAllByText('partitioned-cookie')).toHaveLength(2);
        expect(screen.getByText(/https:\/\/first\.example/)).toBeTruthy();
        expect(screen.getByText(/https:\/\/second\.example/)).toBeTruthy();
    });

    it('keeps item lists empty when site access is denied', async () => {
        (chrome.permissions.request as Mock).mockResolvedValue(false);
        render(h(ResourceSitePanel, {}));

        fireEvent.change(await screen.findByRole('combobox'), {
            target: { value: 'https://example.com' }
        });

        await screen.findByText('resourcePermissionDenied');
        expect(screen.queryByRole('checkbox')).toBeNull();
        expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
            expect.objectContaining({ type: MSG.RESOURCE_ENABLE })
        );
    });

    it('renders only the latest site when an older selection resolves last', async () => {
        const api = makeChrome();
        let resolveFirst: ((value: boolean) => void) | undefined;
        api.runtime.sendMessage.mockImplementation(
            async ({ type, payload }: { type: MSG; payload?: { origin?: string } }) => {
                if (type === MSG.RESOURCE_LIST_SITES) {
                    return { ok: true, origins: ['https://a.example', 'https://b.example'] };
                }
                if (type === MSG.RESOURCE_ENABLE || type === MSG.RESOURCE_STATUS) return { ok: true, items: [] };
                if (type === MSG.RESOURCE_LIST_ITEMS) {
                    const origin = payload?.origin;
                    if (origin === 'https://a.example') {
                        await new Promise<boolean>((resolve) => {
                            resolveFirst = resolve;
                        });
                    }
                    return {
                        ok: true,
                        cookies: [],
                        localStorage: {
                            readable: true,
                            items: [{ key: origin === 'https://a.example' ? 'a-key' : 'b-key', size: 1 }]
                        }
                    };
                }
                return { ok: false, error: 'failed' };
            }
        );
        vi.stubGlobal('chrome', api);
        render(h(ResourceSitePanel, {}));
        const select = await screen.findByRole('combobox');

        fireEvent.change(select, { target: { value: 'https://a.example' } });
        await waitFor(() =>
            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
                type: MSG.RESOURCE_LIST_ITEMS,
                payload: { origin: 'https://a.example' }
            })
        );
        fireEvent.change(select, { target: { value: 'https://b.example' } });
        await screen.findByText('b-key');
        await act(async () => resolveFirst?.(true));

        await waitFor(() => expect(screen.queryByText('a-key')).toBeNull());
        expect(screen.getByText('b-key')).toBeTruthy();
    });

    it("ignores an old site's status poll after a new site loads", async () => {
        const api = makeChrome();
        const staleStatus = Promise.withResolvers<{ ok: true; items: [] }>();
        let statusCalls = 0;
        let poll: (() => void) | undefined;
        const intervalHandle = 1 as unknown as NodeJS.Timeout;
        vi.spyOn(window, 'setInterval').mockImplementation((handler: TimerHandler, timeout?: number) => {
            if (timeout === 2_000) poll = handler as () => void;
            return intervalHandle;
        });
        api.runtime.sendMessage.mockImplementation(
            async ({ type, payload }: { type: MSG; payload?: { origin?: string } }) => {
                if (type === MSG.RESOURCE_LIST_SITES) {
                    return { ok: true, origins: ['https://a.example', 'https://b.example'] };
                }
                if (type === MSG.RESOURCE_ENABLE) return { ok: true };
                if (type === MSG.RESOURCE_LIST_ITEMS) {
                    return {
                        ok: true,
                        cookies: [],
                        localStorage: {
                            readable: true,
                            items: [{ key: payload?.origin === 'https://a.example' ? 'a-key' : 'b-key', size: 1 }]
                        }
                    };
                }
                if (type === MSG.RESOURCE_STATUS) {
                    statusCalls += 1;
                    if (statusCalls === 2) return staleStatus.promise;
                    const origin = statusCalls === 1 ? 'https://a.example' : 'https://b.example';
                    return {
                        ok: true,
                        items: [
                            {
                                type: 'localStorage',
                                origin,
                                key: origin.endsWith('a.example') ? 'a-key' : 'b-key',
                                paused: false,
                                error: null
                            }
                        ]
                    };
                }
                return { ok: false, error: 'failed' };
            }
        );
        vi.stubGlobal('chrome', api);
        render(h(ResourceSitePanel, {}));
        const select = await screen.findByRole('combobox');

        fireEvent.change(select, { target: { value: 'https://a.example' } });
        const aCheckbox = await screen.findByRole('checkbox', { name: 'a-key' });
        expect((aCheckbox as HTMLInputElement).checked).toBe(true);
        await waitFor(() => expect(poll).toBeTypeOf('function'));
        act(() => poll?.());
        await waitFor(() => expect(statusCalls).toBe(2));

        fireEvent.change(select, { target: { value: 'https://b.example' } });
        const bCheckbox = await screen.findByRole('checkbox', { name: 'b-key' });
        expect((bCheckbox as HTMLInputElement).checked).toBe(true);
        await act(async () => staleStatus.resolve({ ok: true, items: [] }));

        expect((screen.getByRole('checkbox', { name: 'b-key' }) as HTMLInputElement).checked).toBe(true);
    });

    it('clears a denied selection error when the next site succeeds', async () => {
        const api = makeChrome();
        api.runtime.sendMessage.mockImplementation(async ({ type }: { type: MSG }) => {
            if (type === MSG.RESOURCE_LIST_SITES) {
                return { ok: true, origins: ['https://denied.example', 'https://example.com'] };
            }
            if (type === MSG.RESOURCE_ENABLE) return { ok: true };
            if (type === MSG.RESOURCE_STATUS) return { ok: true, items: [] };
            if (type === MSG.RESOURCE_LIST_ITEMS) {
                return {
                    ok: true,
                    cookies: [],
                    localStorage: { readable: true, items: [{ key: 'recovered-key', size: 1 }] }
                };
            }
            return { ok: false, error: 'failed' };
        });
        api.permissions.request.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
        vi.stubGlobal('chrome', api);
        render(h(ResourceSitePanel, {}));
        const select = await screen.findByRole('combobox');

        fireEvent.change(select, { target: { value: 'https://denied.example' } });
        await screen.findByText('resourcePermissionDenied');
        fireEvent.change(select, { target: { value: 'https://example.com' } });

        await screen.findByText('recovered-key');
        expect(screen.queryByText('resourcePermissionDenied')).toBeNull();
    });

    it('ignores a failed toggle after another site is selected', async () => {
        const api = makeChrome();
        let resolveToggle: ((value: { ok: false; error: 'failed' }) => void) | undefined;
        api.runtime.sendMessage.mockImplementation(
            async ({ type, payload }: { type: MSG; payload?: { origin?: string } }) => {
                if (type === MSG.RESOURCE_LIST_SITES) {
                    return { ok: true, origins: ['https://a.example', 'https://b.example'] };
                }
                if (type === MSG.RESOURCE_ENABLE || type === MSG.RESOURCE_STATUS) return { ok: true, items: [] };
                if (type === MSG.RESOURCE_LIST_ITEMS) {
                    const origin = payload?.origin;
                    return {
                        ok: true,
                        cookies: [],
                        localStorage: {
                            readable: true,
                            items: [{ key: origin === 'https://a.example' ? 'a-key' : 'b-key', size: 1 }]
                        }
                    };
                }
                if (type === MSG.RESOURCE_SUBSCRIBE) {
                    return new Promise<{ ok: false; error: 'failed' }>((resolve) => {
                        resolveToggle = resolve;
                    });
                }
                return { ok: false, error: 'failed' };
            }
        );
        vi.stubGlobal('chrome', api);
        render(h(ResourceSitePanel, {}));
        const select = await screen.findByRole('combobox');

        fireEvent.change(select, { target: { value: 'https://a.example' } });
        fireEvent.click(await screen.findByRole('checkbox', { name: 'a-key' }));
        await waitFor(() =>
            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
                type: MSG.RESOURCE_SUBSCRIBE,
                payload: {
                    origin: 'https://a.example',
                    item: { type: 'localStorage', key: 'a-key' }
                }
            })
        );
        fireEvent.change(select, { target: { value: 'https://b.example' } });
        await screen.findByRole('checkbox', { name: 'b-key' });
        await act(async () => resolveToggle?.({ ok: false, error: 'failed' }));

        expect(screen.queryByText('resourceSyncFailed')).toBeNull();
        expect(screen.getByRole('checkbox', { name: 'b-key' })).toBeTruthy();
    });

    it('shows unreadable storage distinctly from an empty store', async () => {
        (chrome.runtime.sendMessage as Mock).mockImplementation(async ({ type }: { type: MSG }) => {
            if (type === MSG.RESOURCE_LIST_SITES) return { ok: true, origins: ['https://example.com'] };
            if (type === MSG.RESOURCE_ENABLE) return { ok: true };
            return {
                ok: true,
                cookies: [],
                localStorage: { readable: false, items: [] }
            };
        });
        render(h(ResourceSitePanel, {}));
        fireEvent.change(await screen.findByRole('combobox'), {
            target: { value: 'https://example.com' }
        });

        await screen.findByText('resourceStorageUnreadable');
        expect(screen.queryByRole('checkbox')).toBeNull();
    });

    it('stops before listing when the worker no longer sees site permission', async () => {
        (chrome.runtime.sendMessage as Mock).mockImplementation(async ({ type }: { type: MSG }) => {
            if (type === MSG.RESOURCE_LIST_SITES) return { ok: true, origins: ['https://example.com'] };
            if (type === MSG.RESOURCE_ENABLE) return { ok: false, error: 'permission_denied' };
            return { ok: false, error: 'failed' };
        });
        render(h(ResourceSitePanel, {}));
        fireEvent.change(await screen.findByRole('combobox'), {
            target: { value: 'https://example.com' }
        });

        await screen.findByText('resourcePermissionDenied');
        expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
            expect.objectContaining({ type: MSG.RESOURCE_LIST_ITEMS })
        );
    });
});
