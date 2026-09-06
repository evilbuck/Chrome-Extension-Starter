/** Public rendezvous metadata only. Application payloads never belong on this protocol. */
export const PAIRING_ORIGIN = 'https://beam-me-up-pairing.buck-f11.workers.dev';
export const PAIRING_SOCKET_PROTOCOL = 'beam-pairing-v1';
export const PAIRING_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PAIRING_TTL_MS = 2 * 60 * 1000;
export const PAIRING_PROOF_TTL_MS = 60 * 1000;
export const PAIRING_MAX_FRAME_BYTES = 96 * 1024;
export const PAIRING_MAX_DESCRIPTOR_LENGTH = 48 * 1024;
export type PairingRole = 'host' | 'client';

export interface PairingDevice {
    publicKey: string;
    label: string;
}

export interface PairedBrowser {
    id: string;
    role: PairingRole;
    peer: PairingDevice;
    createdAt: number;
}

export type PairingFailure =
    | 'invalid_code'
    | 'expired'
    | 'busy'
    | 'rejected'
    | 'cancelled'
    | 'disconnected'
    | 'unpaired'
    | 'invalid_peer'
    | 'invalid_message'
    | 'rate_limited'
    | 'unavailable'
    | 'connection_failed';

export type PairingPhase =
    | 'idle'
    | 'creating'
    | 'waiting'
    | 'confirming'
    | 'connecting'
    | 'connected'
    | 'disconnected'
    | 'expired'
    | 'rejected'
    | 'failed';

export interface PairingSnapshot {
    phase: PairingPhase;
    code: string | null;
    expiresAt: number | null;
    pending: { attemptId: string; peer: PairingDevice; confirmed: boolean } | null;
    pair: PairedBrowser | null;
    error: PairingFailure | null;
}

export type PairingCommand =
    | { action: 'status' }
    | { action: 'create'; label: string }
    | { action: 'join'; code: string; label: string }
    | { action: 'confirm'; attemptId: string }
    | { action: 'connect' }
    | { action: 'cancel' }
    | { action: 'forget' };

export type PairingCommandResult = { ok: true; pairing: PairingSnapshot } | { ok: false; error: PairingFailure };

/** POST /v1/invitations -> credentials; host role is implicit. */
export type CreateInvitation = PairingDevice;
/** POST /v1/join -> credentials; client role is implicit. */
export interface JoinInvitation extends PairingDevice {
    code: string;
}
/** POST /v1/reconnect or /v1/forget. Signature covers action and every field except itself. */
export interface PairingProof {
    roomId: string;
    publicKey: string;
    nonce: string;
    timestamp: number;
    signature: string;
}

export interface RoomCredentials {
    ok: true;
    roomId: string;
    ticket: string;
    code: string | null;
    expiresAt: number | null;
}

/** WebSocket /v1/socket/<roomId>; protocols [PAIRING_SOCKET_PROTOCOL, ticket]. No tokens in URLs. */
export type PairingClientMessage =
    | { type: 'confirm'; attemptId: string; peerPublicKey: string }
    | { type: 'cancel' }
    | SignedSignal;

export interface SignedSignal {
    type: 'signal';
    connectionId: string;
    descriptor: string;
    signature: string;
}

export type PairingServerMessage =
    | { type: 'waiting'; expiresAt: number | null }
    | { type: 'pending'; attemptId: string; peer: PairingDevice; expiresAt: number }
    | { type: 'paired'; pair: PairedBrowser; connectionId: string }
    | SignedSignal
    | { type: 'error'; error: PairingFailure };

export const normalizePairingCode = (code: string): string => code.trim().toUpperCase();
export const isPairingCode = (code: unknown): code is string =>
    typeof code === 'string' && /^[A-HJ-NP-Z2-9]{5}$/.test(code);

export const isPairingLabel = (label: unknown): label is string => {
    if (typeof label !== 'string' || label.length > 40 || label.trim().length === 0) return false;
    for (let index = 0; index < label.length; index++) {
        const code = label.charCodeAt(index);
        if (code < 32 || code === 127) return false;
    }
    return true;
};

export const isPairingDevice = (device: unknown): device is PairingDevice => {
    if (!device || typeof device !== 'object' || Array.isArray(device)) return false;
    const value = device as Record<string, unknown>;
    return (
        typeof value.publicKey === 'string' &&
        value.publicKey.length <= 256 &&
        /^[A-Za-z0-9+/]+={0,2}$/.test(value.publicKey) &&
        isPairingLabel(value.label)
    );
};

export const isPairingCommand = (command: unknown): command is PairingCommand => {
    if (!command || typeof command !== 'object' || Array.isArray(command)) return false;
    const value = command as Record<string, unknown>;
    switch (value.action) {
        case 'status':
        case 'connect':
        case 'cancel':
        case 'forget':
            return Object.keys(value).length === 1;
        case 'create':
            return Object.keys(value).length === 2 && isPairingLabel(value.label);
        case 'join':
            return (
                Object.keys(value).length === 3 &&
                typeof value.code === 'string' &&
                isPairingCode(normalizePairingCode(value.code)) &&
                isPairingLabel(value.label)
            );
        case 'confirm':
            return (
                Object.keys(value).length === 2 &&
                typeof value.attemptId === 'string' &&
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.attemptId)
            );
        default:
            return false;
    }
};

export const pairingProofText = (action: 'reconnect' | 'forget', proof: Omit<PairingProof, 'signature'>): string =>
    JSON.stringify(['beam-proof-v1', action, proof.roomId, proof.publicKey, proof.nonce, proof.timestamp]);

export const pairingSignalText = (
    roomId: string,
    role: PairingRole,
    signal: Omit<SignedSignal, 'signature' | 'type'>
): string => JSON.stringify(['beam-signal-v1', roomId, signal.connectionId, role, signal.descriptor]);
