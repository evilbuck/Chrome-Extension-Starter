import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PairingIdentity, SavedRoleStore, TrustStore } from '@/offscreen/identity-storage';
import { PairingController, type PairingPeer, type PairingSocket } from '@/offscreen/pairing';
import { ERROR_KIND, LIFECYCLE, type Lifecycle, MSG, OFFSCREEN_TARGET, PAYLOAD_KIND } from '@/shared/constants';
import type { PeerEnvelope, PeerPayload, PeerResponsePayload } from '@/shared/lib/envelope';
import { encodePairingBytes, signPairingText } from '@/shared/lib/pairing-crypto';
import {
    PAIRING_MAX_DESCRIPTOR_LENGTH,
    PAIRING_MAX_FRAME_BYTES,
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
    offerResult = 'local-offer';
    answerResult = 'local-answer';
    throwOnClose = false;
    beforeOffer: (() => void | Promise<void>) | null = null;
    beforeAccept: (() => void | Promise<void>) | null = null;
    beforeApply: (() => void | Promise<void>) | null = null;
    private readonly listeners = new Set<PeerListener>();

    async hostCreateOffer(): Promise<string> {
        if (this.beforeOffer) await this.beforeOffer();
        this.offers += 1;
        this.state = LIFECYCLE.SIGNALING;
        return this.offerResult;
    }

    async clientAcceptOffer(remote: string): Promise<string> {
        if (this.beforeAccept) await this.beforeAccept();
        this.applied.push(remote);
        this.state = LIFECYCLE.SIGNALING;
        return this.answerResult;
    }

    async applyRemoteAnswer(remote: string): Promise<void> {
        if (this.beforeApply) await this.beforeApply();
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
        if (this.throwOnClose) throw new Error('peer-close');
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

    emitFailed(error = 'ice-failed'): void {
        this.state = LIFECYCLE.FAILED;
        for (const listener of this.listeners) listener({ type: 'state', state: this.state, error });
    }

    emitClosed(): void {
        this.state = LIFECYCLE.CLOSED;
        for (const listener of this.listeners) listener({ type: 'state', state: this.state, error: null });
    }

    emitMessage(envelope: PeerEnvelope): void {
        for (const listener of this.listeners) listener({ type: 'message', state: this.state, envelope });
    }
}

class FakeSocket implements PairingSocket {
    readyState = 1;
    sent: string[] = [];
    throwOnSend: Error | null = null;
    throwOnClose = false;
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
        if (this.throwOnSend) throw this.throwOnSend;
        this.sent.push(data);
    }

    close(): void {
        if (this.throwOnClose) throw new Error('socket-close');
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

    const make = (opts?: {
        identity?: { loadOrCreate: () => Promise<PairingIdentity> };
        trust?: TrustStore;
        WebSocket?: new (url: string, protocols?: string | string[]) => PairingSocket;
        onPeerMessage?: (envelope: PeerEnvelope) => void;
        configurePeer?: (peer: FakePeer) => void;
    }) => {
        const Socket =
            opts?.WebSocket ??
            class extends FakeSocket {
                constructor(url: string, protocols?: string | string[]) {
                    super(url, protocols);
                    sockets.push(this);
                }
            };
        return new PairingController({
            identity: opts?.identity ?? { loadOrCreate: async () => host },
            trust: opts?.trust ?? trust(),
            savedRole: roleStore(),
            fetch: (url, init) => fetchImpl(String(url), init),
            WebSocket: Socket,
            now: () => 1_700_000_000_000,
            randomUuid: () => CONNECTION_B,
            randomNonce: () => 'N'.repeat(32),
            createPeer: () => {
                const peer = new FakePeer();
                opts?.configurePeer?.(peer);
                peers.push(peer);
                return peer;
            },
            onChange: () => {},
            onPeerMessage: opts?.onPeerMessage ?? (() => {})
        });
    };

    const emit = (socket: FakeSocket, message: unknown): void => {
        socket.onmessage?.(new MessageEvent('message', { data: JSON.stringify(message) }));
    };

    const emitRaw = (socket: FakeSocket, data: unknown): void => {
        socket.onmessage?.({ data } as MessageEvent);
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

    const signedOffer = (identity: PairingIdentity, connectionId: string, descriptor: string) =>
        signPairingText(identity.privateKey, pairingSignalText(ROOM_ID, 'host', { connectionId, descriptor }));

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

    it('cancels a waiting invitation over the socket and is a no-op while idle', async () => {
        const pairing = make();
        expect((await pairing.handleCommand({ action: 'cancel' })).ok).toBe(true);
        expect(pairing.snapshot()).toMatchObject({ phase: 'idle', code: null, pair: null, error: null });
        expect(sockets).toHaveLength(0);

        expect((await pairing.handleCommand({ action: 'create', label: 'HostBox' })).ok).toBe(true);
        expect(pairing.snapshot().phase).toBe('waiting');
        const socket = sockets[0];
        const cancel = await pairing.handleCommand({ action: 'cancel' });
        expect(cancel.ok).toBe(true);
        expect(socket.sent.map((frame) => JSON.parse(frame).type)).toEqual(['cancel']);
        expect(pairing.snapshot()).toMatchObject({ phase: 'idle', code: null, pending: null, pair: null });
        expect(socket.readyState).toBe(3);
    });

    it('forgets an unpaired controller without contacting the broker', async () => {
        const pairing = make();
        await pairing.ready();
        const result = await pairing.handleCommand({ action: 'forget' });
        expect(result).toMatchObject({ ok: true, pairing: { phase: 'idle', pair: null } });
        expect(stored).toBeNull();
    });

    it('reports unavailable when unpaired forget cannot clear the trust store', async () => {
        const pairing = make({
            trust: {
                get: async () => null,
                set: async () => {},
                clear: async () => {
                    throw new Error('idb');
                }
            }
        });
        await pairing.ready();
        expect(await pairing.handleCommand({ action: 'forget' })).toEqual({ ok: false, error: 'unavailable' });
        expect(pairing.snapshot()).toMatchObject({ phase: 'idle', error: 'unavailable', pair: null });
    });

    it('rejects confirm for an unknown attempt while idle', async () => {
        const pairing = make();
        await pairing.ready();
        expect(await pairing.handleCommand({ action: 'confirm', attemptId: ATTEMPT_A })).toEqual({
            ok: false,
            error: 'invalid_peer'
        });
        expect(pairing.snapshot().phase).toBe('idle');
    });

    it('rejects join when room credentials are malformed or expired', async () => {
        fetchImpl = async () =>
            jsonResponse({ ok: true, roomId: 'not-a-uuid', ticket: TICKET, code: 'ABCDE', expiresAt: null });
        const malformed = make();
        expect(await malformed.handleCommand({ action: 'join', code: 'ABCDE', label: 'ClientBox' })).toEqual({
            ok: false,
            error: 'invalid_message'
        });
        expect(malformed.snapshot()).toMatchObject({ phase: 'failed', error: 'invalid_message' });

        fetchImpl = async () => jsonResponse({ error: 'expired' }, 410);
        const expiredHttp = make();
        expect(await expiredHttp.handleCommand({ action: 'join', code: 'ABCDE', label: 'ClientBox' })).toEqual({
            ok: false,
            error: 'expired'
        });
        expect(expiredHttp.snapshot()).toMatchObject({ phase: 'expired', error: 'expired' });

        fetchImpl = async () => jsonResponse(credentials());
        const pairing = make();
        expect((await pairing.handleCommand({ action: 'join', code: 'ABCDE', label: 'ClientBox' })).ok).toBe(true);
        emit(sockets[0], { type: 'waiting', expiresAt: 1_699_000_000_000 });
        await vi.waitFor(() => {
            expect(pairing.snapshot()).toMatchObject({ phase: 'expired', error: 'expired' });
        });
    });

    it('maps a malformed or wrong-role remote signal to a pairing error without applying it', async () => {
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

        emitRaw(socket, '{not-json');
        await vi.waitFor(() => {
            expect(pairing.snapshot()).toMatchObject({ phase: 'failed', error: 'invalid_message' });
        });
        expect(peers[0]?.applied ?? []).toEqual([]);
        expect(pairing.isAuthorized(CONNECTION_A)).toBe(false);
    });

    it('rejects a remote answer signed for the wrong role and leaves the descriptor unapplied', async () => {
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
        const signature = await signedOffer(client, CONNECTION_A, 'answer-one');
        emit(socket, { type: 'signal', connectionId: CONNECTION_A, descriptor: 'answer-one', signature });
        await vi.waitFor(() => {
            expect(pairing.snapshot().error).toBe('invalid_peer');
        });
        expect(peers[0]?.applied ?? []).toEqual([]);
        expect(pairing.snapshot().phase).toBe('failed');
        expect(pairing.isAuthorized(CONNECTION_A)).toBe(false);
    });

    it('rejects an empty remote descriptor as invalid_message', async () => {
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
        emit(socket, { type: 'signal', connectionId: CONNECTION_A, descriptor: '', signature: 'AAAA' });
        await vi.waitFor(() => {
            expect(pairing.snapshot()).toMatchObject({ phase: 'failed', error: 'invalid_message' });
        });
        expect(peers[0]?.applied ?? []).toEqual([]);
    });

    it('maps socket close and error mid-attempt onto disconnected and unavailable', async () => {
        const pairing = make();
        await pairing.handleCommand({ action: 'create', label: 'HostBox' });
        sockets[0].onclose?.(new CloseEvent('close'));
        await vi.waitFor(() => {
            expect(pairing.snapshot()).toMatchObject({ phase: 'failed', error: 'disconnected' });
        });

        const unavailable = make();
        await unavailable.handleCommand({ action: 'create', label: 'HostBox' });
        sockets[1].onerror?.(new Event('error'));
        await vi.waitFor(() => {
            expect(unavailable.snapshot()).toMatchObject({ phase: 'failed', error: 'unavailable' });
        });
    });

    it('disconnects an established pair when the rendezvous socket closes', async () => {
        const pairing = make();
        await pairing.handleCommand({ action: 'create', label: 'HostBox' });
        const socket = sockets[0];
        const peer = await hostUntilConnected(pairing, socket);
        socket.onclose?.(new CloseEvent('close'));
        await vi.waitFor(() => {
            expect(pairing.snapshot()).toMatchObject({ phase: 'disconnected', error: 'disconnected' });
        });
        expect(peer.closed).toBe(true);
        expect(pairing.isAuthorized(CONNECTION_A)).toBe(false);
    });

    it('reconnects a populated trust store and refuses connect when unpaired or busy', async () => {
        const unpaired = make();
        await unpaired.ready();
        expect(await unpaired.handleCommand({ action: 'connect' })).toEqual({ ok: false, error: 'unpaired' });

        stored = {
            id: ROOM_ID,
            role: 'host',
            peer: { publicKey: client.publicKeySpki, label: 'ClientBox' },
            createdAt: 1_700_000_000_000
        };
        fetchImpl = async () => jsonResponse(credentials(null));
        const pairing = make();
        await pairing.ready();
        expect(pairing.snapshot().phase).toBe('disconnected');
        expect((await pairing.handleCommand({ action: 'connect' })).ok).toBe(true);
        expect(pairing.snapshot().phase).toBe('connecting');
        expect(sockets[0].url).toBe(`${PAIRING_ORIGIN}/v1/socket/${ROOM_ID}`);
        expect(await pairing.handleCommand({ action: 'connect' })).toEqual({ ok: false, error: 'busy' });
        expect(pairing.snapshot().phase).toBe('connecting');
    });

    it('fails reconnect when the identity store cannot load keys', async () => {
        stored = {
            id: ROOM_ID,
            role: 'host',
            peer: { publicKey: client.publicKeySpki, label: 'ClientBox' },
            createdAt: 1_700_000_000_000
        };
        const pairing = make({
            identity: {
                loadOrCreate: async () => {
                    throw new Error('no-identity');
                }
            }
        });
        await pairing.ready();
        expect(await pairing.handleCommand({ action: 'connect' })).toEqual({ ok: false, error: 'unavailable' });
        expect(pairing.snapshot()).toMatchObject({ phase: 'failed', error: 'unavailable' });
    });

    it('rejects a second create while waiting as busy', async () => {
        const pairing = make();
        expect((await pairing.handleCommand({ action: 'create', label: 'HostBox' })).ok).toBe(true);
        expect(pairing.snapshot()).toMatchObject({ phase: 'waiting', code: 'ABCDE' });
        expect(await pairing.handleCommand({ action: 'create', label: 'HostBox' })).toEqual({
            ok: false,
            error: 'busy'
        });
        expect(pairing.snapshot().phase).toBe('waiting');
        expect(sockets).toHaveLength(1);
    });

    it('maps a throwing socket constructor and a throwing confirm send to unavailable', async () => {
        class ThrowingSocket implements PairingSocket {
            readyState = 0;
            onopen = null;
            onmessage = null;
            onclose = null;
            onerror = null;
            constructor(_url: string, _protocols?: string | string[]) {
                throw new Error('ws-unavailable');
            }
            send(): void {}
            close(): void {}
        }
        const pairing = make({
            WebSocket: ThrowingSocket
        });
        expect(await pairing.handleCommand({ action: 'create', label: 'HostBox' })).toEqual({
            ok: false,
            error: 'unavailable'
        });
        expect(pairing.snapshot()).toMatchObject({ phase: 'failed', error: 'unavailable' });

        const confirming = make();
        await confirming.handleCommand({ action: 'create', label: 'HostBox' });
        const socket = sockets[0];
        emit(socket, pendingMessage(ATTEMPT_A, client));
        await vi.waitFor(() => {
            expect(confirming.snapshot().phase).toBe('confirming');
        });
        socket.throwOnSend = new Error('send-failed');
        expect(await confirming.handleCommand({ action: 'confirm', attemptId: ATTEMPT_A })).toEqual({
            ok: false,
            error: 'unavailable'
        });
        expect(confirming.snapshot().phase).toBe('confirming');
    });

    it('still cancels locally when the waiting socket cannot send cancel', async () => {
        const pairing = make();
        await pairing.handleCommand({ action: 'create', label: 'HostBox' });
        sockets[0].throwOnSend = new Error('send-failed');
        expect((await pairing.handleCommand({ action: 'cancel' })).ok).toBe(true);
        expect(pairing.snapshot()).toMatchObject({ phase: 'idle', pair: null });
    });

    it('answers a host offer on the client path and withholds authorization until connected', async () => {
        const pairing = make();
        expect((await pairing.handleCommand({ action: 'join', code: 'ABCDE', label: 'ClientBox' })).ok).toBe(true);
        const socket = sockets[0];
        emit(socket, pendingMessage(ATTEMPT_A, client));
        await vi.waitFor(() => {
            expect(pairing.snapshot().phase).toBe('confirming');
        });
        await pairing.handleCommand({ action: 'confirm', attemptId: ATTEMPT_A });
        emit(socket, {
            type: 'paired',
            connectionId: CONNECTION_A,
            pair: {
                id: ROOM_ID,
                role: 'client',
                peer: { publicKey: client.publicKeySpki, label: 'ClientBox' },
                createdAt: 1_700_000_000_000
            }
        });
        await vi.waitFor(() => {
            expect(pairing.snapshot().phase).toBe('connecting');
            expect(pairing.getRole()).toBe('client');
        });
        const signature = await signedOffer(client, CONNECTION_A, 'offer-one');
        emit(socket, { type: 'signal', connectionId: CONNECTION_A, descriptor: 'offer-one', signature });
        await vi.waitFor(() => {
            expect(peers[0]?.applied).toEqual(['offer-one']);
            expect(socket.sent.some((frame) => JSON.parse(frame).type === 'signal')).toBe(true);
        });
        const answer = JSON.parse(socket.sent.find((frame) => JSON.parse(frame).type === 'signal') ?? '{}');
        expect(answer).toMatchObject({ type: 'signal', connectionId: CONNECTION_A, descriptor: 'local-answer' });
        expect(pairing.isAuthorized(CONNECTION_A)).toBe(false);
        peers[0]?.emitConnected();
        await vi.waitFor(() => {
            expect(pairing.isAuthorized(CONNECTION_A)).toBe(true);
            expect(pairing.snapshot().phase).toBe('connected');
        });
    });

    it('promotes a join without a displayed code from creating to waiting on the socket ack', async () => {
        fetchImpl = async () => jsonResponse(credentials(null));
        const pairing = make();
        expect((await pairing.handleCommand({ action: 'join', code: 'ABCDE', label: 'ClientBox' })).ok).toBe(true);
        expect(pairing.snapshot()).toMatchObject({ phase: 'creating', code: null });
        emit(sockets[0], { type: 'waiting', expiresAt: 1_700_000_120_000 });
        await vi.waitFor(() => {
            expect(pairing.snapshot()).toMatchObject({ phase: 'waiting', expiresAt: 1_700_000_120_000 });
        });
    });

    it('fails closed on unparseable, oversized, or unrecognized socket frames', async () => {
        const pairing = make();
        await pairing.handleCommand({ action: 'create', label: 'HostBox' });
        const socket = sockets[0];

        emitRaw(socket, { not: 'a-string' });
        await vi.waitFor(() => {
            expect(pairing.snapshot()).toMatchObject({ phase: 'failed', error: 'invalid_message' });
        });

        const oversized = make();
        await oversized.handleCommand({ action: 'create', label: 'HostBox' });
        emitRaw(sockets[1], 'x'.repeat(PAIRING_MAX_FRAME_BYTES + 1));
        await vi.waitFor(() => {
            expect(oversized.snapshot()).toMatchObject({ phase: 'failed', error: 'invalid_message' });
        });

        const unknown = make();
        await unknown.handleCommand({ action: 'create', label: 'HostBox' });
        emit(sockets[2], { type: 'nope' });
        await vi.waitFor(() => {
            expect(unknown.snapshot()).toMatchObject({ phase: 'failed', error: 'invalid_message' });
        });
    });

    it('applies a broker error frame and ignores a waiting ack with a non-numeric expiry', async () => {
        const pairing = make();
        await pairing.handleCommand({ action: 'create', label: 'HostBox' });
        emit(sockets[0], { type: 'error', error: 'rejected' });
        await vi.waitFor(() => {
            expect(pairing.snapshot()).toMatchObject({ phase: 'rejected', error: 'rejected' });
        });

        const waiting = make();
        await waiting.handleCommand({ action: 'create', label: 'HostBox' });
        emit(sockets[1], { type: 'waiting', expiresAt: 'later' });
        await vi.waitFor(() => {
            expect(waiting.snapshot()).toMatchObject({ phase: 'failed', error: 'invalid_message' });
        });
    });

    it('maps invitation HTTP failures onto the broker error or status class', async () => {
        fetchImpl = async () => jsonResponse({ error: 'invalid_code' }, 400);
        expect(await make().handleCommand({ action: 'join', code: 'ABCDE', label: 'ClientBox' })).toEqual({
            ok: false,
            error: 'invalid_code'
        });

        fetchImpl = async () => jsonResponse({}, 429);
        expect(await make().handleCommand({ action: 'create', label: 'HostBox' })).toEqual({
            ok: false,
            error: 'rate_limited'
        });

        fetchImpl = async () => jsonResponse({}, 409);
        expect(await make().handleCommand({ action: 'create', label: 'HostBox' })).toEqual({
            ok: false,
            error: 'busy'
        });

        fetchImpl = async () => jsonResponse({}, 503);
        expect(await make().handleCommand({ action: 'create', label: 'HostBox' })).toEqual({
            ok: false,
            error: 'unavailable'
        });

        fetchImpl = async () => {
            throw new TypeError('network');
        };
        expect(await make().handleCommand({ action: 'create', label: 'HostBox' })).toEqual({
            ok: false,
            error: 'unavailable'
        });
    });

    it('refuses create and join that disagree with a saved role', async () => {
        savedRole = 'client';
        expect(await make().handleCommand({ action: 'create', label: 'HostBox' })).toEqual({
            ok: false,
            error: 'invalid_peer'
        });
        savedRole = 'host';
        expect(await make().handleCommand({ action: 'join', code: 'ABCDE', label: 'ClientBox' })).toEqual({
            ok: false,
            error: 'invalid_peer'
        });
    });

    it('rejects a paired event that arrives before local confirm', async () => {
        const pairing = make();
        await pairing.handleCommand({ action: 'create', label: 'HostBox' });
        const socket = sockets[0];
        emit(socket, pendingMessage(ATTEMPT_A, client));
        await vi.waitFor(() => {
            expect(pairing.snapshot().phase).toBe('confirming');
        });
        emit(socket, pairedMessage(client, CONNECTION_A));
        await vi.waitFor(() => {
            expect(pairing.snapshot()).toMatchObject({ phase: 'failed', error: 'invalid_peer' });
        });
        expect(stored).toBeNull();
        expect(pairing.isAuthorized(CONNECTION_A)).toBe(false);
    });

    it('fails the host offer when the local descriptor is oversized', async () => {
        const pairing = make({
            configurePeer: (peer) => {
                peer.offerResult = 'x'.repeat(PAIRING_MAX_DESCRIPTOR_LENGTH + 1);
            }
        });
        await pairing.handleCommand({ action: 'create', label: 'HostBox' });
        const socket = sockets[0];
        emit(socket, pendingMessage(ATTEMPT_A, client));
        await vi.waitFor(() => {
            expect(pairing.snapshot().phase).toBe('confirming');
        });
        await pairing.handleCommand({ action: 'confirm', attemptId: ATTEMPT_A });
        emit(socket, pairedMessage(client, CONNECTION_A));
        await vi.waitFor(() => {
            expect(pairing.snapshot()).toMatchObject({ phase: 'failed', error: 'invalid_message' });
        });
        expect(socket.sent.some((frame) => JSON.parse(frame).type === 'signal')).toBe(false);
    });

    it('fails the host offer when the rendezvous socket drops during local SDP', async () => {
        const pairing = make({
            configurePeer: (peer) => {
                peer.beforeOffer = () => {
                    sockets[0].readyState = 3;
                };
            }
        });
        await pairing.handleCommand({ action: 'create', label: 'HostBox' });
        const socket = sockets[0];
        emit(socket, pendingMessage(ATTEMPT_A, client));
        await vi.waitFor(() => {
            expect(pairing.snapshot().phase).toBe('confirming');
        });
        await pairing.handleCommand({ action: 'confirm', attemptId: ATTEMPT_A });
        emit(socket, pairedMessage(client, CONNECTION_A));
        await vi.waitFor(() => {
            expect(pairing.snapshot()).toMatchObject({ phase: 'disconnected', error: 'disconnected' });
        });
        expect(pairing.isAuthorized(CONNECTION_A)).toBe(false);
    });

    it('undoes a pin persisted after the attempt was cancelled', async () => {
        let releaseSet!: () => void;
        let resolveStarted!: () => void;
        const setStarted = new Promise<void>((resolve) => {
            resolveStarted = resolve;
        });
        const setGate = new Promise<void>((resolve) => {
            releaseSet = resolve;
        });
        const pairing = make({
            trust: {
                get: async () => stored,
                set: async (pair) => {
                    stored = pair;
                    resolveStarted();
                    await setGate;
                },
                clear: async () => {
                    stored = null;
                }
            }
        });
        await pairing.handleCommand({ action: 'create', label: 'HostBox' });
        const socket = sockets[0];
        emit(socket, pendingMessage(ATTEMPT_A, client));
        await vi.waitFor(() => {
            expect(pairing.snapshot().phase).toBe('confirming');
        });
        await pairing.handleCommand({ action: 'confirm', attemptId: ATTEMPT_A });
        emit(socket, pairedMessage(client, CONNECTION_A));
        await setStarted;
        expect((await pairing.handleCommand({ action: 'cancel' })).ok).toBe(true);
        releaseSet();
        await vi.waitFor(() => {
            expect(stored).toBeNull();
        });
        expect(pairing.snapshot()).toMatchObject({ phase: 'idle', pair: null });
        expect(pairing.isAuthorized(CONNECTION_A)).toBe(false);
    });

    it('marks connection_failed when the peer reports a failed lifecycle', async () => {
        const pairing = make();
        await pairing.handleCommand({ action: 'create', label: 'HostBox' });
        const socket = sockets[0];
        await hostUntilConnected(pairing, socket);
        peers[0]?.emitFailed('ice-failed');
        await vi.waitFor(() => {
            expect(pairing.snapshot()).toMatchObject({ phase: 'failed', error: 'connection_failed' });
        });
        expect(pairing.getLifecycle()).toBe(LIFECYCLE.FAILED);
        expect(pairing.isAuthorized(CONNECTION_A)).toBe(false);
    });

    it('disconnects when an authorized peer closes', async () => {
        const pairing = make();
        await pairing.handleCommand({ action: 'create', label: 'HostBox' });
        const socket = sockets[0];
        const peer = await hostUntilConnected(pairing, socket);
        peer.emitClosed();
        await vi.waitFor(() => {
            expect(pairing.snapshot()).toMatchObject({ phase: 'disconnected', error: 'disconnected' });
        });
        expect(pairing.isAuthorized(CONNECTION_A)).toBe(false);
    });

    it('forwards authorized peer messages and drops unauthorized ones', async () => {
        const received: PeerEnvelope[] = [];
        const pairing = make({
            onPeerMessage: (envelope) => {
                received.push(envelope);
            }
        });
        await pairing.handleCommand({ action: 'create', label: 'HostBox' });
        const socket = sockets[0];
        const envelope = {
            v: 1,
            role: 'client',
            connectionId: CONNECTION_A,
            requestId: ATTEMPT_A,
            deadline: 1_700_000_120_000,
            payload: { kind: PAYLOAD_KIND.PING }
        } as PeerEnvelope;
        emit(socket, pendingMessage(ATTEMPT_A, client));
        await vi.waitFor(() => {
            expect(pairing.snapshot().phase).toBe('confirming');
        });
        await pairing.handleCommand({ action: 'confirm', attemptId: ATTEMPT_A });
        emit(socket, pairedMessage(client, CONNECTION_A));
        await vi.waitFor(() => {
            expect(pairing.snapshot().phase).toBe('connecting');
        });
        peers[0]?.emitMessage(envelope);
        expect(received).toEqual([]);
        const signature = await signedAnswer(client, CONNECTION_A, 'answer-one');
        emit(socket, { type: 'signal', connectionId: CONNECTION_A, descriptor: 'answer-one', signature });
        await vi.waitFor(() => {
            expect(peers[0]?.applied).toEqual(['answer-one']);
        });
        peers[0]?.emitConnected();
        await vi.waitFor(() => {
            expect(pairing.isAuthorized(CONNECTION_A)).toBe(true);
        });
        peers[0]?.emitMessage(envelope);
        expect(received).toEqual([envelope]);
    });

    it('returns the current snapshot for status and tears down via dispose', async () => {
        const pairing = make();
        expect(await pairing.handleCommand({ action: 'status' })).toEqual({
            ok: true,
            pairing: pairing.snapshot()
        });
        await pairing.handleCommand({ action: 'create', label: 'HostBox' });
        expect(pairing.snapshot().phase).toBe('waiting');
        pairing.dispose();
        expect(pairing.snapshot()).toMatchObject({ phase: 'idle', code: null });
        expect(sockets[0].sent.map((frame) => JSON.parse(frame).type)).toEqual(['cancel']);
    });

    it('confirms as disconnected when the waiting socket is no longer open', async () => {
        const pairing = make();
        await pairing.handleCommand({ action: 'create', label: 'HostBox' });
        const socket = sockets[0];
        emit(socket, pendingMessage(ATTEMPT_A, client));
        await vi.waitFor(() => {
            expect(pairing.snapshot().phase).toBe('confirming');
        });
        socket.readyState = 3;
        expect(await pairing.handleCommand({ action: 'confirm', attemptId: ATTEMPT_A })).toEqual({
            ok: false,
            error: 'disconnected'
        });
        expect(pairing.snapshot().phase).toBe('confirming');
    });

    it('rejects room credentials that fail ticket, code, or expiry checks', async () => {
        fetchImpl = async () =>
            jsonResponse({ ok: true, roomId: ROOM_ID, ticket: 'short', code: 'ABCDE', expiresAt: null });
        expect(await make().handleCommand({ action: 'create', label: 'HostBox' })).toEqual({
            ok: false,
            error: 'invalid_message'
        });

        fetchImpl = async () =>
            jsonResponse({ ok: true, roomId: ROOM_ID, ticket: TICKET, code: 'ABC1E', expiresAt: null });
        expect(await make().handleCommand({ action: 'create', label: 'HostBox' })).toEqual({
            ok: false,
            error: 'invalid_message'
        });

        fetchImpl = async () =>
            ({
                ok: true,
                status: 200,
                json: async () => ({
                    ok: true,
                    roomId: ROOM_ID,
                    ticket: TICKET,
                    code: 'ABCDE',
                    expiresAt: Number.POSITIVE_INFINITY
                })
            }) as Response;
        expect(await make().handleCommand({ action: 'create', label: 'HostBox' })).toEqual({
            ok: false,
            error: 'invalid_message'
        });
    });

    it('ignores rendezvous socket errors after the pair is already connected', async () => {
        const pairing = make();
        await pairing.handleCommand({ action: 'create', label: 'HostBox' });
        const socket = sockets[0];
        await hostUntilConnected(pairing, socket);
        socket.onerror?.(new Event('error'));
        expect(pairing.snapshot().phase).toBe('connected');
        expect(pairing.isAuthorized(CONNECTION_A)).toBe(true);
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
