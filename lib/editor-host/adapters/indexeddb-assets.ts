import type { EditorAssetsAdapter } from '../types';

export interface IndexedDbAssetsRef {
    docId: string;
}

export interface IndexedDbAssetsOptions {
    dbName: string;
    assetIdPrefix: string;
    dbVersion?: number;
    storeName?: string;
    hardDeleteAfterMs?: number;
}

type StoredIndexedDbAsset = {
    assetId: string;
    docId: string;
    nodeId: string;
    propertyName: string;
    fileName: string;
    mimeType: string;
    blob: Blob;
    createdAt: number;
    deletedAt: number | null;
    lastReferencedAt: number;
};

const DEFAULT_DB_VERSION = 2;
const DEFAULT_STORE_NAME = 'assets';
const DEFAULT_HARD_DELETE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const objectUrlCache = new Map<string, string>();

const getStoreName = (options: IndexedDbAssetsOptions): string =>
    options.storeName ?? DEFAULT_STORE_NAME;

const getDbVersion = (options: IndexedDbAssetsOptions): number =>
    options.dbVersion ?? DEFAULT_DB_VERSION;

const getHardDeleteAfterMs = (options: IndexedDbAssetsOptions): number =>
    options.hardDeleteAfterMs ?? DEFAULT_HARD_DELETE_AFTER_MS;

const getCacheKey = (options: IndexedDbAssetsOptions, assetId: string): string =>
    `${options.dbName}:${assetId}`;

function createIndexedDbUnavailableError(): Error {
    return new Error('IndexedDB asset storage is unavailable in this environment.');
}

function getIndexedDb(): IDBFactory {
    if (typeof globalThis.indexedDB === 'undefined') {
        throw createIndexedDbUnavailableError();
    }

    return globalThis.indexedDB;
}

function isIndexedDbRequest<T>(value: unknown): value is IDBRequest<T> {
    return !!value && typeof value === 'object' && 'onsuccess' in value && 'onerror' in value;
}

function openDb(options: IndexedDbAssetsOptions): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = getIndexedDb().open(options.dbName, getDbVersion(options));
        const storeName = getStoreName(options);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(storeName)) {
                const store = db.createObjectStore(storeName, { keyPath: 'assetId' });
                store.createIndex('by_doc', 'docId', { unique: false });
                return;
            }

            const tx = request.transaction;
            if (!tx) return;

            const store = tx.objectStore(storeName);
            const getAllRequest = store.getAll();
            getAllRequest.onsuccess = () => {
                const assets = (getAllRequest.result as StoredIndexedDbAsset[] | undefined) ?? [];
                assets.forEach((asset) => {
                    const migratedAsset: StoredIndexedDbAsset = {
                        ...asset,
                        deletedAt: typeof asset.deletedAt === 'number' ? asset.deletedAt : null,
                        lastReferencedAt: typeof asset.lastReferencedAt === 'number'
                            ? asset.lastReferencedAt
                            : asset.createdAt,
                    };
                    store.put(migratedAsset);
                });
            };
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB asset database'));
    });
}

async function withStore<T>(
    options: IndexedDbAssetsOptions,
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T> | T
): Promise<T> {
    const db = await openDb(options);
    const storeName = getStoreName(options);

    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        let result: T | undefined;
        let settled = false;
        let pendingError: unknown;

        const settleResolve = () => {
            if (settled) return;
            settled = true;
            db.close();
            resolve(result as T);
        };

        const settleReject = (error: unknown) => {
            if (settled) return;
            settled = true;
            db.close();
            reject(error);
        };

        tx.oncomplete = settleResolve;
        tx.onerror = () => {
            settleReject(pendingError ?? tx.error ?? new Error('IndexedDB asset transaction failed'));
        };
        tx.onabort = () => {
            settleReject(pendingError ?? tx.error ?? new Error('IndexedDB asset transaction aborted'));
        };

        try {
            const requestOrResult = fn(store);
            if (isIndexedDbRequest<T>(requestOrResult)) {
                requestOrResult.onsuccess = () => {
                    result = requestOrResult.result;
                };
                requestOrResult.onerror = () => {
                    pendingError = requestOrResult.error ?? new Error('IndexedDB asset request failed');
                };
            } else {
                result = requestOrResult;
            }
        } catch (error) {
            pendingError = error;
            try {
                tx.abort();
            } catch {
                settleReject(error);
            }
        }
    });
}

async function getAllAssets(options: IndexedDbAssetsOptions): Promise<StoredIndexedDbAsset[]> {
    return withStore(options, 'readonly', (store) => store.getAll());
}

async function putAsset(options: IndexedDbAssetsOptions, asset: StoredIndexedDbAsset): Promise<void> {
    await withStore<IDBValidKey>(options, 'readwrite', (store) => store.put(asset));
}

async function deleteAsset(options: IndexedDbAssetsOptions, assetId: string): Promise<void> {
    await withStore<undefined>(options, 'readwrite', (store) => store.delete(assetId));
}

async function getMatchingAssets(
    options: IndexedDbAssetsOptions,
    input: {
        docId: string;
        nodeId: string;
        propertyName: string;
    }
): Promise<StoredIndexedDbAsset[]> {
    const allAssets = await getAllAssets(options);
    return allAssets.filter(
        (asset) =>
            asset.docId === input.docId &&
            asset.nodeId === input.nodeId &&
            asset.propertyName === input.propertyName
    );
}

async function softDeleteMatchingAssets(
    options: IndexedDbAssetsOptions,
    input: {
        docId: string;
        nodeId: string;
        propertyName: string;
        now: number;
    }
): Promise<void> {
    const matches = await getMatchingAssets(options, input);

    await Promise.all(
        matches.map(async (asset) => {
            if (asset.deletedAt !== null) return;
            await putAsset(options, {
                ...asset,
                deletedAt: input.now,
            });
        })
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function collectReferencedAssetIds(value: unknown, target: Set<string>): void {
    if (Array.isArray(value)) {
        value.forEach((item) => collectReferencedAssetIds(item, target));
        return;
    }

    if (!isRecord(value)) {
        return;
    }

    if (typeof value.assetId === 'string' && value.assetId.trim().length > 0) {
        target.add(value.assetId);
    }

    Object.values(value).forEach((childValue) => {
        collectReferencedAssetIds(childValue, target);
    });
}

function revokeCachedAssetUrl(options: IndexedDbAssetsOptions, assetId: string): void {
    const cacheKey = getCacheKey(options, assetId);
    const existingUrl = objectUrlCache.get(cacheKey);
    if (!existingUrl) return;

    URL.revokeObjectURL(existingUrl);
    objectUrlCache.delete(cacheKey);
}

export async function getIndexedDbAssetUrl(
    options: IndexedDbAssetsOptions,
    assetId: string
): Promise<string | null> {
    const cacheKey = getCacheKey(options, assetId);
    const cached = objectUrlCache.get(cacheKey);
    if (cached) return cached;

    const asset = await withStore<StoredIndexedDbAsset | undefined>(
        options,
        'readonly',
        (store) => store.get(assetId)
    );
    if (!asset) return null;

    const objectUrl = URL.createObjectURL(asset.blob);
    objectUrlCache.set(cacheKey, objectUrl);
    return objectUrl;
}

export async function rehydrateAssetUrls(
    value: unknown,
    resolveAssetUrl: (assetId: string) => Promise<string | null>
): Promise<unknown> {
    if (Array.isArray(value)) {
        return Promise.all(value.map((item) => rehydrateAssetUrls(item, resolveAssetUrl)));
    }

    if (!isRecord(value)) {
        return value;
    }

    const next: Record<string, unknown> = {};
    for (const [key, childValue] of Object.entries(value)) {
        next[key] = await rehydrateAssetUrls(childValue, resolveAssetUrl);
    }

    const assetId = typeof next.assetId === 'string' ? next.assetId : null;
    const hasUrlField = Object.prototype.hasOwnProperty.call(next, 'url');
    const url = typeof next.url === 'string' ? next.url : '';
    if (assetId && hasUrlField) {
        const resolvedUrl = await resolveAssetUrl(assetId);
        next.url = resolvedUrl ?? (url.startsWith('blob:') ? '' : url);
    }

    return next;
}

export async function rehydrateIndexedDbAssetUrls(
    value: unknown,
    options: IndexedDbAssetsOptions
): Promise<unknown> {
    return rehydrateAssetUrls(value, (assetId) => getIndexedDbAssetUrl(options, assetId));
}

export async function reconcileIndexedDbGraphAssets(
    options: IndexedDbAssetsOptions,
    input: {
        docId: string;
        graphData: unknown;
        hardDeleteAfterMs?: number;
        now?: number;
    }
): Promise<void> {
    const assets = await getAllAssets(options);
    const referencedAssetIds = new Set<string>();
    collectReferencedAssetIds(input.graphData, referencedAssetIds);

    const now = input.now ?? Date.now();
    const hardDeleteAfterMs = input.hardDeleteAfterMs ?? getHardDeleteAfterMs(options);
    const scopedAssets = assets.filter((asset) => asset.docId === input.docId);

    await Promise.all(
        scopedAssets.map(async (asset) => {
            const isReferenced = referencedAssetIds.has(asset.assetId);

            if (isReferenced) {
                const shouldRestore = asset.deletedAt !== null || asset.lastReferencedAt !== now;
                if (!shouldRestore) return;

                await putAsset(options, {
                    ...asset,
                    deletedAt: null,
                    lastReferencedAt: now,
                });
                return;
            }

            if (asset.deletedAt === null) {
                await putAsset(options, {
                    ...asset,
                    deletedAt: now,
                });
                return;
            }

            if (now - asset.deletedAt >= hardDeleteAfterMs) {
                revokeCachedAssetUrl(options, asset.assetId);
                await deleteAsset(options, asset.assetId);
            }
        })
    );
}

export function createIndexedDbAssetsAdapter(
    options: IndexedDbAssetsOptions
): EditorAssetsAdapter<IndexedDbAssetsRef> {
    return {
        async uploadAndLinkAsset(input) {
            if (input.replaceExisting) {
                await softDeleteMatchingAssets(options, {
                    docId: input.ref.docId,
                    nodeId: input.nodeId,
                    propertyName: input.propertyName,
                    now: Date.now(),
                });
            }

            const now = Date.now();
            const assetId = `${options.assetIdPrefix}:${input.ref.docId}:${now}:${Math.floor(Math.random() * 10000)}`;
            const objectUrl = URL.createObjectURL(input.file);
            objectUrlCache.set(getCacheKey(options, assetId), objectUrl);

            await putAsset(options, {
                assetId,
                docId: input.ref.docId,
                nodeId: input.nodeId,
                propertyName: input.propertyName,
                fileName: input.file.name,
                mimeType: input.file.type || 'application/octet-stream',
                blob: input.file,
                createdAt: now,
                deletedAt: null,
                lastReferencedAt: now,
            });

            return {
                assetId,
                url: objectUrl,
            };
        },

        async unlinkAsset(input) {
            await softDeleteMatchingAssets(options, {
                docId: input.ref.docId,
                nodeId: input.nodeId,
                propertyName: input.propertyName,
                now: Date.now(),
            });
        },

        async reconcileGraphAssets(input) {
            await reconcileIndexedDbGraphAssets(options, {
                docId: input.ref.docId,
                graphData: input.graphData,
                hardDeleteAfterMs: input.hardDeleteAfterMs,
                now: input.now,
            });
        },
    };
}
