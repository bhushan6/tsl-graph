import {
    createIndexedDbAssetsAdapter,
    getIndexedDbAssetUrl,
    rehydrateIndexedDbAssetUrls,
    type IndexedDbAssetsOptions,
} from './indexeddb-assets';
import type { EditorAssetsAdapter } from '../types';

export interface StandaloneIndexedDbRef {
    docId: string;
}

const STANDALONE_INDEXEDDB_ASSETS_OPTIONS: IndexedDbAssetsOptions = {
    dbName: 'tsl-standalone-assets',
    assetIdPrefix: 'standalone',
};

export async function getStandaloneAssetUrl(assetId: string): Promise<string | null> {
    return getIndexedDbAssetUrl(STANDALONE_INDEXEDDB_ASSETS_OPTIONS, assetId);
}

export async function rehydrateStandaloneIndexedDbAssetUrls(value: unknown): Promise<unknown> {
    return rehydrateIndexedDbAssetUrls(value, STANDALONE_INDEXEDDB_ASSETS_OPTIONS);
}

export function createStandaloneIndexedDbAssetsAdapter(): EditorAssetsAdapter<StandaloneIndexedDbRef> {
    return createIndexedDbAssetsAdapter(STANDALONE_INDEXEDDB_ASSETS_OPTIONS);
}
