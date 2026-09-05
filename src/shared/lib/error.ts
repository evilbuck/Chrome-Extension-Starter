// Phase 4 error helpers. The `details` field is intentionally absent:
// Phase 2 evidence discipline forbids echoing SDP, ICE candidates, or
// credential content in error responses. The `code` is the only structured
// metadata; the `message` is non-secret.

import type { ErrorResponse } from '@/shared/types';

export const createErrorResponse = (message: string, code?: string): ErrorResponse => {
    const err: ErrorResponse['error'] = code !== undefined ? { message, code } : { message };
    return { error: err };
};

export const isErrorResponse = (response: unknown): response is ErrorResponse => {
    return (
        typeof response === 'object' &&
        response !== null &&
        'error' in response &&
        typeof (response as Record<string, unknown>).error === 'object' &&
        typeof ((response as Record<string, unknown>).error as Record<string, unknown>).message === 'string'
    );
};

export const toErrorResponse = (error: unknown): ErrorResponse => {
    if (isErrorResponse(error)) {
        return error;
    }
    if (error instanceof Error) {
        return createErrorResponse(error.message, error.name);
    }
    return createErrorResponse(String(error), 'UNKNOWN_ERROR');
};