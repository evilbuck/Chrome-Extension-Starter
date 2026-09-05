// Phase 4 typed schema. The schema intentionally omits sync and managed
// storage areas (Phase 4 moves all settings to chrome.storage.local) and
// drops the demo fields (favoriteColor, darkMode, etc.). The MESSAGE_SPEC
// map type is unchanged so the existing typed bus keeps working.

import type { MSG, MESSAGE_SPEC } from '@/shared/constants';

export type InferMessageMap<T extends Record<string, string>> = {
    [K in keyof T]: { req?: unknown; res?: unknown };
};

export type MessageMapOf<
    T extends Record<string, string>,
    O extends Partial<{ [K in keyof T]: { req?: unknown; res?: unknown } }>
> = {
    [K in keyof T]: O[K] extends object ? O[K] : { req?: unknown; res?: unknown };
};

export type MessageMap = MessageMapOf<typeof MSG, typeof MESSAGE_SPEC>;
export type Message<T extends string = string, P = unknown> = {
    type: T;
    payload?: P;
};

// Structured error response. The `details` field is intentionally
// omitted: Phase 2 evidence discipline forbids echoing SDP / ICE /
// credential content in error responses.
export interface ErrorResponse {
    error: {
        message: string;
        code?: string;
    };
}

// Phase 4 typed storage schema. Local-only — sync and managed were removed.
export interface StorageSchema {
    local: {
        role: 'host' | 'client' | null;
        connectionMetadata: { connectionId: string | null; lastConnectedAt: number | null };
    };
    session: {
        activeRequestId: string | null;
        activeRequestOriginTab: number | null;
    };
}