import { beforeEach, describe, expect, it } from 'vitest';
import type { SubgraphDefinition } from '@/lib/types';
import { useEditorStore } from './editor';

const SUBGRAPH_ID = 'custom/debug-preview-test';

function createSubgraph(): SubgraphDefinition {
    return {
        id: SUBGRAPH_ID,
        name: 'Debug Preview Test',
        scope: 'project',
        inputs: [{ id: 'in_0', label: 'Input 1', type: 'any' }],
        outputs: [{ id: 'out_0', label: 'Output 1', type: 'any' }],
        nodes: [],
        edges: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
}

describe('Editor debug preview UI state', () => {
    beforeEach(() => {
        useEditorStore.getState().resetEditor();
    });

    it('toggles active preview nodes without dirtying or versioning the graph', () => {
        const initialVersion = useEditorStore.getState().graphStructureVersion;

        useEditorStore.getState().toggleDebugPreviewActive('node-1');

        expect(useEditorStore.getState().activeDebugPreviewNodeIds).toEqual(['node-1']);
        expect(useEditorStore.getState().graphStructureVersion).toBe(initialVersion);
        expect(useEditorStore.getState().isDirty).toBe(false);

        useEditorStore.getState().toggleDebugPreviewActive('node-1');

        expect(useEditorStore.getState().activeDebugPreviewNodeIds).toEqual([]);
        expect(useEditorStore.getState().graphStructureVersion).toBe(initialVersion);
        expect(useEditorStore.getState().isDirty).toBe(false);
    });

    it('keeps only one active preview in the main post graph', () => {
        const store = useEditorStore.getState();
        store.setActiveRootGraph('post');

        const initialVersion = useEditorStore.getState().graphStructureVersion;
        store.toggleDebugPreviewActive('node-1');
        store.toggleDebugPreviewActive('node-2');

        expect(useEditorStore.getState().activeDebugPreviewNodeIds).toEqual(['node-2']);
        expect(useEditorStore.getState().graphStructureVersion).toBe(initialVersion);
        expect(useEditorStore.getState().isDirty).toBe(false);

        useEditorStore.getState().toggleDebugPreviewActive('node-2');

        expect(useEditorStore.getState().activeDebugPreviewNodeIds).toEqual([]);
    });

    it('tracks preview errors as resettable UI-only state', () => {
        useEditorStore.getState().setDebugPreviewError('node-1', 'Failed');
        expect(useEditorStore.getState().debugPreviewErrors).toEqual({ 'node-1': 'Failed' });

        useEditorStore.getState().setDebugPreviewError('node-1', null);
        expect(useEditorStore.getState().debugPreviewErrors).toEqual({});

        useEditorStore.getState().setDebugPreviewError('node-2', 'Still failed');
        useEditorStore.getState().clearDebugPreviewErrors();
        expect(useEditorStore.getState().debugPreviewErrors).toEqual({});
    });

    it('stores the post debug output builder as resettable UI-only state', () => {
        const initialVersion = useEditorStore.getState().graphStructureVersion;
        const builder = () => ({
            outputNode: null,
            update: () => {},
        });

        useEditorStore.getState().setPostDebugPreviewOutputBuilder(builder);

        expect(useEditorStore.getState().postDebugPreviewOutputBuilder).toBe(builder);
        expect(useEditorStore.getState().graphStructureVersion).toBe(initialVersion);
        expect(useEditorStore.getState().isDirty).toBe(false);

        useEditorStore.getState().resetEditor();

        expect(useEditorStore.getState().postDebugPreviewOutputBuilder).toBe(null);
    });

    it('toggles preview display mode without dirtying or versioning the graph', () => {
        const initialVersion = useEditorStore.getState().graphStructureVersion;

        useEditorStore.getState().toggleDebugPreviewMode('node-1');

        expect(useEditorStore.getState().debugPreviewModes).toEqual({ 'node-1': 'raw' });
        expect(useEditorStore.getState().graphStructureVersion).toBe(initialVersion);
        expect(useEditorStore.getState().isDirty).toBe(false);

        useEditorStore.getState().toggleDebugPreviewMode('node-1');

        expect(useEditorStore.getState().debugPreviewModes).toEqual({ 'node-1': 'color' });
        expect(useEditorStore.getState().graphStructureVersion).toBe(initialVersion);
        expect(useEditorStore.getState().isDirty).toBe(false);
    });

    it('clears active preview UI state when entering a subgraph editor context', () => {
        useEditorStore.setState((state) => ({
            ...state,
            subgraphs: {
                ...state.subgraphs,
                [SUBGRAPH_ID]: createSubgraph(),
            },
        }));

        useEditorStore.getState().toggleDebugPreviewActive('node-1');
        useEditorStore.getState().toggleDebugPreviewMode('node-1');
        useEditorStore.getState().setDebugPreviewError('node-1', 'Failed');

        expect(useEditorStore.getState().enterSubgraphEditor(SUBGRAPH_ID)).toBe(true);

        expect(useEditorStore.getState().activeDebugPreviewNodeIds).toEqual([]);
        expect(useEditorStore.getState().debugPreviewModes).toEqual({});
        expect(useEditorStore.getState().debugPreviewErrors).toEqual({});
    });
});
