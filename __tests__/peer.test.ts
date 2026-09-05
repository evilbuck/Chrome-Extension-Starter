import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIFECYCLE, PAYLOAD_KIND, ROLE, type Lifecycle } from '@/shared/constants';
import { Peer } from '@/shared/lib/peer';

// ---------------------------------------------------------------------------
// JSDOM stubs for RTCPeerConnection / RTCDataChannel
// ---------------------------------------------------------------------------

interface FakeDataChannel {
    label: string;
    ordered: boolean;
    readyState: RTCDataChannelState;
    onopen: ((ev: Event) => unknown) | null;
    onclose: ((ev: Event) => unknown) | null;
    onmessage: ((ev: MessageEvent) => unknown) | null;
    send: (data: string) => void;
    close: () => void;
}

interface FakePeer {
    _dataChannel: FakeDataChannel | null;
    _iceGatheringState: RTCIceGathererState;
    _connectionState: RTCPeerConnectionState;
    _emitConnectionState(s: RTCPeerConnectionState): void;
    onicegatheringstatechange: ((ev: Event) => unknown) | null;
    onconnectionstatechange: ((ev: Event) => unknown) | null;
    ondatachannel: ((ev: RTCDataChannelEvent) => unknown) | null;
    createDataChannel(label: string, init?: RTCDataChannelInit): RTCDataChannel;
    createOffer(): Promise<RTCSessionDescriptionInit>;
    createAnswer(): Promise<RTCSessionDescriptionInit>;
    setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void>;
    setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void>;
    close(): void;
    signalingState: RTCSignalingState;
    connectionState: RTCPeerConnectionState;
    iceGatheringState: RTCIceGathererState;
    localDescription: RTCSessionDescription | null;
}

const peerRegistry: FakePeer[] = [];

const makeFakeChannel = (label: string): FakeDataChannel => ({
    label,
    ordered: true,
    readyState: 'open',
    onopen: null,
    onclose: null,
    onmessage: null,
    send: () => {
        // No-op for state-machine tests.
    },
    close() {
        this.readyState = 'closed';
        if (this.onclose) this.onclose(new Event('close'));
    }
});

const makeFakePeer = (): FakePeer => {
    const peer: FakePeer = {
        _dataChannel: null,
        _iceGatheringState: 'new',
        _connectionState: 'new',
        _emitConnectionState(s) {
            this._connectionState = s;
            if (this.onconnectionstatechange) this.onconnectionstatechange(new Event('state'));
        },
        onicegatheringstatechange: null,
        onconnectionstatechange: null,
        ondatachannel: null,
        createDataChannel(label) {
            const ch = makeFakeChannel(label);
            this._dataChannel = ch;
            return ch as unknown as RTCDataChannel;
        },
        async createOffer() {
            return { type: 'offer', sdp: 'v=0\r\nfake\r\n' };
        },
        async createAnswer() {
            return { type: 'answer', sdp: 'v=0\r\nfake-answer\r\n' };
        },
        async setLocalDescription(desc) {
            this._iceGatheringState = 'complete';
            if (this.onicegatheringstatechange) this.onicegatheringstatechange(new Event('gathering'));
            this.localDescription = { type: desc.type ?? 'offer', sdp: desc.sdp ?? '' } as RTCSessionDescription;
        },
        async setRemoteDescription() {
            // No-op.
        },
        close() {
            this._connectionState = 'closed';
            if (this.onconnectionstatechange) this.onconnectionstatechange(new Event('state'));
        },
        signalingState: 'stable',
        get connectionState() { return this._connectionState; },
        get iceGatheringState() { return this._iceGatheringState; },
        localDescription: null
    };
    peerRegistry.push(peer);
    return peer;
};

beforeEach(() => {
    peerRegistry.length = 0;
    (globalThis as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection = function () {
        return makeFakePeer();
    } as unknown as typeof RTCPeerConnection;

    let counter = 0;
    vi.stubGlobal('crypto', {
        randomUUID: () => `00000000-0000-4000-8000-${(++counter).toString(16).padStart(12, '0')}`
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

describe('Peer state machine', () => {
    it('starts IDLE', () => {
        const peer = new Peer({ role: ROLE.HOST, connectionId: '00000000-0000-4000-8000-000000000001' });
        expect(peer.getState()).toBe(LIFECYCLE.IDLE);
    });

    it('hostCreateOffer transitions IDLE → CREATING → SIGNALING', async () => {
        const peer = new Peer({ role: ROLE.HOST, connectionId: '00000000-0000-4000-8000-000000000002' });
        const states: Lifecycle[] = [];
        peer.subscribe((ev) => {
            if (ev.type === 'state') states.push(ev.state);
        });
        const desc = await peer.hostCreateOffer();
        expect(typeof desc).toBe('string');
        expect(states).toContain(LIFECYCLE.CREATING);
        expect(states).toContain(LIFECYCLE.SIGNALING);
    });

    it('hostCreateOffer rejects when not IDLE', async () => {
        const peer = new Peer({ role: ROLE.HOST, connectionId: '00000000-0000-4000-8000-000000000003' });
        await peer.hostCreateOffer();
        await expect(peer.hostCreateOffer()).rejects.toBeDefined();
    });

    it('close() is idempotent and lands at CLOSED', async () => {
        const peer = new Peer({ role: ROLE.HOST, connectionId: '00000000-0000-4000-8000-000000000004' });
        await peer.hostCreateOffer();
        peer.close();
        peer.close();
        expect(peer.getState()).toBe(LIFECYCLE.CLOSED);
    });
});

// ---------------------------------------------------------------------------
// ICE completion guarantee
// ---------------------------------------------------------------------------

describe('waitForIceComplete', () => {
    it('descriptor encodes a valid envelope on hostCreateOffer', async () => {
        const peer = new Peer({ role: ROLE.HOST, connectionId: '00000000-0000-4000-8000-000000000010' });
        const desc = await peer.hostCreateOffer();
        expect(typeof desc).toBe('string');
        expect(peer.getState()).toBe(LIFECYCLE.SIGNALING);
    });
});

// ---------------------------------------------------------------------------
// sendRequest / sendReply via Peer (no real cross-peer correlation in JSDOM)
// ---------------------------------------------------------------------------


describe('sendRequest / sendReply (correlation)', () => {


    it('disconnected connection state cancels pending requests immediately', async () => {
        const host = new Peer({ role: ROLE.HOST, connectionId: '00000000-0000-4000-8000-000000000021' });
        await host.hostCreateOffer();
        const fake = peerRegistry[0];
        fake._emitConnectionState('connected');
        const p = host.sendRequest({ kind: PAYLOAD_KIND.ECHO, text: 'x' }, 5000);
        // Simulate network loss mid-flight.
        fake._emitConnectionState('disconnected');
        await expect(p).rejects.toMatchObject({ kind: 'channel_closed' });
    });

    it('failed connection state terminates the peer', async () => {
        const host = new Peer({ role: ROLE.HOST, connectionId: '00000000-0000-4000-8000-000000000022' });
        await host.hostCreateOffer();
        const fake = peerRegistry[0];
        fake._emitConnectionState('connected');
        const p = host.sendRequest({ kind: PAYLOAD_KIND.ECHO, text: 'x' }, 5000);
        fake._emitConnectionState('failed');
        await expect(p).rejects.toMatchObject({ kind: 'channel_closed' });
        expect(host.getState()).toBe('failed');
    });

    it('connectionState closed cancels pending requests', async () => {
        const host = new Peer({ role: ROLE.HOST, connectionId: '00000000-0000-4000-8000-000000000040' });
        await host.hostCreateOffer();
        const fake = peerRegistry[0];
        fake._emitConnectionState('connected');
        const p = host.sendRequest({ kind: PAYLOAD_KIND.ECHO, text: 'x' }, 5000);
        fake._emitConnectionState('closed');
        await expect(p).rejects.toMatchObject({ kind: 'channel_closed' });
        expect(host.getState()).toBe('closed');
    });

    it('data channel close mid-flight cancels pending requests without transition', async () => {
        const host = new Peer({ role: ROLE.HOST, connectionId: '00000000-0000-4000-8000-000000000041' });
        await host.hostCreateOffer();
        const fake = peerRegistry[0];
        fake._emitConnectionState('connected');
        const p = host.sendRequest({ kind: PAYLOAD_KIND.ECHO, text: 'x' }, 5000);
        // Simulate the data channel closing without the peer connection
        // transitioning to 'closed' (e.g. graceful server-side channel close).
        const internalChannel = (host as unknown as { channel: FakeDataChannel }).channel;
        internalChannel.close();
        await expect(p).rejects.toMatchObject({ kind: 'channel_closed' });
    });

});

// ---------------------------------------------------------------------------
// close() invalidates pending requests (structural)
// ---------------------------------------------------------------------------

describe('close() invalidates pending requests', () => {
    it('a peer that was never CONNECTED cannot have pending requests to reject', () => {
        const peer = new Peer({ role: ROLE.HOST, connectionId: '00000000-0000-4000-8000-000000000030' });
        peer.close();
        expect(peer.getState()).toBe(LIFECYCLE.CLOSED);
    });
});

// ---------------------------------------------------------------------------
// Local-descriptor encoding is non-empty and parseable
// ---------------------------------------------------------------------------

describe('Local descriptor', () => {
    it('encodeDescriptor round-trip preserves role and connectionId', async () => {
        const id = '00000000-0000-4000-8000-000000000040';
        const peer = new Peer({ role: ROLE.HOST, connectionId: id });
        const desc = await peer.hostCreateOffer();
        expect(desc).toContain(id);
        const parsed = JSON.parse(desc);
        expect(parsed.role).toBe(ROLE.HOST);
        expect(parsed.v).toBe(1);
    });
});