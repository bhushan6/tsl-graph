import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import type { ConvexReactClient } from 'convex/react';
import {
    createConvexAssetsAdapter,
    createConvexProjectAdapter,
    createConvexProjectServices,
} from './convex-adapter';
import {
    createLocalStorageAssetsAdapter,
    createLocalStorageEditorAdapter,
} from './local-storage-adapter';
import {
    createIndexedDbAssetsAdapter,
    rehydrateAssetUrls,
    rehydrateIndexedDbAssetUrls,
    type IndexedDbAssetsOptions,
} from './indexeddb-assets';
import { createPostMessageEditorAdapter } from './postmessage-adapter';

type MutableIdbRequest<T> = {
    result: T;
    error: DOMException | null;
    onsuccess: ((this: IDBRequest<T>, ev: Event) => unknown) | null;
    onerror: ((this: IDBRequest<T>, ev: Event) => unknown) | null;
    onupgradeneeded?: ((this: IDBOpenDBRequest, ev: IDBVersionChangeEvent) => unknown) | null;
};

function createMutableRequest<T>(): MutableIdbRequest<T> {
    return {
        result: undefined as T,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
    };
}

function createFakeIndexedDb(): IDBFactory {
    type DbRecord = {
        version: number;
        stores: Map<string, Map<string, unknown>>;
    };

    class FakeObjectStore {
        constructor(
            private readonly records: Map<string, unknown>,
            private readonly transaction?: FakeTransaction
        ) { }

        createIndex() {
            return {};
        }

        get(assetId: string): IDBRequest<unknown> {
            return this.queue(() => this.records.get(assetId));
        }

        getAll(): IDBRequest<unknown[]> {
            return this.queue(() => Array.from(this.records.values()));
        }

        put(value: unknown): IDBRequest<IDBValidKey> {
            return this.queue<IDBValidKey>(() => {
                if (!value || typeof value !== 'object' || !('assetId' in value)) {
                    throw new DOMException('Missing assetId');
                }

                const assetId = String((value as { assetId: unknown }).assetId);
                this.records.set(assetId, value);
                return assetId;
            });
        }

        delete(assetId: string): IDBRequest<undefined> {
            return this.queue(() => {
                this.records.delete(assetId);
                return undefined;
            });
        }

        private queue<T>(operation: () => T): IDBRequest<T> {
            if (!this.transaction) {
                throw new DOMException('Object store operation requires a transaction');
            }

            return this.transaction.queue(operation);
        }
    }

    class FakeTransaction {
        oncomplete: ((this: IDBTransaction, ev: Event) => unknown) | null = null;
        onerror: ((this: IDBTransaction, ev: Event) => unknown) | null = null;
        onabort: ((this: IDBTransaction, ev: Event) => unknown) | null = null;
        error: DOMException | null = null;
        private aborted = false;

        constructor(private readonly records: Map<string, unknown>) { }

        objectStore(): IDBObjectStore {
            return new FakeObjectStore(this.records, this) as unknown as IDBObjectStore;
        }

        abort() {
            this.aborted = true;
            this.onabort?.call(this as unknown as IDBTransaction, new Event('abort'));
        }

        queue<T>(operation: () => T): IDBRequest<T> {
            const request = createMutableRequest<T>();

            queueMicrotask(() => {
                if (this.aborted) return;

                try {
                    request.result = operation();
                    request.onsuccess?.call(request as unknown as IDBRequest<T>, new Event('success'));
                    if (!this.aborted) {
                        this.oncomplete?.call(this as unknown as IDBTransaction, new Event('complete'));
                    }
                } catch (error) {
                    const domError = error instanceof DOMException
                        ? error
                        : new DOMException(error instanceof Error ? error.message : 'IndexedDB operation failed');
                    request.error = domError;
                    this.error = domError;
                    request.onerror?.call(request as unknown as IDBRequest<T>, new Event('error'));
                    this.onerror?.call(this as unknown as IDBTransaction, new Event('error'));
                }
            });

            return request as unknown as IDBRequest<T>;
        }
    }

    class FakeDatabase {
        objectStoreNames = {
            contains: (storeName: string) => this.record.stores.has(storeName),
        };

        constructor(private readonly record: DbRecord) { }

        createObjectStore(storeName: string): IDBObjectStore {
            const records = new Map<string, unknown>();
            this.record.stores.set(storeName, records);
            return new FakeObjectStore(records) as unknown as IDBObjectStore;
        }

        transaction(storeName: string): IDBTransaction {
            const records = this.record.stores.get(storeName);
            if (!records) {
                throw new DOMException(`Object store ${storeName} does not exist`);
            }

            return new FakeTransaction(records) as unknown as IDBTransaction;
        }

        close() { }
    }

    const databases = new Map<string, DbRecord>();

    return {
        open: vi.fn((name: string, version?: number) => {
            const request = createMutableRequest<IDBDatabase>();

            queueMicrotask(() => {
                const requestedVersion = version ?? 1;
                let record = databases.get(name);
                const needsUpgrade = !record || requestedVersion > record.version;

                if (!record) {
                    record = {
                        version: requestedVersion,
                        stores: new Map(),
                    };
                    databases.set(name, record);
                } else if (requestedVersion > record.version) {
                    record.version = requestedVersion;
                }

                request.result = new FakeDatabase(record) as unknown as IDBDatabase;

                if (needsUpgrade) {
                    request.onupgradeneeded?.call(
                        request as unknown as IDBOpenDBRequest,
                        new Event('upgradeneeded') as IDBVersionChangeEvent
                    );
                }

                request.onsuccess?.call(request as unknown as IDBRequest<IDBDatabase>, new Event('success'));
            });

            return request as unknown as IDBOpenDBRequest;
        }),
    } as unknown as IDBFactory;
}

describe('editor host adapters', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('convex adapter loads and saves graph data via projects API', async () => {
        const convex = {
            query: vi.fn().mockResolvedValue({
                _id: 'project-1',
                name: 'My Project',
                graphData: { version: 2, nodes: [], edges: [] },
            }),
            mutation: vi.fn().mockResolvedValue(undefined),
        };

        const adapter = createConvexProjectAdapter(convex as unknown as ConvexReactClient);

        const loaded = await adapter.load({ projectId: 'project-1' as Id<'projects'> });
        expect(convex.query).toHaveBeenCalledWith(api.projects.get, { id: 'project-1' });
        expect(loaded).toEqual({
            graphData: { version: 2, nodes: [], edges: [] },
            projectName: 'My Project',
        });

        await adapter.save({
            ref: { projectId: 'project-1' as Id<'projects'> },
            graphData: { version: 2, nodes: [{ id: 'n1' }], edges: [] },
            reason: 'autosave',
        });

        expect(convex.mutation).toHaveBeenCalledWith(api.projects.update, {
            id: 'project-1',
            graphData: { version: 2, nodes: [{ id: 'n1' }], edges: [] },
        });
    });

    it('localStorage adapter round-trips graph data', async () => {
        const data = new Map<string, string>();

        const localStorageMock = {
            getItem: vi.fn((key: string) => data.get(key) ?? null),
            setItem: vi.fn((key: string, value: string) => {
                data.set(key, value);
            }),
            removeItem: vi.fn((key: string) => {
                data.delete(key);
            }),
            clear: vi.fn(() => {
                data.clear();
            }),
            key: vi.fn(),
            length: 0,
        };

        vi.stubGlobal('localStorage', localStorageMock);

        const adapter = createLocalStorageEditorAdapter();

        await adapter.save({
            ref: { docId: 'doc-a' },
            graphData: { version: 2, nodes: [{ id: 'n1' }], edges: [] },
            reason: 'manual',
        });

        expect(localStorageMock.setItem).toHaveBeenCalledTimes(1);

        const loaded = await adapter.load({ docId: 'doc-a' });
        expect(loaded).toEqual({
            graphData: { version: 2, nodes: [{ id: 'n1' }], edges: [] },
            projectName: undefined,
        });
    });

    it('convex assets adapter uploads and links through host service boundaries', async () => {
        const convex = {
            query: vi.fn(),
            mutation: vi.fn()
                .mockResolvedValueOnce(undefined)
                .mockResolvedValueOnce('https://upload.example')
                .mockResolvedValueOnce({
                    assetId: 'asset-1',
                    url: 'https://cdn.example/asset.png',
                })
                .mockResolvedValueOnce(undefined),
        };

        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({ storageId: 'storage-1' }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const adapter = createConvexAssetsAdapter(convex as unknown as ConvexReactClient);
        const file = new File(['file-content'], 'texture.png', { type: 'image/png' });

        const result = await adapter.uploadAndLinkAsset({
            ref: { projectId: 'project-1' as Id<'projects'> },
            nodeId: 'node-1',
            propertyName: 'texture',
            file,
            replaceExisting: true,
        });

        expect(result).toEqual({
            assetId: 'asset-1',
            url: 'https://cdn.example/asset.png',
        });
        expect(fetchMock).toHaveBeenCalledWith('https://upload.example', expect.objectContaining({
            method: 'POST',
        }));
        expect(convex.mutation).toHaveBeenCalledWith(api.assets.unlinkAssetFromNode, {
            nodeId: 'node-1',
            graphId: 'project-1',
            propertyName: 'texture',
        });
        expect(convex.mutation).toHaveBeenCalledWith(api.assets.linkAssetToNode, {
            assetId: 'asset-1',
            nodeId: 'node-1',
            graphId: 'project-1',
            propertyName: 'texture',
        });
    });

    it('convex project service uploads thumbnails through adapter boundary', async () => {
        const convex = {
            query: vi.fn(),
            mutation: vi.fn()
                .mockResolvedValueOnce('https://upload.example/thumbnail')
                .mockResolvedValueOnce(undefined),
        };
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({ storageId: 'storage-1' }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const services = createConvexProjectServices(convex as unknown as ConvexReactClient);
        const result = await services.project?.uploadThumbnail?.({
            ref: { projectId: 'project-1' as Id<'projects'> },
            blob: new Blob(['thumb'], { type: 'image/jpeg' }),
            mimeType: 'image/jpeg',
        });

        expect(result).toEqual({ storageId: 'storage-1' });
        expect(fetchMock).toHaveBeenCalledWith('https://upload.example/thumbnail', expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'image/jpeg' },
        }));
        expect(convex.mutation).toHaveBeenCalledWith(api.projects.updateThumbnail, {
            id: 'project-1',
            storageId: 'storage-1',
        });
    });

    it('local assets adapter can upload and unlink without backend', async () => {
        const data = new Map<string, string>();
        const localStorageMock = {
            getItem: vi.fn((key: string) => data.get(key) ?? null),
            setItem: vi.fn((key: string, value: string) => {
                data.set(key, value);
            }),
            removeItem: vi.fn((key: string) => {
                data.delete(key);
            }),
            clear: vi.fn(() => {
                data.clear();
            }),
            key: vi.fn(),
            length: 0,
        };
        vi.stubGlobal('localStorage', localStorageMock);
        vi.stubGlobal('btoa', ((input: string) => Buffer.from(input, 'binary').toString('base64')) as typeof btoa);

        const adapter = createLocalStorageAssetsAdapter();
        const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });

        const result = await adapter.uploadAndLinkAsset({
            ref: { docId: 'standalone' },
            nodeId: 'node-1',
            propertyName: 'map',
            file,
        });

        expect(result.assetId).toContain('local:standalone:');
        expect(result.url).toBe('data:text/plain;base64,aGVsbG8=');
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
            'tsl-editor:asset:standalone:node-1:map',
            expect.any(String)
        );

        await adapter.unlinkAsset({
            ref: { docId: 'standalone' },
            nodeId: 'node-1',
            propertyName: 'map',
        });

        expect(localStorageMock.removeItem).toHaveBeenCalledWith('tsl-editor:asset:standalone:node-1:map');
    });

    it('rehydrates asset urls and clears stale blob urls when assets are missing', async () => {
        const hydrated = await rehydrateAssetUrls(
            {
                values: [
                    { assetId: 'asset-live', url: 'blob:stale-live' },
                    { assetId: 'asset-missing-blob', url: 'blob:stale-missing' },
                    { assetId: 'asset-missing-remote', url: 'https://example.com/texture.png' },
                ],
            },
            async (assetId) => assetId === 'asset-live' ? 'blob:fresh-live' : null
        );

        const values = (hydrated as { values: Array<{ url: string }> }).values;
        expect(values[0].url).toBe('blob:fresh-live');
        expect(values[1].url).toBe('');
        expect(values[2].url).toBe('https://example.com/texture.png');
    });

    it('indexeddb assets adapter soft deletes unused blobs and eventually hard deletes them', async () => {
        vi.stubGlobal('indexedDB', createFakeIndexedDb());

        let objectUrlCount = 0;
        const createObjectUrl = vi
            .spyOn(URL, 'createObjectURL')
            .mockImplementation((blob) => `blob:${blob instanceof Blob ? blob.type : 'media'}:${objectUrlCount += 1}`);
        const revokeObjectUrl = vi
            .spyOn(URL, 'revokeObjectURL')
            .mockImplementation(() => undefined);

        const options: IndexedDbAssetsOptions = {
            dbName: 'test-indexeddb-assets',
            assetIdPrefix: 'test',
        };
        const adapter = createIndexedDbAssetsAdapter(options);
        const file = new File(['image-content'], 'texture.png', { type: 'image/png' });

        const result = await adapter.uploadAndLinkAsset({
            ref: { docId: 'doc-a' },
            nodeId: 'node-1',
            propertyName: 'url',
            file,
        });

        expect(result.assetId).toContain('test:doc-a:');
        expect(result.url).toBe('blob:image/png:1');
        expect(createObjectUrl).toHaveBeenCalledTimes(1);

        const hydrated = await rehydrateIndexedDbAssetUrls(
            { value: { assetId: result.assetId, url: 'blob:stale' } },
            options
        );

        expect((hydrated as { value: { url: string } }).value.url).toBe(result.url);

        await adapter.unlinkAsset({
            ref: { docId: 'doc-a' },
            nodeId: 'node-1',
            propertyName: 'url',
        });

        expect(revokeObjectUrl).not.toHaveBeenCalled();

        const softDeleted = await rehydrateIndexedDbAssetUrls(
            { value: { assetId: result.assetId, url: 'blob:stale-after-unlink' } },
            options
        );

        expect((softDeleted as { value: { url: string } }).value.url).toBe(result.url);

        await adapter.reconcileGraphAssets?.({
            ref: { docId: 'doc-a' },
            graphData: {
                version: 2,
                nodes: [{ data: { values: { url: { assetId: result.assetId, url: result.url } } } }],
                edges: [],
            },
            now: 1000,
        });

        const restored = await rehydrateIndexedDbAssetUrls(
            { value: { assetId: result.assetId, url: 'blob:stale-after-restore' } },
            options
        );

        expect((restored as { value: { url: string } }).value.url).toBe(result.url);

        await adapter.reconcileGraphAssets?.({
            ref: { docId: 'doc-a' },
            graphData: { version: 2, nodes: [], edges: [] },
            hardDeleteAfterMs: 50,
            now: 1100,
        });

        expect(revokeObjectUrl).not.toHaveBeenCalled();

        await adapter.reconcileGraphAssets?.({
            ref: { docId: 'doc-a' },
            graphData: { version: 2, nodes: [], edges: [] },
            hardDeleteAfterMs: 50,
            now: 1150,
        });

        expect(revokeObjectUrl).toHaveBeenCalledWith(result.url);

        const missing = await rehydrateIndexedDbAssetUrls(
            { value: { assetId: result.assetId, url: 'blob:stale' } },
            options
        );

        expect((missing as { value: { url: string } }).value.url).toBe('');
    });

    function stubEmbeddedWindow(respond: (message: { type: string; requestId?: string }) => { source: unknown; origin: string } | null) {
        const listeners = new Set<(event: MessageEvent) => void>();
        const parentWindowMock = {
            postMessage: vi.fn((message: { type: string; requestId?: string }) => {
                const sender = respond(message);
                if (!sender) return;
                queueMicrotask(() => {
                    for (const listener of listeners) {
                        listener({
                            ...sender,
                            data: {
                                source: 'tsl-graph-host',
                                type: message.type.replace('request', 'response'),
                                requestId: message.requestId,
                                payload: { graphData: { version: 2, nodes: [], edges: [] } },
                            },
                        } as MessageEvent);
                    }
                });
            }),
        };
        vi.stubGlobal('window', {
            parent: parentWindowMock,
            addEventListener: (type: string, handler: (event: MessageEvent) => void) => {
                if (type === 'message') listeners.add(handler);
            },
            removeEventListener: (type: string, handler: (event: MessageEvent) => void) => {
                if (type === 'message') listeners.delete(handler);
            },
        } as unknown as Window & typeof globalThis);
        return parentWindowMock;
    }

    it('postMessage adapter ignores responses that do not come from the embedding window', async () => {
        const childFrame = {};
        stubEmbeddedWindow(() => ({ source: childFrame, origin: 'null' }));
        const adapter = createPostMessageEditorAdapter({ requestTimeoutMs: 20 });
        await expect(adapter.load({ docId: 'iframe-doc' })).resolves.toBeNull();
    });

    it('postMessage adapter pins host traffic to a configured origin', async () => {
        let origin = 'https://evil.test';
        const parent = stubEmbeddedWindow(() => ({ source: parent, origin }));
        const adapter = createPostMessageEditorAdapter({ targetOrigin: 'https://host.test/', requestTimeoutMs: 20 });

        await expect(adapter.load({ docId: 'iframe-doc' })).resolves.toBeNull();
        origin = 'https://host.test';
        await expect(adapter.load({ docId: 'iframe-doc' })).resolves.toEqual({
            graphData: { version: 2, nodes: [], edges: [] },
            projectName: undefined,
        });
        expect(parent.postMessage).toHaveBeenCalledWith(expect.anything(), 'https://host.test');
    });

    it('postMessage adapter refuses an invalid target origin instead of widening it', async () => {
        const parent = stubEmbeddedWindow(() => null);
        const adapter = createPostMessageEditorAdapter({ targetOrigin: 'host.test', requestTimeoutMs: 20 });
        await expect(adapter.load({ docId: 'iframe-doc' })).resolves.toBeNull();
        expect(parent.postMessage).not.toHaveBeenCalled();
    });

    it('postMessage adapter exchanges load/save payloads with host window', async () => {
        const listeners = new Set<(event: MessageEvent) => void>();
        const dispatchMessage = (data: unknown) => {
            for (const listener of listeners) {
                listener({ data, source: parentWindowMock, origin: 'https://host.test' } as unknown as MessageEvent);
            }
        };

        const parentPostMessage = vi.fn((message: { type: string; requestId?: string; payload?: unknown }) => {
            if (message.type === 'tsl:request:load') {
                queueMicrotask(() => {
                    dispatchMessage({
                        source: 'tsl-graph-host',
                        type: 'tsl:response:load',
                        requestId: message.requestId,
                        payload: {
                            graphData: { version: 2, nodes: [], edges: [] },
                            projectName: 'Iframe Project',
                        },
                    });
                });
            }

            if (message.type === 'tsl:request:save') {
                queueMicrotask(() => {
                    dispatchMessage({
                        source: 'tsl-graph-host',
                        type: 'tsl:response:save',
                        requestId: message.requestId,
                        payload: { ok: true },
                    });
                });
            }
        });

        const parentWindowMock = {
            postMessage: parentPostMessage,
        };

        const windowMock = {
            parent: parentWindowMock,
            addEventListener: vi.fn((type: string, handler: (event: MessageEvent) => void) => {
                if (type === 'message') {
                    listeners.add(handler);
                }
            }),
            removeEventListener: vi.fn((type: string, handler: (event: MessageEvent) => void) => {
                if (type === 'message') {
                    listeners.delete(handler);
                }
            }),
        };

        vi.stubGlobal('window', windowMock as unknown as Window & typeof globalThis);

        const adapter = createPostMessageEditorAdapter();

        const loaded = await adapter.load({ docId: 'iframe-doc' });
        expect(loaded).toEqual({
            graphData: { version: 2, nodes: [], edges: [] },
            projectName: 'Iframe Project',
        });

        await adapter.save({
            ref: { docId: 'iframe-doc' },
            graphData: { version: 2, nodes: [{ id: 'n1' }], edges: [] },
            reason: 'autosave',
        });

        expect(parentPostMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                source: 'tsl-graph-editor',
                type: 'tsl:request:load',
            }),
            '*'
        );
        expect(parentPostMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                source: 'tsl-graph-editor',
                type: 'tsl:request:save',
            }),
            '*'
        );
    });
});
