if (typeof Promise.withResolvers !== 'function') {
    Promise.withResolvers = <T>() => {
        let resolve!: (value: T | PromiseLike<T>) => void;
        let reject!: (reason?: unknown) => void;
        const promise = new Promise<T>((res, rej) => {
            resolve = res;
            reject = rej;
        });
        return { promise, resolve, reject };
    };
}

if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.clear !== 'function') {
    const values = new Map<string, string>();
    const memoryStorage: Storage = {
        get length() {
            return values.size;
        },
        clear() {
            values.clear();
        },
        getItem(key: string) {
            return values.has(key) ? values.get(key)! : null;
        },
        key(index: number) {
            return [...values.keys()][index] ?? null;
        },
        removeItem(key: string) {
            values.delete(key);
        },
        setItem(key: string, value: string) {
            values.set(key, String(value));
        }
    };
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memoryStorage });
}
