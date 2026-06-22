import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '@/store/editor';
import { createEditorAssetReconcilerController } from './use-editor-persistence';

describe('editor asset reconciler controller', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        useEditorStore.getState().resetEditor();
        vi.useFakeTimers();
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
        consoleErrorSpy.mockRestore();
    });

    it('debounces graph reconciliation and runs once for burst structural edits', async () => {
        const reconcileGraphAssets = vi.fn().mockResolvedValue(undefined);
        const controller = createEditorAssetReconcilerController({
            ref: { docId: 'tutorial-sandbox' },
            assets: {
                uploadAndLinkAsset: vi.fn(),
                unlinkAsset: vi.fn(),
                reconcileGraphAssets,
            },
            debounceMs: 200,
        });

        await vi.advanceTimersByTimeAsync(100);
        useEditorStore.getState().addNode('const/float', { x: 10, y: 20 });

        await vi.advanceTimersByTimeAsync(100);
        useEditorStore.getState().addNode('math/add', { x: 120, y: 20 });

        await vi.advanceTimersByTimeAsync(199);
        expect(reconcileGraphAssets).toHaveBeenCalledTimes(0);

        await vi.advanceTimersByTimeAsync(1);
        expect(reconcileGraphAssets).toHaveBeenCalledTimes(1);
        expect(reconcileGraphAssets).toHaveBeenCalledWith(
            expect.objectContaining({
                ref: { docId: 'tutorial-sandbox' },
                graphData: expect.objectContaining({
                    nodes: expect.arrayContaining([
                        expect.objectContaining({ data: expect.objectContaining({ type: 'const/float' }) }),
                        expect.objectContaining({ data: expect.objectContaining({ type: 'math/add' }) }),
                    ]),
                }),
            })
        );

        controller.dispose();
    });

    it('schedules an initial reconciliation for already-loaded graph state', async () => {
        const loaded = useEditorStore.getState().loadFromJSON(JSON.stringify({
            version: 2,
            activeRootGraph: 'material',
            nodes: [
                {
                    id: 'node-texture',
                    type: 'texture/sample',
                    position: { x: 0, y: 0 },
                    data: {
                        type: 'texture/sample',
                        values: {
                            url: {
                                assetId: 'standalone:landing-demo:1',
                                url: 'blob:stale',
                            },
                        },
                        connected: {},
                    },
                },
            ],
            edges: [],
            postNodes: [],
            postEdges: [],
            globals: [],
            subgraphs: {},
            codeNodes: {},
        }));

        expect(loaded).toBe(true);

        const reconcileGraphAssets = vi.fn().mockResolvedValue(undefined);
        const controller = createEditorAssetReconcilerController({
            ref: { docId: 'landing-demo' },
            assets: {
                uploadAndLinkAsset: vi.fn(),
                unlinkAsset: vi.fn(),
                reconcileGraphAssets,
            },
            debounceMs: 50,
            hardDeleteAfterMs: 1234,
        });

        await vi.advanceTimersByTimeAsync(49);
        expect(reconcileGraphAssets).toHaveBeenCalledTimes(0);

        await vi.advanceTimersByTimeAsync(1);
        expect(reconcileGraphAssets).toHaveBeenCalledTimes(1);
        expect(reconcileGraphAssets).toHaveBeenCalledWith(
            expect.objectContaining({
                ref: { docId: 'landing-demo' },
                hardDeleteAfterMs: 1234,
                graphData: expect.objectContaining({
                    nodes: expect.arrayContaining([
                        expect.objectContaining({ data: expect.objectContaining({ type: 'texture/sample' }) }),
                    ]),
                }),
            })
        );

        controller.dispose();
    });
});
