import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type PairingIdentity, type SavedRoleStore, type TrustStore } from '@/offscreen/identity-storage';
import { PairingController, type PairingPeer, type PairingSocket } from '@/offscreen/pairing';
import { ERROR_KIND, LIFECYCLE, type Lifecycle, MSG, OFFSCREEN_TARGET, PAYLOAD_KIND } from '@/shared/constants';
import type { PeerEnvelope, PeerPayload, PeerResponsePayload } from '@/shared/lib/envelope';
import { encodePairingBytes, signPairingText } from '@/shared/lib/pairing-crypto';
import {
    PAIRING_ORIGIN,
    PAIRING_SOCKET_PROTOCOL,
    type PairedBrowser,
    type PairingRole,
    pairingSignalText
} from '@/shared/lib/pairing-protocol';
import type { PeerListener } from '@/shared/lib/peer';

const ROOM_ID = '00000000-0000-4000-8000-0000000000a1';
const ATTEMPT_A = '00000000-0000-4000-8000-0000000000b1';
const ATTEMPT_B = '00000000-0000-4000-8000-0000000000b2';
const CONNECTION_A = '00000000-0000-4000-8000-0000000000c1';
const CONNECTION_B = '00000000-0000-4000-8000-0000000000c2';
const TICKET = `${'A'.repeat(22)}==`;

const generateIdentity = async (): Promise<PairingIdentity> => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    return {
        privateKey: pair.privateKey,
        publicKey: pair.publicKey,
        publicKeySpki: encodePairingBytes(await crypto.subtle.exportKey('spki', pair.publicKey))
    };
};

class FakePeer implements PairingPeer {
    state: Lifecycle = LIFECYCLE.IDLE;
    closed = false;
    applied: string[] = [];
    offers = 0;
    private readonly listeners = new Set<PeerListener>();

    async hostCreateOffer(): Promise<string> {
        this.offers += 1;
        this.state = LIFECYCLE.SIGNALING;
        return 'local-offer';
    }

    async clientAcceptOffer(remote: string): Promise<string> {
        this.applied.push(remote);
        this.state = LIFECYCLE.SIGNALING;
        return 'local-answer';
    }

    async applyRemoteAnswer(remote: string): Promise<void> {
        this.applied.push(remote);
        this.state = LIFECYCLE.CONNECTING;
        for (const listener of this.listeners) listener({ type: 'state', state: this.state, error: null });
    }

    subscribe(listener: PeerListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    close(): void {
        this.closed = true;
        this.state = LIFECYCLE.CLOSED;
    }

    getState(): Lifecycle {
        return this.state;
    }

    async sendRequest(_payload: PeerPayload, _deadlineMs: number): Promise<PeerEnvelope> {
        throw new Error('not connected');
    }

    sendReply(_payload: PeerResponsePayload, _deadlineMs: number): void {}

    emitConnected(): void {
        this.state = LIFECYCLE.CONNECTED;
        for (const listener of this.listeners) listener({ type: 'state', state: this.state, error: null });
    }
}

class FakeSocket implements PairingSocket {
    readyState = 1;
    sent: string[] = [];
    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    readonly url: string;
    readonly protocols: string | string[] | undefined;

    constructor(url: string, protocols?: string | string[]) {
        this.url = url;
        this.protocols = protocols;
    }

    send(data: string): void {
        this.sent.push(data);
    }

    close(): void {
        this.readyState = 3;
    }
}

describe('offscreen pairing controller', () => {
    let host: PairingIdentity;
    let client: PairingIdentity;
    let stranger: PairingIdentity;
    let stored: PairedBrowser | null;
    let sockets: FakeSocket[];
    let peers: FakePeer[];
    let fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
    let savedRole: PairingRole | null;

    const jsonResponse = (body: unknown, status = 200): Response =>
        new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

    const credentials = (code: string | null = 'ABCDE') => ({
        ok: true as const,
        roomId: ROOM_ID,
        ticket: TICKET,
        code,
        expiresAt: 1_700_000_120_000
    });

    const trust = (): TrustStore => ({
        get: async () => stored,
        set: async (pair) => {
            stored = pair;
        },
        clear: async () => {
            stored = null;
        }
    });

    const roleStore = (): SavedRoleStore => ({ get: async () => savedRole });

    const make = () => {
        const Socket = class extends FakeSocket {
            constructor(url: string, protocols?: string | string[]) {
                super(url, protocols);
                sockets.push(this);
            }
        };
        return new PairingController({
            identity: { loadOrCreate: async () => host },
            trust: trust(),
            savedRole: roleStore(),
            fetch: (url, init) => fetchImpl(String(url), init),
            WebSocket: Socket,
            now: () => 1_700_000_000_000,
            randomUuid: () => CONNECTION_B,
            randomNonce: () => 'N'.repeat(32),
            createPeer: () => {
                const peer = new FakePeer();
                peers.push(peer);
                return peer;
            },
            onChange: () => {},
            onPeerMessage: () => {}
        });
    };

    const emit = (socket: FakeSocket, message: unknown): void => {
        socket.onmessage?.(new MessageEvent('message', { data: JSON.stringify(message) }));
    };

    const pendingMessage = (attemptId: string, identity: PairingIdentity) => ({
        type: 'pending' as const,
        attemptId,
        peer: { publicKey: identity.publicKeySpki, label: 'ClientBox' },
        expiresAt: 1_700_000_120_000
    });

    const pairedMessage = (identity: PairingIdentity, connectionId: string) => ({
        type: 'paired' as const,
        connectionId,
        pair: {
            id: ROOM_ID,
            role: 'host' as const,
            peer: { publicKey: identity.publicKeySpki, label: 'ClientBox' },
            createdAt: 1_700_000_000_000
        }
    });

    const signedAnswer = (identity: PairingIdentity, connectionId: string, descriptor: string) =>
        signPairingText(identity.privateKey, pairingSignalText(ROOM_ID, 'client', { connectionId, descriptor }));

    const hostUntilConnected = async (pairing: PairingController, socket: FakeSocket): Promise<FakePeer> => {
        emit(socket, pendingMessage(ATTEMPT_A, client));
        await vi.waitFor(() => {
            expect(pairing.snapshot().phase).toBe('confirming');
        });
        await pairing.handleCommand({ action: 'confirm', attemptId: ATTEMPT_A });
        emit(socket, pairedMessage(client, CONNECTION_A));
        await vi.waitFor(() => {
            expect(pairing.snapshot().phase).toBe('connecting');
        });
        const signature = await signedAnswer(client, CONNECTION_A, 'answer-one');
        emit(socket, { type: 'signal', connectionId: CONNECTION_A, descriptor: 'answer-one', signature });
        await vi.waitFor(() => {
            expect(pairing.getLifecycle()).toBe(LIFECYCLE.CONNECTING);
            expect(peers[0]?.applied).toEqual(['answer-one']);
        });
        const peer = peers[0];
        if (!peer) throw new Error('expected pairing peer');
        peer.emitConnected();
        await vi.waitFor(() => {
            expect(pairing.isAuthorized(CONNECTION_A)).toBe(true);
            expect(pairing.snapshot().phase).toBe('connected');
        });
        return peer;
    };

    beforeEach(async () => {
        host = await generateIdentity();
        client = await generateIdentity();
        stranger = await generateIdentity();
        stored = null;
        sockets = [];
        peers = [];
        savedRole = null;
        fetchImpl = async () => jsonResponse(credentials());
    });

    it('drops a late invitation after cancel so a stale code cannot bind', async () => {
        let resolveGate!: (value: Response) => void;
        const gate = new Promise<Response>((resolve) => {
            resolveGate = resolve;
        });
        let fetchStarted = false;
        fetchImpl = async (_url, init) => {
            fetchStarted = true;
            if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
            return gate;
        };
        const pairing = make();
        const create = pairing.handleCommand({ action: 'create', label: 'HostBox' });
        await vi.waitFor(() => {
            expect(fetchStarted).toBe(true);
        });
        const cancel = await pairing.handleCommand({ action: 'cancel' });
        expect(cancel.ok).toBe(true);
        resolveGate(jsonResponse(credentials()));
        const late = await create;
        expect(late.ok).toBe(false);
        expect(pairing.snapshot()).toMatchObject({ phase: 'idle', code: null, pending: null, pair: null });
        expect(pairing.isAuthorized(CONNECTION_A)).toBe(false);
    });

    it('rejects a confirm that does not match the current pending attempt', async () => {
        const pairing = make();
        expect((await pairing.handleCommand({ action: 'create', label: 'HostBox' })).ok).toBe(true);
        const socket = sockets[0];
        expect(socket.url).toBe(`${PAIRING_ORIGIN}/v1/socket/${ROOM_ID}`);
        expect(socket.url.includes('?')).toBe(false);
        expect(socket.protocols).toEqual([PAIRING_SOCKET_PROTOCOL, TICKET]);
        emit(socket, pendingMessage(ATTEMPT_A, client));
        await vi.waitFor(() => {
            expect(pairing.snapshot().phase).toBe('confirming');
        });
        const mismatch = await pairing.handleCommand({ action: 'confirm', attemptId: ATTEMPT_B });
        expect(mismatch).toEqual({ ok: false, error: 'invalid_peer' });
        expect(pairing.snapshot().phase).toBe('confirming');
        expect(pairing.snapshot().pending?.attemptId).toBe(ATTEMPT_A);
        expect(socket.sent.some((frame) => JSON.parse(frame).type === 'confirm')).toBe(false);
        expect(pairing.isAuthorized(CONNECTION_A)).toBe(false);
    });

    it('confirms with the exact current pending public key and still withholds app access', async () => {
        const pairing = make();
        await pairing.handleCommand({ action: 'create', label: 'HostBox' });
        const socket = sockets[0];
        emit(socket, pendingMessage(ATTEMPT_A, client));
        await vi.waitFor(() => {
            expect(pairing.snapshot().phase).toBe('confirming');
        });
        expect((await pairing.handleCommand({ action: 'confirm', attemptId: ATTEMPT_A })).ok).toBe(true);
        const confirmFrame = JSON.parse(socket.sent.find((frame) => JSON.parse(frame).type === 'confirm') ?? '{}');
        expect(confirmFrame).toEqual({
            type: 'confirm',
            attemptId: ATTEMPT_A,
            peerPublicKey: client.publicKeySpki
        });
        expect(pairing.isAuthorized(CONNECTION_A)).toBe(false);
        expect(pairing.snapshot().phase).toBe('confirming');
    });

    it('does not overwrite a pinned key when reconnect paired metadata disagrees', async () => {
        stored = {
            id: ROOM_ID,
            role: 'host',
            peer: { publicKey: client.publicKeySpki, label: 'ClientBox' },
            createdAt: 1_700_000_000_000
        };
        fetchImpl = async () => jsonResponse(credentials(null));
        const pairing = make();
        await pairing.ready();
        expect((await pairing.handleCommand({ action: 'connect' })).ok).toBe(true);
        emit(sockets[0], pairedMessage(stranger, CONNECTION_A));
        await vi.waitFor(() => {
            expect(pairing.snapshot().error).toBe('invalid_peer');
        });
        expect(pairing.isAuthorized(CONNECTION_A)).toBe(false);
        expect(stored).toEqual({
            id: ROOM_ID,
            role: 'host',
            peer: { publicKey: client.publicKeySpki, label: 'ClientBox' },
            createdAt: 1_700_000_000_000
        });
    });

    it('does not apply a remote descriptor bound to a different connection id', async () => {
        const pairing = make();
        await pairing.handleCommand({ action: 'create', label: 'HostBox' });
        const socket = sockets[0];
        emit(socket, pendingMessage(ATTEMPT_A, client));
        await vi.waitFor(() => {
            expect(pairing.snapshot().phase).toBe('confirming');
        });
        await pairing.handleCommand({ action: 'confirm', attemptId: ATTEMPT_A });
        emit(socket, pairedMessage(client, CONNECTION_A));
        await vi.waitFor(() => {
            expect(pairing.snapshot().phase).toBe('connecting');
        });
        expect(peers[0]?.applied).toEqual([]);
        const signature = await signedAnswer(client, CONNECTION_B, 'answer-one');
        emit(socket, {
            type: 'signal',
            connectionId: CONNECTION_B,
            descriptor: 'answer-one',
            signature
        });
        await vi.waitFor(() => {
            expect(pairing.snapshot().error).toBe('invalid_peer');
        });
        expect(peers[0]?.applied ?? []).toEqual([]);
        expect(pairing.isAuthorized(CONNECTION_A)).toBe(false);
        expect(pairing.isAuthorized(CONNECTION_B)).toBe(false);
    });

    it('rejects replay of an already applied signed descriptor', async () => {
        const pairing = make();
        await pairing.handleCommand({ action: 'create', label: 'HostBox' });
        const socket = sockets[0];
        await hostUntilConnected(pairing, socket);
        const signature = await signedAnswer(client, CONNECTION_A, 'answer-one');
        emit(socket, { type: 'signal', connectionId: CONNECTION_A, descriptor: 'answer-one', signature });
        await vi.waitFor(() => {
            expect(pairing.isAuthorized(CONNECTION_A)).toBe(false);
            expect(pairing.snapshot().phase).not.toBe('connected');
        });
    });

    it('does not authorize until both confirms, verified signature, and a connected peer', async () => {
        const pairing = make();
        await pairing.handleCommand({ action: 'create', label: 'HostBox' });
        expect(pairing.isAuthorized(CONNECTION_A)).toBe(false);
        const socket = sockets[0];
        emit(socket, pendingMessage(ATTEMPT_A, client));
        await vi.waitFor(() => {
            expect(pairing.snapshot().phase).toBe('confirming');
        });
        await pairing.handleCommand({ action: 'confirm', attemptId: ATTEMPT_A });
        expect(pairing.isAuthorized(CONNECTION_A)).toBe(false);
        emit(socket, pairedMessage(client, CONNECTION_A));
        await vi.waitFor(() => {
            expect(pairing.snapshot().phase).toBe('connecting');
        });
        expect(pairing.isAuthorized(CONNECTION_A)).toBe(false);
        const signature = await signedAnswer(client, CONNECTION_A, 'answer-one');
        emit(socket, { type: 'signal', connectionId: CONNECTION_A, descriptor: 'answer-one', signature });
        await vi.waitFor(() => {
            expect(pairing.getLifecycle()).toBe(LIFECYCLE.CONNECTING);
        });
        expect(pairing.isAuthorized(CONNECTION_A)).toBe(false);
        peers[0]?.emitConnected();
        await vi.waitFor(() => {
            expect(pairing.isAuthorized(CONNECTION_A)).toBe(true);
            expect(pairing.snapshot().phase).toBe('connected');
        });
    });

    it('accepts the broker acknowledgement when forgetting a pinned browser', async () => {
        stored = {
            id: ROOM_ID,
            role: 'host',
            peer: { publicKey: client.publicKeySpki, label: 'ClientBox' },
            createdAt: 1_700_000_000_000
        };
        fetchImpl = async () => jsonResponse({ ok: true });
        const pairing = make();
        await pairing.ready();
        expect(await pairing.handleCommand({ action: 'forget' })).toMatchObject({
            ok: true,
            pairing: { pair: null, phase: 'idle' }
        });
        expect(stored).toBeNull();
        expect(pairing.isAuthorized(CONNECTION_A)).toBe(false);
    });

    it('clears local trust on forget even when the broker is unreachable', async () => {
        stored = {
            id: ROOM_ID,
            role: 'host',
            peer: { publicKey: client.publicKeySpki, label: 'ClientBox' },
            createdAt: 1_700_000_000_000
        };
        fetchImpl = async () => {
            throw new TypeError('network');
        };
        const pairing = make();
        await pairing.ready();
        expect(await pairing.handleCommand({ action: 'forget' })).toEqual({ ok: false, error: 'unavailable' });
        expect(stored).toBeNull();
        expect(pairing.snapshot().pair).toBeNull();
        expect(pairing.isAuthorized(CONNECTION_A)).toBe(false);
    });

    it('ignores a replaced peer emitting connected after cancel', async () => {
        const pairing = make();
        await pairing.handleCommand({ action: 'create', label: 'HostBox' });
        const socket = sockets[0];
        const firstPeer = await hostUntilConnected(pairing, socket);
        await pairing.handleCommand({ action: 'cancel' });
        expect(pairing.isAuthorized(CONNECTION_A)).toBe(false);
        expect(pairing.snapshot().pair?.id).toBe(ROOM_ID);
        firstPeer.emitConnected();
        await vi.waitFor(() => {
            expect(pairing.isAuthorized(CONNECTION_A)).toBe(false);
            expect(pairing.snapshot().phase).toBe('disconnected');
        });
    });

    it('fails closed when queued signaling exceeds the in-flight bound', async () => {
        const pairing = make();
        await pairing.handleCommand({ action: 'create', label: 'HostBox' });
        const socket = sockets[0];
        emit(socket, pendingMessage(ATTEMPT_A, client));
        await vi.waitFor(() => {
            expect(pairing.snapshot().phase).toBe('confirming');
        });
        await pairing.handleCommand({ action: 'confirm', attemptId: ATTEMPT_A });
        emit(socket, pairedMessage(client, CONNECTION_A));
        for (let i = 0; i < 8; i++) {
            emit(socket, {
                type: 'signal',
                connectionId: CONNECTION_A,
                descriptor: 'answer-one',
                signature: 'AAAA'
            });
        }
        await vi.waitFor(() => {
            expect(pairing.snapshot().phase).toBe('failed');
            expect(pairing.snapshot().error).toBe('invalid_message');
        });
        expect(pairing.isAuthorized(CONNECTION_A)).toBe(false);
    });
});

describe('offscreen application boundary', () => {
    const extensionId = 'test-extension';
    type Listener = (
        message: unknown,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response: unknown) => void
    ) => boolean | undefined;

    const deliver = (listener: Listener, message: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> =>
        new Promise((resolve) => {
            const pending = listener(message, sender, resolve);
            if (pending !== true) resolve(undefined);
        });

    afterEach(() => {
        vi.resetModules();
        vi.unstubAllGlobals();
    });

    it('rejects an application request before pairing authorizes the connection', async () => {
        const addListener = vi.fn();
        const peer = await generateIdentity();
        const remembered = {
            id: ROOM_ID,
            role: 'client' as const,
            peer: { publicKey: peer.publicKeySpki, label: 'HostBox' },
            createdAt: 1_700_000_000_000
        };
        vi.stubGlobal('chrome', {
            runtime: {
                id: extensionId,
                getURL: (path: string) => `chrome-extension://${extensionId}/${path}`,
                onMessage: { addListener },
                sendMessage: vi.fn(async (message) =>
                    message.type === MSG.OFFSCREEN_PAIRING_STORAGE
                        ? { ok: true, value: message.payload.action === 'get' ? remembered : 'client' }
                        : undefined
                )
            }
        });
        // resetModules needs a fresh listener; static import would reuse the first registration.
        await import('@/offscreen/index');
        const offscreen = addListener.mock.calls[0][0] as Listener;
        const sender = { id: extensionId, url: `chrome-extension://${extensionId}/static/js/background.js` };
        const status = await deliver(offscreen, { type: MSG.OFFSCREEN_STATUS, target: OFFSCREEN_TARGET }, sender);
        expect(status).toMatchObject({ ok: true, role: 'client', authorized: false, connectionId: null });
        const response = await deliver(
            offscreen,
            {
                type: MSG.OFFSCREEN_APP_REQUEST,
                target: OFFSCREEN_TARGET,
                payload: {
                    kind: PAYLOAD_KIND.SLACK_LIST,
                    deadlineMs: 5000,
                    connectionId: CONNECTION_A
                }
            },
            sender
        );
        expect(response).toEqual({ ok: false, error: ERROR_KIND.NO_ACTIVE_REQUEST });
    });
});
