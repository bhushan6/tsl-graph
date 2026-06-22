import {
    createIndexedDbAssetsAdapter,
    getIndexedDbAssetUrl,
    type IndexedDbAssetsOptions,
} from './indexeddb-assets';
import type { EditorAssetsAdapter } from '../types';

export interface TutorialIndexedDbRef {
    docId: string;
}

const TUTORIAL_INDEXEDDB_ASSETS_OPTIONS: IndexedDbAssetsOptions = {
    dbName: 'tsl-tutorial-assets',
    assetIdPrefix: 'tutorial',
};

export async function getTutorialAssetUrl(assetId: string): Promise<string | null> {
    return getIndexedDbAssetUrl(TUTORIAL_INDEXEDDB_ASSETS_OPTIONS, assetId);
}

export function createTutorialIndexedDbAssetsAdapter(): EditorAssetsAdapter<TutorialIndexedDbRef> {
    return createIndexedDbAssetsAdapter(TUTORIAL_INDEXEDDB_ASSETS_OPTIONS);
}
