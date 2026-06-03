import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './editor';

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

    it('tracks preview errors as resettable UI-only state', () => {
        useEditorStore.getState().setDebugPreviewError('node-1', 'Failed');
        expect(useEditorStore.getState().debugPreviewErrors).toEqual({ 'node-1': 'Failed' });

        useEditorStore.getState().setDebugPreviewError('node-1', null);
        expect(useEditorStore.getState().debugPreviewErrors).toEqual({});

        useEditorStore.getState().setDebugPreviewError('node-2', 'Still failed');
        useEditorStore.getState().clearDebugPreviewErrors();
        expect(useEditorStore.getState().debugPreviewErrors).toEqual({});
    });
});
