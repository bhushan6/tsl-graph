import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from './editor';
import type { Node, Edge } from '@xyflow/react';
import type { TSLNodeData } from '@/lib/types';

describe('Editor Store Grouping', () => {
    beforeEach(() => {
        useEditorStore.getState().resetEditor();
    });

    it('should drop incoming loop edges when node removed from loop', () => {
        const loopId = 'loop1';
        const loopNode: Node<TSLNodeData> = {
            id: loopId,
            type: 'group',
            position: { x: 0, y: 0 },
            data: {
                type: 'group',
                values: {},
                connected: {},
                loop: { kind: 'loop' },
            },
        };

        const loopSource: Node<TSLNodeData> = {
            id: 'loopSource',
            position: { x: 10, y: 10 },
            parentId: loopId,
            data: { type: 'math/add', values: {}, connected: {} },
        };

        const toRemove: Node<TSLNodeData> = {
            id: 'toRemove',
            position: { x: 20, y: 20 },
            parentId: loopId,
            data: { type: 'math/mul', values: {}, connected: {} },
        };

        const outsideSource: Node<TSLNodeData> = {
            id: 'outside',
            position: { x: 200, y: 200 },
            data: { type: 'math/add', values: {}, connected: {} },
        };

        const edges: Edge[] = [
            { id: 'e1', source: 'loopSource', target: 'toRemove', targetHandle: 'a' },
            { id: 'e2', source: 'outside', target: 'toRemove', targetHandle: 'b' },
        ];

        useEditorStore.setState({
            nodes: [loopNode, loopSource, toRemove, outsideSource],
            edges,
        });

        useEditorStore.getState().reparentNodes(['toRemove'], null);

        const { edges: nextEdges } = useEditorStore.getState();
        const edgeIds = nextEdges.map(e => e.id);

        expect(edgeIds).not.toContain('e1');
        expect(edgeIds).toContain('e2');
    });

    it('should drop outgoing edges into loop when node removed from loop', () => {
        const loopId = 'loop1';
        const loopNode: Node<TSLNodeData> = {
            id: loopId,
            type: 'group',
            position: { x: 0, y: 0 },
            data: {
                type: 'group',
                values: {},
                connected: {},
                loop: { kind: 'loop' },
            },
        };

        const loopTarget: Node<TSLNodeData> = {
            id: 'loopTarget',
            position: { x: 30, y: 30 },
            parentId: loopId,
            data: { type: 'math/add', values: {}, connected: {} },
        };

        const toRemove: Node<TSLNodeData> = {
            id: 'toRemove',
            position: { x: 20, y: 20 },
            parentId: loopId,
            data: { type: 'math/mul', values: {}, connected: {} },
        };

        const edges: Edge[] = [
            { id: 'e1', source: 'toRemove', target: 'loopTarget', targetHandle: 'a' },
        ];

        useEditorStore.setState({
            nodes: [loopNode, loopTarget, toRemove],
            edges,
        });

        useEditorStore.getState().reparentNodes(['toRemove'], null);

        const { edges: nextEdges } = useEditorStore.getState();
        expect(nextEdges.map(e => e.id)).not.toContain('e1');
    });
});
