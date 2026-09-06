import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    createIdentityStore,
    createSavedRoleStore,
    createTrustStore,
    IDENTITY_DB_NAME,
    IDENTITY_RECORD_KEY,
    IDENTITY_STORE_NAME,
    isPairedBrowser
} from '@/offscreen/identity-storage';
import { MSG } from '@/shared/constants';

class FakeRequest<T> {
    result = undefined as T;
    error: DOMException | null = null;
    onsuccess: ((ev: Event) => unknown) | null = null;
    onerror: ((ev: Event) => unknown) | null = null;
}

class FakeTransaction {
    oncomplete: ((ev: Event) => unknown) | null = null;
    onabort: ((ev: Event) => unknown) | null = null;
    onerror: ((ev: Event) => unknown) | null = null;
    error: DOMException | null = null;
    releaseComplete: (() => void) | null = null;
    unlock: (() => void) | null = null;
    private readonly pending = new Map<string, unknown>();
    private outstanding = 0;
    private closed = false;

    constructor(
        private readonly db: FakeDatabase,
        private readonly mode: IDBTransactionMode,
        private readonly holdComplete: boolean,
        private readonly ready: Promise<void>
    ) {}
    objectStore(name: string) {
        if (name !== IDENTITY_STORE_NAME) throw new Error('unknown store');
        return {
            get: (key: IDBValidKey) => this.request(() => this.db.committed.get(String(key))),
            put: (value: unknown, key?: IDBValidKey) => {
                if (key !== undefined) this.pending.set(String(key), value);
                return this.request(() => key);
            }
        };
    }

    private request<T>(read: () => T): FakeRequest<T> {
        const request = new FakeRequest<T>();
        this.outstanding += 1;
        void this.ready.then(() => {
            queueMicrotask(() => {
                request.result = read();
                request.onsuccess?.(new Event('success'));
                this.outstanding -= 1;
                this.settleIfIdle();
            });
        });
        return request;
    }

    private settleIfIdle(): void {
        if (this.closed || this.outstanding > 0) return;
        if (this.holdComplete) {
            this.releaseComplete = () => this.complete();
            this.db.heldWrite = this;
            return;
        }
        this.complete();
    }

    private complete(): void {
        if (this.closed) return;
        this.closed = true;
        if (this.mode === 'readwrite') {
            for (const [key, value] of this.pending) this.db.committed.set(key, value);
        }
        this.oncomplete?.(new Event('complete'));
        this.db.finishWrite(this);
    }
}

class FakeDatabase {
    readonly committed = new Map<string, unknown>();
    hasStore = true;
    createdStores: string[] = [];
    readonly objectStoreNames = { contains: (name: string) => this.hasStore && name === IDENTITY_STORE_NAME };
    heldWrite: FakeTransaction | null = null;
    holdNextWrite = false;
    private writeReady: Promise<void> = Promise.resolve();

    transaction(_name: string, mode: IDBTransactionMode = 'readonly'): FakeTransaction {
        const hold = mode === 'readwrite' && this.holdNextWrite;
        if (hold) this.holdNextWrite = false;
        if (mode !== 'readwrite') return new FakeTransaction(this, mode, false, Promise.resolve());
        const ready = this.writeReady;
        const tx = new FakeTransaction(this, mode, hold, ready);
        this.writeReady = new Promise((resolve) => {
            tx.unlock = resolve;
        });
        return tx;
    }

    finishWrite(tx: FakeTransaction): void {
        if (this.heldWrite === tx) this.heldWrite = null;
        const unlock = tx.unlock;
        tx.unlock = null;
        unlock?.();
    }

    close(): void {}
    createObjectStore(name: string): IDBObjectStore {
        this.createdStores.push(name);
        this.hasStore = true;
        return {} as IDBObjectStore;
    }
}

class FakeOpenRequest extends FakeRequest<FakeDatabase> {
    onupgradeneeded: ((ev: Event) => unknown) | null = null;
    onblocked: ((ev: Event) => unknown) | null = null;
}

class FakeFactory {
    readonly db = new FakeDatabase();

    open(name: string): FakeOpenRequest {
        const request = new FakeOpenRequest();
        queueMicrotask(() => {
            if (name !== IDENTITY_DB_NAME) {
                request.error = new DOMException('identity-db-open');
                request.onerror?.(new Event('error'));
                return;
            }
            request.result = this.db;
            request.onupgradeneeded?.(new Event('upgradeneeded'));
            request.onsuccess?.(new Event('success'));
        });
        return request;
    }
}

describe('offscreen identity storage', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('propagates Forget persistence failure instead of claiming durable revocation', async () => {
        vi.stubGlobal('chrome', {
            runtime: { sendMessage: vi.fn().mockResolvedValue({ ok: false, error: 'storage_failure' }) }
        });
        await expect(createTrustStore().clear()).rejects.toThrow('pairing-storage-unavailable');
    });

    it('does not resolve get-or-create before the identity transaction commits', async () => {
        const factory = new FakeFactory();
        factory.db.holdNextWrite = true;
        const idbFactory: IDBFactory = factory as unknown as IDBFactory;
        const pending = createIdentityStore(idbFactory).loadOrCreate();
        let settled = false;
        void pending.then(
            () => {
                settled = true;
            },
            () => {
                settled = true;
            }
        );
        const held = await vi.waitFor(() => {
            expect(factory.db.heldWrite?.releaseComplete).toBeTypeOf('function');
            expect(settled).toBe(false);
            expect(factory.db.committed.has(IDENTITY_RECORD_KEY)).toBe(false);
            return factory.db.heldWrite;
        });
        held?.releaseComplete?.();
        const identity = await pending;
        expect(identity.privateKey.extractable).toBe(false);
        expect(identity.privateKey.usages).toContain('sign');
        expect(factory.db.committed.get(IDENTITY_RECORD_KEY)).toEqual({
            privateKey: identity.privateKey,
            publicKey: identity.publicKey
        });
    });

    it('chooses one committed identity across concurrent create races', async () => {
        const factory = new FakeFactory();
        const idbFactory: IDBFactory = factory as unknown as IDBFactory;
        const [first, second] = await Promise.all([
            createIdentityStore(idbFactory).loadOrCreate(),
            createIdentityStore(idbFactory).loadOrCreate()
        ]);
        expect(first.publicKeySpki).toBe(second.publicKeySpki);
        expect(first.privateKey.extractable).toBe(false);
        expect(second.privateKey.extractable).toBe(false);
        expect(first.privateKey).toBe(second.privateKey);
    });

    it('creates the identity object store on first upgrade', async () => {
        const factory = new FakeFactory();
        factory.db.hasStore = false;
        const identity = await createIdentityStore(factory as unknown as IDBFactory).loadOrCreate();
        expect(factory.db.createdStores).toContain(IDENTITY_STORE_NAME);
        expect(identity.privateKey.extractable).toBe(false);
    });

    it('rejects stored identity keys that cannot be exported', async () => {
        const factory = new FakeFactory();
        const fakeKey = (type: 'private' | 'public'): CryptoKey =>
            ({
                type,
                extractable: type !== 'private',
                algorithm: { name: 'ECDSA', namedCurve: 'P-256' },
                usages: type === 'private' ? ['sign'] : ['verify']
            }) as CryptoKey;
        factory.db.committed.set(IDENTITY_RECORD_KEY, {
            privateKey: fakeKey('private'),
            publicKey: fakeKey('public')
        });
        await expect(createIdentityStore(factory as unknown as IDBFactory).loadOrCreate()).rejects.toThrow(
            'identity-invalid'
        );
    });
    it('rejects generate-and-commit when the generated keys are not a valid identity', async () => {
        const factory = new FakeFactory();
        const spy = vi.spyOn(crypto.subtle, 'generateKey').mockResolvedValue({
            privateKey: {
                type: 'private',
                extractable: false,
                algorithm: { name: 'RSA' },
                usages: ['sign']
            } as CryptoKey,
            publicKey: {
                type: 'public',
                extractable: true,
                algorithm: { name: 'RSA' },
                usages: ['verify']
            } as CryptoKey
        });
        try {
            await expect(createIdentityStore(factory as unknown as IDBFactory).loadOrCreate()).rejects.toThrow(
                'identity-invalid'
            );
        } finally {
            spy.mockRestore();
        }
    });

    it('persists a public pair through trust store set', async () => {
        const sendMessage = vi.fn().mockResolvedValue({ ok: true, value: undefined });
        vi.stubGlobal('chrome', { runtime: { sendMessage } });
        const pair = {
            id: '00000000-0000-4000-8000-000000000001',
            role: 'host' as const,
            peer: { publicKey: 'aGVsbG8=', label: 'Desk' },
            createdAt: 1_700_000_000_000
        };
        await createTrustStore().set(pair);
        expect(sendMessage).toHaveBeenCalledWith({
            type: MSG.OFFSCREEN_PAIRING_STORAGE,
            payload: { action: 'set', pair }
        });
    });

    it('returns a saved host or client role and null otherwise', async () => {
        const sendMessage = vi.fn();
        vi.stubGlobal('chrome', { runtime: { sendMessage } });
        const store = createSavedRoleStore();
        sendMessage.mockResolvedValue({ ok: true, value: 'host' });
        await expect(store.get()).resolves.toBe('host');
        sendMessage.mockResolvedValue({ ok: true, value: 'client' });
        await expect(store.get()).resolves.toBe('client');
        sendMessage.mockResolvedValue({ ok: true, value: 'other' });
        await expect(store.get()).resolves.toBeNull();
    });

    it('treats a non-paired trust value as absent', async () => {
        vi.stubGlobal('chrome', {
            runtime: { sendMessage: vi.fn().mockResolvedValue({ ok: true, value: { id: 'nope' } }) }
        });
        await expect(createTrustStore().get()).resolves.toBeNull();
        expect(isPairedBrowser({ id: 'nope' })).toBe(false);
    });
});
