import { createLocalStorageEditorAdapter, type LocalStorageEditorRef } from './local-storage-adapter';
import { getTutorialAssetUrl } from './tutorial-indexeddb-assets';
import type { EditorPersistenceAdapter } from '../types';

export interface TutorialPersistenceRef extends LocalStorageEditorRef {
    docId: string;
}

const basePersistence = createLocalStorageEditorAdapter();

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

async function rehydrateTutorialAssets(value: unknown): Promise<unknown> {
    if (Array.isArray(value)) {
        return Promise.all(value.map((item) => rehydrateTutorialAssets(item)));
    }

    if (!isRecord(value)) {
        return value;
    }

    const next: Record<string, unknown> = {};
    for (const [key, childValue] of Object.entries(value)) {
        next[key] = await rehydrateTutorialAssets(childValue);
    }

    const assetId = typeof next.assetId === 'string' ? next.assetId : null;
    const url = typeof next.url === 'string' ? next.url : null;
    if (assetId && url) {
        const resolvedUrl = await getTutorialAssetUrl(assetId);
        next.url = resolvedUrl ?? (url.startsWith('blob:') ? '' : url);
    }

    return next;
}

export function createTutorialPersistenceAdapter(): EditorPersistenceAdapter<TutorialPersistenceRef> {
    return {
        async load(ref) {
            const loaded = await basePersistence.load(ref);
            if (!loaded?.graphData) {
                return loaded;
            }

            return {
                ...loaded,
                graphData: await rehydrateTutorialAssets(loaded.graphData),
            };
        },

        async save(input) {
            await basePersistence.save(input);
        },
    };
}
