import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ERROR_KIND,
    type ErrorKind,
    PAYLOAD_KIND,
    PAYLOAD_RESPONSE_KIND,
    PEER_MAX_BYTES,
    ROLE,
    type Role
} from '@/shared/constants';
import {
    EnvelopeError,
    encodeDescriptor,
    encodePeerRequest,
    encodePeerResponse,
    isPeerExpired,
    isSlackRequestKind,
    parseDescriptor,
    parseDescriptorAdopt,
    parsePeer
} from '@/shared/lib/envelope';

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
        expectKind(() => parseDescriptor(big, { role: ROLE.HOST, connectionId: makeUuid() }), ERROR_KIND.OVERSIZED);
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
        expectKind(() => parseDescriptor(bad, { role: ROLE.HOST, connectionId: makeUuid() }), ERROR_KIND.MALFORMED);
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
        expectKind(() => parseDescriptorAdopt(JSON.stringify(env), { role: ROLE.HOST }), ERROR_KIND.EXPIRED);
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
        expectKind(() => parsePeer(env, { role: ROLE.CLIENT, connectionId: id }), ERROR_KIND.ROLE_MISMATCH);
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
        expectKind(() => parsePeer(env, { role: ROLE.HOST, connectionId: id }), ERROR_KIND.EXPIRED);
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
        expectKind(() => parsePeer(env, { role: ROLE.HOST, connectionId: id }), ERROR_KIND.MALFORMED);
    });

    it('rejects echo with empty text', () => {
        const id = makeUuid();
        const env = {
            ...basePeerRequest(ROLE.HOST, id, makeUuid()),
            payload: { kind: PAYLOAD_KIND.ECHO, text: '' }
        };
        expectKind(() => parsePeer(env, { role: ROLE.HOST, connectionId: id }), ERROR_KIND.MALFORMED);
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
        expectKind(() => parsePeer(env, { role: ROLE.CLIENT, connectionId: id }), ERROR_KIND.MALFORMED);
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
            kind: PAYLOAD_RESPONSE_KIND.ECHO_RESPONSE,
            replyTo: original,
            text: 'pong'
        });
        const parsed = parsePeer(env, { role: ROLE.CLIENT, connectionId: id });
        if (!('replyTo' in parsed)) throw new Error('expected response');
        expect(parsed.replyTo).toBe(original);
        const responsePayload = parsed.payload as { kind: 'echo_response'; replyTo: string; text: string };
        expect(responsePayload.text).toBe('pong');
    });

    it('encodePeerRequest slack_list → parsePeer', () => {
        const id = makeUuid();
        const reqId = makeUuid();
        const env = encodePeerRequest(ROLE.CLIENT, id, reqId, 5000, { kind: PAYLOAD_KIND.SLACK_LIST });
        const parsed = parsePeer(env, { role: ROLE.CLIENT, connectionId: id });
        if ('replyTo' in parsed) throw new Error('expected request');
        expect(parsed.payload.kind).toBe(PAYLOAD_KIND.SLACK_LIST);
    });
});

describe('parsePeer (slack application variants)', () => {
    const slackSource = {
        sourceTabId: 1,
        scopeId: 'E01234567',
        workspaceId: 'T01234567',
        userId: 'U01234567',
        enterpriseOrigin: 'https://acme.enterprise.slack.com',
        workspaceOrigin: 'https://acme.slack.com',
        workspaceName: 'Acme'
    };

    it('rejects an invalid slack_capture source', () => {
        const id = makeUuid();
        const env = {
            v: 1 as const,
            role: ROLE.CLIENT,
            connectionId: id,
            requestId: makeUuid(),
            deadline: Date.now() + 60_000,
            payload: { kind: PAYLOAD_KIND.SLACK_CAPTURE, source: { sourceTabId: 1 } }
        };
        expectKind(() => parsePeer(env, { role: ROLE.CLIENT, connectionId: id }), ERROR_KIND.MALFORMED);
    });

    it('rejects extra fields on slack_list', () => {
        const id = makeUuid();
        const env = {
            v: 1 as const,
            role: ROLE.CLIENT,
            connectionId: id,
            requestId: makeUuid(),
            deadline: Date.now() + 60_000,
            payload: { kind: PAYLOAD_KIND.SLACK_LIST, extra: true }
        };
        expectKind(() => parsePeer(env, { role: ROLE.CLIENT, connectionId: id }), ERROR_KIND.MALFORMED);
    });

    it('rejects an invalid slack_session', () => {
        const id = makeUuid();
        const replyTo = makeUuid();
        const env = {
            v: 1 as const,
            role: ROLE.HOST,
            connectionId: id,
            requestId: makeUuid(),
            deadline: Date.now() + 60_000,
            replyTo,
            payload: {
                kind: PAYLOAD_RESPONSE_KIND.SLACK_SESSION,
                replyTo,
                session: { source: slackSource, cookies: [], teams: [] }
            }
        };
        expectKind(() => parsePeer(env, { role: ROLE.HOST, connectionId: id }), ERROR_KIND.MALFORMED);
    });

    it('rejects a wrong-role slack_list envelope', () => {
        const id = makeUuid();
        const env = {
            v: 1 as const,
            role: ROLE.CLIENT,
            connectionId: id,
            requestId: makeUuid(),
            deadline: Date.now() + 60_000,
            payload: { kind: PAYLOAD_KIND.SLACK_LIST }
        };
        expectKind(() => parsePeer(env, { role: ROLE.HOST, connectionId: id }), ERROR_KIND.ROLE_MISMATCH);
    });

    it('rejects an oversized peer message', () => {
        const id = makeUuid();
        const raw = `"${'x'.repeat(PEER_MAX_BYTES + 8)}"`;
        expectKind(() => parsePeer(raw, { role: ROLE.CLIENT, connectionId: id }), ERROR_KIND.OVERSIZED);
    });

    it('accepts a well-formed slack_capture request', () => {
        const id = makeUuid();
        const env = encodePeerRequest(ROLE.CLIENT, id, makeUuid(), 5000, {
            kind: PAYLOAD_KIND.SLACK_CAPTURE,
            source: slackSource
        });
        const parsed = parsePeer(env, { role: ROLE.CLIENT, connectionId: id });
        if ('replyTo' in parsed) throw new Error('expected request');
        expect(parsed.payload.kind).toBe(PAYLOAD_KIND.SLACK_CAPTURE);
    });

    it('accepts slack_error responses', () => {
        const id = makeUuid();
        const replyTo = makeUuid();
        const env = encodePeerResponse(ROLE.HOST, id, makeUuid(), 5000, {
            kind: PAYLOAD_RESPONSE_KIND.SLACK_ERROR,
            replyTo,
            error: 'busy'
        });
        const parsed = parsePeer(env, { role: ROLE.HOST, connectionId: id });
        if (!('replyTo' in parsed)) throw new Error('expected response');
        expect(parsed.payload.kind).toBe(PAYLOAD_RESPONSE_KIND.SLACK_ERROR);
    });
});

describe('parseDescriptor field errors', () => {
    it('rejects a JSON array', () => {
        expectKind(() => parseDescriptor('[]', { role: ROLE.HOST, connectionId: makeUuid() }), ERROR_KIND.MALFORMED);
    });

    it('rejects a non-finite created timestamp', () => {
        const id = makeUuid();
        const env = { ...baseDescriptor(id), created: 'now' };
        expectKind(
            () => parseDescriptor(JSON.stringify(env), { role: ROLE.HOST, connectionId: id }),
            ERROR_KIND.MALFORMED
        );
    });
});

describe('parsePeer request payload variants', () => {
    it('accepts ping', () => {
        const id = makeUuid();
        const env = parsePeer(
            {
                ...basePeerRequest(ROLE.HOST, id, makeUuid()),
                payload: { kind: PAYLOAD_KIND.PING, nonce: 'abc' }
            },
            { role: ROLE.HOST, connectionId: id }
        );
        if ('replyTo' in env) throw new Error('expected request');
        expect(env.payload).toEqual({ kind: PAYLOAD_KIND.PING, nonce: 'abc' });
    });

    it('accepts cancel with a UUID requestId', () => {
        const id = makeUuid();
        const cancelId = makeUuid();
        const env = parsePeer(
            {
                ...basePeerRequest(ROLE.HOST, id, makeUuid()),
                payload: { kind: PAYLOAD_KIND.CANCEL, requestId: cancelId }
            },
            { role: ROLE.HOST, connectionId: id }
        );
        if ('replyTo' in env) throw new Error('expected request');
        expect(env.payload).toEqual({ kind: PAYLOAD_KIND.CANCEL, requestId: cancelId });
    });

    it('rejects cancel with a non-UUID requestId', () => {
        const id = makeUuid();
        const env = {
            ...basePeerRequest(ROLE.HOST, id, makeUuid()),
            payload: { kind: PAYLOAD_KIND.CANCEL, requestId: 'not-a-uuid' }
        };
        expectKind(() => parsePeer(env, { role: ROLE.HOST, connectionId: id }), ERROR_KIND.MALFORMED);
    });

    it('rejects extra fields on slack_capture', () => {
        const id = makeUuid();
        const slackSource = {
            sourceTabId: 1,
            scopeId: 'E01234567',
            workspaceId: 'T01234567',
            userId: 'U01234567',
            enterpriseOrigin: 'https://acme.enterprise.slack.com',
            workspaceOrigin: 'https://acme.slack.com',
            workspaceName: 'Acme'
        };
        const env = {
            ...basePeerRequest(ROLE.CLIENT, id, makeUuid()),
            payload: { kind: PAYLOAD_KIND.SLACK_CAPTURE, source: slackSource, extra: true }
        };
        expectKind(() => parsePeer(env, { role: ROLE.CLIENT, connectionId: id }), ERROR_KIND.MALFORMED);
    });

    it('accepts slack_verify', () => {
        const id = makeUuid();
        const slackSource = {
            sourceTabId: 1,
            scopeId: 'E01234567',
            workspaceId: 'T01234567',
            userId: 'U01234567',
            enterpriseOrigin: 'https://acme.enterprise.slack.com',
            workspaceOrigin: 'https://acme.slack.com',
            workspaceName: 'Acme'
        };
        const env = encodePeerRequest(ROLE.CLIENT, id, makeUuid(), 5000, {
            kind: PAYLOAD_KIND.SLACK_VERIFY,
            source: slackSource
        });
        const parsed = parsePeer(env, { role: ROLE.CLIENT, connectionId: id });
        if ('replyTo' in parsed) throw new Error('expected request');
        expect(parsed.payload.kind).toBe(PAYLOAD_KIND.SLACK_VERIFY);
    });

    it('rejects extra fields on slack_verify', () => {
        const id = makeUuid();
        const slackSource = {
            sourceTabId: 1,
            scopeId: 'E01234567',
            workspaceId: 'T01234567',
            userId: 'U01234567',
            enterpriseOrigin: 'https://acme.enterprise.slack.com',
            workspaceOrigin: 'https://acme.slack.com',
            workspaceName: 'Acme'
        };
        const env = {
            ...basePeerRequest(ROLE.CLIENT, id, makeUuid()),
            payload: { kind: PAYLOAD_KIND.SLACK_VERIFY, source: slackSource, extra: true }
        };
        expectKind(() => parsePeer(env, { role: ROLE.CLIENT, connectionId: id }), ERROR_KIND.MALFORMED);
    });
});

describe('parsePeer response payload variants', () => {
    const slackSource = {
        sourceTabId: 1,
        scopeId: 'E01234567',
        workspaceId: 'T01234567',
        userId: 'U01234567',
        enterpriseOrigin: 'https://acme.enterprise.slack.com',
        workspaceOrigin: 'https://acme.slack.com',
        workspaceName: 'Acme'
    };

    it('accepts slack_sources', () => {
        const id = makeUuid();
        const replyTo = makeUuid();
        const env = encodePeerResponse(ROLE.HOST, id, makeUuid(), 5000, {
            kind: PAYLOAD_RESPONSE_KIND.SLACK_SOURCES,
            replyTo,
            sources: [slackSource]
        });
        const parsed = parsePeer(env, { role: ROLE.HOST, connectionId: id });
        if (!('replyTo' in parsed)) throw new Error('expected response');
        expect(parsed.payload.kind).toBe(PAYLOAD_RESPONSE_KIND.SLACK_SOURCES);
    });

    it('rejects extra fields on slack_sources', () => {
        const id = makeUuid();
        const replyTo = makeUuid();
        const env = {
            ...basePeerResponse(ROLE.HOST, id, makeUuid(), replyTo),
            payload: { kind: PAYLOAD_RESPONSE_KIND.SLACK_SOURCES, replyTo, sources: [slackSource], extra: true }
        };
        expectKind(() => parsePeer(env, { role: ROLE.HOST, connectionId: id }), ERROR_KIND.MALFORMED);
    });

    it('rejects an oversized slack_sources list', () => {
        const id = makeUuid();
        const replyTo = makeUuid();
        const env = {
            ...basePeerResponse(ROLE.HOST, id, makeUuid(), replyTo),
            payload: {
                kind: PAYLOAD_RESPONSE_KIND.SLACK_SOURCES,
                replyTo,
                sources: Array.from({ length: 33 }, () => slackSource)
            }
        };
        expectKind(() => parsePeer(env, { role: ROLE.HOST, connectionId: id }), ERROR_KIND.MALFORMED);
    });

    it('rejects extra fields on slack_session', () => {
        const id = makeUuid();
        const replyTo = makeUuid();
        const env = {
            ...basePeerResponse(ROLE.HOST, id, makeUuid(), replyTo),
            payload: {
                kind: PAYLOAD_RESPONSE_KIND.SLACK_SESSION,
                replyTo,
                session: { source: slackSource, cookies: [], teams: [] },
                extra: true
            }
        };
        expectKind(() => parsePeer(env, { role: ROLE.HOST, connectionId: id }), ERROR_KIND.MALFORMED);
    });

    it('accepts slack_verified', () => {
        const id = makeUuid();
        const replyTo = makeUuid();
        const env = encodePeerResponse(ROLE.HOST, id, makeUuid(), 5000, {
            kind: PAYLOAD_RESPONSE_KIND.SLACK_VERIFIED,
            replyTo
        });
        const parsed = parsePeer(env, { role: ROLE.HOST, connectionId: id });
        if (!('replyTo' in parsed)) throw new Error('expected response');
        expect(parsed.payload.kind).toBe(PAYLOAD_RESPONSE_KIND.SLACK_VERIFIED);
    });

    it('rejects extra fields on slack_verified', () => {
        const id = makeUuid();
        const replyTo = makeUuid();
        const env = {
            ...basePeerResponse(ROLE.HOST, id, makeUuid(), replyTo),
            payload: { kind: PAYLOAD_RESPONSE_KIND.SLACK_VERIFIED, replyTo, extra: true }
        };
        expectKind(() => parsePeer(env, { role: ROLE.HOST, connectionId: id }), ERROR_KIND.MALFORMED);
    });

    it('rejects extra fields on slack_error', () => {
        const id = makeUuid();
        const replyTo = makeUuid();
        const env = {
            ...basePeerResponse(ROLE.HOST, id, makeUuid(), replyTo),
            payload: { kind: PAYLOAD_RESPONSE_KIND.SLACK_ERROR, replyTo, error: 'busy', extra: true }
        };
        expectKind(() => parsePeer(env, { role: ROLE.HOST, connectionId: id }), ERROR_KIND.MALFORMED);
    });

    it('rejects an unknown slack_error code', () => {
        const id = makeUuid();
        const replyTo = makeUuid();
        const env = {
            ...basePeerResponse(ROLE.HOST, id, makeUuid(), replyTo),
            payload: { kind: PAYLOAD_RESPONSE_KIND.SLACK_ERROR, replyTo, error: 'not_a_failure' }
        };
        expectKind(() => parsePeer(env, { role: ROLE.HOST, connectionId: id }), ERROR_KIND.MALFORMED);
    });
});

describe('isSlackRequestKind', () => {
    it('accepts slack request kinds and rejects others', () => {
        expect(isSlackRequestKind(PAYLOAD_KIND.SLACK_LIST)).toBe(true);
        expect(isSlackRequestKind(PAYLOAD_KIND.SLACK_CAPTURE)).toBe(true);
        expect(isSlackRequestKind(PAYLOAD_KIND.SLACK_VERIFY)).toBe(true);
        expect(isSlackRequestKind(PAYLOAD_KIND.ECHO)).toBe(false);
    });
});

describe('encodePeer deadlineMs', () => {
    it('rejects a non-positive deadline on encodePeerRequest', () => {
        const id = makeUuid();
        expectKind(
            () => encodePeerRequest(ROLE.HOST, id, makeUuid(), 0, { kind: PAYLOAD_KIND.ECHO, text: 'hi' }),
            ERROR_KIND.MALFORMED
        );
    });

    it('rejects a non-positive deadline on encodePeerResponse', () => {
        const id = makeUuid();
        const replyTo = makeUuid();
        expectKind(
            () =>
                encodePeerResponse(ROLE.CLIENT, id, makeUuid(), -1, {
                    kind: PAYLOAD_RESPONSE_KIND.ECHO_RESPONSE,
                    replyTo,
                    text: 'pong'
                }),
            ERROR_KIND.MALFORMED
        );
    });
});

describe('parsePeer envelope shape', () => {
    it('rejects invalid JSON text', () => {
        expectKind(() => parsePeer('{', { role: ROLE.HOST, connectionId: makeUuid() }), ERROR_KIND.MALFORMED);
    });

    it('rejects a JSON array', () => {
        expectKind(() => parsePeer([], { role: ROLE.HOST, connectionId: makeUuid() }), ERROR_KIND.MALFORMED);
    });

    it('rejects an oversized object', () => {
        const id = makeUuid();
        const env = {
            ...basePeerRequest(ROLE.HOST, id, makeUuid()),
            payload: { kind: PAYLOAD_KIND.ECHO, text: 'x'.repeat(PEER_MAX_BYTES) }
        };
        expectKind(() => parsePeer(env, { role: ROLE.HOST, connectionId: id }), ERROR_KIND.OVERSIZED);
    });

    it('rejects unknown top-level fields', () => {
        const id = makeUuid();
        const env = { ...basePeerRequest(ROLE.HOST, id, makeUuid()), extra: true };
        expectKind(() => parsePeer(env, { role: ROLE.HOST, connectionId: id }), ERROR_KIND.MALFORMED);
    });

    it('rejects a missing payload object', () => {
        const id = makeUuid();
        const env = { ...basePeerRequest(ROLE.HOST, id, makeUuid()), payload: null };
        expectKind(() => parsePeer(env, { role: ROLE.HOST, connectionId: id }), ERROR_KIND.MALFORMED);
    });
});

// helper keeps the imported literal in scope without an unused import warning
const PayloadKind_ECHO = PAYLOAD_KIND.ECHO;
