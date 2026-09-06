import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_KIND, LIFECYCLE, MSG, OFFSCREEN_TARGET, PAYLOAD_KIND, PAYLOAD_RESPONSE_KIND } from '@/shared/constants';
import type { PeerEnvelope } from '@/shared/lib/envelope';
import type { PairingSnapshot } from '@/shared/lib/pairing-protocol';

type Listener = (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
) => boolean | undefined;

const extensionId = 'test-extension';
const url = (path: string) => `chrome-extension://${extensionId}/${path}`;
const workerSender = { id: extensionId, url: url('static/js/background.js') };
const connectionId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const requestId = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const idlePairing: PairingSnapshot = {
    phase: 'connected',
    code: null,
    expiresAt: null,
    pending: null,
    pair: {
        id: connectionId,
        role: 'client',
        peer: { publicKey: 'AAAA', label: 'Other' },
        createdAt: 1
    },
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

const harness = vi.hoisted(() => {
    const sendRequest = vi.fn();
    const sendReply = vi.fn();
    const handleCommand = vi.fn(async (_command: unknown) => ({
        ok: true as const,
        pairing: {
            phase: 'connected' as const,
            code: null as string | null,
            expiresAt: null as number | null,
            pending: null,
            pair: null,
            error: null
        }
    }));
    const state = {
        connectionId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        role: 'client' as 'host' | 'client' | null,
        lifecycle: 'connected' as string,
        authorized: true,
        error: null as string | null,
        disconnected: false,
        disposed: false,
        deps: null as null | { onChange: () => void; onPeerMessage: (envelope: PeerEnvelope) => void },
        sendRequest,
        sendReply,
        handleCommand,
        peer: { sendRequest, sendReply }
    };
    class PairingController {
        constructor(deps: { onChange: () => void; onPeerMessage: (envelope: PeerEnvelope) => void }) {
            state.deps = deps;
        }
        getConnectionId() {
            return state.connectionId;
        }
        getRole() {
            return state.role;
        }
        getLifecycle() {
            return state.lifecycle;
        }
        getPeer() {
            return state.peer;
        }
        isAuthorized(id: string) {
            return state.authorized && id === state.connectionId;
        }
        snapshot() {
            return {
                phase: 'connected',
                code: null,
                expiresAt: null,
                pending: null,
                pair: null,
                error: null
            };
        }
        getLastError() {
            return state.error;
        }
        handleCommand(command: unknown) {
            return state.handleCommand(command);
        }
        ready() {
            return Promise.resolve();
        }
        disconnectTransport() {
            state.disconnected = true;
        }
        dispose() {
            state.disposed = true;
        }
    }
    return { state, PairingController };
});

vi.mock('@/offscreen/pairing', () => ({
    PairingController: harness.PairingController,
    createBrowserPairingDeps: (opts: unknown) => opts
}));

let offscreen: Listener;
let sent: unknown[] = [];

const deliver = (message: unknown, sender: chrome.runtime.MessageSender = workerSender): Promise<unknown> => {
    const { promise, resolve } = Promise.withResolvers<unknown>();
    const pending = offscreen(message, sender, resolve);
    if (pending !== true) resolve(undefined);
    return promise;
};

beforeEach(async () => {
    vi.resetModules();
    sent = [];
    harness.state.connectionId = connectionId;
    harness.state.role = 'client';
    harness.state.lifecycle = LIFECYCLE.CONNECTED;
    harness.state.authorized = true;
    harness.state.error = null;
    harness.state.disconnected = false;
    harness.state.disposed = false;
    harness.state.deps = null;
    harness.state.sendRequest.mockReset();
    harness.state.sendReply.mockReset();
    harness.state.handleCommand.mockReset();
    harness.state.handleCommand.mockResolvedValue({ ok: true, pairing: idlePairing });
    harness.state.sendRequest.mockResolvedValue({
        payload: { kind: PAYLOAD_RESPONSE_KIND.ECHO_RESPONSE, text: 'pong', replyTo: requestId }
    });
    const addListener = vi.fn();
    vi.stubGlobal('chrome', {
        runtime: {
            id: extensionId,
            getURL: url,
            onMessage: { addListener },
            sendMessage: vi.fn((message: unknown) => {
                sent.push(message);
                return Promise.resolve({ kind: PAYLOAD_RESPONSE_KIND.SLACK_SOURCES, sources: [] });
            })
        }
    });
    await import('@/offscreen/index');
    offscreen = addListener.mock.calls[0][0];
});

afterEach(() => vi.unstubAllGlobals());

const targeted = (type: string, payload?: unknown) => ({ type, target: OFFSCREEN_TARGET, payload });

describe('offscreen connected peer commands', () => {
    it('rejects a synthetic send with a bad kind or non-positive deadline', async () => {
        expect(await deliver(targeted(MSG.OFFSCREEN_SEND_PEER, { payloadKind: 'nope', deadlineMs: 1000 }))).toEqual({
            ok: false,
            error: ERROR_KIND.MALFORMED
        });
        expect(
            await deliver(targeted(MSG.OFFSCREEN_SEND_PEER, { payloadKind: PAYLOAD_KIND.ECHO, deadlineMs: 0 }))
        ).toEqual({ ok: false, error: ERROR_KIND.MALFORMED });
    });

    it('rejects an echo with empty text and sends a ping with a generated nonce', async () => {
        expect(
            await deliver(
                targeted(MSG.OFFSCREEN_SEND_PEER, { payloadKind: PAYLOAD_KIND.ECHO, text: '', deadlineMs: 1000 })
            )
        ).toEqual({ ok: false, error: ERROR_KIND.MALFORMED });
        expect(
            await deliver(targeted(MSG.OFFSCREEN_SEND_PEER, { payloadKind: PAYLOAD_KIND.PING, deadlineMs: 1000 }))
        ).toEqual({ ok: true });
        expect(harness.state.sendRequest).toHaveBeenCalledWith(
            { kind: PAYLOAD_KIND.PING, nonce: expect.any(String) },
            1000
        );
    });

    it('forwards an echo request and surfaces send failures', async () => {
        expect(
            await deliver(
                targeted(MSG.OFFSCREEN_SEND_PEER, {
                    payloadKind: PAYLOAD_KIND.ECHO,
                    text: 'hello',
                    deadlineMs: 2500
                })
            )
        ).toEqual({ ok: true });
        expect(harness.state.sendRequest).toHaveBeenCalledWith({ kind: PAYLOAD_KIND.ECHO, text: 'hello' }, 2500);

        harness.state.sendRequest.mockRejectedValueOnce({ kind: ERROR_KIND.TIMEOUT });
        expect(
            await deliver(
                targeted(MSG.OFFSCREEN_SEND_PEER, {
                    payloadKind: PAYLOAD_KIND.ECHO,
                    text: 'hello',
                    deadlineMs: 2500
                })
            )
        ).toEqual({ ok: false, error: ERROR_KIND.TIMEOUT });
    });

    it('rejects application requests that are malformed or for the wrong connection', async () => {
        expect(await deliver(targeted(MSG.OFFSCREEN_APP_REQUEST, null))).toEqual({
            ok: false,
            error: ERROR_KIND.MALFORMED
        });
        expect(
            await deliver(targeted(MSG.OFFSCREEN_APP_REQUEST, { kind: PAYLOAD_KIND.SLACK_LIST, deadlineMs: 0 }))
        ).toEqual({ ok: false, error: ERROR_KIND.MALFORMED });
        expect(
            await deliver(
                targeted(MSG.OFFSCREEN_APP_REQUEST, {
                    kind: PAYLOAD_KIND.SLACK_LIST,
                    deadlineMs: 1000,
                    connectionId: 'cccccccc-dddd-4eee-8fff-000000000000'
                })
            )
        ).toEqual({ ok: false, error: ERROR_KIND.CONNECTION_ID_MISMATCH });
        expect(
            await deliver(
                targeted(MSG.OFFSCREEN_APP_REQUEST, {
                    kind: 'not-slack',
                    deadlineMs: 1000,
                    connectionId
                })
            )
        ).toEqual({ ok: false, error: ERROR_KIND.MALFORMED });
    });

    it('sends slack_list and slack_capture application requests from a connected client', async () => {
        harness.state.sendRequest.mockResolvedValueOnce({
            payload: { kind: PAYLOAD_RESPONSE_KIND.SLACK_SOURCES, sources: [] }
        });
        expect(
            await deliver(
                targeted(MSG.OFFSCREEN_APP_REQUEST, {
                    kind: PAYLOAD_KIND.SLACK_LIST,
                    deadlineMs: 4000,
                    connectionId
                })
            )
        ).toEqual({ ok: true, payload: { kind: PAYLOAD_RESPONSE_KIND.SLACK_SOURCES, sources: [] } });

        harness.state.sendRequest.mockResolvedValueOnce({
            payload: { kind: PAYLOAD_RESPONSE_KIND.SLACK_SESSION, session: { source: slackSource } }
        });
        expect(
            await deliver(
                targeted(MSG.OFFSCREEN_APP_REQUEST, {
                    kind: PAYLOAD_KIND.SLACK_CAPTURE,
                    source: slackSource,
                    deadlineMs: 4000,
                    connectionId
                })
            )
        ).toMatchObject({ ok: true, payload: { kind: PAYLOAD_RESPONSE_KIND.SLACK_SESSION } });
        expect(harness.state.sendRequest).toHaveBeenLastCalledWith(
            { kind: PAYLOAD_KIND.SLACK_CAPTURE, source: slackSource },
            4000
        );
    });

    it('maps a rejected application request to its error kind', async () => {
        harness.state.sendRequest.mockRejectedValueOnce({ kind: ERROR_KIND.CHANNEL_CLOSED });
        expect(
            await deliver(
                targeted(MSG.OFFSCREEN_APP_REQUEST, {
                    kind: PAYLOAD_KIND.SLACK_VERIFY,
                    source: slackSource,
                    deadlineMs: 4000,
                    connectionId
                })
            )
        ).toEqual({ ok: false, error: ERROR_KIND.CHANNEL_CLOSED });
    });

    it('auto-replies to an inbound echo and reports the peer message', async () => {
        harness.state.deps?.onPeerMessage({
            v: 1,
            role: 'host',
            connectionId,
            requestId,
            created: Date.now(),
            deadline: Date.now() + 5000,
            payload: { kind: PAYLOAD_KIND.ECHO, text: 'ping-me' }
        } as PeerEnvelope);
        expect(harness.state.sendReply).toHaveBeenCalledWith(
            { kind: PAYLOAD_RESPONSE_KIND.ECHO_RESPONSE, replyTo: requestId, text: 'reply:ping-me' },
            5000
        );
        expect(sent).toEqual([
            expect.objectContaining({
                type: MSG.OFFSCREEN_EVENT,
                payload: expect.objectContaining({
                    peerMessage: { payloadKind: PAYLOAD_KIND.ECHO, text: 'ping-me', requestId }
                })
            })
        ]);
    });

    it('forwards an authorized host slack_list inbound to the worker and replies', async () => {
        harness.state.role = 'host';
        harness.state.deps?.onPeerMessage({
            v: 1,
            role: 'client',
            connectionId,
            requestId,
            created: Date.now(),
            deadline: Date.now() + 5000,
            payload: { kind: PAYLOAD_KIND.SLACK_LIST }
        } as PeerEnvelope);
        await vi.waitFor(() => expect(harness.state.sendReply).toHaveBeenCalled());
        expect(sent).toEqual([
            expect.objectContaining({
                type: MSG.OFFSCREEN_APP_INBOUND,
                payload: expect.objectContaining({
                    kind: PAYLOAD_KIND.SLACK_LIST,
                    connectionId,
                    requestId
                })
            })
        ]);
        expect(harness.state.sendReply).toHaveBeenCalledWith(
            expect.objectContaining({ kind: PAYLOAD_RESPONSE_KIND.SLACK_SOURCES, replyTo: requestId }),
            expect.any(Number)
        );
    });

    it('surfaces pairing command failures from the controller', async () => {
        harness.state.handleCommand.mockRejectedValueOnce(new Error('boom'));
        expect(await deliver(targeted(MSG.OFFSCREEN_PAIRING, { action: 'status' }))).toEqual({
            ok: false,
            error: 'unavailable'
        });
    });

    it('disposes pairing when the offscreen document unloads', () => {
        globalThis.dispatchEvent(new Event('pagehide'));
        expect(harness.state.disposed).toBe(true);
    });
});
