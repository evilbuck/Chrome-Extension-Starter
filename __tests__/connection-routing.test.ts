import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { ERROR_KIND, MSG, OFFSCREEN_TARGET, PAIRING_TRUST_STORAGE_KEY } from '@/shared/constants';
import type { PairingSnapshot } from '@/shared/lib/pairing-protocol';

// Chrome's bundled typings omit the boolean that keeps sendResponse alive.
type Listener = (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
) => boolean | undefined;
const extensionId = 'test-extension';
const url = (path: string) => `chrome-extension://${extensionId}/${path}`;
const optionsSender = { id: extensionId, url: url('options.html'), tab: { id: 1 } } as chrome.runtime.MessageSender;
const workerSender = { id: extensionId, url: url('static/js/background.js') };
const connectionId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const pair = {
    id: connectionId,
    role: 'client' as const,
    peer: { publicKey: 'AAAA', label: 'Other browser' },
    createdAt: 1
};
const idlePairing: PairingSnapshot = {
    phase: 'idle',
    code: null,
    expiresAt: null,
    pending: null,
    pair: null,
    error: null
};
const slackSource = {
    sourceTabId: 1,
    scopeId: 'E01234567',
    workspaceId: 'T01234567',
    userId: 'U01234567',
    enterpriseOrigin: 'https://acme.enterprise.slack.com',
    workspaceOrigin: 'https://acme.slack.com',
    workspaceName: 'Acme'
};

let background: Listener;
let offscreen: Listener;
let getContexts: Mock;
let createDocument: Mock;
let storageGet: Mock;
let offscreenReply: ((message: { type?: string; payload?: unknown }) => unknown) | null;

const deliver = (listener: Listener, message: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> => {
    const { promise, resolve } = Promise.withResolvers<unknown>();
    const pending = listener(message, sender, resolve);
    if (pending !== true) resolve(undefined);
    return promise;
};

const connectedStatus = (authorized: boolean, role: 'host' | 'client') => ({
    ok: true,
    state: 'connected',
    role,
    connectionId,
    authorized,
    pairing: {
        phase: 'connected',
        code: null,
        expiresAt: null,
        pending: null,
        pair: { ...pair, role },
        error: null
    },
    error: null
});

beforeEach(async () => {
    vi.resetModules();
    offscreenReply = null;
    const addListener = vi.fn();
    getContexts = vi.fn().mockResolvedValue([{}]);
    createDocument = vi.fn().mockResolvedValue(undefined);
    storageGet = vi.fn().mockResolvedValue({});
    const local: Record<string, unknown> = {};
    storageGet.mockImplementation(async (key: string) => ({ [key]: local[key] }));
    vi.stubGlobal('chrome', {
        runtime: {
            id: extensionId,
            getURL: url,
            ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
            getContexts,
            onMessage: { addListener },
            sendMessage: (message: { type?: string; target?: string; payload?: unknown }) => {
                if (message.target === OFFSCREEN_TARGET) {
                    if (offscreenReply) return Promise.resolve(offscreenReply(message));
                    return deliver(offscreen, message, workerSender);
                }
                if (message.type === MSG.OFFSCREEN_PAIRING_STORAGE) {
                    return deliver(background, message, { id: extensionId, url: url('offscreen.html') });
                }
                return Promise.resolve(undefined);
            }
        },
        offscreen: {
            Reason: { WEB_RTC: 'WEB_RTC' },
            createDocument,
            closeDocument: vi.fn().mockResolvedValue(undefined)
        },
        storage: {
            local: {
                get: storageGet,
                set: vi.fn(async (values: Record<string, unknown>) => {
                    Object.assign(local, values);
                }),
                remove: vi.fn(async (key: string) => {
                    delete local[key];
                })
            }
        },
        permissions: {
            contains: vi.fn().mockResolvedValue(false)
        }
    });
    // Module listeners bind to this test's Chrome stub.
    await import('@/background/connection');
    background = addListener.mock.calls[0][0];
    await import('@/offscreen/index');
    offscreen = addListener.mock.calls[1][0];
});

afterEach(() => vi.unstubAllGlobals());

describe('extension message sender boundaries', () => {
    it('allows only the offscreen document to persist and forget confirmed pair metadata', async () => {
        getContexts.mockResolvedValue([]);
        const storageCommand = { type: MSG.OFFSCREEN_PAIRING_STORAGE, payload: { action: 'set', pair } };
        expect(await deliver(background, storageCommand, optionsSender)).toEqual({
            ok: false,
            error: ERROR_KIND.INVALID_SENDER_CONTEXT
        });
        expect(await deliver(background, { type: MSG.OPTIONS_GET_STATUS }, optionsSender)).toMatchObject({
            authorized: false,
            pairing: { pair: null }
        });
        const sender = { id: extensionId, url: url('offscreen.html') };
        expect(await deliver(background, storageCommand, sender)).toEqual({ ok: true, value: null });
        expect(await deliver(background, { type: MSG.OPTIONS_GET_STATUS }, optionsSender)).toMatchObject({
            authorized: false,
            pairing: { pair }
        });
        await deliver(
            background,
            {
                type: MSG.OFFSCREEN_PAIRING_STORAGE,
                payload: { action: 'clear' }
            },
            sender
        );
        expect(await deliver(background, { type: MSG.OPTIONS_GET_STATUS }, optionsSender)).toMatchObject({
            authorized: false,
            pairing: { pair: null }
        });
    });

    it('lets an Options tab read the authoritative offscreen status', async () => {
        const status = await deliver(background, { type: MSG.OPTIONS_GET_STATUS }, optionsSender);
        expect(status).toMatchObject({ ok: true, state: 'idle', error: null, authorized: false });
    });

    it('lets the popup read status without tab metadata', async () => {
        const status = await deliver(
            background,
            { type: MSG.OPTIONS_GET_STATUS },
            {
                id: extensionId,
                url: url('popup.html')
            }
        );
        expect(status).toMatchObject({ ok: true, state: 'idle', error: null, authorized: false });
    });

    it.each([
        { id: 'another-extension', url: url('options.html') },
        { id: extensionId, url: 'https://example.com', tab: { id: 1 } },
        { id: extensionId, url: url('offscreen.html') },
        { id: extensionId, url: url('other.html') }
    ])('rejects an unauthorized UI sender: $url / $id', async (sender) => {
        expect(
            await deliver(
                background,
                { type: MSG.PAIRING, payload: { action: 'status' } },
                sender as chrome.runtime.MessageSender
            )
        ).toEqual({ ok: false, error: ERROR_KIND.INVALID_SENDER_CONTEXT });
    });

    it('does not let an offscreen listener race the worker response to an Options command', async () => {
        const response = vi.fn();
        const command = { type: MSG.OPTIONS_GET_STATUS };
        offscreen(command, optionsSender, response);
        background(command, optionsSender, response);
        await vi.waitFor(() => expect(response).toHaveBeenCalledOnce());
        expect(response).toHaveBeenCalledWith(
            expect.objectContaining({ ok: true, state: 'idle', error: null, authorized: false })
        );
    });

    it.each([
        'options.html',
        'popup.html',
        'other.html',
        '_generated_background_page.html'
    ])('rejects a direct offscreen command from an extension document: %s', async (page) => {
        const response = await deliver(
            offscreen,
            { type: MSG.OFFSCREEN_STATUS, target: OFFSCREEN_TARGET },
            {
                id: extensionId,
                url: url(page)
            }
        );
        expect(response).toEqual({ ok: false, error: ERROR_KIND.INVALID_SENDER_CONTEXT });
    });

    it('accepts worker messages when Chrome omits the worker URL', async () => {
        const response = await deliver(
            offscreen,
            { type: MSG.OFFSCREEN_STATUS, target: OFFSCREEN_TARGET },
            {
                id: extensionId
            }
        );
        expect(response).toMatchObject({ ok: true, state: 'idle' });
    });

    it('rejects an unidentified document even if its URL is omitted', async () => {
        const response = await deliver(
            offscreen,
            { type: MSG.OFFSCREEN_STATUS, target: OFFSCREEN_TARGET },
            {
                id: extensionId,
                documentId: 'document-id'
            }
        );
        expect(response).toEqual({ ok: false, error: ERROR_KIND.INVALID_SENDER_CONTEXT });
    });

    it('rejects SLACK_LIST from an unauthorized sender', async () => {
        expect(
            await deliver(background, { type: MSG.SLACK_LIST }, {
                id: extensionId,
                url: 'https://example.com',
                tab: { id: 1 }
            } as chrome.runtime.MessageSender)
        ).toEqual({ ok: false, error: ERROR_KIND.INVALID_SENDER_CONTEXT });
    });

    it('rejects REQUEST_START from the offscreen document', async () => {
        expect(
            await deliver(
                background,
                { type: MSG.REQUEST_START, payload: { applicationKey: 'slack' } },
                { id: extensionId, url: url('offscreen.html') }
            )
        ).toEqual({ ok: false, error: ERROR_KIND.INVALID_SENDER_CONTEXT });
    });

    it('rejects OFFSCREEN_APP_INBOUND from the Options page', async () => {
        expect(
            await deliver(
                background,
                { type: MSG.OFFSCREEN_APP_INBOUND, payload: { kind: 'slack_capture' } },
                optionsSender
            )
        ).toEqual({ ok: false, error: ERROR_KIND.INVALID_SENDER_CONTEXT });
    });
});

describe('pairing command routing', () => {
    it('loads remembered public pair metadata without creating offscreen', async () => {
        getContexts.mockResolvedValue([]);
        storageGet.mockResolvedValue({
            [PAIRING_TRUST_STORAGE_KEY]: {
                id: connectionId,
                role: 'host',
                peer: { publicKey: 'AAAA', label: 'Other browser' },
                createdAt: 1
            }
        });
        const status = await deliver(background, { type: MSG.OPTIONS_GET_STATUS }, optionsSender);
        expect(createDocument).not.toHaveBeenCalled();
        expect(status).toMatchObject({
            ok: true,
            authorized: false,
            role: 'host',
            pairing: {
                phase: 'disconnected',
                pair: { id: connectionId, role: 'host' }
            }
        });
    });

    it('forwards a validated pairing command from Options to offscreen', async () => {
        const forwarded: unknown[] = [];
        offscreenReply = (message) => {
            forwarded.push(message);
            return { ok: true, pairing: idlePairing };
        };
        const result = await deliver(
            background,
            { type: MSG.PAIRING, payload: { action: 'create', label: 'This browser' } },
            optionsSender
        );
        expect(result).toEqual({ ok: true, pairing: idlePairing });
        expect(forwarded).toEqual([
            {
                type: MSG.OFFSCREEN_PAIRING,
                target: OFFSCREEN_TARGET,
                payload: { action: 'create', label: 'This browser' }
            }
        ]);
    });

    it('rejects a malformed pairing command from Options', async () => {
        expect(await deliver(background, { type: MSG.PAIRING, payload: { action: 'join' } }, optionsSender)).toEqual({
            ok: false,
            error: 'invalid_message'
        });
        expect(createDocument).not.toHaveBeenCalled();
    });
});

describe('application authorization gates', () => {
    it('rejects Slack start when the current connection is not authorized', async () => {
        offscreenReply = (message) => {
            if (message.type === MSG.OFFSCREEN_STATUS) return connectedStatus(false, 'client');
            return { ok: false, error: 'disconnected' };
        };
        expect(
            await deliver(
                background,
                {
                    type: MSG.REQUEST_START,
                    payload: { applicationKey: 'slack', sharedSessionConsent: true, source: slackSource }
                },
                optionsSender
            )
        ).toEqual({ ok: false, error: 'disconnected' });
    });

    it('rejects host Slack inbound when the current connection is not authorized', async () => {
        offscreenReply = (message) => {
            if (message.type === MSG.OFFSCREEN_STATUS) return connectedStatus(false, 'host');
            return { ok: false, error: 'disconnected' };
        };
        expect(
            await deliver(
                background,
                {
                    type: MSG.OFFSCREEN_APP_INBOUND,
                    payload: { kind: 'slack_list', connectionId, deadline: Date.now() + 1000 }
                },
                { id: extensionId, url: url('offscreen.html') }
            )
        ).toMatchObject({ kind: 'slack_error', error: 'disconnected' });
    });

    it('lets a confirmed connection reach Slack consent checks', async () => {
        offscreenReply = (message) => {
            if (message.type === MSG.OFFSCREEN_STATUS) return connectedStatus(true, 'client');
            return { ok: false, error: 'disconnected' };
        };
        expect(
            await deliver(
                background,
                {
                    type: MSG.REQUEST_START,
                    payload: { applicationKey: 'slack', sharedSessionConsent: true, source: slackSource }
                },
                optionsSender
            )
        ).toEqual({ ok: false, error: 'sharing_not_approved' });
    });
});
