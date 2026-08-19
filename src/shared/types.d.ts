import type { MSG, MESSAGE_SPEC } from '@/shared/constants';

export interface HiddenItem {
    id: string;
    title: string;
    url: string;
    thumbnail: string;
    hiddenAt: number;
}

export type HiddenItemsMap = Record<string, HiddenItem>;

// Build a default message map from MSG keys
export type InferMessageMap<T extends Record<string, string>> = {
    [K in keyof T]: { req?: unknown; res?: unknown };
};

// Merge overrides while keeping defaults for unspecified keys
export type MessageMapOf<
    T extends Record<string, string>,
    O extends Partial<{ [K in keyof T]: { req?: unknown; res?: unknown } }>
> = {
    [K in keyof T]: O[K] extends object ? O[K] : { req?: unknown; res?: unknown };
};

// Public message map type used by the bus
export type MessageMap = MessageMapOf<typeof MSG, typeof MESSAGE_SPEC>;
export type Message<T extends string = string, P = unknown> = {
    type: T;
    payload?: P;
};

// Structured error response type
export interface ErrorResponse {
    error: {
        message: string;
        code?: string;
        details?: unknown;
    };
}

// Typed storage schema used by createTypedStorage
export interface StorageSchema {
    local: {
        hiddenItems: HiddenItemsMap;
    };
    sync: {
        settings: unknown;
        version: string;
    };
    managed: {
        orgEnabled: boolean;
        allowedHosts: string[];
    };
    session: {
        lastVisited: string | null;
        tempToken: string | null;
    };
}
