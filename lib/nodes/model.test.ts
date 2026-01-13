
import { describe, it, expect, beforeAll } from 'vitest';
import { compileGraph } from '../compiler';
import { Node } from '@xyflow/react';
import { TSLNodeData } from '@/lib/types';
import { registry } from '../registry';
import { modelNodes } from './model';
import { NodeType } from '@/lib/types';

const createNode = (id: string, type: string, data: Partial<TSLNodeData> = {}): Node<TSLNodeData> => ({
    id,
    position: { x: 0, y: 0 },
    data: {
        type: type as NodeType,
        label: id,
        values: {},
        connected: {},
        ...data
    }
});

describe('Model Nodes Compilation', () => {
    beforeAll(() => {
        registry.registerMany(modelNodes);
    });

    it('should compile modelWorldMatrix', () => {
        const nodes = [createNode('n1', 'model/modelWorldMatrix')];
        const code = compileGraph(nodes, []);
        expect(code).toContain('const _node0 = modelWorldMatrix;');
    });

    it('should compile modelDirection', () => {
        const nodes = [createNode('n1', 'model/modelDirection')];
        const code = compileGraph(nodes, []);
        expect(code).toContain('const _node0 = modelDirection;');
    });

    it('should compile modelViewMatrix', () => {
        const nodes = [createNode('n1', 'model/modelViewMatrix')];
        const code = compileGraph(nodes, []);
        expect(code).toContain('const _node0 = modelViewMatrix;');
    });

    it('should compile modelNormalMatrix', () => {
        const nodes = [createNode('n1', 'model/modelNormalMatrix')];
        const code = compileGraph(nodes, []);
        expect(code).toContain('const _node0 = modelNormalMatrix;');
    });

    it('should compile modelPosition', () => {
        const nodes = [createNode('n1', 'model/modelPosition')];
        const code = compileGraph(nodes, []);
        expect(code).toContain('const _node0 = modelPosition;');
    });

    it('should compile modelScale', () => {
        const nodes = [createNode('n1', 'model/modelScale')];
        const code = compileGraph(nodes, []);
        expect(code).toContain('const _node0 = modelScale;');
    });

    it('should compile modelViewPosition', () => {
        const nodes = [createNode('n1', 'model/modelViewPosition')];
        const code = compileGraph(nodes, []);
        expect(code).toContain('const _node0 = modelViewPosition;');
    });
});
