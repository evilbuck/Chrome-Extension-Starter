// Phase 2 envelope helpers.
//
// Two envelopes share this file:
//   - DescriptorEnvelope (manual offer/answer exchanged by the user).
//   - PeerRequestEnvelope / PeerResponseEnvelope (RTCDataChannel traffic).
//
// Peer envelopes are discriminated by the inner payload `kind` AND by the
// presence/absence of a top-level `replyTo` field. A response carries
// replyTo at the top level; a request does not. This makes correlation
// structural instead of relying on a string union that could be dropped.

import {
    DESCRIPTOR_MAX_BYTES,
    ENVELOPE_VERSION,
    ERROR_KIND,
    PAYLOAD_KIND,
    PEER_VERSION,
    type ErrorKind,
    type Role
} from '@/shared/constants';
import { isUuidV4 } from '@/shared/lib/uuid';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class EnvelopeError extends Error {
    constructor(
        message: string,
        readonly kind: ErrorKind
    ) {
        super(message);
        this.name = 'EnvelopeError';
    }
}

const fail = (kind: ErrorKind, message: string): never => {
    throw new EnvelopeError(message, kind);
};

const requireString = (obj: Record<string, unknown>, key: string): string => {
    const v = obj[key];
    if (typeof v !== 'string') fail(ERROR_KIND.MALFORMED, `missing or non-string field: ${key}`);
    return v as string;
};

const requireNumber = (obj: Record<string, unknown>, key: string): number => {
    const v = obj[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
        fail(ERROR_KIND.MALFORMED, `missing or non-finite numeric field: ${key}`);
    }
    return v as number;
};

const requireEnum = <T extends string>(obj: Record<string, unknown>, key: string, allowed: readonly T[]): T => {
    const v = obj[key];
    if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
        fail(ERROR_KIND.MALFORMED, `missing or invalid enum field: ${key}`);
    }
    return v as T;
};

// ---------------------------------------------------------------------------
// Descriptor envelope
// ---------------------------------------------------------------------------

export interface DescriptorEnvelope {
    v: typeof ENVELOPE_VERSION;
    role: Role;
    connectionId: string;
    created: number;
    expires: number;
    sdp: string;
}

const DESCRIPTOR_KEYS = ['v', 'role', 'connectionId', 'created', 'expires', 'sdp'] as const;

const parseDescriptorFields = (
    raw: string,
    expected: { role: Role },
    requireConnectionIdMatch: boolean
): DescriptorEnvelope => {
    if (typeof raw !== 'string') fail(ERROR_KIND.MALFORMED, 'descriptor must be a string');
    if (raw.length === 0) fail(ERROR_KIND.MALFORMED, 'descriptor is empty');
    if (raw.length > DESCRIPTOR_MAX_BYTES) {
        fail(ERROR_KIND.OVERSIZED, `descriptor exceeds ${DESCRIPTOR_MAX_BYTES} bytes`);
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        fail(ERROR_KIND.MALFORMED, 'descriptor is not valid JSON');
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        fail(ERROR_KIND.MALFORMED, 'descriptor must be a JSON object');
    }

    const obj = parsed as Record<string, unknown>;
    for (const k of Object.keys(obj)) {
        if (!(DESCRIPTOR_KEYS as readonly string[]).includes(k)) {
            fail(ERROR_KIND.MALFORMED, `unexpected field: ${k}`);
        }
    }

    const v = requireNumber(obj, 'v');
    if (v !== ENVELOPE_VERSION) fail(ERROR_KIND.UNSUPPORTED_VERSION, `descriptor version ${v} not supported`);

    const role = requireEnum(obj, 'role', ['host', 'client'] as const) as Role;
    if (role !== expected.role) fail(ERROR_KIND.ROLE_MISMATCH, `descriptor role ${role} != expected ${expected.role}`);

    const connectionId = requireString(obj, 'connectionId');
    if (!isUuidV4(connectionId)) fail(ERROR_KIND.MALFORMED, 'connectionId is not a valid UUID v4');

    if (
        requireConnectionIdMatch &&
        'connectionId' in expected &&
        connectionId !== (expected as { connectionId: string }).connectionId
    ) {
        fail(ERROR_KIND.CONNECTION_ID_MISMATCH, 'descriptor connectionId does not match active session');
    }

    const created = requireNumber(obj, 'created');
    const expires = requireNumber(obj, 'expires');
    if (expires <= created) fail(ERROR_KIND.MALFORMED, 'expires must be > created');

    const sdp = requireString(obj, 'sdp');
    if (sdp.length === 0) fail(ERROR_KIND.MALFORMED, 'sdp is empty');

    if (Date.now() > expires) fail(ERROR_KIND.EXPIRED, 'descriptor has expired');

    return { v: ENVELOPE_VERSION, role, connectionId, created, expires, sdp };
};

export const parseDescriptor = (
    raw: string,
    expected: { role: Role; connectionId: string }
): DescriptorEnvelope => parseDescriptorFields(raw, expected, true);

export const parseDescriptorAdopt = (raw: string, expected: { role: Role }): DescriptorEnvelope =>
    parseDescriptorFields(raw, expected, false);

export const encodeDescriptor = (env: DescriptorEnvelope): string => {
    if (env.v !== ENVELOPE_VERSION) fail(ERROR_KIND.UNSUPPORTED_VERSION, 'cannot encode unsupported version');
    if (!isUuidV4(env.connectionId)) fail(ERROR_KIND.MALFORMED, 'connectionId is not a valid UUID v4');
    if (env.expires <= env.created) fail(ERROR_KIND.MALFORMED, 'expires must be > created');
    if (env.sdp.length === 0) fail(ERROR_KIND.MALFORMED, 'sdp is empty');
    const out = JSON.stringify(env);
    if (out.length > DESCRIPTOR_MAX_BYTES) fail(ERROR_KIND.OVERSIZED, 'encoded descriptor exceeds size budget');
    return out;
};

// ---------------------------------------------------------------------------
// Peer message envelope — discriminated by presence of `replyTo`
// ---------------------------------------------------------------------------

export interface PeerEchoPayload {
    kind: typeof PAYLOAD_KIND.ECHO;
    text: string;
}

export interface PeerPingPayload {
    kind: typeof PAYLOAD_KIND.PING;
    nonce: string;
}

export interface PeerCancelPayload {
    kind: typeof PAYLOAD_KIND.CANCEL;
    requestId: string;
}

/** A response frame's payload carries the original requestId in `replyTo`.
 *  It is structurally distinct from any request payload. */
export interface PeerEchoResponsePayload {
    kind: 'echo_response';
    replyTo: string;
    text: string;
}

export type PeerPayload = PeerEchoPayload | PeerPingPayload | PeerCancelPayload;
export type PeerResponsePayload = PeerEchoResponsePayload;

export interface PeerRequestEnvelope {
    v: typeof PEER_VERSION;
    role: Role;
    connectionId: string;
    requestId: string;
    deadline: number;
    /** Required on response envelopes, forbidden on request envelopes. */
    replyTo?: never;
    payload: PeerPayload;
}

export interface PeerResponseEnvelope {
    v: typeof PEER_VERSION;
    role: Role;
    connectionId: string;
    requestId: string;
    deadline: number;
    /** The original requestId this response correlates to. */
    replyTo: string;
    payload: PeerResponsePayload;
}

export type PeerEnvelope = PeerRequestEnvelope | PeerResponseEnvelope;

const PEER_KEYS = ['v', 'role', 'connectionId', 'requestId', 'deadline', 'replyTo', 'payload'] as const;

const parseRequestPayload = (obj: Record<string, unknown>): PeerPayload => {
    const kind = requireEnum(obj, 'kind', [PAYLOAD_KIND.ECHO, PAYLOAD_KIND.PING, PAYLOAD_KIND.CANCEL] as const);
    if (kind === PAYLOAD_KIND.ECHO) {
        const text = requireString(obj, 'text');
        if (text.length === 0) fail(ERROR_KIND.MALFORMED, 'echo.text must be non-empty');
        return { kind, text };
    }
    if (kind === PAYLOAD_KIND.PING) {
        const nonce = requireString(obj, 'nonce');
        return { kind, nonce };
    }
    if (kind === PAYLOAD_KIND.CANCEL) {
        const requestId = requireString(obj, 'requestId');
        if (!isUuidV4(requestId)) fail(ERROR_KIND.MALFORMED, 'cancel.requestId is not a valid UUID v4');
        return { kind, requestId };
    }
    return fail(ERROR_KIND.MALFORMED, `unknown request payload kind: ${String(kind)}`);
};

const parseResponsePayload = (obj: Record<string, unknown>): PeerResponsePayload => {
    const kind = requireEnum(obj, 'kind', ['echo_response'] as const);
    if (kind === 'echo_response') {
        const replyTo = requireString(obj, 'replyTo');
        if (!isUuidV4(replyTo)) fail(ERROR_KIND.MALFORMED, 'echo_response.replyTo is not a valid UUID v4');
        const text = requireString(obj, 'text');
        return { kind: 'echo_response', replyTo, text };
    }
    return fail(ERROR_KIND.MALFORMED, `unknown response payload kind: ${String(kind)}`);
};

/** Build a peer request envelope. Pure: does not transmit. */
export const encodePeerRequest = (
    role: Role,
    connectionId: string,
    requestId: string,
    deadlineMs: number,
    payload: PeerPayload
): PeerRequestEnvelope => {
    if (!isUuidV4(connectionId)) fail(ERROR_KIND.MALFORMED, 'connectionId is not a valid UUID v4');
    if (!isUuidV4(requestId)) fail(ERROR_KIND.MALFORMED, 'requestId is not a valid UUID v4');
    if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) {
        fail(ERROR_KIND.MALFORMED, 'deadlineMs must be a positive finite number');
    }
    return {
        v: PEER_VERSION,
        role,
        connectionId,
        requestId,
        deadline: Date.now() + deadlineMs,
        payload
    };
};

/** Build a peer response envelope. Pure: does not transmit. */
export const encodePeerResponse = (
    role: Role,
    connectionId: string,
    requestId: string,
    deadlineMs: number,
    payload: PeerResponsePayload
): PeerResponseEnvelope => {
    if (!isUuidV4(connectionId)) fail(ERROR_KIND.MALFORMED, 'connectionId is not a valid UUID v4');
    if (!isUuidV4(requestId)) fail(ERROR_KIND.MALFORMED, 'requestId is not a valid UUID v4');
    if (!isUuidV4(payload.replyTo)) fail(ERROR_KIND.MALFORMED, 'response payload.replyTo is not a valid UUID v4');
    if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) {
        fail(ERROR_KIND.MALFORMED, 'deadlineMs must be a positive finite number');
    }
    return {
        v: PEER_VERSION,
        role,
        connectionId,
        requestId,
        deadline: Date.now() + deadlineMs,
        replyTo: payload.replyTo,
        payload
    };
};

/**
 * Validate and parse a peer message envelope. Returns either a request
 * envelope or a response envelope (discriminated by `replyTo`).
 */
export const parsePeer = (
    raw: unknown,
    expected: { role: Role; connectionId: string }
): PeerEnvelope => {
    if (typeof raw === 'string') {
        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            fail(ERROR_KIND.MALFORMED, 'peer message is not valid JSON');
        }
        return parsePeer(parsed, expected);
    }

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        fail(ERROR_KIND.MALFORMED, 'peer message must be an object or JSON string');
    }
    const obj = raw as Record<string, unknown>;
    for (const k of Object.keys(obj)) {
        if (!(PEER_KEYS as readonly string[]).includes(k)) {
            fail(ERROR_KIND.MALFORMED, `unexpected field: ${k}`);
        }
    }

    const v = requireNumber(obj, 'v');
    if (v !== PEER_VERSION) fail(ERROR_KIND.UNSUPPORTED_VERSION, `peer version ${v} not supported`);

    const role = requireEnum(obj, 'role', ['host', 'client'] as const) as Role;
    if (role !== expected.role) fail(ERROR_KIND.ROLE_MISMATCH, `peer role ${role} != expected ${expected.role}`);

    const connectionId = requireString(obj, 'connectionId');
    if (!isUuidV4(connectionId)) fail(ERROR_KIND.MALFORMED, 'connectionId is not a valid UUID v4');
    if (connectionId !== expected.connectionId) {
        fail(ERROR_KIND.CONNECTION_ID_MISMATCH, 'peer connectionId does not match active session');
    }

    const requestId = requireString(obj, 'requestId');
    if (!isUuidV4(requestId)) fail(ERROR_KIND.MALFORMED, 'requestId is not a valid UUID v4');

    const deadline = requireNumber(obj, 'deadline');
    if (!Number.isFinite(deadline)) fail(ERROR_KIND.MALFORMED, 'deadline is not finite');
    if (Date.now() > deadline) fail(ERROR_KIND.EXPIRED, 'peer envelope deadline has passed');

    let replyTo: string | undefined;
    if (obj.replyTo !== undefined) {
        if (typeof obj.replyTo !== 'string') fail(ERROR_KIND.MALFORMED, 'replyTo must be a string');
        if (!isUuidV4(obj.replyTo)) fail(ERROR_KIND.MALFORMED, 'replyTo is not a valid UUID v4');
        replyTo = obj.replyTo as string;
    }

    const rawPayload = obj.payload;
    if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
        fail(ERROR_KIND.MALFORMED, 'payload must be a JSON object');
    }
    const payloadObj = rawPayload as Record<string, unknown>;

    if (replyTo !== undefined) {
        const response = parseResponsePayload(payloadObj);
        if (response.replyTo !== replyTo) {
            fail(ERROR_KIND.MALFORMED, "top-level replyTo does not match payload.replyTo");
        }
        return {
            v: PEER_VERSION,
            role,
            connectionId,
            requestId,
            deadline,
            replyTo: response.replyTo,
            payload: response
        };
    }

    const request = parseRequestPayload(payloadObj);
    return {
        v: PEER_VERSION,
        role,
        connectionId,
        requestId,
        deadline,
        payload: request
    };
};

/** True iff `deadline` is strictly in the past relative to `now`. */
export const isPeerExpired = (deadline: number, now: number = Date.now()): boolean => deadline <= now;