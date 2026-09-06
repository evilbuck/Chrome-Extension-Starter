import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('CodeSlot', () => {
    it('rejects a second active reservation for the same code', async () => {
        const first = crypto.randomUUID();
        const second = crypto.randomUUID();
        const slot = env.CODE_SLOT.getByName(crypto.randomUUID());
        const reserved = await slot.reserve(first, Date.now() + 120_000);
        expect(reserved.ok).toBe(true);
        const collided = await slot.reserve(second, Date.now() + 120_000);
        expect(collided).toEqual({ ok: false, error: 'busy' });
        const looked = await slot.lookup();
        expect(looked.ok).toBe(true);
        if (looked.ok) expect(looked.roomId).toBe(first);
    });

    it('allows reuse after expiry', async () => {
        const first = crypto.randomUUID();
        const second = crypto.randomUUID();
        const slot = env.CODE_SLOT.getByName(crypto.randomUUID());
        expect((await slot.reserve(first, Date.now() + 120_000)).ok).toBe(true);
        await runInDurableObject(slot, async (_instance, state) => {
            state.storage.sql.exec('UPDATE slot SET expires_at = ?', Date.now() - 5);
        });
        expect(await slot.lookup()).toEqual({ ok: false, error: 'expired' });
        expect((await slot.reserve(second, Date.now() + 120_000)).ok).toBe(true);
        const looked = await slot.lookup();
        expect(looked.ok).toBe(true);
        if (looked.ok) expect(looked.roomId).toBe(second);
    });

    it('treats a consumed code as busy until release', async () => {
        const roomId = crypto.randomUUID();
        const slot = env.CODE_SLOT.getByName(crypto.randomUUID());
        expect((await slot.reserve(roomId, Date.now() + 120_000)).ok).toBe(true);
        await slot.consume(roomId);
        expect(await slot.lookup()).toEqual({ ok: false, error: 'busy' });
        await slot.release(roomId);
        expect(await slot.lookup()).toEqual({ ok: false, error: 'invalid_code' });
    });

    it('alarm deletes an expired reservation', async () => {
        const slot = env.CODE_SLOT.getByName(crypto.randomUUID());
        expect((await slot.reserve(crypto.randomUUID(), Date.now() + 120_000)).ok).toBe(true);
        await runInDurableObject(slot, async (_instance, state) => {
            state.storage.sql.exec('UPDATE slot SET expires_at = ?', Date.now() - 5);
            await state.storage.setAlarm(Date.now() + 60_000);
        });
        await runDurableObjectAlarm(slot);
        expect(await slot.lookup()).toEqual({ ok: false, error: 'invalid_code' });
    });

    it('ignores consume and release from a stale room after reuse', async () => {
        const first = crypto.randomUUID();
        const second = crypto.randomUUID();
        const slot = env.CODE_SLOT.getByName(crypto.randomUUID());
        expect((await slot.reserve(first, Date.now() + 120_000)).ok).toBe(true);

        await slot.release(second);
        const stillFirst = await slot.lookup();
        expect(stillFirst.ok).toBe(true);
        if (stillFirst.ok) expect(stillFirst.roomId).toBe(first);

        await slot.consume(second);
        const unconsumed = await slot.lookup();
        expect(unconsumed.ok).toBe(true);
        if (unconsumed.ok) expect(unconsumed.roomId).toBe(first);

        await slot.consume(first);
        expect(await slot.lookup()).toEqual({ ok: false, error: 'busy' });
        await slot.release(second);
        expect(await slot.lookup()).toEqual({ ok: false, error: 'busy' });
        await slot.release(first);
        expect(await slot.lookup()).toEqual({ ok: false, error: 'invalid_code' });

        expect((await slot.reserve(second, Date.now() + 120_000)).ok).toBe(true);
        await slot.release(first);
        await slot.consume(first);
        const stillSecond = await slot.lookup();
        expect(stillSecond.ok).toBe(true);
        if (stillSecond.ok) expect(stillSecond.roomId).toBe(second);
    });
});
