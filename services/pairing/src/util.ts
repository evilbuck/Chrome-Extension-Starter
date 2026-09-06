import { PAIRING_ALPHABET } from '../../../src/shared/lib/pairing-protocol';

export const PAIRING_MAX_HTTP_BYTES = 8 * 1024;
export const PAIRING_TICKET_TTL_MS = 60 * 1000;
export const PAIRING_CODE_ATTEMPTS = 16;
export const PAIRING_PROOF_SKEW_MS = 5 * 1000;
export const PAIRING_MAX_OPEN_SOCKETS = 2;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const NONCE_RE = /^[A-Za-z0-9+_/=-]{16,128}$/;
const TICKET_RE = /^[A-Za-z0-9_-]{43}$/;

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value);

export const exactKeys = (value: object, keys: readonly string[]): boolean => {
    const actual = Object.keys(value);
    return actual.length === keys.length && keys.every((key) => actual.includes(key));
};

export const randomCode = (): string => {
    const bytes = crypto.getRandomValues(new Uint8Array(5));
    let code = '';
    for (const byte of bytes) code += PAIRING_ALPHABET[byte & 31];
    return code;
};

export const toBase64Url = (bytes: Uint8Array): string => {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};

export const fromBase64Url = (text: string): Uint8Array<ArrayBuffer> | null => {
    if (!TICKET_RE.test(text)) return null;
    try {
        return Uint8Array.from(atob(`${text.replaceAll('-', '+').replaceAll('_', '/')}=`), (character) =>
            character.charCodeAt(0)
        );
    } catch {
        return null;
    }
};

export const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    let hex = '';
    for (const byte of digest) hex += byte.toString(16).padStart(2, '0');
    return hex;
};

export const equalHex = (left: string, right: string): boolean => {
    const encoder = new TextEncoder();
    const a = encoder.encode(left);
    const b = encoder.encode(right);
    if (a.byteLength !== b.byteLength) return false;
    return crypto.subtle.timingSafeEqual(a, b);
};

export const issueTicketValue = async (): Promise<{ ticket: string; hash: string }> => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return { ticket: toBase64Url(bytes), hash: await sha256Hex(bytes) };
};

export const hashPresentedTicket = async (ticket: string): Promise<string | null> => {
    const bytes = fromBase64Url(ticket);
    if (!bytes || bytes.byteLength !== 32) return null;
    return sha256Hex(bytes);
};

export const utf8Size = (text: string): number => new TextEncoder().encode(text).byteLength;

export const parseProtocols = (header: string | null): string[] =>
    header
        ? header
              .split(',')
              .map((part) => part.trim())
              .filter((part) => part.length > 0)
        : [];
