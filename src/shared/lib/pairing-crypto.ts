/** P-256 signatures bind signaling to a pinned browser key; this is not a PAKE. */
const encoder = new TextEncoder();

export const encodePairingBytes = (bytes: ArrayBuffer): string => btoa(String.fromCharCode(...new Uint8Array(bytes)));

export const decodePairingBytes = (text: string): Uint8Array<ArrayBuffer> =>
    Uint8Array.from(atob(text), (character) => character.charCodeAt(0));

export const importPairingPublicKey = (publicKey: string): Promise<CryptoKey> =>
    crypto.subtle.importKey('spki', decodePairingBytes(publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, true, [
        'verify'
    ]);

export const signPairingText = async (privateKey: CryptoKey, text: string): Promise<string> =>
    encodePairingBytes(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, encoder.encode(text)));

export const verifyPairingText = async (publicKey: string, text: string, signature: string): Promise<boolean> => {
    if (publicKey.length > 256 || signature.length > 128) return false;
    try {
        const key = await importPairingPublicKey(publicKey);
        return await crypto.subtle.verify(
            { name: 'ECDSA', hash: 'SHA-256' },
            key,
            decodePairingBytes(signature),
            encoder.encode(text)
        );
    } catch {
        return false;
    }
};
