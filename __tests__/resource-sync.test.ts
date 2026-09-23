import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { h } from 'preact';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { enableResourceOrigin, listResourceItems, listResourceSites } from '@/background/apps/resources';
import { ResourceSitePanel } from '@/pages/resources/site-panel';
import { MSG } from '@/shared/constants';

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

const makeChrome = () => ({
    tabs: {
        query: vi.fn().mockResolvedValue([
            { id: 1, url: 'https://example.com/account', incognito: false },
            { id: 2, url: 'https://example.com/other', incognito: false },
            { id: 3, url: 'http://other.example/path', incognito: false },
            { id: 4, url: 'chrome://extensions', incognito: false },
            { id: 5, url: 'https://private.example/', incognito: true }
        ])
    },
    permissions: {
        contains: vi.fn().mockResolvedValue(true),
        request: vi.fn().mockResolvedValue(true)
    },
    cookies: {
        getAll: vi.fn().mockResolvedValue([syntheticCookie])
    },
    scripting: {
        executeScript: vi.fn(async ({ func }: { func: () => unknown }) => [{ result: func() }])
    },
    runtime: {
        sendMessage: vi.fn()
    },
    i18n: {
        getMessage: (key: string) => key
    }
});

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
