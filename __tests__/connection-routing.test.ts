import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { ERROR_KIND, MSG, OFFSCREEN_TARGET, PAIRING_TRUST_STORAGE_KEY, PAYLOAD_KIND } from '@/shared/constants';
import type { PairingSnapshot } from '@/shared/lib/pairing-protocol';
import { SLACK_SHARING_APPROVED } from '@/shared/lib/slack';

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

describe('worker command routing', () => {
    const offscreenSender = { id: extensionId, url: url('offscreen.html') };

    it.each([null, 'nope', 1, []])('rejects malformed inbound %j', async (message) => {
        expect(await deliver(background, message, optionsSender)).toEqual({
            ok: false,
            error: ERROR_KIND.MALFORMED
        });
    });

    it('rejects a message with a missing type', async () => {
        expect(await deliver(background, { payload: {} }, optionsSender)).toEqual({
            ok: false,
            error: ERROR_KIND.MALFORMED
        });
    });

    it('rejects an unknown request type from Options', async () => {
        expect(await deliver(background, { type: 'NOT_A_COMMAND' }, optionsSender)).toEqual({
            ok: false,
            error: ERROR_KIND.UNKNOWN_REQUEST
        });
    });

    it('disconnects by cancelling pairing and closing the offscreen document', async () => {
        const forwarded: unknown[] = [];
        offscreenReply = (message) => {
            forwarded.push(message);
            if (message.type === MSG.OFFSCREEN_PAIRING) return { ok: true, pairing: idlePairing };
            return { ok: true };
        };
        expect(await deliver(background, { type: MSG.OPTIONS_DISCONNECT }, optionsSender)).toEqual({ ok: true });
        expect(forwarded).toEqual([
            { type: MSG.OFFSCREEN_PAIRING, target: OFFSCREEN_TARGET, payload: { action: 'cancel' } },
            { type: MSG.OFFSCREEN_CLOSE, target: OFFSCREEN_TARGET, payload: { reason: 'user' } }
        ]);
        expect(chrome.offscreen.closeDocument).toHaveBeenCalled();
    });

    it('rejects OPTIONS_SEND_SYNTHETIC with a malformed payload kind', async () => {
        expect(
            await deliver(
                background,
                { type: MSG.OPTIONS_SEND_SYNTHETIC, payload: { payloadKind: 'slack_list', deadlineMs: 1000 } },
                optionsSender
            )
        ).toEqual({ ok: false, error: ERROR_KIND.MALFORMED });
    });

    it('rejects OPTIONS_SEND_SYNTHETIC when deadlineMs is not positive', async () => {
        expect(
            await deliver(
                background,
                {
                    type: MSG.OPTIONS_SEND_SYNTHETIC,
                    payload: { payloadKind: PAYLOAD_KIND.ECHO, text: 'hi', deadlineMs: 0 }
                },
                optionsSender
            )
        ).toEqual({ ok: false, error: ERROR_KIND.MALFORMED });
    });

    it('forwards a valid echo OPTIONS_SEND_SYNTHETIC to the offscreen', async () => {
        const forwarded: unknown[] = [];
        offscreenReply = (message) => {
            forwarded.push(message);
            return { ok: true };
        };
        expect(
            await deliver(
                background,
                {
                    type: MSG.OPTIONS_SEND_SYNTHETIC,
                    payload: { payloadKind: PAYLOAD_KIND.ECHO, text: 'ping', deadlineMs: 5000 }
                },
                optionsSender
            )
        ).toEqual({ ok: true });
        expect(forwarded).toEqual([
            {
                type: MSG.OFFSCREEN_SEND_PEER,
                target: OFFSCREEN_TARGET,
                payload: { payloadKind: PAYLOAD_KIND.ECHO, text: 'ping', deadlineMs: 5000 }
            }
        ]);
    });

    it('returns a pairing snapshot for PAIRING status without creating an offscreen document', async () => {
        offscreenReply = (message) => {
            if (message.type === MSG.OFFSCREEN_STATUS) return connectedStatus(true, 'client');
            return { ok: false, error: 'unavailable' };
        };
        expect(await deliver(background, { type: MSG.PAIRING, payload: { action: 'status' } }, optionsSender)).toEqual({
            ok: true,
            pairing: connectedStatus(true, 'client').pairing
        });
        expect(createDocument).not.toHaveBeenCalled();
    });

    it('closes the offscreen document after a successful PAIRING forget', async () => {
        offscreenReply = () => ({ ok: true, pairing: idlePairing });
        expect(await deliver(background, { type: MSG.PAIRING, payload: { action: 'forget' } }, optionsSender)).toEqual({
            ok: true,
            pairing: idlePairing
        });
        expect(chrome.offscreen.closeDocument).toHaveBeenCalled();
    });

    it('forwards a PAIRING join with a normalized 5-character code', async () => {
        const forwarded: unknown[] = [];
        offscreenReply = (message) => {
            forwarded.push(message);
            return { ok: true, pairing: idlePairing };
        };
        expect(
            await deliver(
                background,
                { type: MSG.PAIRING, payload: { action: 'join', code: 'abc23', label: 'This browser' } },
                optionsSender
            )
        ).toEqual({ ok: true, pairing: idlePairing });
        expect(forwarded).toEqual([
            {
                type: MSG.OFFSCREEN_PAIRING,
                target: OFFSCREEN_TARGET,
                payload: { action: 'join', code: 'ABC23', label: 'This browser' }
            }
        ]);
    });

    it('treats garbage pairing replies from the offscreen as unavailable', async () => {
        offscreenReply = () => ({ unexpected: true });
        expect(
            await deliver(
                background,
                { type: MSG.PAIRING, payload: { action: 'create', label: 'This browser' } },
                optionsSender
            )
        ).toEqual({ ok: false, error: 'unavailable' });
    });

    it('rejects SLACK_ENABLE without sharing consent', async () => {
        expect(
            await deliver(
                background,
                { type: MSG.SLACK_ENABLE, payload: { sharedSessionConsent: false } },
                optionsSender
            )
        ).toEqual({ ok: false, error: 'sharing_not_approved' });
    });

    it('rejects SLACK_ENABLE when Slack permissions are missing', async () => {
        expect(
            await deliver(
                background,
                { type: MSG.SLACK_ENABLE, payload: { sharedSessionConsent: true } },
                optionsSender
            )
        ).toEqual({ ok: false, error: 'permission_denied' });
        expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });

    it('records sharing approval when SLACK_ENABLE has consent and permissions', async () => {
        (chrome.permissions.contains as Mock).mockResolvedValue(true);
        expect(
            await deliver(
                background,
                { type: MSG.SLACK_ENABLE, payload: { sharedSessionConsent: true } },
                optionsSender
            )
        ).toEqual({ ok: true });
        expect(chrome.storage.local.set).toHaveBeenCalledWith({ [SLACK_SHARING_APPROVED]: true });
        expect(await chrome.storage.local.get(SLACK_SHARING_APPROVED)).toEqual({ [SLACK_SHARING_APPROVED]: true });
    });

    it('rejects SLACK_LIST without sharing approval', async () => {
        expect(await deliver(background, { type: MSG.SLACK_LIST }, optionsSender)).toEqual({
            ok: false,
            error: 'sharing_not_approved'
        });
    });

    it('rejects SLACK_LIST for a disconnected client after sharing is approved', async () => {
        await chrome.storage.local.set({ [SLACK_SHARING_APPROVED]: true });
        offscreenReply = (message) => {
            if (message.type === MSG.OFFSCREEN_STATUS) return connectedStatus(false, 'client');
            return { ok: false, error: 'disconnected' };
        };
        expect(await deliver(background, { type: MSG.SLACK_LIST }, optionsSender)).toEqual({
            ok: false,
            error: 'disconnected'
        });
    });

    it('rejects SLACK_LIST for a host without Slack permissions', async () => {
        await chrome.storage.local.set({ [SLACK_SHARING_APPROVED]: true });
        offscreenReply = (message) => {
            if (message.type === MSG.OFFSCREEN_STATUS) return connectedStatus(true, 'host');
            return { ok: false, error: 'disconnected' };
        };
        expect(await deliver(background, { type: MSG.SLACK_LIST }, optionsSender)).toEqual({
            ok: false,
            error: 'permission_denied'
        });
    });

    it('lists no Slack sources for a host when permissions are granted and no tabs match', async () => {
        await chrome.storage.local.set({ [SLACK_SHARING_APPROVED]: true });
        (chrome.permissions.contains as Mock).mockResolvedValue(true);
        Object.assign(chrome, { tabs: { query: vi.fn().mockResolvedValue([]) } });
        Object.assign(chrome.storage, { session: { get: vi.fn().mockResolvedValue({}) } });
        offscreenReply = (message) => {
            if (message.type === MSG.OFFSCREEN_STATUS) return connectedStatus(true, 'host');
            return { ok: false, error: 'disconnected' };
        };
        expect(await deliver(background, { type: MSG.SLACK_LIST }, optionsSender)).toEqual({ ok: true, sources: [] });
    });

    it('rejects REQUEST_START for an unsupported application', async () => {
        expect(
            await deliver(background, { type: MSG.REQUEST_START, payload: { applicationKey: 'zoom' } }, optionsSender)
        ).toEqual({ ok: false, error: ERROR_KIND.REQUEST_NOT_SUPPORTED });
    });

    it('rejects REQUEST_START when Slack permissions are missing after approval', async () => {
        await chrome.storage.local.set({ [SLACK_SHARING_APPROVED]: true });
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
        ).toEqual({ ok: false, error: 'permission_denied' });
    });

    it('rejects REQUEST_START with an invalid Slack source', async () => {
        await chrome.storage.local.set({ [SLACK_SHARING_APPROVED]: true });
        (chrome.permissions.contains as Mock).mockResolvedValue(true);
        offscreenReply = (message) => {
            if (message.type === MSG.OFFSCREEN_STATUS) return connectedStatus(true, 'client');
            return { ok: false, error: 'disconnected' };
        };
        expect(
            await deliver(
                background,
                {
                    type: MSG.REQUEST_START,
                    payload: { applicationKey: 'slack', sharedSessionConsent: true, source: { sourceTabId: 1 } }
                },
                optionsSender
            )
        ).toEqual({ ok: false, error: 'invalid_payload' });
    });

    it('returns the idle request status when no request is active', async () => {
        expect(await deliver(background, { type: MSG.REQUEST_STATUS }, optionsSender)).toEqual({
            ok: true,
            requestId: null,
            state: 'idle',
            outcome: null,
            since: null,
            error: null,
            reason: null,
            destinationTabId: null
        });
    });

    it('returns no-active-request when cancelling with no request', async () => {
        expect(await deliver(background, { type: MSG.REQUEST_CANCEL }, optionsSender)).toEqual({
            ok: false,
            error: ERROR_KIND.NO_ACTIVE_REQUEST
        });
    });

    it('broadcasts a valid OFFSCREEN_EVENT from the offscreen document', async () => {
        const broadcasts: unknown[] = [];
        const sendMessage = chrome.runtime.sendMessage;
        chrome.runtime.sendMessage = ((message: { type?: string; target?: string; payload?: unknown }) => {
            broadcasts.push(message);
            return sendMessage(message);
        }) as typeof chrome.runtime.sendMessage;
        const payload = connectedStatus(true, 'host');
        expect(await deliver(background, { type: MSG.OFFSCREEN_EVENT, payload }, offscreenSender)).toEqual({
            ok: true
        });
        expect(broadcasts).toContainEqual({ type: MSG.OFFSCREEN_EVENT, payload });
    });

    it('acknowledges an invalid OFFSCREEN_EVENT payload without broadcasting it', async () => {
        const sendMessage = vi.fn().mockResolvedValue(undefined);
        chrome.runtime.sendMessage = sendMessage;
        expect(
            await deliver(background, { type: MSG.OFFSCREEN_EVENT, payload: { state: 'nope' } }, offscreenSender)
        ).toEqual({ ok: true });
        expect(sendMessage).not.toHaveBeenCalled();
    });

    it('rejects OFFSCREEN_EVENT from the Options page', async () => {
        expect(
            await deliver(
                background,
                { type: MSG.OFFSCREEN_EVENT, payload: connectedStatus(true, 'host') },
                optionsSender
            )
        ).toEqual({ ok: false, error: ERROR_KIND.INVALID_SENDER_CONTEXT });
    });

    it('rejects OFFSCREEN_APP_INBOUND with an invalid kind for an authorized host', async () => {
        await chrome.storage.local.set({ [SLACK_SHARING_APPROVED]: true });
        (chrome.permissions.contains as Mock).mockResolvedValue(true);
        offscreenReply = (message) => {
            if (message.type === MSG.OFFSCREEN_STATUS) return connectedStatus(true, 'host');
            return { ok: false, error: 'disconnected' };
        };
        await deliver(background, { type: MSG.OPTIONS_GET_STATUS }, optionsSender);
        expect(
            await deliver(
                background,
                {
                    type: MSG.OFFSCREEN_APP_INBOUND,
                    payload: { kind: 'echo', connectionId, deadline: Date.now() + 1000 }
                },
                offscreenSender
            )
        ).toMatchObject({ kind: 'slack_error', error: 'invalid_payload' });
    });

    it('rejects OFFSCREEN_APP_INBOUND when deadline or connectionId is missing', async () => {
        await chrome.storage.local.set({ [SLACK_SHARING_APPROVED]: true });
        (chrome.permissions.contains as Mock).mockResolvedValue(true);
        offscreenReply = (message) => {
            if (message.type === MSG.OFFSCREEN_STATUS) return connectedStatus(true, 'host');
            return { ok: false, error: 'disconnected' };
        };
        await deliver(background, { type: MSG.OPTIONS_GET_STATUS }, optionsSender);
        expect(
            await deliver(
                background,
                { type: MSG.OFFSCREEN_APP_INBOUND, payload: { kind: PAYLOAD_KIND.SLACK_LIST } },
                offscreenSender
            )
        ).toMatchObject({ kind: 'slack_error', error: 'invalid_payload' });
    });

    it('rejects host OFFSCREEN_APP_INBOUND slack_list without Slack permissions', async () => {
        await chrome.storage.local.set({ [SLACK_SHARING_APPROVED]: true });
        offscreenReply = (message) => {
            if (message.type === MSG.OFFSCREEN_STATUS) return connectedStatus(true, 'host');
            return { ok: false, error: 'disconnected' };
        };
        await deliver(background, { type: MSG.OPTIONS_GET_STATUS }, optionsSender);
        expect(
            await deliver(
                background,
                {
                    type: MSG.OFFSCREEN_APP_INBOUND,
                    payload: { kind: PAYLOAD_KIND.SLACK_LIST, connectionId, deadline: Date.now() + 1000 }
                },
                offscreenSender
            )
        ).toMatchObject({ kind: 'slack_error', error: 'permission_denied' });
    });

    it('rejects host OFFSCREEN_APP_INBOUND when sharing is not approved', async () => {
        offscreenReply = (message) => {
            if (message.type === MSG.OFFSCREEN_STATUS) return connectedStatus(true, 'host');
            return { ok: false, error: 'disconnected' };
        };
        await deliver(background, { type: MSG.OPTIONS_GET_STATUS }, optionsSender);
        expect(
            await deliver(
                background,
                {
                    type: MSG.OFFSCREEN_APP_INBOUND,
                    payload: { kind: PAYLOAD_KIND.SLACK_LIST, connectionId, deadline: Date.now() + 1000 }
                },
                offscreenSender
            )
        ).toMatchObject({ kind: 'slack_error', error: 'sharing_not_approved' });
    });
});

describe('offscreen command routing', () => {
    it('rejects an array message tagged for the offscreen', async () => {
        const message = Object.assign([], { target: OFFSCREEN_TARGET });
        expect(await deliver(offscreen, message, workerSender as chrome.runtime.MessageSender)).toEqual({
            ok: false,
            error: ERROR_KIND.MALFORMED
        });
    });

    it('rejects an offscreen-targeted message with a missing type', async () => {
        expect(
            await deliver(offscreen, { target: OFFSCREEN_TARGET }, workerSender as chrome.runtime.MessageSender)
        ).toEqual({ ok: false, error: ERROR_KIND.MALFORMED });
    });

    it('rejects OFFSCREEN_PAIRING with an invalid payload', async () => {
        expect(
            await deliver(
                offscreen,
                { type: MSG.OFFSCREEN_PAIRING, target: OFFSCREEN_TARGET, payload: { action: 'join' } },
                workerSender as chrome.runtime.MessageSender
            )
        ).toEqual({ ok: false, error: 'invalid_message' });
    });

    it('returns a pairing snapshot for OFFSCREEN_PAIRING status', async () => {
        expect(
            await deliver(
                offscreen,
                { type: MSG.OFFSCREEN_PAIRING, target: OFFSCREEN_TARGET, payload: { action: 'status' } },
                workerSender as chrome.runtime.MessageSender
            )
        ).toEqual({ ok: true, pairing: idlePairing });
    });

    it('rejects OFFSCREEN_SEND_PEER when no peer is connected', async () => {
        expect(
            await deliver(
                offscreen,
                {
                    type: MSG.OFFSCREEN_SEND_PEER,
                    target: OFFSCREEN_TARGET,
                    payload: { payloadKind: PAYLOAD_KIND.ECHO, text: 'hi', deadlineMs: 1000 }
                },
                workerSender as chrome.runtime.MessageSender
            )
        ).toEqual({ ok: false, error: ERROR_KIND.NO_ACTIVE_REQUEST });
    });

    it('rejects OFFSCREEN_APP_REQUEST when the pairing role is not client', async () => {
        expect(
            await deliver(
                offscreen,
                {
                    type: MSG.OFFSCREEN_APP_REQUEST,
                    target: OFFSCREEN_TARGET,
                    payload: { kind: PAYLOAD_KIND.SLACK_LIST, deadlineMs: 1000, connectionId }
                },
                workerSender as chrome.runtime.MessageSender
            )
        ).toEqual({ ok: false, error: ERROR_KIND.ROLE_MISMATCH });
    });

    it('acknowledges OFFSCREEN_CLOSE', async () => {
        expect(
            await deliver(
                offscreen,
                { type: MSG.OFFSCREEN_CLOSE, target: OFFSCREEN_TARGET, payload: { reason: 'user' } },
                workerSender as chrome.runtime.MessageSender
            )
        ).toEqual({ ok: true });
    });

    it('rejects an unknown offscreen command type', async () => {
        expect(
            await deliver(
                offscreen,
                { type: 'OFFSCREEN_NOT_A_THING', target: OFFSCREEN_TARGET },
                workerSender as chrome.runtime.MessageSender
            )
        ).toEqual({ ok: false, error: ERROR_KIND.UNKNOWN_REQUEST });
    });
});
