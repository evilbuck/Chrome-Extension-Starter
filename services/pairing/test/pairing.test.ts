import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { isPairingCode } from '../../../src/shared/lib/pairing-protocol';
import { isCreds, jsonOf, makeDevice, makeProof, makeSignal, newIp, openSocket, post } from './helpers';

const invite = async (ip = newIp()) => {
    const host = await makeDevice('Host');
    const client = await makeDevice('Client');
    const created = await post('/v1/invitations', { publicKey: host.publicKey, label: host.label }, ip);
    const createdBody = await jsonOf(created);
    return { ip, host, client, created, createdBody };
};

const pairSession = async () => {
    const { ip, host, client, createdBody } = await invite();
    if (!isCreds(createdBody) || !createdBody.code) throw new Error('expected code');
    const joined = await post(
        '/v1/join',
        { publicKey: client.publicKey, label: client.label, code: createdBody.code },
        ip
    );
    const joinedBody = await jsonOf(joined);
    if (!isCreds(joinedBody)) throw new Error('expected join credentials');
    const hostSock = await openSocket(createdBody.roomId, createdBody.ticket, ip);
    const clientSock = await openSocket(joinedBody.roomId, joinedBody.ticket, ip);
    if (!hostSock.inbox || !clientSock.inbox || !hostSock.ws || !clientSock.ws) {
        throw new Error('expected sockets');
    }
    const hostPending = await hostSock.inbox.next();
    const clientPending = await clientSock.inbox.next();
    if (hostPending.type !== 'pending' || clientPending.type !== 'pending') throw new Error('pending');
    hostSock.ws.send(
        JSON.stringify({
            type: 'confirm',
            attemptId: hostPending.attemptId,
            peerPublicKey: hostPending.peer.publicKey
        })
    );
    clientSock.ws.send(
        JSON.stringify({
            type: 'confirm',
            attemptId: clientPending.attemptId,
            peerPublicKey: clientPending.peer.publicKey
        })
    );
    const hostPaired = await hostSock.inbox.next();
    const clientPaired = await clientSock.inbox.next();
    if (hostPaired.type !== 'paired' || clientPaired.type !== 'paired') throw new Error('paired');
    return {
        ip,
        host,
        client,
        roomId: createdBody.roomId,
        hostSock,
        clientSock,
        hostInbox: hostSock.inbox,
        clientInbox: clientSock.inbox,
        pair: hostPaired.pair,
        connectionId: hostPaired.connectionId
    };
};

describe('HTTP pairing API', () => {
    it('creates an invitation with a five-character code and join credentials for the same room', async () => {
        const { ip, host, client, created, createdBody } = await invite();
        expect(created.status).toBe(200);
        expect(isCreds(createdBody)).toBe(true);
        if (!isCreds(createdBody) || createdBody.code === null) throw new Error('expected credentials');
        expect(isPairingCode(createdBody.code)).toBe(true);
        expect(createdBody.expiresAt).toBeGreaterThan(Date.now() + 60_000);

        const joined = await post(
            '/v1/join',
            { publicKey: client.publicKey, label: client.label, code: createdBody.code.toLowerCase() },
            ip
        );
        const joinedBody = await jsonOf(joined);
        expect(joined.status).toBe(200);
        expect(isCreds(joinedBody)).toBe(true);
        if (!isCreds(joinedBody)) throw new Error('expected join credentials');
        expect(joinedBody.roomId).toBe(createdBody.roomId);
        expect(joinedBody.code).toBeNull();
        expect(joinedBody.ticket === createdBody.ticket).toBe(false);
        void host;
    });

    it('rejects unknown codes, extra fields, invalid keys, and oversized bodies', async () => {
        const ip = newIp();
        const host = await makeDevice('Host');
        const unknown = await post('/v1/join', { publicKey: host.publicKey, label: host.label, code: 'ABCDE' }, ip);
        expect(unknown.status).toBe(400);
        expect(await jsonOf(unknown)).toEqual({ ok: false, error: 'invalid_code' });

        const extra = await post('/v1/invitations', { publicKey: host.publicKey, label: host.label, extra: true }, ip);
        expect(await jsonOf(extra)).toEqual({ ok: false, error: 'invalid_message' });

        const badKey = await post('/v1/invitations', { publicKey: 'AAAA', label: host.label }, ip);
        expect(await jsonOf(badKey)).toEqual({ ok: false, error: 'invalid_peer' });

        const huge = await post('/v1/invitations', null, ip, `{"publicKey":"${'A'.repeat(9000)}","label":"Host"}`);
        expect(await jsonOf(huge)).toEqual({ ok: false, error: 'invalid_message' });
    });

    it('fails closed on a third join of a consumed code', async () => {
        const { ip, client, createdBody } = await invite();
        if (!isCreds(createdBody) || !createdBody.code) throw new Error('expected code');
        const first = await post(
            '/v1/join',
            { publicKey: client.publicKey, label: client.label, code: createdBody.code },
            ip
        );
        expect(first.status).toBe(200);
        const third = await makeDevice('Intruder');
        const second = await post(
            '/v1/join',
            { publicKey: third.publicKey, label: third.label, code: createdBody.code },
            ip
        );
        expect(await jsonOf(second)).toEqual({ ok: false, error: 'busy' });
    });

    it('rejects join after the code expires', async () => {
        const { ip, client, createdBody } = await invite();
        if (!isCreds(createdBody) || !createdBody.code) throw new Error('expected code');
        const slot = env.CODE_SLOT.getByName(createdBody.code);
        await runInDurableObject(slot, async (_instance, state) => {
            state.storage.sql.exec('UPDATE slot SET expires_at = ?', Date.now() - 10);
        });
        const joined = await post(
            '/v1/join',
            { publicKey: client.publicKey, label: client.label, code: createdBody.code },
            ip
        );
        expect(await jsonOf(joined)).toEqual({ ok: false, error: 'expired' });
    });
});

describe('confirmation and signaling', () => {
    it('rejects confirmation after expiry even when the cleanup alarm is delayed', async () => {
        const { ip, host, client, createdBody } = await invite();
        if (!isCreds(createdBody) || !createdBody.code) throw new Error('expected code');
        const joined = await jsonOf(
            await post(
                '/v1/join',
                {
                    publicKey: client.publicKey,
                    label: client.label,
                    code: createdBody.code
                },
                ip
            )
        );
        if (!isCreds(joined)) throw new Error('expected credentials');
        const hostSocket = await openSocket(createdBody.roomId, createdBody.ticket, ip);
        const clientSocket = await openSocket(joined.roomId, joined.ticket, ip);
        if (!hostSocket.ws || !clientSocket.ws || !hostSocket.inbox || !clientSocket.inbox) {
            throw new Error('expected sockets');
        }
        const hostPending = await hostSocket.inbox.next();
        const clientPending = await clientSocket.inbox.next();
        if (hostPending.type !== 'pending' || clientPending.type !== 'pending') throw new Error('pending');
        await runInDurableObject(env.PAIR_ROOM.getByName(createdBody.roomId), async (_instance, state) => {
            state.storage.sql.exec('UPDATE room SET invitation_expires_at = ?', Date.now() - 1);
            await state.storage.setAlarm(Date.now() + 60_000);
        });
        hostSocket.ws.send(
            JSON.stringify({
                type: 'confirm',
                attemptId: hostPending.attemptId,
                peerPublicKey: client.publicKey
            })
        );
        clientSocket.ws.send(
            JSON.stringify({
                type: 'confirm',
                attemptId: clientPending.attemptId,
                peerPublicKey: host.publicKey
            })
        );
        expect(await hostSocket.inbox.next()).toEqual({ type: 'error', error: 'expired' });
        expect(await clientSocket.inbox.next()).toEqual({ type: 'error', error: 'expired' });
        const proof = await makeProof('reconnect', host, createdBody.roomId);
        expect(await jsonOf(await post('/v1/reconnect', proof, ip))).toEqual({ ok: false, error: 'expired' });
    });

    it('requires both confirms and both sockets before paired, then forwards signed descriptors', async () => {
        const { ip, host, client, createdBody } = await invite();
        if (!isCreds(createdBody) || !createdBody.code) throw new Error('expected code');
        const joined = await post(
            '/v1/join',
            { publicKey: client.publicKey, label: client.label, code: createdBody.code },
            ip
        );
        const joinedBody = await jsonOf(joined);
        if (!isCreds(joinedBody)) throw new Error('expected join credentials');

        const hostSock = await openSocket(createdBody.roomId, createdBody.ticket, ip);
        const clientSock = await openSocket(joinedBody.roomId, joinedBody.ticket, ip);
        expect(hostSock.response.status).toBe(101);
        expect(clientSock.response.status).toBe(101);
        if (!hostSock.inbox || !clientSock.inbox || !hostSock.ws || !clientSock.ws) {
            throw new Error('expected sockets');
        }

        const hostPending = await hostSock.inbox.next();
        const clientPending = await clientSock.inbox.next();
        expect(hostPending.type).toBe('pending');
        expect(clientPending.type).toBe('pending');
        if (hostPending.type !== 'pending' || clientPending.type !== 'pending') throw new Error('pending');
        expect(hostPending.peer.publicKey).toBe(client.publicKey);
        expect(clientPending.peer.publicKey).toBe(host.publicKey);
        expect(hostPending.attemptId).toBe(clientPending.attemptId);

        hostSock.ws.send(
            JSON.stringify({
                type: 'confirm',
                attemptId: hostPending.attemptId,
                peerPublicKey: hostPending.peer.publicKey
            })
        );
        clientSock.ws.send(
            JSON.stringify({
                type: 'confirm',
                attemptId: clientPending.attemptId,
                peerPublicKey: clientPending.peer.publicKey
            })
        );

        const hostPaired = await hostSock.inbox.next();
        const clientPaired = await clientSock.inbox.next();
        expect(hostPaired.type).toBe('paired');
        expect(clientPaired.type).toBe('paired');
        if (hostPaired.type !== 'paired' || clientPaired.type !== 'paired') throw new Error('paired');
        expect(hostPaired.pair.id).toBe(createdBody.roomId);
        expect(clientPaired.pair.id).toBe(createdBody.roomId);
        expect(hostPaired.pair.role).toBe('host');
        expect(clientPaired.pair.role).toBe('client');
        expect(hostPaired.pair.peer.publicKey).toBe(client.publicKey);
        expect(clientPaired.pair.peer.publicKey).toBe(host.publicKey);
        expect(hostPaired.connectionId).toBe(clientPaired.connectionId);

        const descriptor = 'offer-descriptor';
        hostSock.ws.send(
            JSON.stringify(await makeSignal(host, createdBody.roomId, 'host', hostPaired.connectionId, descriptor))
        );
        const forwarded = await clientSock.inbox.next();
        expect(forwarded.type).toBe('signal');
        if (forwarded.type !== 'signal') throw new Error('signal');
        expect(forwarded.connectionId).toBe(hostPaired.connectionId);
        expect(forwarded.descriptor).toBe(descriptor);
    });

    it('forwards one offer and one answer per epoch and rejects a duplicate', async () => {
        const session = await pairSession();
        if (!session.hostSock.ws || !session.clientSock.ws) throw new Error('expected sockets');
        session.hostSock.ws.send(
            JSON.stringify(await makeSignal(session.host, session.roomId, 'host', session.connectionId, 'offer'))
        );
        const offer = await session.clientInbox.next();
        expect(offer.type).toBe('signal');
        if (offer.type !== 'signal') throw new Error('offer');
        expect(offer.descriptor).toBe('offer');

        session.clientSock.ws.send(
            JSON.stringify(await makeSignal(session.client, session.roomId, 'client', session.connectionId, 'answer'))
        );
        const answer = await session.hostInbox.next();
        expect(answer.type).toBe('signal');
        if (answer.type !== 'signal') throw new Error('answer');
        expect(answer.descriptor).toBe('answer');

        session.hostSock.ws.send(
            JSON.stringify(await makeSignal(session.host, session.roomId, 'host', session.connectionId, 'offer-2'))
        );
        expect(await session.hostInbox.next()).toEqual({ type: 'error', error: 'invalid_message' });
    });

    it('rejects a signal that is not bound to the current connection epoch', async () => {
        const session = await pairSession();
        if (!session.hostSock.ws) throw new Error('expected host socket');
        session.hostSock.ws.send(
            JSON.stringify(await makeSignal(session.host, session.roomId, 'host', crypto.randomUUID(), 'stale-epoch'))
        );
        expect(await session.hostInbox.next()).toEqual({ type: 'error', error: 'invalid_message' });
    });

    it('rejects a mismatched counterpart key and cannot complete afterwards', async () => {
        const { ip, host, client, createdBody } = await invite();
        if (!isCreds(createdBody) || !createdBody.code) throw new Error('expected code');
        const joined = await post(
            '/v1/join',
            { publicKey: client.publicKey, label: client.label, code: createdBody.code },
            ip
        );
        const joinedBody = await jsonOf(joined);
        if (!isCreds(joinedBody)) throw new Error('expected join credentials');
        const hostSock = await openSocket(createdBody.roomId, createdBody.ticket, ip);
        const clientSock = await openSocket(joinedBody.roomId, joinedBody.ticket, ip);
        if (!hostSock.inbox || !clientSock.inbox || !hostSock.ws) throw new Error('expected sockets');
        const pending = await hostSock.inbox.next();
        await clientSock.inbox.next();
        if (pending.type !== 'pending') throw new Error('pending');
        const stranger = await makeDevice('Stranger');
        hostSock.ws.send(
            JSON.stringify({
                type: 'confirm',
                attemptId: pending.attemptId,
                peerPublicKey: stranger.publicKey
            })
        );
        const hostError = await hostSock.inbox.next();
        expect(hostError).toEqual({ type: 'error', error: 'rejected' });
        void host;
    });

    it('rejects a mismatched attempt id', async () => {
        const { ip, client, createdBody } = await invite();
        if (!isCreds(createdBody) || !createdBody.code) throw new Error('expected code');
        const joined = await post(
            '/v1/join',
            { publicKey: client.publicKey, label: client.label, code: createdBody.code },
            ip
        );
        const joinedBody = await jsonOf(joined);
        if (!isCreds(joinedBody)) throw new Error('expected join credentials');
        const hostSock = await openSocket(createdBody.roomId, createdBody.ticket, ip);
        if (!hostSock.inbox || !hostSock.ws) throw new Error('expected host socket');
        const pending = await hostSock.inbox.next();
        if (pending.type !== 'pending') throw new Error('pending');
        hostSock.ws.send(
            JSON.stringify({
                type: 'confirm',
                attemptId: crypto.randomUUID(),
                peerPublicKey: pending.peer.publicKey
            })
        );
        expect(await hostSock.inbox.next()).toEqual({ type: 'error', error: 'invalid_message' });
    });

    it('does not forward signals before both sides are paired', async () => {
        const { ip, host, client, createdBody } = await invite();
        if (!isCreds(createdBody) || !createdBody.code) throw new Error('expected code');
        const joined = await post(
            '/v1/join',
            { publicKey: client.publicKey, label: client.label, code: createdBody.code },
            ip
        );
        const joinedBody = await jsonOf(joined);
        if (!isCreds(joinedBody)) throw new Error('expected join credentials');
        const hostSock = await openSocket(createdBody.roomId, createdBody.ticket, ip);
        if (!hostSock.inbox || !hostSock.ws) throw new Error('expected host socket');
        await hostSock.inbox.next();
        hostSock.ws.send(
            JSON.stringify(await makeSignal(host, createdBody.roomId, 'host', crypto.randomUUID(), 'too-early'))
        );
        expect(await hostSock.inbox.next()).toEqual({ type: 'error', error: 'invalid_message' });
        void client;
    });

    it('rejects ticket reuse', async () => {
        const { ip, createdBody } = await invite();
        if (!isCreds(createdBody)) throw new Error('expected credentials');
        const first = await openSocket(createdBody.roomId, createdBody.ticket, ip);
        expect(first.response.status).toBe(101);
        const reuse = await openSocket(createdBody.roomId, createdBody.ticket, ip);
        expect(await jsonOf(reuse.response)).toEqual({ ok: false, error: 'invalid_peer' });
    });

    it('cannot resurrect a cancelled attempt', async () => {
        const { ip, client, createdBody } = await invite();
        if (!isCreds(createdBody) || !createdBody.code) throw new Error('expected code');
        const joined = await post(
            '/v1/join',
            { publicKey: client.publicKey, label: client.label, code: createdBody.code },
            ip
        );
        const joinedBody = await jsonOf(joined);
        if (!isCreds(joinedBody)) throw new Error('expected join credentials');
        const hostSock = await openSocket(createdBody.roomId, createdBody.ticket, ip);
        if (!hostSock.inbox || !hostSock.ws) throw new Error('expected host socket');
        await hostSock.inbox.next();
        hostSock.ws.send(JSON.stringify({ type: 'cancel' }));
        expect(await hostSock.inbox.next()).toEqual({ type: 'error', error: 'cancelled' });
        const again = await post(
            '/v1/join',
            { publicKey: client.publicKey, label: client.label, code: createdBody.code },
            ip
        );
        const againBody = await jsonOf(again);
        expect(againBody.ok).toBe(false);
        if (againBody.ok !== false) throw new Error('expected failure');
        expect(
            againBody.error === 'invalid_code' || againBody.error === 'cancelled' || againBody.error === 'busy'
        ).toBe(true);
    });
});

describe('reconnect and forget', () => {
    it('reconnects a pinned pair without repeating confirmation and rejects nonce replay', async () => {
        const session = await pairSession();
        const proof = await makeProof('reconnect', session.host, session.pair.id);
        const reconnected = await post('/v1/reconnect', proof, session.ip);
        const body = await jsonOf(reconnected);
        expect(reconnected.status).toBe(200);
        expect(isCreds(body)).toBe(true);
        if (!isCreds(body)) throw new Error('expected reconnect credentials');
        expect(body.roomId).toBe(session.pair.id);
        expect(body.code).toBeNull();

        const replay = await post('/v1/reconnect', proof, session.ip);
        expect(await jsonOf(replay)).toEqual({ ok: false, error: 'invalid_peer' });

        const hostSock = await openSocket(body.roomId, body.ticket, session.ip);
        expect(hostSock.response.status).toBe(101);
        if (!hostSock.inbox) throw new Error('expected socket');
        const paired = await hostSock.inbox.next();
        expect(paired.type).toBe('paired');
        if (paired.type !== 'paired') throw new Error('paired');
        expect(paired.pair.id).toBe(session.pair.id);
        expect(paired.connectionId === session.connectionId).toBe(false);
    });

    it('rejects reconnect from a non-member key', async () => {
        const session = await pairSession();
        const stranger = await makeDevice('Stranger');
        const proof = await makeProof('reconnect', stranger, session.pair.id);
        const response = await post('/v1/reconnect', proof, session.ip);
        expect(await jsonOf(response)).toEqual({ ok: false, error: 'invalid_peer' });
    });

    it('forget revokes membership and blocks reconnect', async () => {
        const session = await pairSession();
        const proof = await makeProof('forget', session.host, session.pair.id);
        const forgotten = await post('/v1/forget', proof, session.ip);
        expect(await jsonOf(forgotten)).toEqual({ ok: true });
        const reconnectProof = await makeProof('reconnect', session.client, session.pair.id);
        const reconnect = await post('/v1/reconnect', reconnectProof, session.ip);
        expect(await jsonOf(reconnect)).toEqual({ ok: false, error: 'unpaired' });
        const peerForget = await makeProof('forget', session.client, session.pair.id);
        expect(await jsonOf(await post('/v1/forget', peerForget, session.ip))).toEqual({ ok: true });
        const stranger = await makeDevice('Stranger');
        const strangerForget = await makeProof('forget', stranger, session.pair.id);
        expect(await jsonOf(await post('/v1/forget', strangerForget, session.ip))).toEqual({
            ok: false,
            error: 'invalid_peer'
        });
    });

    it('does not expire established pair trust when the invitation TTL elapses', async () => {
        const session = await pairSession();
        const stub = env.PAIR_ROOM.getByName(session.pair.id);
        await runInDurableObject(stub, async (_instance, state) => {
            state.storage.sql.exec('UPDATE room SET invitation_expires_at = ?', Date.now() - 10);
            await state.storage.setAlarm(Date.now() + 60_000);
        });
        await runDurableObjectAlarm(stub);
        const proof = await makeProof('reconnect', session.client, session.pair.id);
        const reconnect = await post('/v1/reconnect', proof, session.ip);
        expect(reconnect.status).toBe(200);
        expect(isCreds(await jsonOf(reconnect))).toBe(true);
    });

    it('rejects a cross-room reconnect proof', async () => {
        const session = await pairSession();
        const other = await invite(session.ip);
        if (!isCreds(other.createdBody)) throw new Error('expected other room');
        const proof = await makeProof('reconnect', session.host, other.createdBody.roomId);
        const response = await post('/v1/reconnect', proof, session.ip);
        const body = await jsonOf(response);
        expect(body.ok).toBe(false);
        if (body.ok !== false) throw new Error('expected failure');
        expect(body.error === 'unpaired' || body.error === 'invalid_peer').toBe(true);
    });
});

describe('rate limit binding', () => {
    it('eventually rate-limits a single IP', async () => {
        const ip = newIp();
        let blocked = false;
        for (let i = 0; i < 40; i++) {
            const { success } = await env.PAIRING_RATE_LIMIT.limit({ key: ip });
            if (!success) {
                blocked = true;
                break;
            }
        }
        expect(blocked).toBe(true);
        const host = await makeDevice('Host');
        const response = await post('/v1/invitations', { publicKey: host.publicKey, label: host.label }, ip);
        expect(await jsonOf(response)).toEqual({ ok: false, error: 'rate_limited' });
    });
});
