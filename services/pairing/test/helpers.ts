import { env } from 'cloudflare:workers';
import { signPairingText } from '../../../src/shared/lib/pairing-crypto';
import {
    PAIRING_SOCKET_PROTOCOL,
    type PairingProof,
    type PairingRole,
    type PairingServerMessage,
    pairingProofText,
    pairingSignalText,
    type RoomCredentials,
    type SignedSignal
} from '../../../src/shared/lib/pairing-protocol';
import worker from '../src/index';

export const ORIGIN = 'https://example.com';

export interface TestDevice {
    publicKey: string;
    label: string;
    privateKey: CryptoKey;
}

export const newIp = (): string => crypto.randomUUID();

export const isCreds = (value: unknown): value is RoomCredentials => {
    if (!value || typeof value !== 'object') return false;
    return 'ok' in value && value.ok === true && 'roomId' in value && 'ticket' in value;
};

export async function makeDevice(label: string): Promise<TestDevice> {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
    return { publicKey: btoa(String.fromCharCode(...spki)), label, privateKey: pair.privateKey };
}

export async function post(path: string, body: unknown, ip: string, raw?: string): Promise<Response> {
    return worker.fetch(
        new Request(`${ORIGIN}${path}`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'CF-Connecting-IP': ip
            },
            body: raw ?? JSON.stringify(body)
        }),
        env
    );
}

export async function jsonOf(response: Response): Promise<Record<string, unknown>> {
    return (await response.json()) as Record<string, unknown>;
}

export class Inbox {
    private readonly queue: PairingServerMessage[] = [];
    private readonly waiters: Array<{
        resolve: (value: PairingServerMessage) => void;
        reject: (error: Error) => void;
        timer: number;
    }> = [];

    constructor(ws: WebSocket) {
        ws.addEventListener('message', (event) => {
            if (typeof event.data !== 'string') return;
            const parsed = JSON.parse(event.data) as PairingServerMessage;
            const waiter = this.waiters.shift();
            if (waiter) {
                clearTimeout(waiter.timer);
                waiter.resolve(parsed);
            } else this.queue.push(parsed);
        });
        ws.addEventListener('close', () => {
            queueMicrotask(() => {
                const error = new Error('socket closed');
                while (this.waiters.length > 0) {
                    const waiter = this.waiters.shift();
                    if (!waiter) break;
                    clearTimeout(waiter.timer);
                    waiter.reject(error);
                }
            });
        });
    }

    next(timeoutMs = 3000): Promise<PairingServerMessage> {
        const queued = this.queue.shift();
        if (queued) return Promise.resolve(queued);
        const { promise, resolve, reject } = Promise.withResolvers<PairingServerMessage>();
        const timer = setTimeout(() => {
            const index = this.waiters.findIndex((waiter) => waiter.reject === reject);
            if (index >= 0) this.waiters.splice(index, 1);
            reject(new Error('inbox timeout'));
        }, timeoutMs);
        this.waiters.push({ resolve, reject, timer });
        return promise;
    }
}

export async function openSocket(
    roomId: string,
    ticket: string,
    ip: string
): Promise<{ response: Response; ws: WebSocket | null; inbox: Inbox | null }> {
    const response = await worker.fetch(
        new Request(`${ORIGIN}/v1/socket/${roomId}`, {
            headers: {
                Upgrade: 'websocket',
                'Sec-WebSocket-Protocol': `${PAIRING_SOCKET_PROTOCOL}, ${ticket}`,
                'CF-Connecting-IP': ip
            }
        }),
        env
    );
    const ws = response.webSocket ?? null;
    if (!ws) return { response, ws, inbox: null };
    const inbox = new Inbox(ws);
    ws.accept();
    return { response, ws, inbox };
}

export function randomNonce(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    let nonce = '';
    for (const byte of bytes) nonce += byte.toString(16).padStart(2, '0');
    return nonce;
}

export async function makeProof(
    action: 'reconnect' | 'forget',
    device: TestDevice,
    roomId: string,
    nonce = randomNonce(),
    timestamp = Date.now()
): Promise<PairingProof> {
    const unsigned = { roomId, publicKey: device.publicKey, nonce, timestamp };
    return {
        ...unsigned,
        signature: await signPairingText(device.privateKey, pairingProofText(action, unsigned))
    };
}

export async function makeSignal(
    device: TestDevice,
    roomId: string,
    role: PairingRole,
    connectionId: string,
    descriptor: string
): Promise<SignedSignal> {
    return {
        type: 'signal',
        connectionId,
        descriptor,
        signature: await signPairingText(
            device.privateKey,
            pairingSignalText(roomId, role, { connectionId, descriptor })
        )
    };
}
