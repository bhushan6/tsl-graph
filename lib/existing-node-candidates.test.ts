import { describe, it, expect, beforeAll } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import type { NodeType, TSLNodeData } from '@/lib/types';
import { registry } from './registry';
import { getExistingNodeCandidates } from './existing-node-candidates';

const createNode = (
    id: string,
    type: string,
    data: Partial<TSLNodeData> = {},
    nodeOverrides: Partial<Node<TSLNodeData>> = {}
): Node<TSLNodeData> => ({
    id,
    type,
    position: { x: 0, y: 0 },
    data: {
        type: type as NodeType,
        values: {},
        connected: {},
        ...data,
    },
    ...nodeOverrides,
});

beforeAll(() => {
    registry.registerMany([
        {
            type: 'const/float' as NodeType,
            label: 'Float',
            category: 'Constants',
            tsl: 'float',
            inputs: { value: { type: 'float', default: 0, label: 'Value', propertyOnly: true } },
            outputs: { out: { type: 'float', label: 'Out' } },
        },
        {
            type: 'math/sin' as NodeType,
            label: 'Sin',
            category: 'Math',
            tsl: 'sin',
            inputs: { in: { type: 'any', default: 0, label: 'In' } },
            outputs: { out: { type: 'any', label: 'Out' } },
        },
        {
            type: 'const/vec3' as NodeType,
            label: 'Vec3',
            category: 'Constants',
            tsl: 'vec3',
            inputs: {},
            outputs: { out: { type: 'vec3', label: 'Out' } },
        },
    ] as never[]);
});

const baseParams = {
    globals: [],
    subgraphs: {},
    codeNodes: {},
    sourceHandleId: 'out',
    sourceDataType: 'float' as const,
};

describe('getExistingNodeCandidates', () => {
    it('lists target input handles when dragging from an output, excluding self', () => {
        const nodes = [
            createNode('src', 'const/float'),
            createNode('sink', 'math/sin', { values: { localName: 'wave' } }),
        ];
        const candidates = getExistingNodeCandidates({
            ...baseParams,
            nodes,
            edges: [],
            sourceNodeId: 'src',
            handleDirection: 'output',
        });
        expect(candidates).toHaveLength(1);
        expect(candidates[0]).toMatchObject({ nodeId: 'sink', handleId: 'in' });
        expect(candidates[0].nodeLabel).toContain('wave');
        expect(candidates[0].searchText).toContain('wave');
    });

    it('excludes candidates that would create a cycle', () => {
        const nodes = [createNode('a', 'math/sin'), createNode('b', 'math/sin')];
        const edges: Edge[] = [
            { id: 'e1', source: 'a', target: 'b', sourceHandle: 'out', targetHandle: 'in' },
        ];
        const candidates = getExistingNodeCandidates({
            ...baseParams,
            nodes,
            edges,
            sourceNodeId: 'b',
            handleDirection: 'output',
        });
        expect(candidates.find((c) => c.nodeId === 'a')).toBeUndefined();
    });

    it('excludes loop-scoped nodes that the connection rules reject', () => {
        const nodes = [
            createNode('loopA', 'loop', { type: 'loop' as NodeType }),
            createNode('loopOut', 'loop/output', {}, { parentId: 'loopA' }),
            createNode('src', 'const/float'),
        ];
        const candidates = getExistingNodeCandidates({
            ...baseParams,
            nodes,
            edges: [],
            sourceNodeId: 'src',
            handleDirection: 'output',
        });
        expect(candidates.find((c) => c.nodeId === 'loopOut')).toBeUndefined();
    });

    it('lists source output handles when dragging from an input, ranked by type match', () => {
        const nodes = [
            createNode('sink', 'math/sin'),
            createNode('floatSrc', 'const/float'),
            createNode('vecSrc', 'const/vec3'),
        ];
        const candidates = getExistingNodeCandidates({
            ...baseParams,
            nodes,
            edges: [],
            sourceNodeId: 'sink',
            sourceHandleId: 'in',
            handleDirection: 'input',
        });
        expect(candidates.map((c) => c.nodeId)).toEqual(['floatSrc', 'vecSrc']);
        expect(candidates[0].matchRank).toBe(0);
        expect(candidates[1].matchRank).toBe(1);
    });

    it('resolves declared-any output types through the graph', () => {
        const nodes = [
            createNode('f', 'const/float'),
            createNode('sinNode', 'math/sin'),
            createNode('sink', 'math/sin'),
        ];
        const edges: Edge[] = [
            { id: 'e1', source: 'f', target: 'sinNode', sourceHandle: 'out', targetHandle: 'in' },
        ];
        const candidates = getExistingNodeCandidates({
            ...baseParams,
            nodes,
            edges,
            sourceNodeId: 'sink',
            sourceHandleId: 'in',
            handleDirection: 'input',
        });
        const sinCandidate = candidates.find((c) => c.nodeId === 'sinNode');
        expect(sinCandidate?.type).toBe('float');
    });
});
