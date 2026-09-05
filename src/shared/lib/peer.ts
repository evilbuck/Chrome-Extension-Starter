// Phase 2 peer-connection state machine + WebRTC helpers.
//
// Wraps RTCPeerConnection so the offscreen document can drive it without
// depending on global types beyond `globalThis`. The wrapper:
//
//   * owns exactly one ordered reliable data channel
//   * tracks lifecycle transitions explicitly
//   * follows the real WebRTC order: createOffer/createAnswer +
//     setLocalDescription FIRST, then wait for iceGatheringState ===
//     'complete' before serializing the local descriptor
//   * only the host creates the data channel; the client receives it via
//     ondatachannel
//   * on the receiving side, setRemoteDescription takes envelope.sdp, not
//     the whole envelope string
//   * correlates request → response via separate outbound pending and
//     inbound replay sets; the response's replyTo resolves the matching
//     outbound Promise
//   * rejects duplicate, malformed, wrong-role/connection-id, expired or
//     unknown peer messages
//   * never logs SDP, ICE candidate contents, DTLS fingerprints, or peer
//     identities
//
// Tests stub RTCPeerConnection via vitest globals (see __tests__/peer.test.ts).

import {
    ENVELOPE_VERSION,
    ERROR_KIND,
    LIFECYCLE,
    PAYLOAD_KIND,
    type Lifecycle,
    type Role
} from '@/shared/constants';
import {
    encodeDescriptor,
    encodePeerRequest,
    encodePeerResponse,
    isPeerExpired,
    parseDescriptor,
    parsePeer,
    type DescriptorEnvelope,
    type PeerEnvelope,
    type PeerPayload,
    type PeerResponsePayload
} from '@/shared/lib/envelope';
import { isUuidV4, randomUuid } from '@/shared/lib/uuid';

// Re-export so the offscreen can use PeerEnvelope / PeerPayload without
// touching envelope.ts directly.
export type { PeerEnvelope, PeerPayload, PeerResponsePayload };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PeerOptions {
    role: Role;
    connectionId: string;
    rtcFactory?: () => RTCPeerConnection;
    rtcDataChannelFactory?: (pc: RTCPeerConnection, label: string, opts?: RTCDataChannelInit) => RTCDataChannel;
}

export interface PeerEventState {
    state: Lifecycle;
    error: string | null;
}

export interface PeerEventDescriptor {
    state: Lifecycle;
    descriptor: string;
}

export interface PeerEventMessage {
    state: Lifecycle;
    envelope: PeerEnvelope;
}

export interface PeerEventResponse {
    state: Lifecycle;
    requestId: string;
    envelope: PeerEnvelope;
}

export type PeerListener = (event: PeerEvent) => void;

export type PeerEvent =
    | ({ type: 'state' } & PeerEventState)
    | ({ type: 'descriptor' } & PeerEventDescriptor)
    | ({ type: 'message' } & PeerEventMessage)
    | ({ type: 'response' } & PeerEventResponse)
    | ({ type: 'channel-open' } & PeerEventState)
    | ({ type: 'channel-close' } & PeerEventState);

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

const allowed: Record<Lifecycle, readonly Lifecycle[]> = {
    [LIFECYCLE.IDLE]: [LIFECYCLE.CREATING, LIFECYCLE.CLOSED, LIFECYCLE.FAILED],
    [LIFECYCLE.CREATING]: [LIFECYCLE.SIGNALING, LIFECYCLE.CLOSED, LIFECYCLE.FAILED],
    [LIFECYCLE.SIGNALING]: [LIFECYCLE.CONNECTING, LIFECYCLE.CLOSED, LIFECYCLE.FAILED],
    [LIFECYCLE.CONNECTING]: [LIFECYCLE.CONNECTED, LIFECYCLE.CLOSED, LIFECYCLE.FAILED],
    [LIFECYCLE.CONNECTED]: [LIFECYCLE.CLOSED, LIFECYCLE.FAILED],
    [LIFECYCLE.CLOSED]: [],
    [LIFECYCLE.FAILED]: []
};

const canTransition = (from: Lifecycle, to: Lifecycle): boolean => allowed[from].includes(to);

// ---------------------------------------------------------------------------
// Browser-shaped types (subset)
// ---------------------------------------------------------------------------

interface RTCPeerConnectionLike {
    createDataChannel: (label: string, init?: RTCDataChannelInit) => RTCDataChannel;
    createOffer: (options?: RTCOfferOptions) => Promise<RTCSessionDescriptionInit>;
    createAnswer: () => Promise<RTCSessionDescriptionInit>;
    setLocalDescription: (desc: RTCSessionDescriptionInit) => Promise<void>;
    setRemoteDescription: (desc: RTCSessionDescriptionInit) => Promise<void>;
    addIceCandidate?: (candidate: RTCIceCandidateInit) => Promise<void>;
    onicecandidate: ((this: RTCPeerConnection, ev: RTCPeerConnectionIceEvent) => unknown) | null;
    onicegatheringstatechange: ((this: RTCPeerConnection, ev: Event) => unknown) | null;
    ondatachannel: ((this: RTCPeerConnection, ev: RTCDataChannelEvent) => unknown) | null;
    onconnectionstatechange: ((this: RTCPeerConnection, ev: Event) => unknown) | null;
    close: () => void;
    signalingState: RTCSignalingState;
    connectionState: RTCPeerConnectionState;
    iceGatheringState: RTCIceGathererState;
    localDescription: RTCSessionDescription | null;
}

interface RTCDataChannelLike {
    label: string;
    ordered: boolean;
    readyState: RTCDataChannelState;
    onopen: ((this: RTCDataChannel, ev: Event) => unknown) | null;
    onclose: ((this: RTCDataChannel, ev: Event) => unknown) | null;
    onmessage: ((this: RTCDataChannel, ev: MessageEvent) => unknown) | null;
    send: (data: string) => void;
    close: () => void;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const defaultRtcFactory = (): RTCPeerConnection => {
    if (typeof RTCPeerConnection === 'undefined') {
        throw new Error('RTCPeerConnection is not available in this context');
    }
    return new RTCPeerConnection({ iceServers: [] });
};

const defaultChannelInit = (): RTCDataChannelInit => ({
    ordered: true
    // maxRetransmits omitted → reliable
});

const defaultChannelFactory = (
    pc: RTCPeerConnection,
    label: string,
    init?: RTCDataChannelInit
): RTCDataChannel => pc.createDataChannel(label, init);

// ---------------------------------------------------------------------------
// Peer class
// ---------------------------------------------------------------------------

interface PendingRequest {
    resolve: (envelope: PeerEnvelope) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
}

export class Peer {
    private pc: RTCPeerConnectionLike | null = null;
    private channel: RTCDataChannelLike | null = null;
    private state: Lifecycle = LIFECYCLE.IDLE;
    private error: string | null = null;
    private readonly listeners = new Set<PeerListener>();
    private readonly outboundSentIds = new Set<string>();
    private readonly inboundReplayIds = new Set<string>();
    private readonly pendingByRequestId = new Map<string, PendingRequest>();
    private readonly options: PeerOptions;
    private localDescriptor: string | null = null;
    private candidateGathering: { promise: Promise<void>; resolve: () => void; reject: (err: Error) => void } | null = null;

    constructor(options: PeerOptions) {
        if (!isUuidV4(options.connectionId)) {
            throw new Error('connectionId must be a valid UUID v4');
        }
        if (options.role !== 'host' && options.role !== 'client') {
            throw new Error('role must be "host" or "client"');
        }
        this.options = options;
    }

    // Public API ----------------------------------------------------------------

    getState(): Lifecycle {
        return this.state;
    }

    getError(): string | null {
        return this.error;
    }

    getLocalDescriptor(): string | null {
        return this.localDescriptor;
    }

    subscribe(fn: PeerListener): () => void {
        this.listeners.add(fn);
        return () => {
            this.listeners.delete(fn);
        };
    }

    async hostCreateOffer(): Promise<string> {
        this.assertState(LIFECYCLE.IDLE);
        this.transition(LIFECYCLE.CREATING);

        const pc = this.buildPeerConnection();
        const channel = this.buildDataChannel(pc, 'sync-auth');
        this.attachChannel(channel);

        this.transition(LIFECYCLE.SIGNALING);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await this.waitForIceComplete(pc);

        return this.serializeDescriptor('host');
    }

    async clientAcceptOffer(remote: string): Promise<string> {
        this.assertState(LIFECYCLE.IDLE);
        this.transition(LIFECYCLE.CREATING);

        const remoteEnv = parseDescriptor(remote, {
            role: 'host',
            connectionId: this.options.connectionId
        });

        const pc = this.buildPeerConnection();

        this.transition(LIFECYCLE.SIGNALING);

        await pc.setRemoteDescription(this.sdpInitFromEnv(remoteEnv));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await this.waitForIceComplete(pc);

        return this.serializeDescriptor('client');
    }

    async applyRemoteAnswer(remote: string): Promise<void> {
        this.assertState(LIFECYCLE.SIGNALING);
        const remoteEnv = parseDescriptor(remote, {
            role: 'client',
            connectionId: this.options.connectionId
        });

        const pc = this.pc;
        if (!pc) throw new Error('no peer connection');

        await pc.setRemoteDescription(this.sdpInitFromEnv(remoteEnv));
        this.transition(LIFECYCLE.CONNECTING);
        this.emit({ type: 'state', state: this.state, error: null });
    }

    /**
     * Send a request and return a Promise that resolves with the matching
     * inbound response envelope, or rejects on timeout / channel close.
     */
    async sendRequest(payload: PeerPayload, deadlineMs: number): Promise<PeerEnvelope> {
        this.assertState(LIFECYCLE.CONNECTED);

        const channel = this.channel;
        if (!channel || channel.readyState !== 'open') {
            return Promise.reject(
                new EnvelopeSendError(ERROR_KIND.CHANNEL_CLOSED, 'data channel is not open')
            );
        }

        const requestId = randomUuid();
        const envelope = encodePeerRequest(
            this.options.role,
            this.options.connectionId,
            requestId,
            deadlineMs,
            payload
        );
        this.outboundSentIds.add(requestId);
        channel.send(JSON.stringify(envelope));

        return new Promise<PeerEnvelope>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingByRequestId.delete(requestId);
                reject(new EnvelopeSendError(ERROR_KIND.DEADLINE_EXCEEDED, `request ${requestId} timed out`));
            }, deadlineMs);
            this.pendingByRequestId.set(requestId, { resolve, reject, timer });
        });
    }

    /**
     * Send a response to an inbound request. The response's payload.replyTo
     * is the inbound envelope's requestId so the requester's pending
     * Promise resolves.
     */
    sendReply(payload: PeerResponsePayload, deadlineMs: number): void {
        this.assertState(LIFECYCLE.CONNECTED);

        const channel = this.channel;
        if (!channel || channel.readyState !== 'open') {
            throw new EnvelopeSendError(ERROR_KIND.CHANNEL_CLOSED, 'data channel is not open');
        }

        const envelope = encodePeerResponse(
            this.options.role,
            this.options.connectionId,
            randomUuid(),
            deadlineMs,
            payload
        );
        this.outboundSentIds.add(envelope.requestId);
        channel.send(JSON.stringify(envelope));
    }

    /** Explicit close. Idempotent. Cancels all pending requests. */
    close(): void {
        if (this.state === LIFECYCLE.CLOSED || this.state === LIFECYCLE.FAILED) {
            // Even when already terminal, drain any stray pending requests
            // (e.g. a request sent after close was initiated).
            this.cancelAllPending('close invoked');
            return;
        }
        const prev = this.state;
        try {
            this.channel?.close();
        } catch {
            // ignore
        }
        try {
            this.pc?.close();
        } catch {
            // ignore
        }
        this.state = LIFECYCLE.CLOSED;
        this.error = null;

        this.cancelAllPending('close invoked');

        this.emit({ type: 'state', state: this.state, error: null });
        if (prev === LIFECYCLE.CONNECTED) {
            this.emit({ type: 'channel-close', state: this.state, error: null });
        }
    }

    /** Reject every pending request with CHANNEL_CLOSED. Idempotent. */
    private cancelAllPending(reason: string): void {
        for (const [id, pending] of this.pendingByRequestId.entries()) {
            clearTimeout(pending.timer);
            pending.reject(
                new EnvelopeSendError(
                    ERROR_KIND.CHANNEL_CLOSED,
                    `${reason}; request ${id} cancelled`
                )
            );
        }
        this.pendingByRequestId.clear();
    }

    // Internal -------------------------------------------------------------------

    private buildPeerConnection(): RTCPeerConnectionLike {
        const factory = this.options.rtcFactory ?? defaultRtcFactory;
        const pc = factory() as RTCPeerConnectionLike;
        this.attachPeerConnectionListeners(pc);
        return pc;
    }

    private buildDataChannel(pc: RTCPeerConnectionLike, label: string): RTCDataChannelLike {
        const factory = this.options.rtcDataChannelFactory ?? defaultChannelFactory;
        const ch = factory(pc as RTCPeerConnection, label, defaultChannelInit()) as RTCDataChannelLike;
        return ch;
    }

    private attachPeerConnectionListeners(pc: RTCPeerConnectionLike): void {
        this.pc = pc;

        pc.onicegatheringstatechange = () => {
            if (pc.iceGatheringState === 'complete') {
                this.candidateGathering?.resolve();
            }
        };

        pc.onicecandidate = (ev: RTCPeerConnectionIceEvent) => {
            if (ev.candidate === null) {
                this.candidateGathering?.resolve();
            }
        };

        pc.ondatachannel = (ev: RTCDataChannelEvent) => {
            this.attachChannel(ev.channel);
        };

        pc.onconnectionstatechange = () => {
            const cs = pc.connectionState;
            if (cs === 'connected') {
                if (this.state !== LIFECYCLE.CONNECTED) {
                    this.state = LIFECYCLE.CONNECTED;
                    this.emit({ type: 'state', state: this.state, error: null });
                }
            } else if (cs === 'failed') {
                this.fail(ERROR_KIND.ICE_FAILED);
            } else if (cs === 'closed') {
                if (this.state !== LIFECYCLE.CLOSED) {
                    this.state = LIFECYCLE.CLOSED;
                    this.error = null;
                    this.cancelAllPending('connectionState=closed');
                    this.emit({ type: 'state', state: this.state, error: null });
                }
            } else if (cs === 'disconnected') {
                // ICE transient loss. Do NOT transition the lifecycle state
                // (the plan locks the 7-state union); let the user observe and
                // decide. But the data channel is unusable right now, so cancel
                // any in-flight request — the only safe behavior for the requester.
                this.cancelAllPending('connectionState=disconnected');
                this.emit({ type: 'state', state: this.state, error: null });
            }
        };
    }

    private attachChannel(channel: RTCDataChannelLike): void {
        this.channel = channel;

        channel.onopen = () => {
            this.emit({ type: 'channel-open', state: this.state, error: null });
        };

        channel.onclose = () => {
            // A data-channel close without an explicit Peer.close() can still
            // strand pending requests. Cancel them and re-emit state.
            this.cancelAllPending('data channel closed');
            this.emit({ type: 'channel-close', state: this.state, error: null });
            if (this.state === LIFECYCLE.CONNECTED) {
                this.state = LIFECYCLE.CLOSED;
                this.error = null;
                this.emit({ type: 'state', state: this.state, error: null });
            }
        };

        channel.onmessage = (ev: MessageEvent) => {
            let parsed: unknown;
            try {
                parsed = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
            } catch {
                return; // silently drop malformed frames
            }

            let envelope: PeerEnvelope;
            try {
                envelope = parsePeer(parsed, {
                    role: this.options.role === 'host' ? 'client' : 'host',
                    connectionId: this.options.connectionId
                });
            } catch {
                return; // silently drop rejected envelopes; protocol violation
            }

            if (isPeerExpired(envelope.deadline)) {
                return;
            }

            // Response frame: resolve the pending request and replay-protect.
            if ('replyTo' in envelope && typeof envelope.replyTo === 'string') {
                if (!isUuidV4(envelope.replyTo)) return;
                if (this.inboundReplayIds.has(envelope.replyTo)) return;
                if (!this.pendingByRequestId.has(envelope.replyTo)) return;
                const pending = this.pendingByRequestId.get(envelope.replyTo);
                if (!pending) return;
                this.pendingByRequestId.delete(envelope.replyTo);
                clearTimeout(pending.timer);
                this.inboundReplayIds.add(envelope.replyTo);
                pending.resolve(envelope);
                this.emit({ type: 'response', state: this.state, requestId: envelope.replyTo, envelope });
                return;
            }

            // Request frame: replay-protect on the inbound request ID.
            if (this.inboundReplayIds.has(envelope.requestId)) return;
            this.inboundReplayIds.add(envelope.requestId);
            this.emit({ type: 'message', state: this.state, envelope });
        };
    }

    private sdpInitFromEnv(env: DescriptorEnvelope): RTCSessionDescriptionInit {
        let parsed: RTCSessionDescriptionInit;
        try {
            parsed = JSON.parse(env.sdp) as RTCSessionDescriptionInit;
        } catch {
            parsed = { type: env.role === 'host' ? 'offer' : 'answer', sdp: env.sdp };
        }
        if (!parsed.type || !parsed.sdp) {
            parsed = { type: env.role === 'host' ? 'offer' : 'answer', sdp: env.sdp };
        }
        return parsed;
    }

    private serializeDescriptor(role: Role): string {
        const pc = this.pc;
        if (!pc || !pc.localDescription) throw new Error('no local description available');
        const env: DescriptorEnvelope = {
            v: ENVELOPE_VERSION,
            role,
            connectionId: this.options.connectionId,
            created: Date.now(),
            expires: Date.now() + 5 * 60 * 1000,
            sdp: JSON.stringify(pc.localDescription)
        };
        const json = encodeDescriptor(env);
        this.localDescriptor = json;
        this.emit({ type: 'state', state: this.state, error: null });
        this.emit({ type: 'descriptor', state: this.state, descriptor: json });
        return json;
    }

    private async waitForIceComplete(pc: RTCPeerConnectionLike): Promise<void> {
        if (pc.iceGatheringState === 'complete') return;
        if (this.candidateGathering) return;

        let resolve!: () => void;
        let reject!: (err: Error) => void;
        const promise = new Promise<void>((res, rej) => {
            resolve = res;
            reject = rej;
        });
        this.candidateGathering = { promise, resolve, reject };

        const timeoutMs = 5000;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<void>((_, rej) => {
            timer = setTimeout(() => {
                const err = new Error('ICE gathering did not complete within 5s');
                err.name = 'IceGatheringTimeoutError';
                rej(err);
            }, timeoutMs);
        });

        try {
            await Promise.race([promise, timeoutPromise]);
        } catch (err) {
            throw new Error(err instanceof Error ? err.message : 'ICE gathering timeout');
        } finally {
            if (timer) clearTimeout(timer);
            this.candidateGathering = null;
        }
    }

    private assertState(expected: Lifecycle): void {
        if (this.state !== expected) {
            throw new EnvelopeSendError(ERROR_KIND.UNKNOWN, `expected state ${expected}, got ${this.state}`);
        }
    }

    private transition(next: Lifecycle): void {
        if (!canTransition(this.state, next)) {
            throw new Error(`invalid state transition ${this.state} → ${next}`);
        }
        this.state = next;
        this.emit({ type: 'state', state: this.state, error: null });
    }

    private fail(kind: string): void {
        if (this.state === LIFECYCLE.CLOSED || this.state === LIFECYCLE.FAILED) return;
        this.state = LIFECYCLE.FAILED;
        this.error = kind;
        // A peer that has hard-failed cannot service pending requests. Cancel
        // them so callers don't hang past their own deadlines.
        this.cancelAllPending('peer failed');
        this.emit({ type: 'state', state: this.state, error: kind });
    }

    private emit(ev: PeerEvent): void {
        for (const fn of this.listeners) fn(ev);
    }
}

// ---------------------------------------------------------------------------
// Local error class
// ---------------------------------------------------------------------------

export class EnvelopeSendError extends Error {
    constructor(
        readonly kind: string,
        message: string
    ) {
        super(message);
        this.name = 'EnvelopeSendError';
    }
}

export const SEND_KIND_FROM = (err: unknown): string =>
    err instanceof EnvelopeSendError ? err.kind : ERROR_KIND.UNKNOWN;

export const PEER_PAYLOAD_KIND = PAYLOAD_KIND;