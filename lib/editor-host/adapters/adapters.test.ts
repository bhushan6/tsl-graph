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

describe('editor host adapters', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
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
});
