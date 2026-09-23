import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { h } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createResourceClient } from '@/background/apps/resources';
import { ClientGrantPanel } from '@/pages/resources/client-grant';
import { MSG, PAYLOAD_RESPONSE_KIND, RESOURCE_ERROR } from '@/shared/constants';

const connectionId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const otherConnectionId = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const origin = 'https://example.com';
const cookie = {
    type: 'cookie' as const,
    name: 'syn-cookie',
    domain: '.example.com',
    path: '/',
    secure: true,
    httpOnly: false,
    sameSite: 'lax' as const,
    session: true,
    value: 'synthetic-cookie-value'
};
const storage = {
    type: 'localStorage' as const,
    key: 'syn-key',
    value: 'synthetic-storage-value'
};

const chromeForApply = () => {
    const set = vi.fn(async (details: chrome.cookies.SetDetails) => details);
    return {
        chrome: {
            permissions: { contains: vi.fn().mockResolvedValue(false) },
            cookies: { set },
            tabs: {
                query: vi.fn().mockResolvedValue([]),
                get: vi.fn(),
                create: vi.fn(),
                remove: vi.fn(),
                onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
                onUpdated: { addListener: vi.fn(), removeListener: vi.fn() }
            },
            scripting: { executeScript: vi.fn() }
        },
        set
    };
};

const request = (item: unknown, id = connectionId) => ({
    role: 'client' as const,
    authorized: true,
    replyTo: 'peer-request',
    origin,
    item,
    connectionId: id
});

describe('client origin grant', () => {
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('records every denied identity and writes nothing until the same connection is granted', async () => {
        const { chrome, set } = chromeForApply();
        vi.stubGlobal('chrome', chrome);
        const client = createResourceClient();

        await expect(client.apply(request(cookie))).resolves.toMatchObject({
            kind: PAYLOAD_RESPONSE_KIND.RESOURCE_ERROR,
            error: RESOURCE_ERROR.PERMISSION_DENIED
        });
        await expect(client.apply(request(storage))).resolves.toMatchObject({
            error: RESOURCE_ERROR.PERMISSION_DENIED
        });
        expect(set).not.toHaveBeenCalled();
        expect(client.pendingOrigins(connectionId)).toEqual([origin]);
        expect(JSON.stringify(client.pendingOrigins(connectionId))).not.toContain('synthetic-cookie-value');
        expect(JSON.stringify(client.pendingOrigins(connectionId))).not.toContain('synthetic-storage-value');

        await expect(client.retryDenied(connectionId, origin)).resolves.toEqual({
            ok: false,
            error: RESOURCE_ERROR.PERMISSION_DENIED
        });
        expect(set).not.toHaveBeenCalled();

        await expect(client.retryDenied(otherConnectionId, origin)).resolves.toEqual({
            ok: false,
            error: RESOURCE_ERROR.DISCONNECTED
        });
        expect(client.pendingOrigins(connectionId)).toEqual([]);
    });

    it('replays every held identity after the live connection is granted', async () => {
        const { chrome, set } = chromeForApply();
        vi.stubGlobal('chrome', chrome);
        const client = createResourceClient();
        await client.apply(request(cookie));
        await client.apply(request(storage));
        chrome.permissions.contains.mockResolvedValue(true);
        chrome.tabs.query.mockResolvedValue([{ id: 7, url: `${origin}/`, incognito: false, status: 'complete' }]);
        chrome.tabs.get.mockResolvedValue({ id: 7, url: `${origin}/`, incognito: false, status: 'complete' });
        chrome.scripting.executeScript.mockResolvedValue([{ result: true }]);

        await expect(client.retryDenied(connectionId, origin)).resolves.toEqual({ ok: true });

        expect(set).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'syn-cookie', value: 'synthetic-cookie-value' })
        );
        expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
            expect.objectContaining({ args: ['syn-key', 'synthetic-storage-value'] })
        );
        expect(client.pendingOrigins(connectionId)).toEqual([]);
    });

    it('does not apply a later held item after disconnect clears the pair', async () => {
        const { chrome, set } = chromeForApply();
        vi.stubGlobal('chrome', chrome);
        const client = createResourceClient();
        await client.apply(request(cookie));
        await client.apply(request(storage));
        chrome.permissions.contains.mockResolvedValue(true);
        set.mockImplementation(async (details: chrome.cookies.SetDetails) => {
            client.clearDenied();
            return details;
        });

        await expect(client.retryDenied(connectionId, origin)).resolves.toEqual({
            ok: false,
            error: RESOURCE_ERROR.DISCONNECTED
        });

        expect(set).toHaveBeenCalledTimes(1);
        expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
    });

    it('shows an origin that is denied after the client options page is already open', async () => {
        vi.useFakeTimers();
        const responses = [
            { ok: true, origins: [] as string[] },
            { ok: true, origins: [origin] }
        ];
        const requestPermission = vi.fn().mockResolvedValue(true);
        vi.stubGlobal('chrome', {
            i18n: { getMessage: (key: string) => key },
            runtime: {
                sendMessage: vi.fn(async (message: { type: string }) => {
                    if (message.type === MSG.RESOURCE_CLIENT_PENDING) return responses.shift() ?? responses[0];
                    return { ok: true };
                })
            },
            permissions: { request: requestPermission }
        });

        render(h(ClientGrantPanel, {}));
        expect(screen.queryByRole('button', { name: 'resourceClientGrantAction' })).toBeNull();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(1000);
        });

        expect(await screen.findByRole('button', { name: 'resourceClientGrantAction' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'resourceClientGrantAction' }));
        await act(async () => {
            await Promise.resolve();
        });
        expect(requestPermission).toHaveBeenCalledWith({
            permissions: ['cookies', 'scripting'],
            origins: [`${origin}/*`]
        });
    });
});
