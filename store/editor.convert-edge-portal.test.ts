import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import type { NodeType, TSLNodeData } from '@/lib/types';
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

describe('convertEdgeToLocalPortal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useEditorStore.getState().resetEditor();
        // undo() clears this flag on a timer; don't let it leak across tests
        useEditorStore.setState({ isUndoRedoInProgress: false });
    });

    const seedGraph = () => {
        const nodes = [
            createNode('src', 'math/add', { x: 0, y: 0 }),
            createNode('dst', 'math/mul', { x: 800, y: 0 }),
        ];
        const edges: Edge[] = [
            { id: 'e1', source: 'src', target: 'dst', sourceHandle: 'out', targetHandle: 'a' },
        ];
        useEditorStore.setState({ nodes, edges });
    };

    it('replaces the edge with a wired set/get pair in one step', () => {
        seedGraph();
        const ok = useEditorStore.getState().convertEdgeToLocalPortal('e1');
        expect(ok).toBe(true);

        const state = useEditorStore.getState();
        const setNode = state.nodes.find((n) => n.data.type === 'local/set');
        const getNode = state.nodes.find((n) => n.data.type === 'local/get');
        expect(setNode).toBeDefined();
        expect(getNode).toBeDefined();
        expect(getNode?.data.values.localSourceId).toBe(setNode?.id);

        expect(state.edges.find((e) => e.id === 'e1')).toBeUndefined();
        expect(state.edges).toHaveLength(2);
        expect(state.edges.find((e) => e.source === 'src' && e.target === setNode?.id)?.targetHandle).toBe('value');
        expect(state.edges.find((e) => e.source === getNode?.id && e.target === 'dst')?.targetHandle).toBe('a');
    });

    it('restores the exact prior graph with a single undo', () => {
        seedGraph();
        const before = {
            nodes: useEditorStore.getState().nodes,
            edges: useEditorStore.getState().edges,
        };

        useEditorStore.getState().convertEdgeToLocalPortal('e1');
        useEditorStore.getState().undo();

        const state = useEditorStore.getState();
        // history snapshots normalize selected to false
        expect(state.nodes).toEqual(before.nodes.map((n) => ({ ...n, selected: false })));
        expect(state.edges).toEqual(before.edges);
    });

    it('takes no snapshot and reports failure when blocked', () => {
        seedGraph();
        const pastDepth = useEditorStore.getState().history.past.length;
        const ok = useEditorStore.getState().convertEdgeToLocalPortal('missing-edge');
        expect(ok).toBe(false);
        expect(toast.error).toHaveBeenCalled();
        expect(useEditorStore.getState().history.past.length).toBe(pastDepth);
    });

    it('deleteEdge removes a single edge with undo support', () => {
        seedGraph();
        useEditorStore.getState().deleteEdge('e1');
        expect(useEditorStore.getState().edges).toHaveLength(0);
        useEditorStore.getState().undo();
        expect(useEditorStore.getState().edges).toHaveLength(1);
    });
});
