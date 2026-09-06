import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUuid } from '@/shared/lib/uuid';

describe('randomUuid', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('throws when crypto.randomUUID is unavailable', () => {
        vi.stubGlobal('crypto', {});
        expect(() => randomUuid()).toThrow(/Chrome >= 92/);
    });
});
