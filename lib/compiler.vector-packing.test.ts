import { beforeAll, describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { initializeNodes } from '@/lib/nodes';
import type { NodeType, TSLNodeData } from '@/lib/types';
import { compileGraph } from './compiler';

const createNode = (id: string, type: string, data: Partial<TSLNodeData> = {}): Node<TSLNodeData> => ({
    id,
    position: { x: 0, y: 0 },
    data: {
        type: type as NodeType,
        label: id,
        values: {},
        connected: {},
        ...data,
    },
});

const createEdge = (source: string, target: string, targetHandle: string, sourceHandle = 'out'): Edge => ({
    id: `${source}-${target}-${targetHandle}`,
    source,
    sourceHandle,
    target,
    targetHandle,
});

describe('compileGraph vector packing', () => {
    beforeAll(() => {
        initializeNodes();
    });

    it('emits one vec2 argument when a vec2 fills X and Y', () => {
        const nodes = [
            createNode('v2', 'const/vec2', { values: { x: 1, y: 2 } }),
            createNode('v3', 'const/vec3', { values: { z: 3 } }),
        ];
        const edges = [createEdge('v2', 'v3', 'x')];

        const code = compileGraph(nodes, edges);

        expect(code).toContain('vec3(vec2(1, 2), 3)');
    });

    it('emits one vec2 argument when a vec2 fills Y and Z', () => {
        const nodes = [
            createNode('v2', 'const/vec2', { values: { x: 1, y: 2 } }),
            createNode('v3', 'const/vec3', { values: { x: 4, z: 3 } }),
        ];
        const edges = [createEdge('v2', 'v3', 'y')];

        const code = compileGraph(nodes, edges);

        expect(code).toContain('vec3(4, vec2(1, 2))');
    });

    it('emits one vec3 argument when a vec3 fills every channel', () => {
        const nodes = [
            createNode('src', 'const/vec3', { values: { x: 1, y: 2, z: 3 } }),
            createNode('dst', 'const/vec3', { values: { z: 9 } }),
        ];
        const edges = [createEdge('src', 'dst', 'x')];

        const code = compileGraph(nodes, edges);

        expect(code).toContain('vec3(vec3(1, 2, 3))');
    });

    it('keeps per-channel emission for single floats', () => {
        const nodes = [
            createNode('a', 'const/float', { values: { value: 1 } }),
            createNode('b', 'const/float', { values: { value: 3 } }),
            createNode('v3', 'const/vec3', { values: { y: 2 } }),
        ];
        const edges = [createEdge('a', 'v3', 'x'), createEdge('b', 'v3', 'z')];

        const code = compileGraph(nodes, edges);

        expect(code).toContain('vec3(float(1), 2, float(3))');
    });

    it('falls back to per-input emission for overflowing legacy edges', () => {
        const nodes = [
            createNode('v4', 'const/vec4', { values: { x: 1, y: 2, z: 3, w: 4 } }),
            createNode('v3', 'const/vec3'),
        ];
        const edges = [createEdge('v4', 'v3', 'x')];

        const code = compileGraph(nodes, edges);

        expect(code).toContain('vec3(vec4(1, 2, 3, 4), 0, 0)');
    });

    it('falls back when an upstream type change creates an overlapping edge', () => {
        const nodes = [
            createNode('v2', 'const/vec2', { values: { x: 1, y: 2 } }),
            createNode('f', 'const/float', { values: { value: 3 } }),
            createNode('v3', 'const/vec3'),
        ];
        const edges = [createEdge('v2', 'v3', 'x'), createEdge('f', 'v3', 'y')];

        const code = compileGraph(nodes, edges);

        expect(code).toContain('vec3(vec2(1, 2), float(3), 0)');
    });

    it('does not pack constructors outside the enabled set', () => {
        const nodes = [
            createNode('v2', 'const/vec2', { values: { x: 1, y: 2 } }),
            createNode('v4', 'const/vec4', { values: { z: 3, w: 4 } }),
        ];
        const edges = [createEdge('v2', 'v4', 'x')];

        const code = compileGraph(nodes, edges);

        expect(code).toContain('vec4(vec2(1, 2), 0, 3, 4)');
    });
});
