import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Node } from '@xyflow/react';
import type { NodeType, TSLNodeData } from '@/lib/types';
import { useEditorStore } from './editor';

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
    nodeOverrides: Partial<Node<TSLNodeData>> = {}
): Node<TSLNodeData> => ({
    id,
    type,
    position,
    data: {
        type: type as NodeType,
        values: {},
        connected: {},
    },
    ...nodeOverrides,
});

describe('Editor group drop', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useEditorStore.getState().resetEditor();
    });

    it('clears stale dragging flags when dropping nodes into a group', () => {
        const group = createNode('group-1', 'group', { x: 0, y: 0 }, {
            style: { width: 400, height: 400 },
        });
        const dragged = createNode('node-1', 'math/add', { x: 50, y: 60 }, {
            dragging: true,
            selected: true,
        });

        useEditorStore.setState({
            nodes: [group, dragged],
            edges: [],
            selectedNodeIds: ['node-1'],
            selectedNodeId: null,
        });

        useEditorStore.getState().dropNodesIntoGroup(['node-1'], 'group-1', [group, dragged]);

        const updated = useEditorStore.getState().nodes.find((node) => node.id === 'node-1');
        expect(updated?.parentId).toBe('group-1');
        expect(updated?.dragging).toBe(false);
        expect(updated?.position).toEqual({ x: 50, y: 60 });
    });

    it('sanitizes dragging flags when loading a graph', () => {
        const json = JSON.stringify({
            version: 1,
            nodes: [
                createNode('node-1', 'math/add', { x: 10, y: 20 }, { dragging: true }),
            ],
            edges: [],
        });

        expect(useEditorStore.getState().loadFromJSON(json)).toBe(true);

        const loaded = useEditorStore.getState().nodes.find((node) => node.id === 'node-1');
        expect(loaded?.dragging).toBe(false);
    });
});
