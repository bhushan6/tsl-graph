import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import type { NodeType, TSLNodeData } from '@/lib/types';
import { MATERIAL_NODE_TYPES } from '@/lib/nodes';
import { useEditorStore } from './editor';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
    },
}));

const createNode = (
    id: string,
    type: string,
    position: { x: number; y: number } = { x: 0, y: 0 },
    dataOverrides: Partial<TSLNodeData> = {},
    nodeOverrides: Partial<Node<TSLNodeData>> = {}
): Node<TSLNodeData> => ({
    id,
    type,
    position,
    data: {
        type: type as NodeType,
        values: {},
        connected: {},
        ...dataOverrides,
    },
    ...nodeOverrides,
});

describe('Editor copy/paste', () => {
    beforeEach(() => {
        useEditorStore.getState().resetEditor();
    });

    it('copies internal edges only', () => {
        const nodes = [
            createNode('a', 'math/add', { x: 0, y: 0 }),
            createNode('b', 'math/mul', { x: 120, y: 0 }),
            createNode('c', 'math/sub', { x: 240, y: 0 }),
        ];
        const edges: Edge[] = [
            { id: 'e1', source: 'a', target: 'b', sourceHandle: 'out', targetHandle: 'a' },
            { id: 'e2', source: 'b', target: 'c', sourceHandle: 'out', targetHandle: 'a' },
        ];

        useEditorStore.setState({
            nodes,
            edges,
            selectedNodeIds: ['a', 'b'],
            selectedNodeId: null,
        });

        const store = useEditorStore.getState();
        store.copySelection();
        store.pasteSelection({ x: 500, y: 500 });

        const state = useEditorStore.getState();
        const newNodes = state.nodes.filter((node) => !['a', 'b', 'c'].includes(node.id));
        const newEdges = state.edges.filter((edge) => !['e1', 'e2'].includes(edge.id));

        expect(newNodes).toHaveLength(2);
        expect(newEdges).toHaveLength(1);

        const newNodeIds = new Set(newNodes.map((node) => node.id));
        expect(newNodeIds.has(newEdges[0].source)).toBe(true);
        expect(newNodeIds.has(newEdges[0].target)).toBe(true);
    });

    it('preserves group hierarchy when pasting', () => {
        const group = createNode('group-1', 'group', { x: 0, y: 0 }, { type: 'group' as NodeType }, { style: { width: 200, height: 200 } });
        const child = createNode(
            'child-1',
            'math/add',
            { x: 20, y: 30 },
            {},
            { parentId: 'group-1', extent: 'parent' }
        );

        useEditorStore.setState({
            nodes: [group, child],
            edges: [],
            selectedNodeIds: ['group-1'],
            selectedNodeId: 'group-1',
        });

        const store = useEditorStore.getState();
        store.copySelection();
        store.pasteSelection({ x: 400, y: 400 });

        const state = useEditorStore.getState();
        const newGroups = state.nodes.filter((node) => node.type === 'group' && node.id !== 'group-1');
        expect(newGroups).toHaveLength(1);
        const newGroupId = newGroups[0].id;
        const pastedChild = state.nodes.find((node) => node.parentId === newGroupId);

        expect(pastedChild).toBeDefined();
        expect(pastedChild?.position).toEqual({ x: 20, y: 30 });
    });

    it('reuses subgraph definitions and clones code node definitions', () => {
        const subgraphDef = {
            id: 'custom/foo-1',
            name: 'Foo',
            inputs: [],
            outputs: [],
            nodes: [],
            edges: [],
            createdAt: 1,
            updatedAt: 1,
        };
        const codeDef = {
            id: 'code/bar-1',
            name: 'Bar',
            code: '',
            inputs: [],
            output: { id: 'out', label: 'Result', type: 'any' as const },
            createdAt: 1,
            updatedAt: 1,
        };

        const customNode = createNode('custom-node', subgraphDef.id, { x: 0, y: 0 }, { dynamicPorts: [] });
        const codeNode = createNode('code-node', codeDef.id, { x: 150, y: 0 }, { dynamicPorts: [codeDef.output] });

        useEditorStore.setState({
            nodes: [customNode, codeNode],
            edges: [],
            subgraphs: { [subgraphDef.id]: subgraphDef },
            codeNodes: { [codeDef.id]: codeDef },
            selectedNodeIds: [customNode.id, codeNode.id],
            selectedNodeId: null,
        });

        const store = useEditorStore.getState();
        store.copySelection();
        store.pasteSelection({ x: 300, y: 300 });

        const state = useEditorStore.getState();
        const subgraphIds = Object.keys(state.subgraphs);
        const codeIds = Object.keys(state.codeNodes);

        expect(subgraphIds).toHaveLength(1);
        expect(codeIds).toHaveLength(2);

        const newSubgraphId = subgraphIds.find((id) => id !== subgraphDef.id);
        const newCodeId = codeIds.find((id) => id !== codeDef.id);

        expect(newSubgraphId).toBeUndefined();
        expect(newCodeId).toBeDefined();

        const pastedCustom = state.nodes.find((node) => node.data.type === subgraphDef.id && node.id !== customNode.id);
        const pastedCode = state.nodes.find((node) => node.data.type === newCodeId);

        expect(pastedCustom).toBeDefined();
        expect(pastedCode).toBeDefined();
    });

    it('skips material nodes when one already exists', () => {
        const materialType = MATERIAL_NODE_TYPES[0];
        const existingMaterial = createNode('mat-existing', materialType, { x: 0, y: 0 });
        const materialToCopy = createNode('mat-copy', materialType, { x: 200, y: 0 });
        const regularNode = createNode('n1', 'math/add', { x: 200, y: 100 });

        useEditorStore.setState({
            nodes: [existingMaterial, materialToCopy, regularNode],
            edges: [],
            selectedNodeIds: ['mat-copy', 'n1'],
            selectedNodeId: null,
        });

        const store = useEditorStore.getState();
        store.copySelection();
        store.pasteSelection({ x: 500, y: 500 });

        const state = useEditorStore.getState();
        const materialNodes = state.nodes.filter((node) =>
            (MATERIAL_NODE_TYPES as readonly string[]).includes(node.data.type)
        );
        const pastedNodes = state.nodes.filter((node) => !['mat-existing', 'mat-copy', 'n1'].includes(node.id));

        // We already had two material nodes before paste; ensure we didn't add another.
        expect(materialNodes).toHaveLength(2);
        expect(pastedNodes).toHaveLength(1);
        expect(
            pastedNodes.some((node) => (MATERIAL_NODE_TYPES as readonly string[]).includes(node.data.type))
        ).toBe(false);
    });

    it('does not copy or paste post anchor nodes', () => {
        const postInput = createNode('post-input', 'post/input', { x: 0, y: 0 });
        const postOutput = createNode('post-output', 'post/output', { x: 220, y: 0 });
        const addNode = createNode('add-1', 'math/add', { x: 120, y: 0 });

        useEditorStore.setState({
            nodes: [postInput, postOutput, addNode],
            edges: [],
            selectedNodeIds: ['post-input', 'add-1'],
            selectedNodeId: null,
            activeRootGraph: 'post',
        });

        const store = useEditorStore.getState();
        store.copySelection();
        store.pasteSelection({ x: 400, y: 400 });

        const state = useEditorStore.getState();
        const postAnchors = state.nodes.filter((node) => node.data.type === 'post/input' || node.data.type === 'post/output');
        const pastedNodes = state.nodes.filter((node) => !['post-input', 'post-output', 'add-1'].includes(node.id));

        expect(postAnchors).toHaveLength(2);
        expect(pastedNodes).toHaveLength(1);
        expect(pastedNodes[0].data.type).toBe('math/add');
    });

    it('assigns unique default names for new Set Local nodes', () => {
        const store = useEditorStore.getState();

        store.addNode('local/set', { x: 10, y: 10 });
        store.addNode('local/set', { x: 80, y: 10 });
        store.addNode('local/set', { x: 150, y: 10 });

        const setNodes = useEditorStore.getState().nodes.filter((node) => node.data.type === 'local/set');
        const names = setNodes.map((node) => String(node.data.values?.localName));
        expect(names).toEqual(['local', 'local_1', 'local_2']);
    });

    it('rejects Set Local rename collisions', () => {
        useEditorStore.setState({
            nodes: [
                createNode('set-1', 'local/set', { x: 10, y: 10 }, { values: { localName: 'base' } }),
                createNode('set-2', 'local/set', { x: 80, y: 10 }, { values: { localName: 'other' } }),
            ],
            edges: [],
        });

        const store = useEditorStore.getState();
        const first = useEditorStore.getState().nodes.find((node) => node.id === 'set-1');
        const second = useEditorStore.getState().nodes.find((node) => node.id === 'set-2');
        expect(first?.data.values?.localName).toBe('base');
        expect(second?.data.values?.localName).toBe('other');

        store.updateNodeValue('set-2', 'localName', 'base');

        const updatedSecond = useEditorStore.getState().nodes.find((node) => node.id === 'set-2');
        expect(updatedSecond?.data.values?.localName).toBe('other');
        expect(vi.mocked(toast.error)).toHaveBeenCalled();
    });

    it('remaps Get Local source when set and get are pasted together', () => {
        const setNode = createNode('set-a', 'local/set', { x: 0, y: 0 }, { values: { localName: 'L' } });
        const getNode = createNode('get-a', 'local/get', { x: 120, y: 0 }, { values: { localSourceId: 'set-a' } });

        useEditorStore.setState({
            nodes: [setNode, getNode],
            edges: [],
            selectedNodeIds: ['set-a', 'get-a'],
            selectedNodeId: null,
        });

        const store = useEditorStore.getState();
        store.copySelection();
        store.pasteSelection({ x: 300, y: 300 });

        const pasted = useEditorStore.getState().nodes.filter((node) => !['set-a', 'get-a'].includes(node.id));
        const pastedSet = pasted.find((node) => node.data.type === 'local/set');
        const pastedGet = pasted.find((node) => node.data.type === 'local/get');

        expect(pastedSet).toBeDefined();
        expect(pastedGet).toBeDefined();
        expect(pastedGet?.data.values?.localSourceId).toBe(pastedSet?.id);
    });

    it('keeps original Get Local source when pasted alone', () => {
        const setNode = createNode('set-a', 'local/set', { x: 0, y: 0 }, { values: { localName: 'L' } });
        const getNode = createNode('get-a', 'local/get', { x: 120, y: 0 }, { values: { localSourceId: 'set-a' } });

        useEditorStore.setState({
            nodes: [setNode, getNode],
            edges: [],
            selectedNodeIds: ['get-a'],
            selectedNodeId: 'get-a',
        });

        const store = useEditorStore.getState();
        store.copySelection();
        store.pasteSelection({ x: 300, y: 300 });

        const pastedGet = useEditorStore
            .getState()
            .nodes
            .find((node) => node.data.type === 'local/get' && node.id !== 'get-a');

        expect(pastedGet).toBeDefined();
        expect(pastedGet?.data.values?.localSourceId).toBe('set-a');
    });

    it('prevents deleting post anchors', () => {
        useEditorStore.setState({
            nodes: [
                createNode('post-input', 'post/input'),
                createNode('post-output', 'post/output'),
                createNode('add-1', 'math/add'),
            ],
            edges: [],
            activeRootGraph: 'post',
        });

        const store = useEditorStore.getState();
        store.deleteNode('post-input');
        store.deleteNode('post-output');

        const state = useEditorStore.getState();
        expect(state.nodes.some((node) => node.id === 'post-input')).toBe(true);
        expect(state.nodes.some((node) => node.id === 'post-output')).toBe(true);
    });
});
