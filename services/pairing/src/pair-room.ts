import { DurableObject } from 'cloudflare:workers';
import { verifyPairingText } from '../../../src/shared/lib/pairing-crypto';
import {
    PAIRING_MAX_DESCRIPTOR_LENGTH,
    PAIRING_MAX_FRAME_BYTES,
    PAIRING_PROOF_TTL_MS,
    PAIRING_SOCKET_PROTOCOL,
    PAIRING_TTL_MS,
    type PairedBrowser,
    type PairingDevice,
    type PairingFailure,
    type PairingProof,
    type PairingRole,
    type PairingServerMessage,
    pairingProofText,
    pairingSignalText,
    type RoomCredentials,
    type SignedSignal
} from '../../../src/shared/lib/pairing-protocol';
import { jsonError } from './http';
import {
    equalHex,
    exactKeys,
    hashPresentedTicket,
    issueTicketValue,
    isUuid,
    PAIRING_MAX_OPEN_SOCKETS,
    PAIRING_PROOF_SKEW_MS,
    PAIRING_TICKET_TTL_MS,
    parseProtocols,
    utf8Size
} from './util';
import { isValidP256PublicKey } from './validate';

export type BrokerResult = RoomCredentials | { ok: false; error: PairingFailure };
export type ForgetResult = { ok: true } | { ok: false; error: PairingFailure };

type RoomStatus = 'waiting' | 'pending' | 'paired' | 'cancelled' | 'expired' | 'rejected' | 'revoked';

type RoomRow = {
    id: string;
    host_public_key: string;
    host_label: string;
    client_public_key: string | null;
    client_label: string | null;
    code: string | null;
    invitation_expires_at: number | null;
    attempt_id: string | null;
    host_confirmed: number;
    client_confirmed: number;
    pair_created_at: number | null;
    connection_id: string | null;
    host_generation: number;
    client_generation: number;
    status: RoomStatus;
};

type TicketRow = {
    hash: string;
    role: PairingRole;
    expires_at: number;
    consumed: number;
};

interface SocketAttachment {
    role: PairingRole;
    generation: number;
}

export class PairRoom extends DurableObject<Env> {
    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        ctx.blockConcurrencyWhile(async () => {
            this.ctx.storage.sql.exec(`
                CREATE TABLE IF NOT EXISTS room (
                    id TEXT PRIMARY KEY,
                    host_public_key TEXT NOT NULL,
                    host_label TEXT NOT NULL,
                    client_public_key TEXT,
                    client_label TEXT,
                    code TEXT,
                    invitation_expires_at INTEGER,
                    attempt_id TEXT,
                    host_confirmed INTEGER NOT NULL DEFAULT 0,
                    client_confirmed INTEGER NOT NULL DEFAULT 0,
                    pair_created_at INTEGER,
                    connection_id TEXT,
                    host_generation INTEGER NOT NULL DEFAULT 0,
                    client_generation INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL
                )
            `);
            this.ctx.storage.sql.exec(`
                CREATE TABLE IF NOT EXISTS tickets (
                    hash TEXT PRIMARY KEY,
                    role TEXT NOT NULL,
                    expires_at INTEGER NOT NULL,
                    consumed INTEGER NOT NULL DEFAULT 0
                )
            `);
            this.ctx.storage.sql.exec(`
                CREATE TABLE IF NOT EXISTS nonces (
                    nonce TEXT PRIMARY KEY,
                    action TEXT NOT NULL,
                    expires_at INTEGER NOT NULL
                )
            `);
            this.ctx.storage.sql.exec(`
                CREATE TABLE IF NOT EXISTS signals (
                    connection_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    PRIMARY KEY (connection_id, role)
                )
            `);
        });
    }

    async createHost(roomId: string, device: PairingDevice, code: string, expiresAt: number): Promise<BrokerResult> {
        if (this.loadRoom()) return { ok: false, error: 'busy' };
        if (!(await isValidP256PublicKey(device.publicKey))) return { ok: false, error: 'invalid_peer' };
        this.ctx.storage.sql.exec(
            `INSERT INTO room (
                id, host_public_key, host_label, code, invitation_expires_at, status
            ) VALUES (?, ?, ?, ?, ?, 'waiting')`,
            roomId,
            device.publicKey,
            device.label,
            code,
            expiresAt
        );
        const ticket = await this.issueTicket('host');
        await this.scheduleAlarm();
        return { ok: true, roomId, ticket, code, expiresAt };
    }

    async join(device: PairingDevice): Promise<BrokerResult> {
        if (!(await isValidP256PublicKey(device.publicKey))) return { ok: false, error: 'invalid_peer' };
        const room = this.loadRoom();
        if (!room) return { ok: false, error: 'invalid_code' };
        if (room.status === 'expired') return { ok: false, error: 'expired' };
        if (room.status === 'cancelled') return { ok: false, error: 'cancelled' };
        if (room.status === 'rejected') return { ok: false, error: 'rejected' };
        if (room.status === 'revoked') return { ok: false, error: 'unpaired' };
        if (room.status !== 'waiting' || room.client_public_key) return { ok: false, error: 'busy' };
        if (room.invitation_expires_at !== null && room.invitation_expires_at <= Date.now()) {
            await this.failClosed('expired');
            return { ok: false, error: 'expired' };
        }
        if (device.publicKey === room.host_public_key) return { ok: false, error: 'invalid_peer' };
        const attemptId = crypto.randomUUID();
        this.ctx.storage.sql.exec(
            `UPDATE room SET client_public_key = ?, client_label = ?, attempt_id = ?, status = 'pending'
             WHERE id = ?`,
            device.publicKey,
            device.label,
            attemptId,
            room.id
        );
        const ticket = await this.issueTicket('client');
        const expiresAt = room.invitation_expires_at;
        this.sendToRole('host', {
            type: 'pending',
            attemptId,
            peer: device,
            expiresAt: expiresAt ?? Date.now() + PAIRING_TTL_MS
        });
        await this.scheduleAlarm();
        return { ok: true, roomId: room.id, ticket, code: null, expiresAt };
    }

    async reconnect(proof: PairingProof): Promise<BrokerResult> {
        const verified = await this.verifyMembershipProof('reconnect', proof);
        if (!verified.ok) return verified;
        const ticket = await this.issueTicket(verified.role);
        await this.scheduleAlarm();
        return { ok: true, roomId: proof.roomId, ticket, code: null, expiresAt: null };
    }

    async forget(proof: PairingProof): Promise<ForgetResult> {
        const verified = await this.verifyMembershipProof('forget', proof);
        if (!verified.ok) return verified;
        const room = this.loadRoom();
        if (!room) return { ok: false, error: 'unpaired' };
        this.ctx.storage.sql.exec(
            `UPDATE room SET status = 'revoked', connection_id = NULL, attempt_id = NULL, code = NULL WHERE id = ?`,
            room.id
        );
        this.ctx.storage.sql.exec('DELETE FROM signals');
        if (room.code) await this.env.CODE_SLOT.getByName(room.code).release(room.id);
        this.broadcast({ type: 'error', error: 'unpaired' });
        this.closeAll();
        await this.scheduleAlarm();
        return { ok: true };
    }

    async fetch(request: Request): Promise<Response> {
        if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
            return jsonError('invalid_message');
        }
        const protocols = parseProtocols(request.headers.get('Sec-WebSocket-Protocol'));
        if (protocols.length !== 2 || protocols[0] !== PAIRING_SOCKET_PROTOCOL) {
            return jsonError('invalid_peer');
        }
        const ticketHash = await hashPresentedTicket(protocols[1]);
        if (!ticketHash) return jsonError('invalid_peer');
        const ticket = this.ticketByHash(ticketHash);
        if (!ticket) return jsonError('invalid_peer');
        if (ticket.consumed) return jsonError('invalid_peer');
        if (ticket.expires_at <= Date.now()) return jsonError('expired');
        const room = this.loadRoom();
        if (!room || room.status === 'revoked') return jsonError('unpaired');
        if (room.status === 'cancelled') return jsonError('cancelled');
        if (room.status === 'expired') return jsonError('expired');
        if (room.status === 'rejected') return jsonError('rejected');
        if (this.invitationExpired(room)) {
            await this.failClosed('expired');
            return jsonError('expired');
        }
        this.ctx.storage.sql.exec('UPDATE tickets SET consumed = 1 WHERE hash = ?', ticket.hash);
        const generation = (ticket.role === 'host' ? room.host_generation : room.client_generation) + 1;
        if (ticket.role === 'host') {
            this.ctx.storage.sql.exec(
                'UPDATE room SET host_generation = ?, connection_id = NULL WHERE id = ?',
                generation,
                room.id
            );
        } else {
            this.ctx.storage.sql.exec(
                'UPDATE room SET client_generation = ?, connection_id = NULL WHERE id = ?',
                generation,
                room.id
            );
        }
        this.ctx.storage.sql.exec('DELETE FROM signals');
        for (const socket of this.ctx.getWebSockets(ticket.role)) {
            if (socket.readyState !== WebSocket.OPEN) continue;
            this.send(socket, { type: 'error', error: 'disconnected' });
            socket.close(1008, 'disconnected');
        }
        let openCount = 0;
        for (const socket of this.ctx.getWebSockets()) {
            if (socket.readyState === WebSocket.OPEN) openCount += 1;
        }
        if (openCount >= PAIRING_MAX_OPEN_SOCKETS) return jsonError('busy');
        const pair = new WebSocketPair();
        const client = pair[0];
        const server = pair[1];
        const attachment: SocketAttachment = { role: ticket.role, generation };
        server.serializeAttachment(attachment);
        this.ctx.acceptWebSocket(server, [ticket.role]);
        const latest = this.loadRoom();
        if (latest) this.greet(server, latest, ticket.role);
        await this.tryPair();
        await this.scheduleAlarm();
        return new Response(null, {
            status: 101,
            webSocket: client,
            headers: { 'Sec-WebSocket-Protocol': PAIRING_SOCKET_PROTOCOL }
        });
    }

    async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
        if (typeof message !== 'string') {
            this.failSocket(ws, 'invalid_message');
            return;
        }
        if (utf8Size(message) > PAIRING_MAX_FRAME_BYTES) {
            this.failSocket(ws, 'invalid_message');
            return;
        }
        const attachment = ws.deserializeAttachment() as SocketAttachment | null;
        const room = this.loadRoom();
        if (!attachment || !room) {
            this.failSocket(ws, 'invalid_peer');
            return;
        }
        if (!this.isCurrentSocket(ws, room, attachment)) {
            this.failSocket(ws, 'disconnected');
            return;
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(message);
        } catch {
            this.failSocket(ws, 'invalid_message');
            return;
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            this.failSocket(ws, 'invalid_message');
            return;
        }
        const clientMessage = parsed as Record<string, unknown>;
        if (clientMessage.type === 'cancel') {
            if (!exactKeys(clientMessage, ['type'])) {
                this.failSocket(ws, 'invalid_message');
                return;
            }
            if (room.status === 'paired' || room.status === 'revoked') {
                this.failSocket(ws, 'invalid_message');
                return;
            }
            await this.failClosed('cancelled');
            return;
        }
        if (clientMessage.type === 'confirm') {
            await this.handleConfirm(ws, room, attachment, clientMessage);
            return;
        }
        if (clientMessage.type === 'signal') {
            await this.handleSignal(ws, room, attachment, clientMessage, message);
            return;
        }
        this.failSocket(ws, 'invalid_message');
    }

    async webSocketClose(ws: WebSocket): Promise<void> {
        const attachment = ws.deserializeAttachment() as SocketAttachment | null;
        const room = this.loadRoom();
        if (!attachment || !room) return;
        if (!this.isCurrentSocket(ws, room, attachment)) return;
        if (room.status === 'waiting' || room.status === 'pending') {
            await this.failClosed('disconnected', ws);
            return;
        }
        if (room.status === 'paired' && room.connection_id) {
            this.ctx.storage.sql.exec('UPDATE room SET connection_id = NULL WHERE id = ?', room.id);
            const other: PairingRole = attachment.role === 'host' ? 'client' : 'host';
            const otherSocket = this.liveSocket(
                other,
                other === 'host' ? room.host_generation : room.client_generation
            );
            if (otherSocket) this.send(otherSocket, { type: 'error', error: 'disconnected' });
        }
    }

    async webSocketError(ws: WebSocket): Promise<void> {
        await this.webSocketClose(ws);
    }

    async alarm(): Promise<void> {
        const now = Date.now();
        this.ctx.storage.sql.exec('DELETE FROM tickets WHERE expires_at <= ?', now);
        this.ctx.storage.sql.exec('DELETE FROM nonces WHERE expires_at <= ?', now);
        const room = this.loadRoom();
        if (room && (room.status === 'waiting' || room.status === 'pending')) {
            if (room.invitation_expires_at !== null && room.invitation_expires_at <= now) {
                await this.failClosed('expired');
                return;
            }
        }
        await this.scheduleAlarm();
    }

    private async handleConfirm(
        ws: WebSocket,
        room: RoomRow,
        attachment: SocketAttachment,
        clientMessage: Record<string, unknown>
    ): Promise<void> {
        if (room.status === 'expired') {
            this.failSocket(ws, 'expired');
            return;
        }
        if (!exactKeys(clientMessage, ['type', 'attemptId', 'peerPublicKey'])) {
            this.failSocket(ws, 'invalid_message');
            return;
        }
        if (room.status === 'paired' || room.status === 'revoked') {
            this.failSocket(ws, 'invalid_message');
            return;
        }
        if (room.status !== 'pending' || !room.attempt_id || !room.client_public_key || !room.client_label) {
            this.failSocket(ws, 'invalid_message');
            return;
        }
        if (this.invitationExpired(room)) {
            await this.failClosed('expired');
            return;
        }
        if (!isUuid(clientMessage.attemptId) || typeof clientMessage.peerPublicKey !== 'string') {
            this.failSocket(ws, 'invalid_message');
            return;
        }
        if (clientMessage.attemptId !== room.attempt_id) {
            await this.failClosed('invalid_message');
            return;
        }
        const counterpart: PairingDevice =
            attachment.role === 'host'
                ? { publicKey: room.client_public_key, label: room.client_label }
                : { publicKey: room.host_public_key, label: room.host_label };
        if (clientMessage.peerPublicKey !== counterpart.publicKey) {
            await this.failClosed('invalid_peer');
            return;
        }
        if (attachment.role === 'host') {
            if (!room.host_confirmed) {
                this.ctx.storage.sql.exec('UPDATE room SET host_confirmed = 1 WHERE id = ?', room.id);
            }
        } else if (!room.client_confirmed) {
            this.ctx.storage.sql.exec('UPDATE room SET client_confirmed = 1 WHERE id = ?', room.id);
        }
        await this.tryPair();
    }

    private async handleSignal(
        ws: WebSocket,
        room: RoomRow,
        attachment: SocketAttachment,
        clientMessage: Record<string, unknown>,
        raw: string
    ): Promise<void> {
        if (!exactKeys(clientMessage, ['type', 'connectionId', 'descriptor', 'signature'])) {
            this.failSocket(ws, 'invalid_message');
            return;
        }
        if (room.status !== 'paired' || !room.connection_id) {
            this.failSocket(ws, 'invalid_message');
            return;
        }
        if (
            !isUuid(clientMessage.connectionId) ||
            typeof clientMessage.descriptor !== 'string' ||
            typeof clientMessage.signature !== 'string'
        ) {
            this.failSocket(ws, 'invalid_message');
            return;
        }
        if (clientMessage.connectionId !== room.connection_id) {
            this.failSocket(ws, 'invalid_message');
            return;
        }
        if (
            clientMessage.descriptor.length === 0 ||
            clientMessage.descriptor.length > PAIRING_MAX_DESCRIPTOR_LENGTH ||
            clientMessage.signature.length === 0 ||
            clientMessage.signature.length > 128
        ) {
            this.failSocket(ws, 'invalid_message');
            return;
        }
        const senderKey = attachment.role === 'host' ? room.host_public_key : room.client_public_key;
        if (!senderKey) {
            this.failSocket(ws, 'invalid_peer');
            return;
        }
        const signal: SignedSignal = {
            type: 'signal',
            connectionId: clientMessage.connectionId,
            descriptor: clientMessage.descriptor,
            signature: clientMessage.signature
        };
        const text = pairingSignalText(room.id, attachment.role, {
            connectionId: signal.connectionId,
            descriptor: signal.descriptor
        });
        if (!(await verifyPairingText(senderKey, text, signal.signature))) {
            this.failSocket(ws, 'invalid_peer');
            return;
        }
        const latest = this.loadRoom();
        if (
            !latest ||
            latest.status !== 'paired' ||
            latest.connection_id !== signal.connectionId ||
            !this.isCurrentSocket(ws, latest, attachment) ||
            ws.readyState !== WebSocket.OPEN
        ) {
            this.failSocket(ws, 'disconnected');
            return;
        }
        const other: PairingRole = attachment.role === 'host' ? 'client' : 'host';
        const otherSocket = this.liveSocket(
            other,
            other === 'host' ? latest.host_generation : latest.client_generation
        );
        if (!otherSocket) {
            this.failSocket(ws, 'disconnected');
            return;
        }
        const already = this.ctx.storage.sql
            .exec<{ role: string }>(
                'SELECT role FROM signals WHERE connection_id = ? AND role = ?',
                room.connection_id,
                attachment.role
            )
            .toArray();
        if (already.length > 0) {
            this.failSocket(ws, 'invalid_message');
            return;
        }
        this.ctx.storage.sql.exec(
            'INSERT INTO signals (connection_id, role) VALUES (?, ?)',
            room.connection_id,
            attachment.role
        );
        otherSocket.send(raw);
    }

    private invitationExpired(room: RoomRow): boolean {
        return (
            (room.status === 'waiting' || room.status === 'pending') &&
            room.invitation_expires_at !== null &&
            room.invitation_expires_at <= Date.now()
        );
    }

    private async tryPair(): Promise<void> {
        const room = this.loadRoom();
        if (!room) return;
        if (room.status !== 'pending' && room.status !== 'paired') return;
        if (this.invitationExpired(room)) {
            await this.failClosed('expired');
            return;
        }
        if (room.status === 'pending' && (!room.host_confirmed || !room.client_confirmed)) return;
        if (!room.client_public_key || !room.client_label) return;
        const hostSocket = this.liveSocket('host', room.host_generation);
        const clientSocket = this.liveSocket('client', room.client_generation);
        if (!hostSocket || !clientSocket) return;
        if (room.connection_id) return;
        const connectionId = crypto.randomUUID();
        const createdAt = room.pair_created_at ?? Date.now();
        this.ctx.storage.sql.exec('DELETE FROM signals');
        this.ctx.storage.sql.exec(
            `UPDATE room SET status = 'paired', connection_id = ?, pair_created_at = ? WHERE id = ?`,
            connectionId,
            createdAt,
            room.id
        );
        const hostPair: PairedBrowser = {
            id: room.id,
            role: 'host',
            peer: { publicKey: room.client_public_key, label: room.client_label },
            createdAt
        };
        const clientPair: PairedBrowser = {
            id: room.id,
            role: 'client',
            peer: { publicKey: room.host_public_key, label: room.host_label },
            createdAt
        };
        this.send(hostSocket, { type: 'paired', pair: hostPair, connectionId });
        this.send(clientSocket, { type: 'paired', pair: clientPair, connectionId });
    }

    private greet(ws: WebSocket, room: RoomRow, role: PairingRole): void {
        if (room.status === 'waiting') {
            this.send(ws, { type: 'waiting', expiresAt: room.invitation_expires_at });
            return;
        }
        if (room.status === 'pending' && room.attempt_id && room.client_public_key && room.client_label) {
            const peer: PairingDevice =
                role === 'host'
                    ? { publicKey: room.client_public_key, label: room.client_label }
                    : { publicKey: room.host_public_key, label: room.host_label };
            this.send(ws, {
                type: 'pending',
                attemptId: room.attempt_id,
                peer,
                expiresAt: room.invitation_expires_at ?? Date.now() + PAIRING_TTL_MS
            });
            return;
        }
        if (room.status === 'paired') {
            const other: PairingRole = role === 'host' ? 'client' : 'host';
            const otherLive = this.liveSocket(other, other === 'host' ? room.host_generation : room.client_generation);
            if (!otherLive) this.send(ws, { type: 'waiting', expiresAt: null });
        }
    }

    private async failClosed(error: PairingFailure, except?: WebSocket): Promise<void> {
        const room = this.loadRoom();
        if (
            !room ||
            room.status === 'paired' ||
            room.status === 'revoked' ||
            room.status === 'cancelled' ||
            room.status === 'expired' ||
            room.status === 'rejected'
        ) {
            return;
        }
        const status: RoomStatus =
            error === 'expired'
                ? 'expired'
                : error === 'rejected' || error === 'invalid_peer'
                  ? 'rejected'
                  : 'cancelled';
        this.ctx.storage.sql.exec(
            `UPDATE room SET status = ?, connection_id = NULL, attempt_id = NULL, code = NULL WHERE id = ?`,
            status,
            room.id
        );
        this.ctx.storage.sql.exec('DELETE FROM signals');
        if (room.code) await this.env.CODE_SLOT.getByName(room.code).release(room.id);
        const wireError: PairingFailure =
            error === 'invalid_message' ? 'invalid_message' : error === 'invalid_peer' ? 'rejected' : error;
        this.broadcast({ type: 'error', error: wireError });
        this.closeAll(except);
    }

    private async verifyMembershipProof(
        action: 'reconnect' | 'forget',
        proof: PairingProof
    ): Promise<{ ok: true; role: PairingRole } | { ok: false; error: PairingFailure }> {
        const room = this.loadRoom();
        if (!room) return { ok: false, error: 'unpaired' };
        if (action === 'reconnect' && room.status !== 'paired') {
            if (room.status === 'expired') return { ok: false, error: 'expired' };
            if (room.status === 'cancelled') return { ok: false, error: 'cancelled' };
            if (room.status === 'rejected') return { ok: false, error: 'rejected' };
            return { ok: false, error: 'unpaired' };
        }
        const now = Date.now();
        if (proof.timestamp > now + PAIRING_PROOF_SKEW_MS || now - proof.timestamp > PAIRING_PROOF_TTL_MS) {
            return { ok: false, error: 'expired' };
        }
        let role: PairingRole | null = null;
        if (proof.publicKey === room.host_public_key) role = 'host';
        else if (room.client_public_key && proof.publicKey === room.client_public_key) role = 'client';
        if (!role) return { ok: false, error: 'invalid_peer' };
        const text = pairingProofText(action, {
            roomId: proof.roomId,
            publicKey: proof.publicKey,
            nonce: proof.nonce,
            timestamp: proof.timestamp
        });
        if (!(await verifyPairingText(proof.publicKey, text, proof.signature))) {
            return { ok: false, error: 'invalid_peer' };
        }
        const existing = this.ctx.storage.sql
            .exec<{ nonce: string }>('SELECT nonce FROM nonces WHERE nonce = ?', proof.nonce)
            .toArray();
        if (existing.length > 0) return { ok: false, error: 'invalid_peer' };
        this.ctx.storage.sql.exec(
            'INSERT INTO nonces (nonce, action, expires_at) VALUES (?, ?, ?)',
            proof.nonce,
            action,
            proof.timestamp + PAIRING_PROOF_TTL_MS
        );
        return { ok: true, role };
    }

    private async issueTicket(role: PairingRole): Promise<string> {
        const issued = await issueTicketValue();
        this.ctx.storage.sql.exec('DELETE FROM tickets WHERE role = ? AND consumed = 0', role);
        this.ctx.storage.sql.exec(
            'INSERT INTO tickets (hash, role, expires_at, consumed) VALUES (?, ?, ?, 0)',
            issued.hash,
            role,
            Date.now() + PAIRING_TICKET_TTL_MS
        );
        return issued.ticket;
    }

    private ticketByHash(hash: string): TicketRow | null {
        const rows = this.ctx.storage.sql
            .exec<TicketRow>('SELECT hash, role, expires_at, consumed FROM tickets')
            .toArray();
        for (const row of rows) {
            if (equalHex(row.hash, hash)) return row;
        }
        return null;
    }

    private loadRoom(): RoomRow | null {
        const rows = this.ctx.storage.sql.exec<RoomRow>('SELECT * FROM room LIMIT 1').toArray();
        return rows[0] ?? null;
    }

    private liveSocket(role: PairingRole, generation: number): WebSocket | null {
        for (const socket of this.ctx.getWebSockets(role)) {
            if (socket.readyState !== WebSocket.OPEN) continue;
            const attachment = socket.deserializeAttachment() as SocketAttachment | null;
            if (attachment?.role === role && attachment.generation === generation) return socket;
        }
        return null;
    }

    private isCurrentSocket(ws: WebSocket, room: RoomRow, attachment: SocketAttachment): boolean {
        const generation = attachment.role === 'host' ? room.host_generation : room.client_generation;
        return attachment.generation === generation;
    }

    private send(ws: WebSocket, message: PairingServerMessage): void {
        try {
            ws.send(JSON.stringify(message));
        } catch {
            // Socket already closing.
        }
    }

    private sendToRole(role: PairingRole, message: PairingServerMessage): void {
        const room = this.loadRoom();
        if (!room) return;
        const socket = this.liveSocket(role, role === 'host' ? room.host_generation : room.client_generation);
        if (socket) this.send(socket, message);
    }

    private broadcast(message: PairingServerMessage): void {
        for (const socket of this.ctx.getWebSockets()) this.send(socket, message);
    }

    private failSocket(ws: WebSocket, error: PairingFailure): void {
        this.send(ws, { type: 'error', error });
        if (ws.readyState !== WebSocket.OPEN) return;
        try {
            ws.close(1008, error);
        } catch {
            // Already closed.
        }
    }

    private closeAll(except?: WebSocket): void {
        for (const socket of this.ctx.getWebSockets()) {
            if (except === socket || socket.readyState !== WebSocket.OPEN) continue;
            try {
                socket.close(1008, 'closed');
            } catch {
                // Already closed.
            }
        }
    }

    private async scheduleAlarm(): Promise<void> {
        const times: number[] = [];
        const room = this.loadRoom();
        if (room && (room.status === 'waiting' || room.status === 'pending') && room.invitation_expires_at) {
            times.push(room.invitation_expires_at);
        }
        const ticket = this.ctx.storage.sql
            .exec<{ t: number | null }>('SELECT MIN(expires_at) as t FROM tickets')
            .toArray()[0];
        if (ticket?.t) times.push(ticket.t);
        const nonce = this.ctx.storage.sql
            .exec<{ t: number | null }>('SELECT MIN(expires_at) as t FROM nonces')
            .toArray()[0];
        if (nonce?.t) times.push(nonce.t);
        if (times.length === 0) {
            await this.ctx.storage.deleteAlarm();
            return;
        }
        await this.ctx.storage.setAlarm(Math.min(...times));
    }
}
