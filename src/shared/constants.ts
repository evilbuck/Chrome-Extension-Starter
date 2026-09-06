// Phase 4 constants. The CHANGE_BG demo message, the ALARMS poll/cleanup,
// and the sync/managed storage area references are removed. The request
// lifecycle and outcome vocabulary added here drive the control plane.

import type {
    PairedBrowser,
    PairingCommand,
    PairingCommandResult,
    PairingSnapshot
} from '@/shared/lib/pairing-protocol';

export const OFFSCREEN_TARGET = 'offscreen-document' as const;

export const PAIRING_TRUST_STORAGE_KEY = 'pairingTrust' as const;

// Transport envelope versions
export const ENVELOPE_VERSION = 1 as const;
export const PEER_VERSION = 1 as const;

// Descriptor envelope size cap
export const DESCRIPTOR_MAX_BYTES = 32 * 1024;
export const PEER_MAX_BYTES = 96 * 1024;

// Roles
export const ROLE = {
    HOST: 'host',
    CLIENT: 'client'
} as const;
export type Role = (typeof ROLE)[keyof typeof ROLE];

// Transport-level lifecycle (drives the Peer state machine).
export const LIFECYCLE = {
    IDLE: 'idle',
    CREATING: 'creating',
    SIGNALING: 'signaling',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    CLOSED: 'closed',
    FAILED: 'failed'
} as const;
export type Lifecycle = (typeof LIFECYCLE)[keyof typeof LIFECYCLE];

// Phase 4 request lifecycle. Replaces the transport-level lifecycle from the
// caller's perspective: the offscreen owns the transport; the worker owns the
// request state. The progression:
//   idle → checking_host → preparing_host → completing_client → verifying → succeeded
// with `waiting_for_user` as an orthogonal pause and a small set of terminal
// non-success outcomes.
export const REQUEST_STATE = {
    IDLE: 'idle',
    CHECKING_HOST: 'checking_host',
    PREPARING_HOST: 'preparing_host',
    COMPLETING_CLIENT: 'completing_client',
    VERIFYING: 'verifying',
    SUCCEEDED: 'succeeded',
    WAITING_FOR_USER: 'waiting_for_user'
} as const;
export type RequestState = (typeof REQUEST_STATE)[keyof typeof REQUEST_STATE];

export const REQUEST_OUTCOME = {
    UNSUPPORTED: 'unsupported',
    HOST_UNAVAILABLE: 'host_unavailable',
    ACCOUNT_MISMATCH: 'account_mismatch',
    DISCONNECTED: 'disconnected',
    CANCELLED: 'cancelled',
    EXPIRED: 'expired',
    FAILED: 'failed'
} as const;
export type RequestOutcome = (typeof REQUEST_OUTCOME)[keyof typeof REQUEST_OUTCOME];

export type RequestStatus =
    | { kind: 'state'; state: RequestState }
    | { kind: 'outcome'; outcome: RequestOutcome; reason?: string }
    | { kind: 'waiting'; since: number };

// Error categories surfaced to the popup / options UI. Never include SDP,
// ICE candidates, or credential content.
export const ERROR_KIND = {
    UNSUPPORTED_VERSION: 'unsupported_version',
    OVERSIZED: 'oversized',
    MALFORMED: 'malformed',
    EXPIRED: 'expired',
    ROLE_MISMATCH: 'role_mismatch',
    CONNECTION_ID_MISMATCH: 'connection_id_mismatch',
    UNKNOWN_REQUEST: 'unknown_request',
    DUPLICATE_REQUEST: 'duplicate_request',
    DEADLINE_EXCEEDED: 'deadline_exceeded',
    TIMEOUT: 'timeout',
    CHANNEL_CLOSED: 'channel_closed',
    ICE_FAILED: 'ice_failed',
    CREATE_DOCUMENT_FAILED: 'create_document_failed',
    NO_ACTIVE_REQUEST: 'no_active_request',
    INVALID_SENDER_CONTEXT: 'invalid_sender_context',
    REQUEST_NOT_SUPPORTED: 'request_not_supported',
    REQUEST_EXPIRED: 'request_expired',
    STORAGE_FAILURE: 'storage_failure',
    UNKNOWN: 'unknown'
} as const;
export type ErrorKind = (typeof ERROR_KIND)[keyof typeof ERROR_KIND];

// Peer payload kinds. Synthetic echo/ping stay on the existing channel;
// Slack application variants are typed slots on the same envelope, never
// generic credential blobs.
export const PAYLOAD_KIND = {
    ECHO: 'echo',
    PING: 'ping',
    CANCEL: 'cancel',
    SLACK_LIST: 'slack_list',
    SLACK_CAPTURE: 'slack_capture',
    SLACK_VERIFY: 'slack_verify'
} as const;
export type PayloadKind = (typeof PAYLOAD_KIND)[keyof typeof PAYLOAD_KIND];

export const PAYLOAD_RESPONSE_KIND = {
    ECHO_RESPONSE: 'echo_response',
    SLACK_SOURCES: 'slack_sources',
    SLACK_SESSION: 'slack_session',
    SLACK_VERIFIED: 'slack_verified',
    SLACK_ERROR: 'slack_error'
} as const;
export type PayloadResponseKind = (typeof PAYLOAD_RESPONSE_KIND)[keyof typeof PAYLOAD_RESPONSE_KIND];

// Request timeout budgets (ms). One request deadline pauses only for explicit
// human interaction; transport timeout is independent and bounded.
export const REQUEST_DEADLINE_MS = 5 * 60 * 1000;
export const REQUEST_TRANSPORT_TIMEOUT_MS = 30 * 1000;

export enum MSG {
    // Offscreen lifecycle. Worker → offscreen.
    OFFSCREEN_SEND_PEER = 'OFFSCREEN_SEND_PEER',
    OFFSCREEN_CLOSE = 'OFFSCREEN_CLOSE',
    OFFSCREEN_STATUS = 'OFFSCREEN_STATUS',
    OFFSCREEN_PAIRING = 'OFFSCREEN_PAIRING',

    // Offscreen emits back to worker. Worker fans out to popup/options.
    OFFSCREEN_EVENT = 'OFFSCREEN_EVENT',
    OFFSCREEN_PAIRING_STORAGE = 'OFFSCREEN_PAIRING_STORAGE',

    // Typed Slack application frames. Worker ↔ offscreen only.
    OFFSCREEN_APP_REQUEST = 'OFFSCREEN_APP_REQUEST',
    OFFSCREEN_APP_INBOUND = 'OFFSCREEN_APP_INBOUND',

    // Popup/options → worker bridge (transport control).
    OPTIONS_GET_STATUS = 'OPTIONS_GET_STATUS',
    OPTIONS_DISCONNECT = 'OPTIONS_DISCONNECT',
    OPTIONS_SEND_SYNTHETIC = 'OPTIONS_SEND_SYNTHETIC',
    PAIRING = 'PAIRING',

    // Request control plane. popup/options → worker.
    REQUEST_START = 'REQUEST_START',
    REQUEST_CANCEL = 'REQUEST_CANCEL',
    REQUEST_STATUS = 'REQUEST_STATUS',

    // Slack consent + source listing. popup/options → worker.
    SLACK_ENABLE = 'SLACK_ENABLE',
    SLACK_LIST = 'SLACK_LIST'
}

export const MESSAGE_SPEC = {
    [MSG.OFFSCREEN_SEND_PEER]: {
        req: {} as {
            payloadKind: typeof PAYLOAD_KIND.ECHO | typeof PAYLOAD_KIND.PING;
            text: string;
            deadlineMs?: number;
        },
        res: {} as { ok: true; requestId: string } | { ok: false; error: ErrorKind }
    },
    [MSG.OFFSCREEN_CLOSE]: {
        req: {} as { reason?: 'user' | 'shutdown' | 'replaced' } | undefined,
        res: {} as { ok: true }
    },
    [MSG.OFFSCREEN_STATUS]: {
        req: {} as Record<string, never>,
        res: {} as {
            ok: true;
            state: Lifecycle;
            role: Role | null;
            connectionId: string | null;
            authorized: boolean;
            pairing: PairingSnapshot;
            error: ErrorKind | null;
        }
    },
    [MSG.OFFSCREEN_PAIRING]: {
        req: {} as PairingCommand,
        res: {} as PairingCommandResult
    },
    [MSG.OFFSCREEN_EVENT]: {
        req: {} as {
            state: Lifecycle;
            role: Role | null;
            connectionId: string | null;
            authorized: boolean;
            pairing: PairingSnapshot;
            error: ErrorKind | null;
            peerMessage?: { payloadKind: PayloadKind; text: string; requestId: string };
        },
        res: {} as { ok: true }
    },
    [MSG.OFFSCREEN_PAIRING_STORAGE]: {
        req: {} as { action: 'get' | 'role' | 'clear' } | { action: 'set'; pair: PairedBrowser },
        res: {} as { ok: true; value: PairedBrowser | Role | null } | { ok: false; error: ErrorKind }
    },
    [MSG.OFFSCREEN_APP_REQUEST]: {
        req: {} as {
            kind: typeof PAYLOAD_KIND.SLACK_LIST | typeof PAYLOAD_KIND.SLACK_CAPTURE | typeof PAYLOAD_KIND.SLACK_VERIFY;
            source?: unknown;
            deadlineMs: number;
            connectionId: string;
        },
        res: {} as { ok: true; payload: unknown } | { ok: false; error: string }
    },
    [MSG.OFFSCREEN_APP_INBOUND]: {
        req: {} as {
            kind: typeof PAYLOAD_KIND.SLACK_LIST | typeof PAYLOAD_KIND.SLACK_CAPTURE | typeof PAYLOAD_KIND.SLACK_VERIFY;
            source?: unknown;
            requestId: string;
            connectionId: string;
            deadline: number;
        },
        res: {} as { kind: string; sources?: unknown; session?: unknown; error?: string }
    },

    [MSG.OPTIONS_GET_STATUS]: {
        req: {} as Record<string, never>,
        res: {} as {
            ok: true;
            state: Lifecycle;
            role: Role | null;
            connectionId: string | null;
            authorized: boolean;
            pairing: PairingSnapshot;
            error: ErrorKind | null;
        }
    },
    [MSG.OPTIONS_DISCONNECT]: {
        req: {} as Record<string, never>,
        res: {} as { ok: true } | { ok: false; error: ErrorKind }
    },
    [MSG.OPTIONS_SEND_SYNTHETIC]: {
        req: {} as {
            payloadKind: typeof PAYLOAD_KIND.ECHO | typeof PAYLOAD_KIND.PING;
            text: string;
            deadlineMs: number;
        },
        res: {} as { ok: true; requestId: string } | { ok: false; error: ErrorKind }
    },
    [MSG.PAIRING]: {
        req: {} as PairingCommand,
        res: {} as PairingCommandResult
    },

    [MSG.REQUEST_START]: {
        req: {} as {
            applicationKey: string;
            source?: unknown;
            sharedSessionConsent?: unknown;
        },
        res: {} as { ok: true; requestId: string } | { ok: false; error: string }
    },
    [MSG.REQUEST_CANCEL]: {
        req: {} as { requestId?: string },
        res: {} as { ok: true; outcome: 'cancelled' } | { ok: false; error: ErrorKind }
    },
    [MSG.REQUEST_STATUS]: {
        req: {} as { requestId?: string },
        res: {} as {
            ok: true;
            requestId: string | null;
            state: RequestState;
            outcome: RequestOutcome | null;
            since: number | null;
            error: ErrorKind | null;
            reason: string | null;
            destinationTabId?: number | null;
        }
    },
    [MSG.SLACK_ENABLE]: {
        req: {} as { sharedSessionConsent: true },
        res: {} as { ok: true } | { ok: false; error: string }
    },
    [MSG.SLACK_LIST]: {
        req: {} as Record<string, never>,
        res: {} as { ok: true; sources: unknown[] } | { ok: false; error: string }
    }
} as const;

export const RESTRICTED = {
    schemes: ['chrome', 'chrome-extension', 'chrome-untrusted', 'devtools', 'edge', 'about'],
    hosts: [
        /^(?:https?:\/\/)?chrome\.google\.com\/webstore\/?/i,
        /^(?:https?:\/\/)?microsoftedge\.microsoft\.com\/addons\/?/i
    ]
} as const;

export type RestrictedScheme = (typeof RESTRICTED.schemes)[number];
