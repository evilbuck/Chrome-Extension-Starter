// Phase 4 typed KV storage. Local + session only — sync and managed were
// removed so all settings stay machine-local (Phase 4 contract).

import type { StorageSchema } from '@/shared/types';

type AllAreas = 'local' | 'session';
type AreasOf<S> = Extract<keyof S, AllAreas>;
type ValueOf<T, K extends keyof T> = T[K];
type StrictPartial<T> = { [K in keyof T]?: T[K] };

const areaOf = (area: AllAreas) => {
    switch (area) {
        case 'local':
            return chrome.storage.local;
        case 'session':
            return chrome.storage.session;
    }
};

export function createTypedStorage<S extends Partial<Record<AllAreas, Record<string, unknown>>>>() {
    type Area = AreasOf<S>;

    function get<A extends Area, K extends keyof S[A]>(
        area: A,
        key: K,
        fallback: ValueOf<S[A], K>
    ): Promise<ValueOf<S[A], K>>;

    function get<A extends Area, K extends keyof S[A]>(
        area: A,
        key: K
    ): Promise<ValueOf<S[A], K> | undefined>;

    async function get(area: AllAreas, key: string, fallback?: unknown): Promise<unknown> {
        const bucket = areaOf(area);
        const result = await new Promise<Record<string, unknown>>((resolve) => {
            if (typeof fallback === 'undefined') {
                bucket.get([key], (v) => resolve(v));
            } else {
                bucket.get({ [key]: fallback }, (v) => resolve(v));
            }
        });
        return result[key];
    }

    function getAll<A extends Area>(area: A, defaults: Partial<S[A]>): Promise<S[A]>;
    function getAll<A extends Area>(area: A): Promise<Partial<S[A]>>;

    async function getAll(area: AllAreas, defaults?: Record<string, unknown>): Promise<Record<string, unknown>> {
        const bucket = areaOf(area);
        const result = await new Promise<Record<string, unknown>>((resolve) => {
            bucket.get((defaults ?? undefined) as Record<string, unknown> | null, (v) => resolve(v));
        });
        return result;
    }

    function set<A extends Area, K extends keyof S[A]>(
        area: A,
        key: K,
        value: ValueOf<S[A], K>
    ): Promise<void>;

    async function set(area: AllAreas, key: string, value: unknown): Promise<void> {
        const bucket = areaOf(area);
        await new Promise<void>((resolve) => bucket.set({ [key]: value }, () => resolve()));
    }

    function setAll<A extends Area>(area: A, items: StrictPartial<S[A]>): Promise<void>;

    async function setAll(area: AllAreas, items: Record<string, unknown>): Promise<void> {
        const bucket = areaOf(area);
        await new Promise<void>((resolve) => bucket.set(items, () => resolve()));
    }

    function remove<A extends Area, K extends keyof S[A]>(area: A, key: K | K[]): Promise<void>;

    async function remove(area: AllAreas, key: string | string[]): Promise<void> {
        const bucket = areaOf(area);
        const keys = Array.isArray(key) ? key : [key];
        await new Promise<void>((resolve) => bucket.remove(keys, () => resolve()));
    }

    const watch = <A extends Area, K extends keyof S[A]>(
        area: A,
        key: K,
        cb: (current: ValueOf<S[A], K> | undefined, previous: ValueOf<S[A], K> | undefined) => void
    ): (() => void) => {
        const handler = (
            changes: { [k: string]: chrome.storage.StorageChange },
            areaName: string
        ): void => {
            if ((areaName as Area) !== area) return;
            const change = changes[key as string];
            if (!change) return;
            cb(
                change.newValue as ValueOf<S[A], K> | undefined,
                change.oldValue as ValueOf<S[A], K> | undefined
            );
        };
        chrome.storage.onChanged.addListener(handler);
        return () => chrome.storage.onChanged.removeListener(handler);
    };

    return { get, getAll, set, setAll, remove, watch };
}

export const kv = createTypedStorage<StorageSchema>();