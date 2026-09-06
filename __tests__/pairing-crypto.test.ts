// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { encodePairingBytes, signPairingText, verifyPairingText } from '@/shared/lib/pairing-crypto';
import { pairingProofText, pairingSignalText } from '@/shared/lib/pairing-protocol';

let identity: CryptoKeyPair;
let publicKey: string;
let otherPublicKey: string;

beforeAll(async () => {
    identity = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
    const other = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
    publicKey = encodePairingBytes(await crypto.subtle.exportKey('spki', identity.publicKey));
    otherPublicKey = encodePairingBytes(await crypto.subtle.exportKey('spki', other.publicKey));
});

describe('paired browser signatures', () => {
    it('accepts the pinned signer and refuses a substituted browser key', async () => {
        const text = pairingSignalText('room-a', 'host', { connectionId: 'epoch-a', descriptor: 'synthetic-offer' });
        const signature = await signPairingText(identity.privateKey, text);
        expect(await verifyPairingText(publicKey, text, signature)).toBe(true);
        expect(await verifyPairingText(otherPublicKey, text, signature)).toBe(false);
    });

    it('rejects descriptor tampering, connection replay, cross-pair replay and role reflection', async () => {
        const signal = { connectionId: 'epoch-a', descriptor: 'synthetic-offer' };
        const signature = await signPairingText(identity.privateKey, pairingSignalText('room-a', 'host', signal));
        const alteredMessages = [
            pairingSignalText('room-a', 'host', { ...signal, descriptor: 'substituted-offer' }),
            pairingSignalText('room-a', 'host', { ...signal, connectionId: 'epoch-b' }),
            pairingSignalText('room-b', 'host', signal),
            pairingSignalText('room-a', 'client', signal)
        ];
        for (const text of alteredMessages) expect(await verifyPairingText(publicKey, text, signature)).toBe(false);
    });

    it('cannot reuse a reconnect proof to forget a pair or authenticate a different nonce', async () => {
        const proof = { roomId: 'room-a', publicKey, nonce: 'nonce-a', timestamp: 1000 };
        const text = pairingProofText('reconnect', proof);
        const signature = await signPairingText(identity.privateKey, text);
        expect(await verifyPairingText(publicKey, text, signature)).toBe(true);
        expect(await verifyPairingText(publicKey, pairingProofText('forget', proof), signature)).toBe(false);
        expect(
            await verifyPairingText(publicKey, pairingProofText('reconnect', { ...proof, nonce: 'nonce-b' }), signature)
        ).toBe(false);
    });

    it('treats malformed public keys and signatures as failed authentication', async () => {
        expect(await verifyPairingText('invalid-key', 'message', 'invalid-signature')).toBe(false);
        expect(await verifyPairingText(publicKey, 'message', 'not-base64')).toBe(false);
    });
});
