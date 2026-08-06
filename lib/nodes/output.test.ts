import { describe, it, expect, beforeAll } from 'vitest';
import { Node } from '@xyflow/react';
import { compileGraph } from '../compiler';
import { registry } from '../registry';
import { materialNodes } from './output';
import type { NodeType, TSLNodeData } from '@/lib/types';

const createNode = (
    id: string,
    type: string,
    data: Partial<TSLNodeData> = {},
): Node<TSLNodeData> => ({
    id,
    position: { x: 0, y: 0 },
    data: {
        type: type as NodeType,
        values: {},
        connected: {},
        ...data,
    },
});

describe('Material Nodes', () => {
    beforeAll(() => {
        registry.registerMany(materialNodes);
    });

    it('exposes SpriteNodeMaterial depthTest as a material property', () => {
        const spriteDef = materialNodes.find((node) => node.type === 'material/sprite');
        expect(spriteDef?.inputs?.depthTest).toMatchObject({
            label: 'Depth Test',
            type: 'bool',
            default: true,
            propertyOnly: true,
            isMaterialProp: true,
        });
    });

    it('compiles an active SpriteNodeMaterial depthTest property', () => {
        const nodes = [createNode('sprite', 'material/sprite', {
            activeInputs: ['depthTest'],
            values: { depthTest: false },
        })];

        const code = compileGraph(nodes, []);

        expect(code).toContain('material.depthTest = false;');
    });
});
