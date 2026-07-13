import { describe, expect, it, beforeAll } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import * as THREE from 'three/webgpu';
import { buildNodePreviewMaterial, buildTSLPostDebugOutputNode, getPreviewOutputHandle } from './tsl-builder';
import type { GlobalContextEntry, SubgraphDefinition, TSLNodeData } from '@/lib/types';
import { initializeNodes } from './nodes';

function createNode(
    id: string,
    type: string,
    values: Record<string, unknown> = {}
): Node<TSLNodeData> {
    return {
        id,
        type: 'default',
        position: { x: 0, y: 0 },
        data: {
            type,
            values,
            localName: typeof values.localName === 'string' ? values.localName : undefined,
        } as TSLNodeData,
    };
}

describe('buildNodePreviewMaterial', () => {
    beforeAll(() => {
        initializeNodes();
    });

    it('builds preview for local/get nodes using node material fragment output', () => {
        const nodes: Node<TSLNodeData>[] = [
            createNode('const-1', 'const/float', { value: 0.25 }),
            createNode('set-1', 'local/set', { localName: 'foo' }),
            createNode('get-1', 'local/get', { localSourceId: 'set-1' }),
        ];

        const edges: Edge[] = [
            {
                id: 'edge-1',
                source: 'const-1',
                sourceHandle: 'out',
                target: 'set-1',
                targetHandle: 'value',
            },
        ];

        const material = buildNodePreviewMaterial('get-1', nodes, edges);

        expect(material).toBeInstanceOf(THREE.NodeMaterial);
        expect((material as THREE.NodeMaterial).fragmentNode).toBeTruthy();
    });

    it('builds preview for custom subgraph instances', () => {
        const subgraph: SubgraphDefinition = {
            id: 'custom/add-one',
            name: 'Add One',
            inputs: [{ id: 'in_0', label: 'Value', type: 'float' }],
            outputs: [{ id: 'out_0', label: 'Out', type: 'float' }],
            nodes: [
                createNode('one', 'const/float', { value: 1 }),
                createNode('add', 'math/add'),
            ],
            edges: [
                {
                    id: 'sg-edge-1',
                    source: 'subgraph-input',
                    sourceHandle: 'in_0',
                    target: 'add',
                    targetHandle: 'a',
                },
                {
                    id: 'sg-edge-2',
                    source: 'one',
                    sourceHandle: 'out',
                    target: 'add',
                    targetHandle: 'b',
                },
                {
                    id: 'sg-edge-3',
                    source: 'add',
                    sourceHandle: 'out',
                    target: 'subgraph-output',
                    targetHandle: 'out_0',
                },
            ],
            createdAt: 0,
            updatedAt: 0,
        };

        const nodes: Node<TSLNodeData>[] = [
            createNode('value', 'const/float', { value: 0.5 }),
            {
                ...createNode('custom-1', 'custom/add-one'),
                data: {
                    ...createNode('custom-1', 'custom/add-one').data,
                    dynamicPorts: [...subgraph.inputs, ...subgraph.outputs],
                },
            },
        ];

        const edges: Edge[] = [
            {
                id: 'edge-1',
                source: 'value',
                sourceHandle: 'out',
                target: 'custom-1',
                targetHandle: 'in_0',
            },
        ];

        const material = buildNodePreviewMaterial(
            'custom-1',
            nodes,
            edges,
            { [subgraph.id]: subgraph }
        );

        expect(material).toBeInstanceOf(THREE.NodeMaterial);
        expect((material as THREE.NodeMaterial).fragmentNode).toBeTruthy();
    });

    it('builds preview for nodes inside the subgraph editor using default anchor inputs', () => {
        const nodes: Node<TSLNodeData>[] = [
            {
                ...createNode('subgraph-input', 'subgraph/input'),
                type: 'subgraph/input',
                data: {
                    type: 'subgraph/input',
                    values: {},
                    connected: {},
                    dynamicPorts: [{ id: 'in_0', label: 'Value', type: 'float' }],
                } as TSLNodeData,
            },
            createNode('one', 'const/float', { value: 1 }),
            createNode('add', 'math/add'),
        ];

        const edges: Edge[] = [
            {
                id: 'edge-1',
                source: 'subgraph-input',
                sourceHandle: 'in_0',
                target: 'add',
                targetHandle: 'a',
            },
            {
                id: 'edge-2',
                source: 'one',
                sourceHandle: 'out',
                target: 'add',
                targetHandle: 'b',
            },
        ];

        const material = buildNodePreviewMaterial('add', nodes, edges);

        expect(material).toBeInstanceOf(THREE.NodeMaterial);
        expect((material as THREE.NodeMaterial).fragmentNode).toBeTruthy();
    });

    it('builds a preview when a global name shadows a three/tsl builtin (thickness)', () => {
        // `thickness` is a three/tsl export, so it appears as a scope key injected
        // as a function parameter. A user global named `thickness` compiles to a
        // top-level `const thickness = ...`, which previously collided with that
        // parameter ("Identifier 'thickness' has already been declared") and fell
        // back to the magenta error material (no fragmentNode).
        const globals: GlobalContextEntry[] = [
            { id: 'g-thick', name: 'thickness', kind: 'uniform', type: 'float', defaultValue: 0 },
        ];
        const nodes: Node<TSLNodeData>[] = [
            createNode('gref', 'global/ref', { globalId: 'g-thick' }),
            createNode('add', 'math/add', { b: 1 }),
        ];
        const edges: Edge[] = [
            { id: 'e1', source: 'gref', sourceHandle: 'out', target: 'add', targetHandle: 'a' },
        ];

        const material = buildNodePreviewMaterial('add', nodes, edges, undefined, undefined, globals);

        expect(material).toBeInstanceOf(THREE.NodeMaterial);
        // A real preview sets fragmentNode; the error fallback sets .color instead.
        expect((material as THREE.NodeMaterial).fragmentNode).toBeTruthy();
    });

    it('uses the combined vector output for constant vector debug previews', () => {
        const node = createNode('vec3-1', 'const/vec3', { x: 1, y: 0, z: 0 });

        expect(getPreviewOutputHandle(node)).toBe('out');
    });

    it('reports post debug preview targets without renderable outputs', () => {
        const nodes: Node<TSLNodeData>[] = [
            createNode('post-input', 'post/input'),
            createNode('post-output', 'post/output'),
        ];

        expect(() => buildTSLPostDebugOutputNode(
            'post-output',
            null,
            null,
            null,
            null,
            null,
            null,
            nodes,
            []
        )).toThrow('has no renderable output');
    });
});
