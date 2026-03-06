import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './editor';

describe('Editor root material lock', () => {
    beforeEach(() => {
        useEditorStore.getState().resetEditor();
    });

    it('locks root material against deletion', () => {
        const store = useEditorStore.getState();
        const locked = store.setRootMaterial('material/standard');
        expect(locked).toBe(true);

        const materialNode = useEditorStore
            .getState()
            .nodes
            .find((node) => node.data.type === 'material/standard');
        expect(materialNode).toBeTruthy();

        store.deleteNode(materialNode!.id);
        expect(useEditorStore.getState().nodes.some((node) => node.id === materialNode!.id)).toBe(true);

        useEditorStore.getState().onNodesChange([{ id: materialNode!.id, type: 'remove' }]);
        expect(useEditorStore.getState().nodes.some((node) => node.id === materialNode!.id)).toBe(true);
    });

    it('prevents adding/replacing material node while lock is active', () => {
        const store = useEditorStore.getState();
        store.setRootMaterial('material/standard');

        const added = store.addNode('material/basic', { x: 120, y: 20 });
        expect(added).toBe(false);

        const materialNodes = useEditorStore
            .getState()
            .nodes
            .filter((node) => node.data.type.startsWith('material/'));
        expect(materialNodes).toHaveLength(1);
        expect(materialNodes[0].data.type).toBe('material/standard');
    });

    it('preserves locked material on clearGraph', () => {
        const store = useEditorStore.getState();
        store.setRootMaterial('material/physical');
        store.addNode('math/add', { x: 40, y: 40 });
        expect(useEditorStore.getState().nodes.some((node) => node.data.type === 'math/add')).toBe(true);

        store.clearGraph();

        const state = useEditorStore.getState();
        const materialNodes = state.nodes.filter((node) => node.data.type.startsWith('material/'));
        expect(materialNodes).toHaveLength(1);
        expect(materialNodes[0].data.type).toBe('material/physical');
    });

    it('enforces locked material type on loadFromJSON', () => {
        const store = useEditorStore.getState();
        store.setRootMaterial('material/standard');

        const incoming = {
            version: 2,
            activeRootGraph: 'material',
            nodes: [
                {
                    id: 'mat-x',
                    type: 'material/basic',
                    position: { x: 0, y: 0 },
                    data: { type: 'material/basic', values: {}, connected: {} },
                },
            ],
            edges: [],
        };

        const loaded = store.loadFromJSON(JSON.stringify(incoming));
        expect(loaded).toBe(true);

        const state = useEditorStore.getState();
        const materialNodes = state.nodes.filter((node) => node.data.type.startsWith('material/'));
        expect(materialNodes).toHaveLength(1);
        expect(materialNodes[0].data.type).toBe('material/standard');
    });
});
