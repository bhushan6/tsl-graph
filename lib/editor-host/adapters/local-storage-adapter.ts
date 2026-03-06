import type {
    EditorAssetsAdapter,
    EditorHostServices,
    EditorPersistenceAdapter,
} from '../types';

export interface LocalStorageEditorRef {
    docId: string;
}

const getStorageKey = (ref: LocalStorageEditorRef) => `tsl-editor:${ref.docId}`;
const getAssetStorageKey = (ref: LocalStorageEditorRef, nodeId: string, propertyName: string) =>
    `tsl-editor:asset:${ref.docId}:${nodeId}:${propertyName}`;

const getStorage = (): Storage | null => {
    if (typeof globalThis.localStorage === 'undefined') {
        return null;
    }
    return globalThis.localStorage;
};

export function createLocalStorageEditorAdapter(): EditorPersistenceAdapter<LocalStorageEditorRef> {
    return {
        async load(ref) {
            const storage = getStorage();
            if (!storage) return null;

            const raw = storage.getItem(getStorageKey(ref));
            if (!raw) return null;

            try {
                const parsed = JSON.parse(raw) as { graphData?: unknown; projectName?: string } | unknown;

                if (
                    parsed &&
                    typeof parsed === 'object' &&
                    Object.prototype.hasOwnProperty.call(parsed, 'graphData')
                ) {
                    const payload = parsed as { graphData?: unknown; projectName?: string };
                    return {
                        graphData: payload.graphData,
                        projectName: payload.projectName,
                    };
                }

                return {
                    graphData: parsed,
                };
            } catch {
                return null;
            }
        },

        async save({ ref, graphData }) {
            const storage = getStorage();
            if (!storage) return;

            storage.setItem(
                getStorageKey(ref),
                JSON.stringify({
                    graphData,
                })
            );
        },
    };
}

function encodeFileToDataUrl(file: File): Promise<string> {
    return file.arrayBuffer().then((buffer) => {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        const chunkSize = 0x8000;

        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode(...chunk);
        }

        if (typeof globalThis.btoa !== 'function') {
            throw new Error('Base64 encoding is unavailable in this environment.');
        }

        const base64 = globalThis.btoa(binary);
        const mimeType = file.type || 'application/octet-stream';
        return `data:${mimeType};base64,${base64}`;
    });
}

export function createLocalStorageAssetsAdapter(): EditorAssetsAdapter<LocalStorageEditorRef> {
    return {
        async uploadAndLinkAsset(input) {
            const storage = getStorage();
            const url = await encodeFileToDataUrl(input.file);
            const assetId = `local:${input.ref.docId}:${Date.now()}:${Math.floor(Math.random() * 10000)}`;

            if (storage) {
                storage.setItem(
                    getAssetStorageKey(input.ref, input.nodeId, input.propertyName),
                    JSON.stringify({
                        assetId,
                        url,
                        updatedAt: Date.now(),
                    })
                );
            }

            return { assetId, url };
        },

        async unlinkAsset(input) {
            const storage = getStorage();
            if (!storage) return;
            storage.removeItem(getAssetStorageKey(input.ref, input.nodeId, input.propertyName));
        },
    };
}

export function createLocalStorageEditorServices(): EditorHostServices<LocalStorageEditorRef> {
    return {
        assets: createLocalStorageAssetsAdapter(),
    };
}
