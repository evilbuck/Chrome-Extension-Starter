import { DurableObject } from 'cloudflare:workers';
import type { PairingFailure } from '../../../src/shared/lib/pairing-protocol';

export type CodeLookup =
    | { ok: true; roomId: string; expiresAt: number }
    | { ok: false; error: Extract<PairingFailure, 'invalid_code' | 'expired' | 'busy'> };

export type CodeReserve = { ok: true } | { ok: false; error: Extract<PairingFailure, 'busy'> };

type SlotRow = {
    room_id: string;
    expires_at: number;
    consumed: number;
};

export class CodeSlot extends DurableObject<Env> {
    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        ctx.blockConcurrencyWhile(async () => {
            this.ctx.storage.sql.exec(`
                CREATE TABLE IF NOT EXISTS slot (
                    room_id TEXT NOT NULL,
                    expires_at INTEGER NOT NULL,
                    consumed INTEGER NOT NULL DEFAULT 0
                )
            `);
        });
    }

    async reserve(roomId: string, expiresAt: number): Promise<CodeReserve> {
        const now = Date.now();
        const existing = this.row();
        if (existing && existing.expires_at > now && existing.room_id !== roomId) {
            return { ok: false, error: 'busy' };
        }
        this.ctx.storage.sql.exec('DELETE FROM slot');
        this.ctx.storage.sql.exec(
            'INSERT INTO slot (room_id, expires_at, consumed) VALUES (?, ?, 0)',
            roomId,
            expiresAt
        );
        await this.ctx.storage.setAlarm(expiresAt);
        return { ok: true };
    }

    async lookup(): Promise<CodeLookup> {
        const existing = this.row();
        if (!existing) return { ok: false, error: 'invalid_code' };
        if (existing.consumed) return { ok: false, error: 'busy' };
        if (existing.expires_at <= Date.now()) return { ok: false, error: 'expired' };
        return { ok: true, roomId: existing.room_id, expiresAt: existing.expires_at };
    }

    async consume(roomId: string): Promise<void> {
        const existing = this.row();
        if (!existing || existing.room_id !== roomId) return;
        this.ctx.storage.sql.exec('UPDATE slot SET consumed = 1 WHERE room_id = ?', roomId);
    }

    async release(roomId: string): Promise<void> {
        const existing = this.row();
        if (!existing || existing.room_id !== roomId) return;
        this.ctx.storage.sql.exec('DELETE FROM slot WHERE room_id = ?', roomId);
        await this.ctx.storage.deleteAlarm();
    }

    async alarm(): Promise<void> {
        const existing = this.row();
        if (!existing) {
            await this.ctx.storage.deleteAlarm();
            return;
        }
        if (existing.expires_at <= Date.now()) {
            this.ctx.storage.sql.exec('DELETE FROM slot');
            await this.ctx.storage.deleteAlarm();
            return;
        }
        await this.ctx.storage.setAlarm(existing.expires_at);
    }

    private row(): SlotRow | null {
        const rows = this.ctx.storage.sql
            .exec<SlotRow>('SELECT room_id, expires_at, consumed FROM slot LIMIT 1')
            .toArray();
        return rows[0] ?? null;
    }
}
