import { describe, expect, it } from 'vitest';
import { createErrorResponse, toErrorResponse } from '@/shared/lib/error';

describe('createErrorResponse', () => {
    it('includes code when provided', () => {
        expect(createErrorResponse('boom', 'NOPE')).toEqual({ error: { message: 'boom', code: 'NOPE' } });
    });

    it('omits code when not provided', () => {
        expect(createErrorResponse('boom')).toEqual({ error: { message: 'boom' } });
        expect(createErrorResponse('boom').error).not.toHaveProperty('code');
    });
});

describe('toErrorResponse', () => {
    it('uses the Error message and name', () => {
        expect(toErrorResponse(new Error('x'))).toEqual({ error: { message: 'x', code: 'Error' } });
    });
});
