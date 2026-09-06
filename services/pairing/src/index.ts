import { isPairingCode, normalizePairingCode, PAIRING_TTL_MS } from '../../../src/shared/lib/pairing-protocol';
import { CodeSlot } from './code-slot';
import { enforceRateLimit, jsonError, readJsonObject, statusOf } from './http';
import { type BrokerResult, PairRoom } from './pair-room';
import { exactKeys, isUuid, PAIRING_CODE_ATTEMPTS, randomCode } from './util';
import { isValidP256PublicKey, parseDevice, parseJoin, parseProof } from './validate';

export { CodeSlot, PairRoom };

const toResponse = (result: BrokerResult): Response => {
    if (result.ok) return Response.json(result);
    return jsonError(result.error, statusOf(result.error));
};

const allocateCode = async (env: Env, roomId: string, expiresAt: number): Promise<string | null> => {
    for (let attempt = 0; attempt < PAIRING_CODE_ATTEMPTS; attempt++) {
        const candidate = randomCode();
        const reserved = await env.CODE_SLOT.getByName(candidate).reserve(roomId, expiresAt);
        if (reserved.ok) return candidate;
    }
    return null;
};

const releaseCode = async (env: Env, code: string, roomId: string): Promise<void> => {
    await env.CODE_SLOT.getByName(code).release(roomId);
};

const createInvitation = async (request: Request, env: Env): Promise<Response> => {
    const body = await readJsonObject(request);
    if (!body.ok) return jsonError(body.error);
    const device = parseDevice(body.value);
    if (!device) return jsonError('invalid_message');
    if (!(await isValidP256PublicKey(device.publicKey))) return jsonError('invalid_peer');
    const roomId = crypto.randomUUID();
    const expiresAt = Date.now() + PAIRING_TTL_MS;
    const code = await allocateCode(env, roomId, expiresAt);
    if (!code) return jsonError('unavailable');
    try {
        const result = await env.PAIR_ROOM.getByName(roomId).createHost(roomId, device, code, expiresAt);
        if (!result.ok) await releaseCode(env, code, roomId);
        return toResponse(result);
    } catch {
        await releaseCode(env, code, roomId);
        return jsonError('unavailable');
    }
};

const joinInvitation = async (request: Request, env: Env): Promise<Response> => {
    const body = await readJsonObject(request);
    if (!body.ok) return jsonError(body.error);
    if (!exactKeys(body.value, ['publicKey', 'label', 'code'])) return jsonError('invalid_message');
    const join = parseJoin(body.value);
    if (!join) {
        if (typeof body.value.code === 'string' && !isPairingCode(normalizePairingCode(body.value.code))) {
            return jsonError('invalid_code');
        }
        return jsonError('invalid_message');
    }
    if (!(await isValidP256PublicKey(join.publicKey))) return jsonError('invalid_peer');
    const looked = await env.CODE_SLOT.getByName(join.code).lookup();
    if (!looked.ok) return jsonError(looked.error);
    const result = await env.PAIR_ROOM.getByName(looked.roomId).join({
        publicKey: join.publicKey,
        label: join.label
    });
    if (result.ok) await env.CODE_SLOT.getByName(join.code).consume(looked.roomId);
    return toResponse(result);
};

const reconnectOrForget = async (request: Request, env: Env, action: 'reconnect' | 'forget'): Promise<Response> => {
    const body = await readJsonObject(request);
    if (!body.ok) return jsonError(body.error);
    const proof = parseProof(body.value);
    if (!proof) return jsonError('invalid_message');
    if (!(await isValidP256PublicKey(proof.publicKey))) return jsonError('invalid_peer');
    const room = env.PAIR_ROOM.getByName(proof.roomId);
    if (action === 'forget') {
        const result = await room.forget(proof);
        if (!result.ok) return jsonError(result.error, statusOf(result.error));
        return Response.json({ ok: true });
    }
    return toResponse(await room.reconnect(proof));
};

const upgradeSocket = async (request: Request, env: Env, roomId: string): Promise<Response> => {
    if (!isUuid(roomId)) return jsonError('invalid_message');
    return env.PAIR_ROOM.getByName(roomId).fetch(request);
};

const handle = async (request: Request, env: Env): Promise<Response> => {
    const path = new URL(request.url).pathname;
    const limited =
        request.method === 'POST' || (request.method === 'GET' && path.startsWith('/v1/socket/'))
            ? await enforceRateLimit(env, request)
            : null;
    if (limited) return limited;
    if (request.method === 'POST' && path === '/v1/invitations') return createInvitation(request, env);
    if (request.method === 'POST' && path === '/v1/join') return joinInvitation(request, env);
    if (request.method === 'POST' && path === '/v1/reconnect') return reconnectOrForget(request, env, 'reconnect');
    if (request.method === 'POST' && path === '/v1/forget') return reconnectOrForget(request, env, 'forget');
    if (request.method === 'GET' && path.startsWith('/v1/socket/')) {
        return upgradeSocket(request, env, path.slice('/v1/socket/'.length));
    }
    return jsonError('invalid_message');
};

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        try {
            return await handle(request, env);
        } catch {
            console.error(JSON.stringify({ message: 'unhandled' }));
            return jsonError('unavailable');
        }
    }
} satisfies ExportedHandler<Env>;
