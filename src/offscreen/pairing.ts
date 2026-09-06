import {
    createIdentityStore,
    createSavedRoleStore,
    createTrustStore,
    type IdentityStore,
    isPairedBrowser,
    type PairingIdentity,
    type SavedRoleStore,
    type TrustStore
} from '@/offscreen/identity-storage';
import { LIFECYCLE, type Lifecycle, type Role } from '@/shared/constants';
import type { PeerEnvelope, PeerPayload, PeerResponsePayload } from '@/shared/lib/envelope';
import { encodePairingBytes, signPairingText, verifyPairingText } from '@/shared/lib/pairing-crypto';
import {
    isPairingCommand,
    isPairingDevice,
    normalizePairingCode,
    PAIRING_MAX_DESCRIPTOR_LENGTH,
    PAIRING_MAX_FRAME_BYTES,
    PAIRING_ORIGIN,
    PAIRING_SOCKET_PROTOCOL,
    type PairedBrowser,
    type PairingCommand,
    type PairingCommandResult,
    type PairingFailure,
    type PairingPhase,
    type PairingRole,
    type PairingServerMessage,
    type PairingSnapshot,
    pairingProofText,
    pairingSignalText,
    type RoomCredentials,
    type SignedSignal
} from '@/shared/lib/pairing-protocol';
import { Peer, type PeerListener } from '@/shared/lib/peer';
import { isUuidV4, randomUuid } from '@/shared/lib/uuid';

const PAIRING_FAILURES: Record<string, true> = {
    invalid_code: true,
    expired: true,
    busy: true,
    rejected: true,
    cancelled: true,
    disconnected: true,
    unpaired: true,
    invalid_peer: true,
    invalid_message: true,
    rate_limited: true,
    unavailable: true,
    connection_failed: true
};

const PAIRING_MAX_INBOUND_QUEUE = 4;

export interface PairingPeer {
    hostCreateOffer(): Promise<string>;
    clientAcceptOffer(remote: string): Promise<string>;
    applyRemoteAnswer(remote: string): Promise<void>;
    subscribe(listener: PeerListener): () => void;
    close(): void;
    getState(): Lifecycle;
    sendRequest(payload: PeerPayload, deadlineMs: number): Promise<PeerEnvelope>;
    sendReply(payload: PeerResponsePayload, deadlineMs: number): void;
}
export interface PairingSocket {
    readyState: number;
    send(data: string): void;
    close(): void;
    onopen: ((event: Event) => void) | null;
    onmessage: ((event: MessageEvent) => void) | null;
    onclose: ((event: CloseEvent) => void) | null;
    onerror: ((event: Event) => void) | null;
}

export interface PairingControllerDeps {
    identity: IdentityStore;
    trust: TrustStore;
    savedRole: SavedRoleStore;
    fetch: typeof fetch;
    WebSocket: new (url: string, protocols?: string | string[]) => PairingSocket;
    now: () => number;
    randomUuid: () => string;
    randomNonce: () => string;
    createPeer: (options: { role: Role; connectionId: string }) => PairingPeer;
    onChange: () => void;
    onPeerMessage: (envelope: PeerEnvelope) => void;
}

class PairingFlowError extends Error {
    constructor(readonly failure: PairingFailure) {
        super(failure);
        this.name = 'PairingFlowError';
    }
}

export const createBrowserPairingDeps = (
    hooks: Pick<PairingControllerDeps, 'onChange' | 'onPeerMessage'>
): PairingControllerDeps => ({
    identity: createIdentityStore(),
    trust: createTrustStore(),
    savedRole: createSavedRoleStore(),
    fetch: (input, init) => globalThis.fetch(input, init),
    WebSocket: globalThis.WebSocket as unknown as PairingControllerDeps['WebSocket'],
    now: Date.now,
    randomUuid,
    randomNonce: () => encodePairingBytes(crypto.getRandomValues(new Uint8Array(32)).buffer),
    createPeer: (options) => new Peer(options),
    onChange: hooks.onChange,
    onPeerMessage: hooks.onPeerMessage
});

export class PairingController {
    private readonly deps: PairingControllerDeps;
    private readonly restored: Promise<void>;
    private generation = 0;
    private abort = new AbortController();
    private phase: PairingPhase = 'idle';
    private code: string | null = null;
    private expiresAt: number | null = null;
    private pending: PairingSnapshot['pending'] = null;
    private pair: PairedBrowser | null = null;
    private roomId: string | null = null;
    private error: PairingFailure | null = null;
    private role: PairingRole | null = null;
    private connectionId: string | null = null;
    private lifecycle: Lifecycle = LIFECYCLE.IDLE;
    private lastError: string | null = null;
    private identity: PairingIdentity | null = null;
    private socket: PairingSocket | null = null;
    private peer: PairingPeer | null = null;
    private unsubscribePeer: (() => void) | null = null;
    private remoteSignatureVerified = false;
    private appliedRemoteConnectionId: string | null = null;
    private inboundQueue: PairingServerMessage[] = [];
    private draining = false;
    private expiryTimer: ReturnType<typeof setTimeout> | null = null;
    private locallyConfirmed = false;

    constructor(deps: PairingControllerDeps) {
        this.deps = deps;
        this.restored = this.restore();
    }

    async ready(): Promise<void> {
        await this.restored;
    }

    snapshot(): PairingSnapshot {
        return {
            phase: this.phase,
            code: this.code,
            expiresAt: this.expiresAt,
            pending: this.pending
                ? {
                      attemptId: this.pending.attemptId,
                      peer: { publicKey: this.pending.peer.publicKey, label: this.pending.peer.label },
                      confirmed: this.pending.confirmed
                  }
                : null,
            pair: this.pair
                ? {
                      id: this.pair.id,
                      role: this.pair.role,
                      peer: { publicKey: this.pair.peer.publicKey, label: this.pair.peer.label },
                      createdAt: this.pair.createdAt
                  }
                : null,
            error: this.error
        };
    }

    getPeer(): PairingPeer | null {
        return this.peer;
    }

    getRole(): Role | null {
        return this.role;
    }

    getConnectionId(): string | null {
        return this.connectionId;
    }

    getLifecycle(): Lifecycle {
        return this.lifecycle;
    }

    getLastError(): string | null {
        return this.lastError;
    }

    isAuthorized(connectionId: string): boolean {
        return (
            this.pair !== null &&
            this.remoteSignatureVerified &&
            this.connectionId !== null &&
            this.connectionId === connectionId &&
            this.peer !== null &&
            this.peer.getState() === LIFECYCLE.CONNECTED
        );
    }

    async handleCommand(command: PairingCommand): Promise<PairingCommandResult> {
        await this.restored;
        if (!isPairingCommand(command)) return { ok: false, error: 'invalid_message' };
        try {
            switch (command.action) {
                case 'status':
                    break;
                case 'create':
                    await this.createInvitation(command.label);
                    break;
                case 'join':
                    await this.joinInvitation(command.code, command.label);
                    break;
                case 'confirm':
                    await this.confirmAttempt(command.attemptId);
                    break;
                case 'connect':
                    await this.reconnectPair();
                    break;
                case 'cancel':
                    this.cancelAttempt();
                    break;
                case 'forget':
                    return await this.forgetPair();
            }
            return { ok: true, pairing: this.snapshot() };
        } catch (error) {
            const failure = error instanceof PairingFlowError ? error.failure : 'unavailable';
            return { ok: false, error: failure };
        }
    }

    disconnectTransport(): void {
        this.cancelAttempt();
    }

    dispose(): void {
        this.cancelAttempt();
    }

    private async restore(): Promise<void> {
        const generation = this.generation;
        const pair = await this.deps.trust.get();
        if (!this.generationMatches(generation)) return;
        if (!pair) return;
        this.pair = pair;
        this.roomId = pair.id;
        this.role = pair.role;
        this.phase = 'disconnected';
        this.emitChange();
    }

    private idleEnough(): boolean {
        return (
            this.phase === 'idle' ||
            this.phase === 'disconnected' ||
            this.phase === 'failed' ||
            this.phase === 'expired' ||
            this.phase === 'rejected'
        );
    }

    private async createInvitation(label: string): Promise<void> {
        if (this.pair || !this.idleEnough()) throw new PairingFlowError('busy');
        const savedRole = await this.deps.savedRole.get();
        if (savedRole && savedRole !== 'host') throw new PairingFlowError('invalid_peer');
        const generation = this.beginAttempt('host');
        this.phase = 'creating';
        this.emitChange();
        try {
            const identity = await this.requireIdentity(generation);
            const credentials = await this.postCredentials(
                '/v1/invitations',
                { publicKey: identity.publicKeySpki, label },
                generation
            );
            this.installCredentials(credentials, generation);
            this.phase = 'waiting';
            this.emitChange();
            this.openSocket(credentials, generation);
        } catch (error) {
            this.rethrowAttempt(generation, error);
        }
    }

    private async joinInvitation(code: string, label: string): Promise<void> {
        if (this.pair || !this.idleEnough()) throw new PairingFlowError('busy');
        const savedRole = await this.deps.savedRole.get();
        if (savedRole && savedRole !== 'client') throw new PairingFlowError('invalid_peer');
        const generation = this.beginAttempt('client');
        this.phase = 'creating';
        this.emitChange();
        try {
            const identity = await this.requireIdentity(generation);
            const credentials = await this.postCredentials(
                '/v1/join',
                { publicKey: identity.publicKeySpki, label, code: normalizePairingCode(code) },
                generation
            );
            this.installCredentials(credentials, generation);
            this.phase = credentials.code ? 'waiting' : 'creating';
            this.emitChange();
            this.openSocket(credentials, generation);
        } catch (error) {
            this.rethrowAttempt(generation, error);
        }
    }

    private async confirmAttempt(attemptId: string): Promise<void> {
        if (!this.pending || this.pending.attemptId !== attemptId || this.phase !== 'confirming') {
            throw new PairingFlowError('invalid_peer');
        }
        const socket = this.socket;
        if (!socket || socket.readyState !== 1) throw new PairingFlowError('disconnected');
        socket.send(
            JSON.stringify({
                type: 'confirm',
                attemptId,
                peerPublicKey: this.pending.peer.publicKey
            })
        );
        this.locallyConfirmed = true;
        this.pending = { ...this.pending, confirmed: true };
        this.emitChange();
    }

    private async reconnectPair(): Promise<void> {
        if (!this.pair) throw new PairingFlowError('unpaired');
        if (!this.idleEnough()) throw new PairingFlowError('busy');
        const pin = this.pair;
        const generation = this.beginAttempt(pin.role, { keepTrust: true });
        this.phase = 'connecting';
        this.emitChange();
        try {
            const identity = await this.requireIdentity(generation);
            const proof = await this.signedProof('reconnect', pin.id, identity, generation);
            const credentials = await this.postCredentials('/v1/reconnect', proof, generation);
            this.installCredentials(credentials, generation, { keepCode: false });
            this.openSocket(credentials, generation);
        } catch (error) {
            this.rethrowAttempt(generation, error);
        }
    }

    private cancelAttempt(): void {
        const hadPair = this.pair !== null;
        const socket = this.socket;
        if (
            socket &&
            socket.readyState === 1 &&
            (this.phase === 'waiting' || this.phase === 'confirming' || this.phase === 'creating')
        ) {
            try {
                socket.send(JSON.stringify({ type: 'cancel' }));
            } catch {
                // Local close is enough; unused codes expire on the broker.
            }
        }
        const pair = this.pair;
        this.beginAttempt(hadPair ? (pair?.role ?? null) : null, { keepTrust: hadPair });
        this.pair = pair;
        this.roomId = pair?.id ?? null;
        this.role = pair?.role ?? null;
        this.phase = hadPair ? 'disconnected' : 'idle';
        this.emitChange();
    }

    private async forgetPair(): Promise<PairingCommandResult> {
        const pin = this.pair;
        this.pair = null;
        this.roomId = null;
        this.remoteSignatureVerified = false;
        this.closePeer();
        const generation = this.beginAttempt(null);
        this.phase = 'idle';
        this.emitChange();
        let durable = false;
        try {
            await this.deps.trust.clear();
            durable = true;
        } catch {
            durable = false;
        }
        if (!pin) {
            if (durable) return { ok: true, pairing: this.snapshot() };
            this.error = 'unavailable';
            this.emitChange();
            return { ok: false, error: 'unavailable' };
        }
        try {
            const identity = await this.deps.identity.loadOrCreate();
            const proof = await this.signedProof('forget', pin.id, identity, generation);
            const result = await this.postJson('/v1/forget', proof, generation);
            if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== true) {
                throw new PairingFlowError('invalid_message');
            }
            if (durable) return { ok: true, pairing: this.snapshot() };
            this.error = 'unavailable';
            this.emitChange();
            return { ok: false, error: 'unavailable' };
        } catch {
            if (!this.generationMatches(generation)) return { ok: false, error: 'cancelled' };
            this.error = 'unavailable';
            this.emitChange();
            return { ok: false, error: 'unavailable' };
        }
    }

    private beginAttempt(role: PairingRole | null, options?: { keepTrust?: boolean }): number {
        this.generation += 1;
        this.abort.abort();
        this.abort = new AbortController();
        this.clearExpiry();
        this.inboundQueue = [];
        this.draining = false;
        this.closeSocket();
        this.closePeer();
        this.connectionId = null;
        this.remoteSignatureVerified = false;
        this.appliedRemoteConnectionId = null;
        this.locallyConfirmed = false;
        this.pending = null;
        this.code = null;
        this.expiresAt = null;
        this.error = null;
        this.lifecycle = LIFECYCLE.IDLE;
        this.lastError = null;
        this.role = role;
        if (!options?.keepTrust) {
            this.pair = null;
            this.roomId = null;
        } else {
            this.roomId = this.pair?.id ?? null;
        }
        return this.generation;
    }

    private generationMatches(generation: number): boolean {
        return this.generation === generation;
    }

    private rethrowAttempt(generation: number, error: unknown): never {
        const failure = error instanceof PairingFlowError ? error.failure : 'unavailable';
        if (this.generationMatches(generation) && failure !== 'cancelled') this.setFailure(failure);
        throw error instanceof PairingFlowError ? error : new PairingFlowError(failure);
    }

    private async requireIdentity(generation: number): Promise<PairingIdentity> {
        const identity = this.identity ?? (await this.deps.identity.loadOrCreate());
        this.assertGeneration(generation);
        this.identity = identity;
        return identity;
    }

    private assertGeneration(generation: number): void {
        if (!this.generationMatches(generation)) throw new PairingFlowError('cancelled');
    }

    private installCredentials(
        credentials: RoomCredentials,
        generation: number,
        options?: { keepCode?: boolean }
    ): void {
        this.assertGeneration(generation);
        this.roomId = credentials.roomId;
        this.code = options?.keepCode === false ? null : credentials.code;
        this.expiresAt = credentials.expiresAt;
        this.armExpiry(credentials.expiresAt, generation);
    }

    private async postCredentials(path: string, body: unknown, generation: number): Promise<RoomCredentials> {
        const parsed = await this.postJson(path, body, generation);
        const credentials = this.asRoomCredentials(parsed);
        if (!credentials) throw new PairingFlowError('invalid_message');
        return credentials;
    }

    private async postJson(path: string, body: unknown, generation: number): Promise<unknown> {
        this.assertGeneration(generation);
        let response: Response;
        try {
            response = await this.deps.fetch(`${PAIRING_ORIGIN}${path}`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
                signal: this.abort.signal
            });
        } catch (error) {
            this.assertGeneration(generation);
            if (error instanceof PairingFlowError) throw error;
            throw new PairingFlowError('unavailable');
        }
        this.assertGeneration(generation);
        let parsed: unknown = null;
        try {
            parsed = await response.json();
        } catch {
            parsed = null;
        }
        this.assertGeneration(generation);
        if (!response.ok) throw new PairingFlowError(this.failureFromResponse(response.status, parsed));
        return parsed;
    }

    private asRoomCredentials(value: unknown): RoomCredentials | null {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        const record = value as Record<string, unknown>;
        if (record.ok !== true) return null;
        if (typeof record.roomId !== 'string' || !isUuidV4(record.roomId)) return null;
        if (typeof record.ticket !== 'string' || record.ticket.length < 16 || record.ticket.length > 256) return null;
        if (record.code !== null && (typeof record.code !== 'string' || !/^[A-HJ-NP-Z2-9]{5}$/.test(record.code)))
            return null;
        if (record.expiresAt !== null && (typeof record.expiresAt !== 'number' || !Number.isFinite(record.expiresAt)))
            return null;
        return {
            ok: true,
            roomId: record.roomId,
            ticket: record.ticket,
            code: record.code,
            expiresAt: record.expiresAt
        };
    }

    private failureFromResponse(status: number, parsed: unknown): PairingFailure {
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const error = (parsed as Record<string, unknown>).error;
            if (typeof error === 'string' && PAIRING_FAILURES[error]) return error as PairingFailure;
        }
        if (status === 429) return 'rate_limited';
        if (status === 409) return 'busy';
        if (status >= 500) return 'unavailable';
        return 'invalid_message';
    }

    private async signedProof(
        action: 'reconnect' | 'forget',
        roomId: string,
        identity: PairingIdentity,
        generation: number
    ): Promise<{ roomId: string; publicKey: string; nonce: string; timestamp: number; signature: string }> {
        const proof = {
            roomId,
            publicKey: identity.publicKeySpki,
            nonce: this.deps.randomNonce(),
            timestamp: this.deps.now()
        };
        const signature = await signPairingText(identity.privateKey, pairingProofText(action, proof));
        this.assertGeneration(generation);
        return { ...proof, signature };
    }

    private openSocket(credentials: RoomCredentials, generation: number): void {
        this.assertGeneration(generation);
        const url = `${PAIRING_ORIGIN}/v1/socket/${credentials.roomId}`;
        let socket: PairingSocket;
        try {
            socket = new this.deps.WebSocket(url, [PAIRING_SOCKET_PROTOCOL, credentials.ticket]);
        } catch {
            throw new PairingFlowError('unavailable');
        }
        this.socket = socket;
        socket.onmessage = (event) => {
            if (!this.generationMatches(generation) || this.socket !== socket) return;
            this.receiveSocketData(event.data, generation);
        };
        socket.onclose = () => {
            if (!this.generationMatches(generation) || this.socket !== socket) return;
            this.socket = null;
            if (this.phase === 'connected') {
                this.remoteSignatureVerified = false;
                this.closePeer();
                this.phase = 'disconnected';
                this.error = 'disconnected';
                this.emitChange();
                return;
            }
            if (
                this.phase === 'waiting' ||
                this.phase === 'confirming' ||
                this.phase === 'creating' ||
                this.phase === 'connecting'
            ) {
                this.setFailure('disconnected');
            }
        };
        socket.onerror = () => {
            if (!this.generationMatches(generation) || this.socket !== socket) return;
            if (this.phase !== 'connected') this.setFailure('unavailable');
        };
    }

    private receiveSocketData(data: unknown, generation: number): void {
        if (typeof data !== 'string' || data.length > PAIRING_MAX_FRAME_BYTES) {
            this.setFailure('invalid_message');
            return;
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(data);
        } catch {
            this.setFailure('invalid_message');
            return;
        }
        const message = this.asServerMessage(parsed);
        if (!message) {
            this.setFailure('invalid_message');
            return;
        }
        if (this.inboundQueue.length >= PAIRING_MAX_INBOUND_QUEUE) {
            this.setFailure('invalid_message');
            return;
        }
        this.inboundQueue.push(message);
        void this.drainInbound(generation);
    }

    private async drainInbound(generation: number): Promise<void> {
        if (this.draining) return;
        this.draining = true;
        try {
            while (this.inboundQueue.length > 0) {
                if (!this.generationMatches(generation)) {
                    this.inboundQueue = [];
                    break;
                }
                const message = this.inboundQueue.shift();
                if (!message) break;
                await this.handleServerMessage(message, generation);
            }
        } catch (error) {
            if (this.generationMatches(generation)) {
                this.setFailure(error instanceof PairingFlowError ? error.failure : 'connection_failed');
            }
        } finally {
            this.draining = false;
        }
    }

    private async handleServerMessage(message: PairingServerMessage, generation: number): Promise<void> {
        this.assertGeneration(generation);
        switch (message.type) {
            case 'waiting':
                this.expiresAt = message.expiresAt;
                if (this.phase === 'creating') this.phase = 'waiting';
                this.armExpiry(message.expiresAt, generation);
                this.emitChange();
                return;
            case 'pending':
                this.pending = { attemptId: message.attemptId, peer: message.peer, confirmed: this.locallyConfirmed };
                this.expiresAt = message.expiresAt;
                this.phase = 'confirming';
                this.armExpiry(message.expiresAt, generation);
                this.emitChange();
                return;
            case 'paired':
                await this.handlePaired(message.pair, message.connectionId, generation);
                return;
            case 'signal':
                await this.handleRemoteSignal(message, generation);
                return;
            case 'error':
                this.setFailure(message.error);
        }
    }

    private async handlePaired(pair: PairedBrowser, connectionId: string, generation: number): Promise<void> {
        this.assertGeneration(generation);
        if (!isUuidV4(connectionId) || !this.role || !this.roomId) throw new PairingFlowError('invalid_peer');
        const nextPair: PairedBrowser = {
            id: pair.id,
            role: pair.role,
            peer: { publicKey: pair.peer.publicKey, label: pair.peer.label },
            createdAt: pair.createdAt
        };
        if (this.pair) {
            if (
                nextPair.id !== this.pair.id ||
                nextPair.role !== this.pair.role ||
                nextPair.peer.publicKey !== this.pair.peer.publicKey
            ) {
                throw new PairingFlowError('invalid_peer');
            }
        } else {
            if (!this.pending || !this.locallyConfirmed) throw new PairingFlowError('invalid_peer');
            if (
                nextPair.id !== this.roomId ||
                nextPair.role !== this.role ||
                nextPair.peer.publicKey !== this.pending.peer.publicKey
            ) {
                throw new PairingFlowError('invalid_peer');
            }
            await this.persistPin(nextPair, generation);
        }
        this.assertGeneration(generation);
        this.pair = this.pair ?? nextPair;
        this.pending = null;
        this.code = null;
        this.expiresAt = null;
        this.clearExpiry();
        this.connectionId = connectionId;
        this.remoteSignatureVerified = false;
        this.appliedRemoteConnectionId = null;
        this.phase = 'connecting';
        this.replacePeer(this.role, connectionId, generation);
        this.emitChange();
        if (this.role === 'host') await this.sendLocalOffer(generation);
    }

    private async persistPin(pair: PairedBrowser, generation: number): Promise<void> {
        this.assertGeneration(generation);
        await this.deps.trust.set(pair);
        if (this.generationMatches(generation)) return;
        const current = await this.deps.trust.get();
        const memoryOwnsPin =
            this.pair !== null && this.pair.id === pair.id && this.pair.peer.publicKey === pair.peer.publicKey;
        if (!memoryOwnsPin && current && current.id === pair.id && current.peer.publicKey === pair.peer.publicKey) {
            try {
                await this.deps.trust.clear();
            } catch {
                // In-memory generation already moved on; durable undo is best-effort.
            }
        }
        throw new PairingFlowError('cancelled');
    }

    private async sendLocalOffer(generation: number): Promise<void> {
        const peer = this.peer;
        const connectionId = this.connectionId;
        const roomId = this.pair?.id ?? this.roomId;
        const identity = this.identity;
        const socket = this.socket;
        if (!peer || !connectionId || !roomId || !identity || !socket) throw new PairingFlowError('connection_failed');
        const descriptor = await peer.hostCreateOffer();
        this.assertGeneration(generation);
        if (this.peer !== peer || this.connectionId !== connectionId) throw new PairingFlowError('cancelled');
        if (descriptor.length > PAIRING_MAX_DESCRIPTOR_LENGTH) throw new PairingFlowError('invalid_message');
        const signature = await signPairingText(
            identity.privateKey,
            pairingSignalText(roomId, 'host', { connectionId, descriptor })
        );
        this.assertGeneration(generation);
        if (this.socket !== socket || socket.readyState !== 1) throw new PairingFlowError('disconnected');
        socket.send(JSON.stringify({ type: 'signal', connectionId, descriptor, signature }));
    }

    private async handleRemoteSignal(signal: SignedSignal, generation: number): Promise<void> {
        this.assertGeneration(generation);
        const pin = this.pair;
        const roomId = this.pair?.id ?? this.roomId;
        const role = this.role;
        const connectionId = this.connectionId;
        const identity = this.identity;
        const socket = this.socket;
        if (!pin || !roomId || !role || !connectionId || !identity) throw new PairingFlowError('invalid_peer');
        if (signal.connectionId !== connectionId) throw new PairingFlowError('invalid_peer');
        if (this.appliedRemoteConnectionId === connectionId) throw new PairingFlowError('invalid_peer');
        if (signal.descriptor.length === 0 || signal.descriptor.length > PAIRING_MAX_DESCRIPTOR_LENGTH) {
            throw new PairingFlowError('invalid_message');
        }
        const senderRole: PairingRole = role === 'host' ? 'client' : 'host';
        const ok = await verifyPairingText(
            pin.peer.publicKey,
            pairingSignalText(roomId, senderRole, { connectionId, descriptor: signal.descriptor }),
            signal.signature
        );
        this.assertGeneration(generation);
        if (!ok) throw new PairingFlowError('invalid_peer');
        if (role === 'client') {
            if (!this.peer) this.replacePeer(role, connectionId, generation);
            const peer = this.peer;
            if (!peer) throw new PairingFlowError('connection_failed');
            const descriptor = await peer.clientAcceptOffer(signal.descriptor);
            this.assertGeneration(generation);
            if (this.peer !== peer || this.connectionId !== connectionId) throw new PairingFlowError('cancelled');
            if (descriptor.length > PAIRING_MAX_DESCRIPTOR_LENGTH) throw new PairingFlowError('invalid_message');
            const signature = await signPairingText(
                identity.privateKey,
                pairingSignalText(roomId, 'client', { connectionId, descriptor })
            );
            this.assertGeneration(generation);
            if (!socket || this.socket !== socket || socket.readyState !== 1)
                throw new PairingFlowError('disconnected');
            socket.send(JSON.stringify({ type: 'signal', connectionId, descriptor, signature }));
        } else {
            const peer = this.peer;
            if (!peer) throw new PairingFlowError('connection_failed');
            await peer.applyRemoteAnswer(signal.descriptor);
            this.assertGeneration(generation);
            if (this.peer !== peer || this.connectionId !== connectionId) throw new PairingFlowError('cancelled');
        }
        this.appliedRemoteConnectionId = connectionId;
        this.remoteSignatureVerified = true;
        this.refreshConnectedPhase();
        this.emitChange();
    }

    private replacePeer(role: PairingRole, connectionId: string, generation: number): void {
        this.closePeer();
        const peer = this.deps.createPeer({ role, connectionId });
        const unsubscribe = peer.subscribe((event) => {
            if (!this.generationMatches(generation) || this.peer !== peer || this.connectionId !== connectionId) return;
            if (event.type === 'state' || event.type === 'channel-open' || event.type === 'channel-close') {
                this.lifecycle = event.state;
                this.lastError = 'error' in event ? (event.error as string | null) : null;
                if (event.type === 'state' && event.state === LIFECYCLE.FAILED) {
                    this.setFailure('connection_failed');
                    return;
                }
                if (event.type === 'state' && event.state === LIFECYCLE.CLOSED) {
                    this.remoteSignatureVerified = false;
                    if (this.phase === 'connected' || this.phase === 'connecting') {
                        this.phase = 'disconnected';
                        this.error = 'disconnected';
                    }
                }
                this.refreshConnectedPhase();
                this.emitChange();
                return;
            }
            if (event.type === 'message') {
                if (!this.isAuthorized(event.envelope.connectionId)) return;
                this.deps.onPeerMessage(event.envelope);
            }
        });
        this.peer = peer;
        this.unsubscribePeer = unsubscribe;
        this.lifecycle = peer.getState();
    }

    private refreshConnectedPhase(): void {
        if (
            this.pair &&
            this.remoteSignatureVerified &&
            this.connectionId &&
            this.peer &&
            this.peer.getState() === LIFECYCLE.CONNECTED
        ) {
            this.phase = 'connected';
            this.error = null;
            this.lifecycle = LIFECYCLE.CONNECTED;
        }
    }

    private setFailure(failure: PairingFailure): void {
        const hadPair = this.pair !== null;
        this.generation += 1;
        this.abort.abort();
        this.abort = new AbortController();
        this.inboundQueue = [];
        this.closeSocket();
        this.closePeer();
        this.remoteSignatureVerified = false;
        this.connectionId = null;
        this.pending = null;
        this.code = null;
        this.clearExpiry();
        this.error = failure;
        if (failure === 'expired') this.phase = 'expired';
        else if (failure === 'rejected') this.phase = 'rejected';
        else if (failure === 'disconnected' && hadPair) this.phase = 'disconnected';
        else if (failure === 'cancelled') this.phase = hadPair ? 'disconnected' : 'idle';
        else this.phase = 'failed';
        this.lifecycle = LIFECYCLE.FAILED;
        this.emitChange();
    }

    private closeSocket(): void {
        const socket = this.socket;
        this.socket = null;
        if (!socket) return;
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        try {
            socket.close();
        } catch {
            // Already closed.
        }
    }

    private closePeer(): void {
        const unsub = this.unsubscribePeer;
        const peer = this.peer;
        this.unsubscribePeer = null;
        this.peer = null;
        if (unsub) unsub();
        if (!peer) return;
        try {
            peer.close();
        } catch {
            // Replacement must not inherit a previous peer's terminal callback.
        }
        this.lifecycle = LIFECYCLE.IDLE;
    }

    private armExpiry(expiresAt: number | null, generation: number): void {
        this.clearExpiry();
        if (expiresAt === null) return;
        const delay = expiresAt - this.deps.now();
        if (delay <= 0) {
            if (this.phase === 'waiting' || this.phase === 'confirming' || this.phase === 'creating') {
                this.setFailure('expired');
            }
            return;
        }
        this.expiryTimer = setTimeout(() => {
            if (!this.generationMatches(generation)) return;
            if (this.phase === 'waiting' || this.phase === 'confirming' || this.phase === 'creating') {
                this.setFailure('expired');
            }
        }, delay);
    }

    private clearExpiry(): void {
        if (this.expiryTimer !== null) {
            clearTimeout(this.expiryTimer);
            this.expiryTimer = null;
        }
    }

    private emitChange(): void {
        this.deps.onChange();
    }

    private asServerMessage(value: unknown): PairingServerMessage | null {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        const record = value as Record<string, unknown>;
        switch (record.type) {
            case 'waiting':
                if (
                    record.expiresAt !== null &&
                    (typeof record.expiresAt !== 'number' || !Number.isFinite(record.expiresAt))
                ) {
                    return null;
                }
                return { type: 'waiting', expiresAt: record.expiresAt ?? null };
            case 'pending':
                if (typeof record.attemptId !== 'string' || !isUuidV4(record.attemptId)) return null;
                if (typeof record.expiresAt !== 'number' || !Number.isFinite(record.expiresAt)) return null;
                if (!isPairingDevice(record.peer)) return null;
                return {
                    type: 'pending',
                    attemptId: record.attemptId,
                    peer: { publicKey: record.peer.publicKey, label: record.peer.label },
                    expiresAt: record.expiresAt
                };
            case 'paired':
                if (typeof record.connectionId !== 'string' || !isUuidV4(record.connectionId)) return null;
                if (!isPairedBrowser(record.pair)) return null;
                return {
                    type: 'paired',
                    connectionId: record.connectionId,
                    pair: {
                        id: record.pair.id,
                        role: record.pair.role,
                        peer: { publicKey: record.pair.peer.publicKey, label: record.pair.peer.label },
                        createdAt: record.pair.createdAt
                    }
                };
            case 'signal':
                if (typeof record.connectionId !== 'string' || !isUuidV4(record.connectionId)) return null;
                if (typeof record.descriptor !== 'string' || typeof record.signature !== 'string') return null;
                return {
                    type: 'signal',
                    connectionId: record.connectionId,
                    descriptor: record.descriptor,
                    signature: record.signature
                };
            case 'error':
                if (typeof record.error !== 'string' || !PAIRING_FAILURES[record.error]) return null;
                return { type: 'error', error: record.error as PairingFailure };
            default:
                return null;
        }
    }
}
