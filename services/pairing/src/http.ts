import type { PairingFailure } from '../../../src/shared/lib/pairing-protocol';
import { PAIRING_MAX_HTTP_BYTES } from './util';

export const statusOf = (error: PairingFailure): number => {
    switch (error) {
        case 'rate_limited':
            return 429;
        case 'unavailable':
            return 503;
        case 'busy':
            return 409;
        case 'expired':
        case 'cancelled':
        case 'unpaired':
        case 'rejected':
            return 410;
        case 'invalid_peer':
            return 401;
        case 'disconnected':
        case 'connection_failed':
            return 409;
        default:
            return 400;
    }
};

export const jsonError = (error: PairingFailure, status = statusOf(error)): Response =>
    Response.json({ ok: false, error }, { status });

export type JsonObjectResult = { ok: true; value: Record<string, unknown> } | { ok: false; error: PairingFailure };

export const readJsonObject = async (request: Request): Promise<JsonObjectResult> => {
    const declared = request.headers.get('Content-Length');
    if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > PAIRING_MAX_HTTP_BYTES)) {
        return { ok: false, error: 'invalid_message' };
    }
    const reader = request.body?.getReader();
    if (!reader) return { ok: false, error: 'invalid_message' };
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > PAIRING_MAX_HTTP_BYTES) {
            await reader.cancel();
            return { ok: false, error: 'invalid_message' };
        }
        chunks.push(value);
    }
    if (total === 0) return { ok: false, error: 'invalid_message' };
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    try {
        const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
            return { ok: false, error: 'invalid_message' };
        return { ok: true, value: parsed as Record<string, unknown> };
    } catch {
        return { ok: false, error: 'invalid_message' };
    }
};

export const clientIp = (request: Request): string => request.headers.get('CF-Connecting-IP') || 'local';

export const enforceRateLimit = async (env: Env, request: Request): Promise<Response | null> => {
    const { success } = await env.PAIRING_RATE_LIMIT.limit({ key: clientIp(request) });
    if (!success) return jsonError('rate_limited');
    return null;
};
