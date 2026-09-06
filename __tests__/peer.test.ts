import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_KIND, LIFECYCLE, type Lifecycle, PAYLOAD_KIND, PAYLOAD_RESPONSE_KIND, ROLE } from '@/shared/constants';
import { EnvelopeSendError, Peer, SEND_KIND_FROM } from '@/shared/lib/peer';

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
    onicecandidate: ((ev: RTCPeerConnectionIceEvent) => unknown) | null;
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
        onicecandidate: null,
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
        get connectionState() {
            return this._connectionState;
        },
        get iceGatheringState() {
            return this._iceGatheringState;
        },
        localDescription: null
    };
    peerRegistry.push(peer);
    return peer;
};

beforeEach(() => {
    peerRegistry.length = 0;
    // biome-ignore lint/complexity/useArrowFunction: RTCPeerConnection is constructed with `new`
    (globalThis as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection = function () {
        return makeFakePeer();
    } as unknown as typeof RTCPeerConnection;

    let counter = 0;
    vi.stubGlobal('crypto', {
        randomUUID: () => `00000000-0000-4000-8000-${(++counter).toString(16).padStart(12, '0')}`
    });
});

afterEach(() => {
    vi.useRealTimers();
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

    it('resolves sendRequest when a matching replyTo arrives on the channel', async () => {
        const id = '00000000-0000-4000-8000-000000000042';
        const host = new Peer({ role: ROLE.HOST, connectionId: id });
        await host.hostCreateOffer();
        const fake = peerRegistry[0];
        fake._emitConnectionState('connected');
        const ch = fake._dataChannel as FakeDataChannel;
        const sent: string[] = [];
        ch.send = (data: string) => {
            sent.push(data);
        };

        const events: Array<{ type: string; requestId?: string }> = [];
        host.subscribe((ev) => {
            if (ev.type === 'response') events.push({ type: ev.type, requestId: ev.requestId });
        });

        const pending = host.sendRequest({ kind: PAYLOAD_KIND.ECHO, text: 'hello' }, 5000);
        expect(sent).toHaveLength(1);
        const outbound = JSON.parse(sent[0]) as { requestId: string };

        const reply = {
            v: 1,
            role: ROLE.CLIENT,
            connectionId: id,
            requestId: '00000000-0000-4000-8000-0000000000aa',
            deadline: Date.now() + 60_000,
            replyTo: outbound.requestId,
            payload: {
                kind: PAYLOAD_RESPONSE_KIND.ECHO_RESPONSE,
                replyTo: outbound.requestId,
                text: 'pong'
            }
        };
        ch.onmessage?.(new MessageEvent('message', { data: JSON.stringify(reply) }));

        const resolved = await pending;
        expect(resolved.replyTo).toBe(outbound.requestId);
        expect(resolved.payload).toMatchObject({ kind: PAYLOAD_RESPONSE_KIND.ECHO_RESPONSE, text: 'pong' });
        expect(events).toEqual([{ type: 'response', requestId: outbound.requestId }]);

        // Duplicate replyTo is replay-protected: no second response event, no throw.
        expect(() => {
            ch.onmessage?.(new MessageEvent('message', { data: JSON.stringify(reply) }));
        }).not.toThrow();
        expect(events).toHaveLength(1);
    });

    it('ignores a replyTo that does not match any pending request', async () => {
        const id = '00000000-0000-4000-8000-000000000043';
        const host = new Peer({ role: ROLE.HOST, connectionId: id });
        await host.hostCreateOffer();
        const fake = peerRegistry[0];
        fake._emitConnectionState('connected');
        const ch = fake._dataChannel as FakeDataChannel;

        const events: string[] = [];
        host.subscribe((ev) => events.push(ev.type));

        const orphan = {
            v: 1,
            role: ROLE.CLIENT,
            connectionId: id,
            requestId: '00000000-0000-4000-8000-0000000000bb',
            deadline: Date.now() + 60_000,
            replyTo: '00000000-0000-4000-8000-0000000000cc',
            payload: {
                kind: PAYLOAD_RESPONSE_KIND.ECHO_RESPONSE,
                replyTo: '00000000-0000-4000-8000-0000000000cc',
                text: 'nobody'
            }
        };
        expect(() => {
            ch.onmessage?.(new MessageEvent('message', { data: JSON.stringify(orphan) }));
        }).not.toThrow();
        expect(events.filter((t) => t === 'response' || t === 'message')).toEqual([]);
        expect(host.getState()).toBe(LIFECYCLE.CONNECTED);
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

// ---------------------------------------------------------------------------
// Constructor validation + default RTC factory
// ---------------------------------------------------------------------------

describe('Peer constructor', () => {
    it('rejects a connectionId that is not a UUID v4', () => {
        expect(() => new Peer({ role: ROLE.HOST, connectionId: 'not-a-uuid' })).toThrow(
            'connectionId must be a valid UUID v4'
        );
    });

    it('rejects a role that is not host or client', () => {
        expect(
            () =>
                new Peer({
                    role: 'observer' as (typeof ROLE)[keyof typeof ROLE],
                    connectionId: '00000000-0000-4000-8000-000000000100'
                })
        ).toThrow('role must be "host" or "client"');
    });

    it('starts with a null error and getError stays null until a hard failure', () => {
        const peer = new Peer({ role: ROLE.HOST, connectionId: '00000000-0000-4000-8000-000000000101' });
        expect(peer.getError()).toBeNull();
    });

    it('subscribe returns an unsubscribe that stops further events', async () => {
        const peer = new Peer({ role: ROLE.HOST, connectionId: '00000000-0000-4000-8000-000000000102' });
        const states: Lifecycle[] = [];
        const unsub = peer.subscribe((ev) => {
            if (ev.type === 'state') states.push(ev.state);
        });
        unsub();
        await peer.hostCreateOffer();
        expect(states).toEqual([]);
    });
});

describe('defaultRtcFactory', () => {
    it('constructing Peer without rtcFactory uses the global RTCPeerConnection stub', async () => {
        const peer = new Peer({ role: ROLE.HOST, connectionId: '00000000-0000-4000-8000-000000000110' });
        const desc = await peer.hostCreateOffer();
        expect(typeof desc).toBe('string');
        expect(peerRegistry).toHaveLength(1);
        expect(peer.getState()).toBe(LIFECYCLE.SIGNALING);
    });
});

// ---------------------------------------------------------------------------
// ICE gathering / setLocalDescription failures
// ---------------------------------------------------------------------------

describe('ICE gathering and setLocalDescription', () => {
    const incompleteIceFactory = (): RTCPeerConnection => {
        const fake = makeFakePeer();
        fake.setLocalDescription = async function (desc) {
            this._iceGatheringState = 'gathering';
            this.localDescription = { type: desc.type ?? 'offer', sdp: desc.sdp ?? '' } as RTCSessionDescription;
        };
        return fake as unknown as RTCPeerConnection;
    };

    it('rejects when ICE gathering never completes', async () => {
        vi.useFakeTimers();
        const peer = new Peer({
            role: ROLE.HOST,
            connectionId: '00000000-0000-4000-8000-000000000120',
            rtcFactory: incompleteIceFactory
        });
        const p = peer.hostCreateOffer();
        const rejected = expect(p).rejects.toThrow('ICE gathering did not complete within 5s');
        await vi.advanceTimersByTimeAsync(5000);
        await rejected;
    });

    it('rejects when setLocalDescription fails', async () => {
        const peer = new Peer({
            role: ROLE.HOST,
            connectionId: '00000000-0000-4000-8000-000000000121',
            rtcFactory: () => {
                const fake = makeFakePeer();
                fake.setLocalDescription = async () => {
                    throw new Error('setLocalDescription failed');
                };
                return fake as unknown as RTCPeerConnection;
            }
        });
        await expect(peer.hostCreateOffer()).rejects.toThrow('setLocalDescription failed');
    });

    it('completes ICE when a null candidate arrives after gathering starts', async () => {
        vi.useFakeTimers();
        const peer = new Peer({
            role: ROLE.HOST,
            connectionId: '00000000-0000-4000-8000-000000000122',
            rtcFactory: () => {
                const fake = makeFakePeer();
                fake.setLocalDescription = async function (desc) {
                    this._iceGatheringState = 'gathering';
                    this.localDescription = {
                        type: desc.type ?? 'offer',
                        sdp: desc.sdp ?? ''
                    } as RTCSessionDescription;
                    setTimeout(() => {
                        this.onicecandidate?.({ candidate: null } as RTCPeerConnectionIceEvent);
                    }, 1);
                };
                return fake as unknown as RTCPeerConnection;
            }
        });
        const p = peer.hostCreateOffer();
        await vi.advanceTimersByTimeAsync(1);
        const desc = await p;
        expect(typeof desc).toBe('string');
        expect(peer.getState()).toBe(LIFECYCLE.SIGNALING);
    });

    it('completes ICE when iceGatheringState flips to complete after wait starts', async () => {
        vi.useFakeTimers();
        const peer = new Peer({
            role: ROLE.HOST,
            connectionId: '00000000-0000-4000-8000-000000000123',
            rtcFactory: () => {
                const fake = makeFakePeer();
                fake.setLocalDescription = async function (desc) {
                    this._iceGatheringState = 'gathering';
                    this.localDescription = {
                        type: desc.type ?? 'offer',
                        sdp: desc.sdp ?? ''
                    } as RTCSessionDescription;
                    setTimeout(() => {
                        this._iceGatheringState = 'complete';
                        this.onicegatheringstatechange?.(new Event('gathering'));
                    }, 1);
                };
                return fake as unknown as RTCPeerConnection;
            }
        });
        const p = peer.hostCreateOffer();
        await vi.advanceTimersByTimeAsync(1);
        const desc = await p;
        expect(typeof desc).toBe('string');
        expect(peer.getState()).toBe(LIFECYCLE.SIGNALING);
    });

    it('records ICE_FAILED on the public error when connectionState fails', async () => {
        const peer = new Peer({ role: ROLE.HOST, connectionId: '00000000-0000-4000-8000-000000000124' });
        await peer.hostCreateOffer();
        peerRegistry[0]._emitConnectionState('failed');
        expect(peer.getState()).toBe(LIFECYCLE.FAILED);
        expect(peer.getError()).toBe(ERROR_KIND.ICE_FAILED);
    });
});

// ---------------------------------------------------------------------------
// Client offer/answer + data-channel lifecycle
// ---------------------------------------------------------------------------

describe('clientAcceptOffer / applyRemoteAnswer', () => {
    it('client accepts a host descriptor and host applyRemoteAnswer lands CONNECTING', async () => {
        const id = '00000000-0000-4000-8000-000000000130';
        const host = new Peer({ role: ROLE.HOST, connectionId: id });
        const client = new Peer({ role: ROLE.CLIENT, connectionId: id });
        const offer = await host.hostCreateOffer();
        const answer = await client.clientAcceptOffer(offer);
        expect(typeof answer).toBe('string');
        expect(JSON.parse(answer).role).toBe(ROLE.CLIENT);
        await host.applyRemoteAnswer(answer);
        expect(host.getState()).toBe(LIFECYCLE.CONNECTING);
    });

    it('clientAcceptOffer accepts a raw (non-JSON) SDP string', async () => {
        const id = '00000000-0000-4000-8000-000000000131';
        const client = new Peer({ role: ROLE.CLIENT, connectionId: id });
        const now = Date.now();
        const remote = JSON.stringify({
            v: 1,
            role: ROLE.HOST,
            connectionId: id,
            created: now,
            expires: now + 5 * 60 * 1000,
            sdp: 'v=0\r\no=raw-offer\r\n'
        });
        const answer = await client.clientAcceptOffer(remote);
        expect(typeof answer).toBe('string');
        expect(client.getState()).toBe(LIFECYCLE.SIGNALING);
    });

    it('applyRemoteAnswer accepts JSON SDP missing type/sdp fields', async () => {
        const id = '00000000-0000-4000-8000-000000000132';
        const host = new Peer({ role: ROLE.HOST, connectionId: id });
        await host.hostCreateOffer();
        const now = Date.now();
        const remote = JSON.stringify({
            v: 1,
            role: ROLE.CLIENT,
            connectionId: id,
            created: now,
            expires: now + 5 * 60 * 1000,
            sdp: JSON.stringify({ foo: 'bar' })
        });
        await host.applyRemoteAnswer(remote);
        expect(host.getState()).toBe(LIFECYCLE.CONNECTING);
    });

    it('applyRemoteAnswer rejects when the peer is not SIGNALING', async () => {
        const host = new Peer({ role: ROLE.HOST, connectionId: '00000000-0000-4000-8000-000000000133' });
        await expect(host.applyRemoteAnswer('{}')).rejects.toMatchObject({
            name: 'EnvelopeSendError',
            kind: ERROR_KIND.UNKNOWN
        });
    });
});

describe('data channel lifecycle', () => {
    it('host channel onopen/onclose emit channel-open and close the connected peer', async () => {
        const id = '00000000-0000-4000-8000-000000000140';
        const host = new Peer({ role: ROLE.HOST, connectionId: id });
        const types: string[] = [];
        host.subscribe((ev) => types.push(ev.type));
        await host.hostCreateOffer();
        const fake = peerRegistry[0];
        const ch = fake._dataChannel as FakeDataChannel;

        ch.onopen?.(new Event('open'));
        expect(types).toContain('channel-open');

        fake._emitConnectionState('connected');
        expect(host.getState()).toBe(LIFECYCLE.CONNECTED);

        ch.close();
        expect(types).toContain('channel-close');
        expect(host.getState()).toBe(LIFECYCLE.CLOSED);
        expect(host.getError()).toBeNull();
    });

    it('client attaches the inbound channel from ondatachannel', async () => {
        const id = '00000000-0000-4000-8000-000000000141';
        const host = new Peer({ role: ROLE.HOST, connectionId: id });
        const client = new Peer({ role: ROLE.CLIENT, connectionId: id });
        const types: string[] = [];
        client.subscribe((ev) => types.push(ev.type));

        const offer = await host.hostCreateOffer();
        await client.clientAcceptOffer(offer);
        const clientFake = peerRegistry[1];
        const inbound = makeFakeChannel('sync-auth');
        inbound.readyState = 'connecting';
        clientFake.ondatachannel?.({ channel: inbound } as unknown as RTCDataChannelEvent);

        inbound.onopen?.(new Event('open'));
        inbound.readyState = 'open';
        expect(types).toContain('channel-open');

        clientFake._emitConnectionState('connected');
        expect(client.getState()).toBe(LIFECYCLE.CONNECTED);

        inbound.close();
        expect(types).toContain('channel-close');
        expect(client.getState()).toBe(LIFECYCLE.CLOSED);
    });

    it('close() from CONNECTED emits channel-close', async () => {
        const host = new Peer({ role: ROLE.HOST, connectionId: '00000000-0000-4000-8000-000000000142' });
        await host.hostCreateOffer();
        peerRegistry[0]._emitConnectionState('connected');
        const types: string[] = [];
        host.subscribe((ev) => types.push(ev.type));
        host.close();
        expect(host.getState()).toBe(LIFECYCLE.CLOSED);
        expect(types).toContain('channel-close');
        expect(types).toContain('state');
    });
});

describe('inbound channel messages', () => {
    const connectHost = async (id: string) => {
        const host = new Peer({ role: ROLE.HOST, connectionId: id });
        await host.hostCreateOffer();
        const fake = peerRegistry[peerRegistry.length - 1];
        fake._emitConnectionState('connected');
        return { host, ch: fake._dataChannel as FakeDataChannel };
    };

    const deliver = (ch: FakeDataChannel, data: unknown) => {
        const payload = typeof data === 'string' ? data : JSON.stringify(data);
        ch.onmessage?.(new MessageEvent('message', { data: payload }));
    };

    it('silently drops malformed JSON and never throws', async () => {
        const { host, ch } = await connectHost('00000000-0000-4000-8000-000000000150');
        const types: string[] = [];
        host.subscribe((ev) => types.push(ev.type));
        expect(() => deliver(ch, '{not-json')).not.toThrow();
        expect(() => {
            ch.onmessage?.(new MessageEvent('message', { data: 123 as unknown as string }));
        }).not.toThrow();
        expect(types.filter((t) => t === 'message' || t === 'response')).toEqual([]);
        expect(host.getState()).toBe(LIFECYCLE.CONNECTED);
    });

    it('silently drops a well-formed envelope with the wrong connectionId', async () => {
        const id = '00000000-0000-4000-8000-000000000151';
        const { host, ch } = await connectHost(id);
        const types: string[] = [];
        host.subscribe((ev) => types.push(ev.type));
        expect(() =>
            deliver(ch, {
                v: 1,
                role: ROLE.CLIENT,
                connectionId: '00000000-0000-4000-8000-0000000000dd',
                requestId: '00000000-0000-4000-8000-0000000000ee',
                deadline: Date.now() + 60_000,
                payload: { kind: PAYLOAD_KIND.ECHO, text: 'nope' }
            })
        ).not.toThrow();
        expect(types.filter((t) => t === 'message')).toEqual([]);
        expect(host.getState()).toBe(LIFECYCLE.CONNECTED);
    });

    it('silently drops an envelope whose deadline is already due', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_700_000_000_000);
        const id = '00000000-0000-4000-8000-000000000152';
        const { host, ch } = await connectHost(id);
        const types: string[] = [];
        host.subscribe((ev) => types.push(ev.type));
        expect(() =>
            deliver(ch, {
                v: 1,
                role: ROLE.CLIENT,
                connectionId: id,
                requestId: '00000000-0000-4000-8000-0000000000ff',
                deadline: Date.now(),
                payload: { kind: PAYLOAD_KIND.ECHO, text: 'late' }
            })
        ).not.toThrow();
        expect(types.filter((t) => t === 'message')).toEqual([]);
        expect(host.getState()).toBe(LIFECYCLE.CONNECTED);
    });

    it('emits message for a valid request and ignores a duplicate requestId', async () => {
        const id = '00000000-0000-4000-8000-000000000153';
        const { host, ch } = await connectHost(id);
        const messages: unknown[] = [];
        host.subscribe((ev) => {
            if (ev.type === 'message') messages.push(ev.envelope.requestId);
        });
        const request = {
            v: 1,
            role: ROLE.CLIENT,
            connectionId: id,
            requestId: '00000000-0000-4000-8000-0000000000a1',
            deadline: Date.now() + 60_000,
            payload: { kind: PAYLOAD_KIND.ECHO, text: 'once' }
        };
        deliver(ch, request);
        deliver(ch, request);
        expect(messages).toEqual(['00000000-0000-4000-8000-0000000000a1']);
        expect(host.getState()).toBe(LIFECYCLE.CONNECTED);
    });
});

describe('sendRequest / sendReply validation', () => {
    it('sendRequest while not connected rejects EnvelopeSendError', async () => {
        const peer = new Peer({ role: ROLE.HOST, connectionId: '00000000-0000-4000-8000-000000000160' });
        const err = await peer.sendRequest({ kind: PAYLOAD_KIND.ECHO, text: 'x' }, 1000).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(EnvelopeSendError);
        expect(err).toMatchObject({ kind: ERROR_KIND.UNKNOWN, name: 'EnvelopeSendError' });
        expect(SEND_KIND_FROM(err)).toBe(ERROR_KIND.UNKNOWN);
    });

    it('SEND_KIND_FROM maps EnvelopeSendError.kind and generic errors to UNKNOWN', () => {
        const typed = new EnvelopeSendError(ERROR_KIND.CHANNEL_CLOSED, 'data channel is not open');
        expect(SEND_KIND_FROM(typed)).toBe(ERROR_KIND.CHANNEL_CLOSED);
        expect(SEND_KIND_FROM(new Error('boom'))).toBe(ERROR_KIND.UNKNOWN);
        expect(SEND_KIND_FROM('not-an-error')).toBe(ERROR_KIND.UNKNOWN);
    });

    it('sendRequest rejects CHANNEL_CLOSED when the channel is not open', async () => {
        const host = new Peer({ role: ROLE.HOST, connectionId: '00000000-0000-4000-8000-000000000161' });
        await host.hostCreateOffer();
        const fake = peerRegistry[0];
        fake._emitConnectionState('connected');
        const ch = fake._dataChannel as FakeDataChannel;
        ch.readyState = 'connecting';
        await expect(host.sendRequest({ kind: PAYLOAD_KIND.ECHO, text: 'x' }, 1000)).rejects.toMatchObject({
            name: 'EnvelopeSendError',
            kind: ERROR_KIND.CHANNEL_CLOSED
        });
    });

    it('sendReply after close throws EnvelopeSendError', async () => {
        const host = new Peer({ role: ROLE.HOST, connectionId: '00000000-0000-4000-8000-000000000162' });
        await host.hostCreateOffer();
        peerRegistry[0]._emitConnectionState('connected');
        host.close();
        expect(() =>
            host.sendReply(
                {
                    kind: PAYLOAD_RESPONSE_KIND.ECHO_RESPONSE,
                    replyTo: '00000000-0000-4000-8000-0000000000a2',
                    text: 'x'
                },
                1000
            )
        ).toThrow(EnvelopeSendError);
    });

    it('sendReply without a channel throws CHANNEL_CLOSED', async () => {
        const id = '00000000-0000-4000-8000-000000000163';
        const host = new Peer({ role: ROLE.HOST, connectionId: id });
        const client = new Peer({ role: ROLE.CLIENT, connectionId: id });
        const offer = await host.hostCreateOffer();
        await client.clientAcceptOffer(offer);
        peerRegistry[1]._emitConnectionState('connected');
        expect(client.getState()).toBe(LIFECYCLE.CONNECTED);
        try {
            client.sendReply(
                {
                    kind: PAYLOAD_RESPONSE_KIND.ECHO_RESPONSE,
                    replyTo: '00000000-0000-4000-8000-0000000000a3',
                    text: 'x'
                },
                1000
            );
            expect.fail('expected sendReply to throw');
        } catch (err) {
            expect(err).toBeInstanceOf(EnvelopeSendError);
            expect(err).toMatchObject({ kind: ERROR_KIND.CHANNEL_CLOSED });
            expect(SEND_KIND_FROM(err)).toBe(ERROR_KIND.CHANNEL_CLOSED);
        }
    });

    it('sendReply transmits a response envelope on an open channel', async () => {
        const id = '00000000-0000-4000-8000-000000000164';
        const host = new Peer({ role: ROLE.HOST, connectionId: id });
        await host.hostCreateOffer();
        const fake = peerRegistry[0];
        fake._emitConnectionState('connected');
        const ch = fake._dataChannel as FakeDataChannel;
        const sent: string[] = [];
        ch.send = (data: string) => {
            sent.push(data);
        };
        const replyTo = '00000000-0000-4000-8000-0000000000a4';
        host.sendReply({ kind: PAYLOAD_RESPONSE_KIND.ECHO_RESPONSE, replyTo, text: 'ok' }, 5000);
        expect(sent).toHaveLength(1);
        const envelope = JSON.parse(sent[0]) as { replyTo: string; role: string; connectionId: string };
        expect(envelope.replyTo).toBe(replyTo);
        expect(envelope.role).toBe(ROLE.HOST);
        expect(envelope.connectionId).toBe(id);
    });

    it('sendRequest rejects DEADLINE_EXCEEDED when no reply arrives', async () => {
        const host = new Peer({ role: ROLE.HOST, connectionId: '00000000-0000-4000-8000-000000000165' });
        await host.hostCreateOffer();
        peerRegistry[0]._emitConnectionState('connected');
        vi.useFakeTimers();
        const p = host.sendRequest({ kind: PAYLOAD_KIND.ECHO, text: 'x' }, 1000);
        const rejected = expect(p).rejects.toMatchObject({
            name: 'EnvelopeSendError',
            kind: ERROR_KIND.DEADLINE_EXCEEDED
        });
        await vi.advanceTimersByTimeAsync(1000);
        await rejected;
    });
});
