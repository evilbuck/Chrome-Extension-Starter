import { decodePairingBytes, importPairingPublicKey } from '../../../src/shared/lib/pairing-crypto';
import {
    isPairingCode,
    isPairingDevice,
    isPairingLabel,
    normalizePairingCode,
    type PairingDevice,
    type PairingProof
} from '../../../src/shared/lib/pairing-protocol';
import { exactKeys, isUuid, NONCE_RE } from './util';

const P256_SPKI_BYTES = 91;

export const isValidP256PublicKey = async (publicKey: string): Promise<boolean> => {
    if (publicKey.length > 256 || !/^[A-Za-z0-9+/]+={0,2}$/.test(publicKey)) return false;
    try {
        const bytes = decodePairingBytes(publicKey);
        if (bytes.byteLength !== P256_SPKI_BYTES) return false;
        await importPairingPublicKey(publicKey);
        return true;
    } catch {
        return false;
    }
};

export const parseDevice = (value: Record<string, unknown>): PairingDevice | null => {
    if (!exactKeys(value, ['publicKey', 'label'])) return null;
    if (!isPairingDevice(value)) return null;
    return { publicKey: value.publicKey, label: value.label };
};

export const parseJoin = (value: Record<string, unknown>): (PairingDevice & { code: string }) | null => {
    if (!exactKeys(value, ['publicKey', 'label', 'code'])) return null;
    if (typeof value.publicKey !== 'string' || typeof value.label !== 'string' || typeof value.code !== 'string') {
        return null;
    }
    if (!isPairingLabel(value.label)) return null;
    const code = normalizePairingCode(value.code);
    if (!isPairingCode(code)) return null;
    if (value.publicKey.length > 256 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.publicKey)) return null;
    return { publicKey: value.publicKey, label: value.label, code };
};

export const parseProof = (value: Record<string, unknown>): PairingProof | null => {
    if (!exactKeys(value, ['roomId', 'publicKey', 'nonce', 'timestamp', 'signature'])) return null;
    if (!isUuid(value.roomId)) return null;
    if (typeof value.publicKey !== 'string' || value.publicKey.length === 0 || value.publicKey.length > 256)
        return null;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value.publicKey)) return null;
    if (typeof value.nonce !== 'string' || !NONCE_RE.test(value.nonce)) return null;
    if (typeof value.timestamp !== 'number' || !Number.isInteger(value.timestamp)) return null;
    if (typeof value.signature !== 'string' || value.signature.length === 0 || value.signature.length > 128)
        return null;
    return {
        roomId: value.roomId,
        publicKey: value.publicKey,
        nonce: value.nonce,
        timestamp: value.timestamp,
        signature: value.signature
    };
};
