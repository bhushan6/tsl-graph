import type { EditorAssetsAdapter } from '../types';

export interface TutorialIndexedDbRef {
    docId: string;
}

const DB_NAME = 'tsl-tutorial-assets';
const DB_VERSION = 1;
const STORE_NAME = 'assets';

type StoredTutorialAsset = {
    assetId: string;
    docId: string;
    nodeId: string;
    propertyName: string;
    fileName: string;
    mimeType: string;
    blob: Blob;
    createdAt: number;
};

const objectUrlCache = new Map<string, string>();

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'assetId' });
                store.createIndex('by_doc', 'docId', { unique: false });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Failed to open tutorial asset database'));
    });
}

async function getAllAssets(): Promise<StoredTutorialAsset[]> {
    return withStore<StoredTutorialAsset[]>('readonly', (store) => store.getAll());
}

async function withStore<T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>
): Promise<T> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);

        Promise.resolve(fn(store))
            .then((result) => {
                tx.oncomplete = () => resolve(result as T);
                tx.onerror = () => reject(tx.error ?? new Error('Tutorial asset transaction failed'));
            })
            .catch((error) => {
                reject(error);
                tx.abort();
            });
    });
}

async function putAsset(asset: StoredTutorialAsset): Promise<void> {
    await withStore('readwrite', (store) => store.put(asset));
}

async function deleteAsset(assetId: string): Promise<void> {
    await withStore('readwrite', (store) => store.delete(assetId));
}

async function getMatchingAssets(input: {
    docId: string;
    nodeId: string;
    propertyName: string;
}): Promise<StoredTutorialAsset[]> {
    const allAssets = await getAllAssets();
    return allAssets.filter(
        (asset) =>
            asset.docId === input.docId &&
            asset.nodeId === input.nodeId &&
            asset.propertyName === input.propertyName
    );
}

async function deleteMatchingAssets(input: {
    docId: string;
    nodeId: string;
    propertyName: string;
}): Promise<void> {
    const matches = await getMatchingAssets(input);

    await Promise.all(
        matches.map(async (asset) => {
            const existingUrl = objectUrlCache.get(asset.assetId);
            if (existingUrl) {
                URL.revokeObjectURL(existingUrl);
                objectUrlCache.delete(asset.assetId);
            }

            await deleteAsset(asset.assetId);
        })
    );
}

export async function getTutorialAssetUrl(assetId: string): Promise<string | null> {
    const cached = objectUrlCache.get(assetId);
    if (cached) return cached;

    const asset = await withStore<StoredTutorialAsset | undefined>('readonly', (store) => store.get(assetId));
    if (!asset) return null;

    const objectUrl = URL.createObjectURL(asset.blob);
    objectUrlCache.set(assetId, objectUrl);
    return objectUrl;
}

export function createTutorialIndexedDbAssetsAdapter(): EditorAssetsAdapter<TutorialIndexedDbRef> {
    return {
        async uploadAndLinkAsset(input) {
            if (input.replaceExisting) {
                await deleteMatchingAssets({
                    docId: input.ref.docId,
                    nodeId: input.nodeId,
                    propertyName: input.propertyName,
                });
            }

            const assetId = `tutorial:${input.ref.docId}:${Date.now()}:${Math.floor(Math.random() * 10000)}`;
            const objectUrl = URL.createObjectURL(input.file);

            objectUrlCache.set(assetId, objectUrl);

            await putAsset({
                assetId,
                docId: input.ref.docId,
                nodeId: input.nodeId,
                propertyName: input.propertyName,
                fileName: input.file.name,
                mimeType: input.file.type || 'application/octet-stream',
                blob: input.file,
                createdAt: Date.now(),
            });

            return {
                assetId,
                url: objectUrl,
            };
        },

        async unlinkAsset(input) {
            const matches = await getMatchingAssets({
                docId: input.ref.docId,
                nodeId: input.nodeId,
                propertyName: input.propertyName,
            });

            await Promise.all(
                matches.map(async (asset) => {
                    const existingUrl = objectUrlCache.get(asset.assetId);
                    if (existingUrl) {
                        URL.revokeObjectURL(existingUrl);
                        objectUrlCache.delete(asset.assetId);
                    }

                    await deleteAsset(asset.assetId);
                })
            );
        },
    };
}
