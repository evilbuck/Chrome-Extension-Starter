import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    encodeDescriptor,
    encodePeerRequest,
    encodePeerResponse,
    EnvelopeError,
    isPeerExpired,
    parseDescriptor,
    parseDescriptorAdopt,
    parsePeer
} from '@/shared/lib/envelope';
import { ERROR_KIND, PAYLOAD_KIND, ROLE, type ErrorKind, type Role } from '@/shared/constants';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let counter = 0;
const makeUuid = (): string => {
    counter += 1;
    const hex = counter.toString(16).padStart(12, '0');
    return `00000000-0000-4000-8000-${hex}`;
};

/** Run `fn`, expect it to throw EnvelopeError with `kind`. */
const expectKind = (fn: () => unknown, kind: ErrorKind): void => {
    try {
        fn();
    } catch (err) {
        if (err instanceof EnvelopeError) {
            expect(err.kind).toBe(kind);
            return;
        }
        throw err;
    }
    throw new Error(`expected EnvelopeError with kind=${kind} but nothing was thrown`);
};

const baseDescriptor = (connectionId: string) => {
    const created = Date.now();
    const expires = created + 5 * 60 * 1000;
    return {
        v: 1 as const,
        role: ROLE.HOST,
        connectionId,
        created,
        expires,
        sdp: JSON.stringify({ type: 'offer', sdp: 'v=0\r\n...fake-sdp...\r\n' })
    };
};

const basePeerRequest = (role: Role, connectionId: string, requestId: string) => ({
    v: 1 as const,
    role,
    connectionId,
    requestId,
    deadline: Date.now() + 60_000,
    payload: { kind: PAYLOAD_KIND.ECHO, text: 'hello' }
});

const basePeerResponse = (role: Role, connectionId: string, requestId: string, replyTo: string) => ({
    v: 1 as const,
    role,
    connectionId,
    requestId,
    deadline: Date.now() + 60_000,
    replyTo,
    payload: { kind: 'echo_response', replyTo, text: 'pong' }
});

beforeEach(() => {
    counter = 0;
    vi.stubGlobal('crypto', { randomUUID: makeUuid });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Descriptor envelope
// ---------------------------------------------------------------------------

describe('parseDescriptor', () => {
    it('accepts a well-formed host descriptor', () => {
        const id = makeUuid();
        const env = parseDescriptor(JSON.stringify(baseDescriptor(id)), {
            role: ROLE.HOST,
            connectionId: id
        });
        expect(env.role).toBe('host');
        expect(env.connectionId).toBe(id);
        expect(typeof env.sdp).toBe('string');
    });

    it('rejects malformed JSON', () => {
        expectKind(
            () => parseDescriptor('not-json', { role: ROLE.HOST, connectionId: makeUuid() }),
            ERROR_KIND.MALFORMED
        );
    });

    it('rejects an oversized envelope', () => {
        const big = 'x'.repeat(33 * 1024);
        expectKind(
            () => parseDescriptor(big, { role: ROLE.HOST, connectionId: makeUuid() }),
            ERROR_KIND.OVERSIZED
        );
    });

    it('rejects unsupported version', () => {
        const id = makeUuid();
        const env = { ...baseDescriptor(id), v: 99 };
        expectKind(
            () =>
                parseDescriptor(JSON.stringify(env), {
                    role: ROLE.HOST,
                    connectionId: id
                }),
            ERROR_KIND.UNSUPPORTED_VERSION
        );
    });

    it('rejects wrong role', () => {
        const id = makeUuid();
        const env = { ...baseDescriptor(id), role: 'client' as const };
        expectKind(
            () => parseDescriptor(JSON.stringify(env), { role: ROLE.HOST, connectionId: id }),
            ERROR_KIND.ROLE_MISMATCH
        );
    });

    it('rejects mismatched connectionId', () => {
        const env = baseDescriptor(makeUuid());
        expectKind(
            () =>
                parseDescriptor(JSON.stringify(env), {
                    role: ROLE.HOST,
                    connectionId: makeUuid()
                }),
            ERROR_KIND.CONNECTION_ID_MISMATCH
        );
    });

    it('rejects expired descriptor', () => {
        const id = makeUuid();
        const env = {
            ...baseDescriptor(id),
            created: Date.now() - 10 * 60 * 1000,
            expires: Date.now() - 5 * 60 * 1000
        };
        expectKind(
            () => parseDescriptor(JSON.stringify(env), { role: ROLE.HOST, connectionId: id }),
            ERROR_KIND.EXPIRED
        );
    });

    it('rejects unknown top-level fields', () => {
        const id = makeUuid();
        const env = { ...baseDescriptor(id), extra: 'x' };
        expectKind(
            () => parseDescriptor(JSON.stringify(env), { role: ROLE.HOST, connectionId: id }),
            ERROR_KIND.MALFORMED
        );
    });

    it('rejects missing required fields', () => {
        const bad = JSON.stringify({ v: 1, role: 'host' });
        expectKind(
            () => parseDescriptor(bad, { role: ROLE.HOST, connectionId: makeUuid() }),
            ERROR_KIND.MALFORMED
        );
    });

    it('round-trips through encodeDescriptor', () => {
        const id = makeUuid();
        const encoded = encodeDescriptor(baseDescriptor(id));
        const decoded = parseDescriptor(encoded, { role: ROLE.HOST, connectionId: id });
        expect(decoded.connectionId).toBe(id);
        expect(decoded.sdp).toBe(baseDescriptor(id).sdp);
    });
});

describe('parseDescriptorAdopt', () => {
    it('accepts a host descriptor without a matching connectionId', () => {
        const id = makeUuid();
        const env = parseDescriptorAdopt(JSON.stringify(baseDescriptor(id)), { role: ROLE.HOST });
        expect(env.connectionId).toBe(id);
    });

    it('rejects an expired descriptor before any RTC work', () => {
        const id = makeUuid();
        const env = {
            ...baseDescriptor(id),
            created: Date.now() - 10 * 60 * 1000,
            expires: Date.now() - 5 * 60 * 1000
        };
        expectKind(
            () => parseDescriptorAdopt(JSON.stringify(env), { role: ROLE.HOST }),
            ERROR_KIND.EXPIRED
        );
    });
});

// ---------------------------------------------------------------------------
// Peer envelope — request (no replyTo at top level)
// ---------------------------------------------------------------------------
//
// Convention: parsePeer(env, { role: SENDER_ROLE, connectionId })
// The envelope.role equals the sender's role; expected.role equals the sender's
// role so the receiver can verify the source. peer.ts passes
// `this.options.role === 'host' ? 'client' : 'host'` which IS the sender's role.

describe('parsePeer (request)', () => {
    it('accepts a well-formed request from a host', () => {
        const id = makeUuid();
        const reqId = makeUuid();
        const env = parsePeer(basePeerRequest(ROLE.HOST, id, reqId), {
            role: ROLE.HOST,
            connectionId: id
        });
        if ('replyTo' in env) throw new Error('expected request, got response');
        expect(env.payload.kind).toBe(PayloadKind_ECHO);
        expect(env.requestId).toBe(reqId);
    });

    it('accepts a well-formed request from a client', () => {
        const id = makeUuid();
        const reqId = makeUuid();
        const env = parsePeer(basePeerRequest(ROLE.CLIENT, id, reqId), {
            role: ROLE.CLIENT,
            connectionId: id
        });
        if ('replyTo' in env) throw new Error('expected request, got response');
        expect(env.payload.kind).toBe(PayloadKind_ECHO);
    });

    it('rejects wrong role', () => {
        const id = makeUuid();
        const env = { ...basePeerRequest(ROLE.HOST, id, makeUuid()) };
        expectKind(
            () => parsePeer(env, { role: ROLE.CLIENT, connectionId: id }),
            ERROR_KIND.ROLE_MISMATCH
        );
    });

    it('rejects mismatched connectionId', () => {
        const id = makeUuid();
        const env = basePeerRequest(ROLE.HOST, id, makeUuid());
        expectKind(
            () => parsePeer(env, { role: ROLE.HOST, connectionId: makeUuid() }),
            ERROR_KIND.CONNECTION_ID_MISMATCH
        );
    });

    it('rejects expired envelope', () => {
        const id = makeUuid();
        const env = {
            ...basePeerRequest(ROLE.HOST, id, makeUuid()),
            deadline: Date.now() - 1000
        };
        expectKind(
            () => parsePeer(env, { role: ROLE.HOST, connectionId: id }),
            ERROR_KIND.EXPIRED
        );
    });

    it('rejects unknown request payload kind', () => {
        const id = makeUuid();
        const env = {
            v: 1 as const,
            role: ROLE.HOST,
            connectionId: id,
            requestId: makeUuid(),
            deadline: Date.now() + 60_000,
            payload: { kind: 'mystery_kind', text: 'x' }
        };
        expectKind(
            () => parsePeer(env, { role: ROLE.HOST, connectionId: id }),
            ERROR_KIND.MALFORMED
        );
    });

    it('rejects echo with empty text', () => {
        const id = makeUuid();
        const env = {
            ...basePeerRequest(ROLE.HOST, id, makeUuid()),
            payload: { kind: PAYLOAD_KIND.ECHO, text: '' }
        };
        expectKind(
            () => parsePeer(env, { role: ROLE.HOST, connectionId: id }),
            ERROR_KIND.MALFORMED
        );
    });
});

// ---------------------------------------------------------------------------
// Peer envelope — response (replyTo at top level)
// ---------------------------------------------------------------------------

describe('parsePeer (response)', () => {
    it('accepts a response with matching top-level replyTo', () => {
        const id = makeUuid();
        const reqId = makeUuid();
        const replyId = makeUuid();
        const env = parsePeer(basePeerResponse(ROLE.CLIENT, id, reqId, replyId), {
            role: ROLE.CLIENT,
            connectionId: id
        });
        if (!('replyTo' in env)) throw new Error('expected response');
        expect(env.replyTo).toBe(replyId);
        const responsePayload = env.payload as { kind: 'echo_response'; replyTo: string; text: string };
        expect(responsePayload.text).toBe('pong');
    });

    it('rejects a response whose top-level replyTo disagrees with payload.replyTo', () => {
        const id = makeUuid();
        const env = {
            v: 1 as const,
            role: ROLE.CLIENT,
            connectionId: id,
            requestId: makeUuid(),
            deadline: Date.now() + 60_000,
            replyTo: makeUuid(),
            payload: { kind: 'echo_response', replyTo: makeUuid(), text: 'pong' }
        };
        expectKind(
            () => parsePeer(env, { role: ROLE.CLIENT, connectionId: id }),
            ERROR_KIND.MALFORMED
        );
    });
});

// ---------------------------------------------------------------------------
// isPeerExpired
// ---------------------------------------------------------------------------

describe('isPeerExpired', () => {
    it('returns true when deadline is in the past', () => {
        expect(isPeerExpired(Date.now() - 1000, Date.now())).toBe(true);
    });

    it('returns false when deadline is in the future', () => {
        expect(isPeerExpired(Date.now() + 1000, Date.now())).toBe(false);
    });

    it('returns true when deadline equals now', () => {
        const t = Date.now();
        expect(isPeerExpired(t, t)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------

describe('encode + decode round trip', () => {
    it('encodePeerRequest → parsePeer preserves payload', () => {
        const id = makeUuid();
        const reqId = makeUuid();
        const env = encodePeerRequest(ROLE.HOST, id, reqId, 5000, {
            kind: PAYLOAD_KIND.ECHO,
            text: 'hi'
        });
        const parsed = parsePeer(env, { role: ROLE.HOST, connectionId: id });
        if ('replyTo' in parsed) throw new Error('expected request');
        expect(parsed.payload).toEqual({ kind: PAYLOAD_KIND.ECHO, text: 'hi' });
        expect(parsed.requestId).toBe(reqId);
    });

    it('encodePeerResponse → parsePeer preserves replyTo', () => {
        const id = makeUuid();
        const reqId = makeUuid();
        const original = makeUuid();
        const env = encodePeerResponse(ROLE.CLIENT, id, reqId, 5000, {
            kind: 'echo_response',
            replyTo: original,
            text: 'pong'
        });
        const parsed = parsePeer(env, { role: ROLE.CLIENT, connectionId: id });
        if (!('replyTo' in parsed)) throw new Error('expected response');
        expect(parsed.replyTo).toBe(original);
        const responsePayload = parsed.payload as { kind: 'echo_response'; replyTo: string; text: string };
        expect(responsePayload.text).toBe('pong');
    });
});

// helper keeps the imported literal in scope without an unused import warning
const PayloadKind_ECHO = PAYLOAD_KIND.ECHO;