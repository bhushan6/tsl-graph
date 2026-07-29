import { describe, it, expect, beforeAll } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import type { NodeType, TSLNodeData } from '@/lib/types';
import { registry } from './registry';
import { isEdgePortalBlocked, planEdgeToLocalPortal, type EdgePortalPlan } from './edge-portal';

const createNode = (
    id: string,
    type: string,
    position: { x: number; y: number } = { x: 0, y: 0 },
    data: Partial<TSLNodeData> = {},
    nodeOverrides: Partial<Node<TSLNodeData>> = {}
): Node<TSLNodeData> => ({
    id,
    type,
    position,
    data: {
        type: type as NodeType,
        values: {},
        connected: {},
        ...data,
    },
    ...nodeOverrides,
});

const edge = (
    id: string,
    source: string,
    target: string,
    sourceHandle: string | null = 'out',
    targetHandle: string | null = 'in'
): Edge => ({ id, source, target, sourceHandle, targetHandle });

const plan = (params: {
    edgeId: string;
    nodes: Node<TSLNodeData>[];
    edges: Edge[];
}): EdgePortalPlan => {
    const result = planEdgeToLocalPortal({ ...params, subgraphs: {}, codeNodes: {}, now: 1000 });
    if (isEdgePortalBlocked(result)) {
        throw new Error(`unexpectedly blocked: ${result.blocked}`);
    }
    return result;
};

beforeAll(() => {
    registry.registerMany([
        {
            type: 'math/sin' as NodeType,
            label: 'Sin',
            category: 'Math',
            tsl: 'sin',
            inputs: { in: { type: 'any', default: 0, label: 'In' } },
            outputs: { out: { type: 'any', label: 'Out' } },
        },
    ] as never[]);
});

describe('planEdgeToLocalPortal', () => {
    it('creates a set near the source, a get near the target, and rewires the edge', () => {
        const nodes = [
            createNode('src', 'math/sin', { x: 0, y: 0 }, {}, { width: 100 } as never),
            createNode('dst', 'math/sin', { x: 1000, y: 50 }),
        ];
        const edges = [edge('e1', 'src', 'dst')];
        const result = plan({ edgeId: 'e1', nodes, edges });

        expect(result.removedEdgeId).toBe('e1');
        expect(result.setNode.data.type).toBe('local/set');
        expect(result.getNode.data.type).toBe('local/get');
        expect(result.getNode.data.values.localSourceId).toBe(result.setNode.id);

        // set sits right of the source (100 wide + 48 gap), get left of the target
        expect(result.setNode.position).toEqual({ x: 148, y: 0 });
        expect(result.getNode.position.x).toBeLessThan(1000);
        expect(result.getNode.position.y).toBe(50);

        expect(result.addedEdges).toHaveLength(2);
        const [toSet, fromGet] = result.addedEdges;
        expect(toSet).toMatchObject({ source: 'src', sourceHandle: 'out', target: result.setNode.id, targetHandle: 'value' });
        expect(fromGet).toMatchObject({ source: result.getNode.id, sourceHandle: 'out', target: 'dst', targetHandle: 'in' });
    });

    it('derives the local name from the source localName with a handle suffix, uniqued', () => {
        const nodes = [
            createNode('src', 'math/sin', { x: 0, y: 0 }, { values: { localName: 'wave' } }),
            createNode('dst', 'math/sin', { x: 500, y: 0 }),
            createNode('existingSet', 'local/set', { x: 0, y: 200 }, { values: { localName: 'wave.aux' } }),
        ];
        const edges = [edge('e1', 'src', 'dst', 'aux')];
        const result = plan({ edgeId: 'e1', nodes, edges });
        expect(result.setNode.data.values.localName).toBe('wave.aux_1');
    });

    it('parents portal nodes like their endpoints with parent-relative positions', () => {
        const nodes = [
            createNode('grp', 'group', { x: 100, y: 100 }, { type: 'group' as NodeType }),
            createNode('src', 'math/sin', { x: 10, y: 20 }, {}, { parentId: 'grp' }),
            createNode('dst', 'math/sin', { x: 900, y: 0 }),
        ];
        const edges = [edge('e1', 'src', 'dst')];
        const result = plan({ edgeId: 'e1', nodes, edges });

        expect(result.setNode.parentId).toBe('grp');
        expect(result.setNode.extent).toBe('parent');
        // src abs = (110, 120); set abs = 110 + 200(fallback) + 48 → parent-rel x = 258
        expect(result.setNode.position).toEqual({ x: 258, y: 20 });
        expect(result.getNode.parentId).toBeUndefined();
    });

    it('places the set outside the loop when the edge escapes it', () => {
        const nodes = [
            createNode('loopA', 'loop', { x: 100, y: 0 }, { type: 'loop' as NodeType }, { width: 400 } as never),
            createNode('loopOut', 'loop/output', { x: 300, y: 40 }, {}, { parentId: 'loopA' }),
            createNode('outside', 'math/sin', { x: 900, y: 0 }),
        ];
        const edges = [edge('e1', 'loopOut', 'outside')];
        const result = plan({ edgeId: 'e1', nodes, edges });

        expect(result.setNode.parentId).toBeUndefined();
        // right of the loop bounds: 100 + 400 + 48
        expect(result.setNode.position.x).toBe(548);
    });

    it('blocks missing, synthetic, portal-touching, and cross-loop edges', () => {
        const nodes = [
            createNode('src', 'math/sin'),
            createNode('set', 'local/set'),
            createNode('loopA', 'loop', { x: 0, y: 0 }, { type: 'loop' as NodeType }),
            createNode('loopB', 'loop', { x: 500, y: 0 }, { type: 'loop' as NodeType }),
            createNode('inA', 'math/sin', { x: 0, y: 0 }, {}, { parentId: 'loopA' }),
            createNode('inB', 'math/sin', { x: 0, y: 0 }, {}, { parentId: 'loopB' }),
        ];
        const edges = [
            edge('toPortal', 'src', 'set', 'out', 'value'),
            { ...edge('__local_dep__x__y', 'set', 'src'), targetHandle: '__local_dep__' },
            edge('crossLoop', 'inA', 'inB'),
            edge('dangling', 'src', 'ghost'),
        ];
        const run = (edgeId: string) =>
            planEdgeToLocalPortal({ edgeId, nodes, edges, subgraphs: {}, codeNodes: {} });

        expect(run('nope')).toEqual({ blocked: 'edge-not-found' });
        expect(run('__local_dep__x__y')).toEqual({ blocked: 'synthetic-edge' });
        expect(run('toPortal')).toEqual({ blocked: 'already-portal' });
        expect(run('crossLoop')).toEqual({ blocked: 'cross-loop' });
        expect(run('dangling')).toEqual({ blocked: 'missing-endpoint' });
    });
});
