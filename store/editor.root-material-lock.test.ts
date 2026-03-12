import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './editor';
import { initializeNodes } from '@/lib/nodes';

describe('Editor root material lock', () => {
    beforeEach(() => {
        initializeNodes();
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

    it('clears locked material nodes on clearGraph while keeping the lock state', () => {
        const store = useEditorStore.getState();
        store.setRootMaterial('material/physical');
        store.addNode('math/add', { x: 40, y: 40 });
        expect(useEditorStore.getState().nodes.some((node) => node.data.type === 'math/add')).toBe(true);

        store.clearGraph();

        const state = useEditorStore.getState();
        const materialNodes = state.nodes.filter((node) => node.data.type.startsWith('material/'));
        expect(materialNodes).toHaveLength(0);
        expect(state.nodes).toHaveLength(0);
        expect(state.forcedRootMaterial?.type).toBe('material/physical');
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

    it('preserves shared connections when switching material type', () => {
        const store = useEditorStore.getState();
        store.setRootMaterial('material/basic');

        // Add a color source node and connect it to the material's colorNode input
        store.addNode('const/color', { x: -200, y: 0 });
        const nodes = useEditorStore.getState().nodes;
        const colorSourceNode = nodes.find((n) => n.data.type === 'const/color');
        const materialNode = nodes.find((n) => n.data.type === 'material/basic');
        expect(colorSourceNode).toBeTruthy();
        expect(materialNode).toBeTruthy();

        useEditorStore.getState().onConnect({
            source: colorSourceNode!.id,
            sourceHandle: 'out',
            target: materialNode!.id,
            targetHandle: 'colorNode',
        });
        expect(useEditorStore.getState().edges).toHaveLength(1);

        // Switch from basic to standard — both have colorNode
        store.setRootMaterial('material/standard');
        const state = useEditorStore.getState();
        const newMat = state.nodes.find((n) => n.data.type === 'material/standard');
        expect(newMat).toBeTruthy();

        // The colorNode edge should be preserved
        const colorEdge = state.edges.find((e) => e.targetHandle === 'colorNode');
        expect(colorEdge).toBeTruthy();
        expect(colorEdge!.target).toBe(newMat!.id);
    });

    it('drops incompatible connections when switching material type', () => {
        const store = useEditorStore.getState();
        store.setRootMaterial('material/standard');

        // Add a float source and connect to roughnessNode
        store.addNode('const/float', { x: -200, y: 0 });
        const nodes = useEditorStore.getState().nodes;
        const floatNode = nodes.find((n) => n.data.type === 'const/float');
        const materialNode = nodes.find((n) => n.data.type === 'material/standard');
        expect(floatNode).toBeTruthy();
        expect(materialNode).toBeTruthy();

        useEditorStore.getState().onConnect({
            source: floatNode!.id,
            sourceHandle: 'out',
            target: materialNode!.id,
            targetHandle: 'roughnessNode',
        });
        expect(useEditorStore.getState().edges).toHaveLength(1);

        // Switch from standard to basic — basic does NOT have roughnessNode
        store.setRootMaterial('material/basic');
        const state = useEditorStore.getState();
        expect(state.nodes.some((n) => n.data.type === 'material/basic')).toBe(true);

        // The roughnessNode edge should be dropped
        expect(state.edges.find((e) => e.targetHandle === 'roughnessNode')).toBeUndefined();
    });

    it('preserves shared property values when switching material type', () => {
        const store = useEditorStore.getState();
        store.setRootMaterial('material/basic');

        // Manually set opacity value on the basic material node
        const basicMat = useEditorStore.getState().nodes.find((n) => n.data.type === 'material/basic');
        expect(basicMat).toBeTruthy();
        store.updateNodeValue(basicMat!.id, 'opacityNode', 0.42);

        const beforeVal = useEditorStore.getState().nodes.find((n) => n.id === basicMat!.id)?.data.values.opacityNode;
        expect(beforeVal).toBe(0.42);

        // Switch to standard — both have opacityNode
        store.setRootMaterial('material/standard');
        const stdMat = useEditorStore.getState().nodes.find((n) => n.data.type === 'material/standard');
        expect(stdMat).toBeTruthy();
        expect(stdMat!.data.values.opacityNode).toBe(0.42);
    });
});
