import { describe, expect, it } from 'vitest';
import { isPairingCommand } from '@/shared/lib/pairing-protocol';

describe('isPairingCommand', () => {
    it('accepts join with exactly three keys, a valid code, and a label', () => {
        expect(isPairingCommand({ action: 'join', code: 'ABC23', label: 'Desk' })).toBe(true);
        expect(isPairingCommand({ action: 'join', code: 'abc23', label: 'Desk' })).toBe(true);
    });

    it('rejects an unknown action', () => {
        expect(isPairingCommand({ action: 'explode' })).toBe(false);
    });
});
