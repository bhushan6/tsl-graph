import { describe, it, expect, beforeAll } from 'vitest';
import { compileGraph } from '../compiler';
import { Node } from '@xyflow/react';
import { NodeType, TSLNodeData } from '@/lib/types';
import { registry } from '../registry';
import { geometryNodes } from './geometry';

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

describe('Geometry Nodes Compilation', () => {
    beforeAll(() => {
        registry.registerMany(geometryNodes);
    });

    it('should compile cameraPosition', () => {
        const nodes = [createNode('n1', 'geo/cameraPosition')];
        const code = compileGraph(nodes, []);
        expect(code).toContain('const _node0 = cameraPosition;');
    });

    it('should compile cameraViewMatrix', () => {
        const nodes = [createNode('n1', 'geo/cameraViewMatrix')];
        const code = compileGraph(nodes, []);
        expect(code).toContain('const _node0 = cameraViewMatrix;');
    });
});
