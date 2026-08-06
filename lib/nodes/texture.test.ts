import { beforeAll, describe, expect, it } from 'vitest';
import { Node } from '@xyflow/react';
import { compileGraph } from '../compiler';
import { NodeType, TSLNodeData } from '@/lib/types';
import { initializeNodes, textureNodes } from './index';

const createNode = (id: string, type: string, data: Partial<TSLNodeData> = {}): Node<TSLNodeData> => ({
    id,
    position: { x: 0, y: 0 },
    data: {
        type: type as NodeType,
        values: {},
        connected: {},
        ...data,
    },
});

describe('Texture Nodes', () => {
    beforeAll(() => {
        initializeNodes();
    });

    it.each(['texture/sampleNode', 'texture/sample', 'texture/triplanar'])('exposes RGBA outputs on %s', (type) => {
        const def = textureNodes.find((node) => node.type === type);
        const outputs = def?.outputs as Record<string, unknown> | undefined;

        expect(Object.keys(outputs ?? {})).toEqual(['out', 'r', 'g', 'b', 'a']);
        expect(outputs?.r).toEqual({ label: 'R', type: 'float' });
        expect(outputs?.a).toEqual({ label: 'A', type: 'float' });
    });

    it('compiles the alpha output as the sampled value alpha channel', () => {
        const nodes = [
            createNode('sample', 'texture/sampleNode'),
            createNode('mat', 'material/standard', { activeInputs: ['opacityNode'] }),
        ];
        const edges = [
            { id: 'e1', source: 'sample', sourceHandle: 'a', target: 'mat', targetHandle: 'opacityNode' },
        ];

        const code = compileGraph(nodes, edges);

        expect(code).toContain('material.opacityNode = texture(');
        expect(code).toContain(').w');
    });
});
