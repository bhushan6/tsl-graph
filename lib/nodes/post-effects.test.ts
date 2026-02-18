import { describe, it, expect, beforeAll } from 'vitest';
import { Node } from '@xyflow/react';
import { compileGraph } from '../compiler';
import { registry } from '../registry';
import { TSLNodeData, NodeType } from '@/lib/types';
import { postEffectNodes, POST_FX_NODE_TYPES } from './post-effects';

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

describe('Post FX Nodes', () => {
    beforeAll(() => {
        registry.registerMany(postEffectNodes);
    });

    it('exports phase-1 post fx node types', () => {
        expect(POST_FX_NODE_TYPES).toContain('postfx/bloom');
        expect(POST_FX_NODE_TYPES).toContain('postfx/transition');
        expect(POST_FX_NODE_TYPES).toHaveLength(17);
    });

    it('compiles a post fx node call', () => {
        const nodes = [createNode('fx', 'postfx/bloom')];
        const code = compileGraph(nodes, []);
        expect(code).toContain('const _node0 = bloom(');
    });
});
