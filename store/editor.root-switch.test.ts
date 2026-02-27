import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './editor';

describe('Editor root graph switching', () => {
    beforeEach(() => {
        useEditorStore.getState().resetEditor();
    });

    it('preserves independent nodes/edges/history/selection per root graph', () => {
        const store = useEditorStore.getState();

        // Material root edits
        store.addNode('math/add', { x: 0, y: 0 });
        store.addNode('math/mul', { x: 180, y: 0 });
        const materialNodeIds = useEditorStore.getState().nodes.map((node) => node.id);
        expect(materialNodeIds).toHaveLength(2);

        useEditorStore.getState().onConnect({
            source: materialNodeIds[0],
            sourceHandle: 'out',
            target: materialNodeIds[1],
            targetHandle: 'a',
        });
        const materialEdgeCount = useEditorStore.getState().edges.length;
        const materialSelection = [...useEditorStore.getState().selectedNodeIds];
        const materialHistoryLength = useEditorStore.getState().history.past.length;

        // Post root edits
        store.setActiveRootGraph('post');
        expect(useEditorStore.getState().nodes.some((node) => node.id === 'post-input')).toBe(true);
        expect(useEditorStore.getState().nodes.some((node) => node.id === 'post-output')).toBe(true);
        store.addNode('math/sin', { x: 120, y: 20 });

        const postNodeTypes = useEditorStore.getState().nodes.map((node) => node.data.type);
        expect(postNodeTypes).toContain('math/sin');
        const postHistoryLength = useEditorStore.getState().history.past.length;
        expect(postHistoryLength).toBeGreaterThan(0);

        // Switch back to material and ensure state is restored
        store.setActiveRootGraph('material');
        const materialState = useEditorStore.getState();
        expect(materialState.nodes.map((node) => node.id)).toEqual(materialNodeIds);
        expect(materialState.edges).toHaveLength(materialEdgeCount);
        expect(materialState.selectedNodeIds).toEqual(materialSelection);
        expect(materialState.history.past.length).toBe(materialHistoryLength);

        // Switch again to post and ensure post graph persisted independently
        store.setActiveRootGraph('post');
        const postState = useEditorStore.getState();
        expect(postState.nodes.some((node) => node.data.type === 'math/sin')).toBe(true);
        expect(postState.edges).toHaveLength(0);
    });

    it('blocks viewport shared texture node in post root', () => {
        const store = useEditorStore.getState();
        store.setActiveRootGraph('post');

        const added = store.addNode('texture/viewportShared', { x: 20, y: 20 });
        expect(added).toBe(false);
        expect(useEditorStore.getState().nodes.some((node) => node.data.type === 'texture/viewportShared')).toBe(false);
    });

    it('blocks uniform node in post root', () => {
        const store = useEditorStore.getState();
        store.setActiveRootGraph('post');

        const added = store.addNode('const/uniform', { x: 20, y: 20 });
        expect(added).toBe(false);
        expect(useEditorStore.getState().nodes.some((node) => node.data.type === 'const/uniform')).toBe(false);
    });

    it('binds explicit global refs and keeps generic global fallback binding', () => {
        const store = useEditorStore.getState();
        const firstGlobalId = store.addGlobal({ name: 'uTime', kind: 'uniform', type: 'float', defaultValue: 0 });
        const secondGlobalId = store.addGlobal({ name: 'uTint', kind: 'uniform', type: 'color', defaultValue: '#ffffff' });

        expect(firstGlobalId).toBeTruthy();
        expect(secondGlobalId).toBeTruthy();

        const addedExplicit = store.addNode('global/ref', { x: 10, y: 10 }, {
            values: { globalId: secondGlobalId as string },
        });
        expect(addedExplicit).toBe(true);

        const explicitNodes = useEditorStore.getState().nodes;
        const explicitNode = explicitNodes[explicitNodes.length - 1];
        expect(explicitNode?.data.values?.globalId).toBe(secondGlobalId);

        const addedGeneric = store.addNode('global/ref', { x: 40, y: 10 });
        expect(addedGeneric).toBe(true);

        const genericNodes = useEditorStore.getState().nodes;
        const genericNode = genericNodes[genericNodes.length - 1];
        const currentFallbackGlobalId = useEditorStore.getState().globals[0]?.id;
        expect(genericNode?.data.values?.globalId).toBe(currentFallbackGlobalId);
    });

    it('keeps local names unique per root context', () => {
        const store = useEditorStore.getState();

        store.addNode('local/set', { x: 20, y: 20 });
        const materialSet = useEditorStore.getState().nodes.find((node) => node.data.type === 'local/set');
        expect(materialSet?.data.values?.localName).toBe('local');

        store.setActiveRootGraph('post');
        store.addNode('local/set', { x: 40, y: 40 });
        const postSet = useEditorStore
            .getState()
            .nodes
            .find((node) => node.data.type === 'local/set');
        expect(postSet?.data.values?.localName).toBe('local');

        store.setActiveRootGraph('material');
        const restoredMaterialSet = useEditorStore.getState().nodes.find((node) => node.id === materialSet?.id);
        expect(restoredMaterialSet?.data.values?.localName).toBe('local');
    });
});
