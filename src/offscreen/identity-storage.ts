import { MSG } from '@/shared/constants';
import { encodePairingBytes } from '@/shared/lib/pairing-crypto';
import { isPairingDevice, type PairedBrowser, type PairingRole } from '@/shared/lib/pairing-protocol';
import { isUuidV4 } from '@/shared/lib/uuid';
import type { MessageMap } from '@/shared/types';

export const IDENTITY_DB_NAME = 'beam-pairing-identity';
export const IDENTITY_STORE_NAME = 'keys';
export const IDENTITY_RECORD_KEY = 'local';

export interface PairingIdentity {
    privateKey: CryptoKey;
    publicKey: CryptoKey;
    publicKeySpki: string;
}

export interface IdentityStore {
    loadOrCreate(): Promise<PairingIdentity>;
}

export interface TrustStore {
    get(): Promise<PairedBrowser | null>;
    set(pair: PairedBrowser): Promise<void>;
    clear(): Promise<void>;
}

export interface SavedRoleStore {
    get(): Promise<PairingRole | null>;
}

interface IdentityRecord {
    privateKey: CryptoKey;
    publicKey: CryptoKey;
}

const openIdentityDb = (factory: IDBFactory): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
        const request = factory.open(IDENTITY_DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(IDENTITY_STORE_NAME)) {
                db.createObjectStore(IDENTITY_STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('identity-db-open'));
        request.onblocked = () => reject(request.error ?? new Error('identity-db-blocked'));
    });

const idbRequest = <T>(request: IDBRequest<T>): Promise<T> =>
    new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('identity-db-request'));
    });

const idbTransactionDone = (tx: IDBTransaction): Promise<void> =>
    new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error ?? new Error('identity-db-abort'));
        tx.onerror = () => reject(tx.error ?? new Error('identity-db-error'));
    });

const isCryptoKey = (value: unknown): value is CryptoKey =>
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'extractable' in value &&
    'algorithm' in value &&
    'usages' in value;

const namedCurve = (key: CryptoKey): string | undefined => {
    const algorithm = key.algorithm as { name?: unknown; namedCurve?: unknown };
    return algorithm.name === 'ECDSA' && typeof algorithm.namedCurve === 'string' ? algorithm.namedCurve : undefined;
};

const isIdentityRecord = (value: unknown): value is IdentityRecord => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as { privateKey?: unknown; publicKey?: unknown };
    if (!isCryptoKey(record.privateKey) || !isCryptoKey(record.publicKey)) return false;
    if (record.privateKey.type !== 'private' || record.privateKey.extractable !== false) return false;
    if (namedCurve(record.privateKey) !== 'P-256' || !record.privateKey.usages.includes('sign')) return false;
    if (record.publicKey.type !== 'public' || namedCurve(record.publicKey) !== 'P-256') return false;
    return true;
};

const identityFromRecord = async (record: IdentityRecord): Promise<PairingIdentity | null> => {
    if (!isIdentityRecord(record)) return null;
    try {
        const publicKeySpki = encodePairingBytes(await crypto.subtle.exportKey('spki', record.publicKey));
        if (publicKeySpki.length === 0 || publicKeySpki.length > 256) return null;
        if (record.privateKey.extractable) return null;
        return { privateKey: record.privateKey, publicKey: record.publicKey, publicKeySpki };
    } catch {
        return null;
    }
};

const readCommittedRecord = async (db: IDBDatabase): Promise<IdentityRecord | null> => {
    const tx = db.transaction(IDENTITY_STORE_NAME, 'readonly');
    const done = idbTransactionDone(tx);
    const existing = await idbRequest(tx.objectStore(IDENTITY_STORE_NAME).get(IDENTITY_RECORD_KEY));
    await done;
    return isIdentityRecord(existing) ? existing : null;
};

const commitGeneratedOrExisting = (db: IDBDatabase, generated: CryptoKeyPair): Promise<IdentityRecord> =>
    new Promise((resolve, reject) => {
        const tx = db.transaction(IDENTITY_STORE_NAME, 'readwrite');
        const store = tx.objectStore(IDENTITY_STORE_NAME);
        const getRequest = store.get(IDENTITY_RECORD_KEY);
        let chosen: IdentityRecord | null = null;
        getRequest.onerror = () => reject(getRequest.error ?? new Error('identity-db-request'));
        getRequest.onsuccess = () => {
            const existing = getRequest.result;
            if (isIdentityRecord(existing)) {
                chosen = existing;
                return;
            }
            chosen = { privateKey: generated.privateKey, publicKey: generated.publicKey };
            store.put(chosen, IDENTITY_RECORD_KEY);
        };
        tx.oncomplete = () => {
            if (!chosen || !isIdentityRecord(chosen)) {
                reject(new Error('identity-invalid'));
                return;
            }
            resolve(chosen);
        };
        tx.onabort = () => reject(tx.error ?? new Error('identity-db-abort'));
        tx.onerror = () => reject(tx.error ?? new Error('identity-db-error'));
    });

export const isPairedBrowser = (value: unknown): value is PairedBrowser => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return (
        typeof record.id === 'string' &&
        isUuidV4(record.id) &&
        (record.role === 'host' || record.role === 'client') &&
        isPairingDevice(record.peer) &&
        typeof record.createdAt === 'number' &&
        Number.isFinite(record.createdAt)
    );
};

const publicPair = (pair: PairedBrowser): PairedBrowser => ({
    id: pair.id,
    role: pair.role,
    peer: { publicKey: pair.peer.publicKey, label: pair.peer.label },
    createdAt: pair.createdAt
});

export const createIdentityStore = (factory?: IDBFactory): IdentityStore => {
    let inflight: Promise<PairingIdentity> | null = null;

    const loadOrCreateOnce = async (): Promise<PairingIdentity> => {
        const idb = factory ?? globalThis.indexedDB;
        if (!idb) throw new Error('indexedDB unavailable');

        const existingDb = await openIdentityDb(idb);
        try {
            const existing = await readCommittedRecord(existingDb);
            if (existing) {
                const identity = await identityFromRecord(existing);
                if (identity) return identity;
            }
        } finally {
            existingDb.close();
        }

        const generated = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
        if (generated.privateKey.extractable) throw new Error('identity-extractable');

        const db = await openIdentityDb(idb);
        try {
            const record = await commitGeneratedOrExisting(db, generated);
            const identity = await identityFromRecord(record);
            if (!identity) throw new Error('identity-invalid');
            return identity;
        } finally {
            db.close();
        }
    };

    return {
        loadOrCreate(): Promise<PairingIdentity> {
            if (!inflight) {
                inflight = loadOrCreateOnce().finally(() => {
                    inflight = null;
                });
            }
            return inflight;
        }
    };
};

// Chrome offscreen documents expose runtime, not chrome.storage.
const pairingStorage = async (payload: MessageMap['OFFSCREEN_PAIRING_STORAGE']['req']): Promise<unknown> => {
    const result = await chrome.runtime.sendMessage({ type: MSG.OFFSCREEN_PAIRING_STORAGE, payload });
    if (!result || result.ok !== true) throw new Error('pairing-storage-unavailable');
    return result.value;
};

export const createTrustStore = (): TrustStore => ({
    async get(): Promise<PairedBrowser | null> {
        const value = await pairingStorage({ action: 'get' });
        return isPairedBrowser(value) ? publicPair(value) : null;
    },
    async set(pair: PairedBrowser): Promise<void> {
        await pairingStorage({ action: 'set', pair: publicPair(pair) });
    },
    async clear(): Promise<void> {
        await pairingStorage({ action: 'clear' });
    }
});

export const createSavedRoleStore = (): SavedRoleStore => ({
    async get(): Promise<PairingRole | null> {
        const value = await pairingStorage({ action: 'role' });
        return value === 'host' || value === 'client' ? value : null;
    }
});
