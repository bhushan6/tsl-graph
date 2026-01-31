
import { describe, it, expect, beforeAll } from 'vitest';
import { compileGraph } from './compiler';
import { Node, Edge } from '@xyflow/react';
import { TSLNodeData, NodeType, NodeDef } from '@/lib/types';
import { registry } from './registry';

// Mock registry data
const mockDefs: NodeDef[] = [
    {
        type: 'const/ivec2',
        label: 'IVec2',
        category: 'Constants',
        tsl: 'ivec2',
        inputs: {
            x: { type: 'int', default: 0, label: 'X' },
            y: { type: 'int', default: 0, label: 'Y' },
        },
        outputs: { out: { type: 'ivec2', label: 'XY' } }
    },
    {
        type: 'test/vec5',
        label: 'Vec5',
        category: 'Test',
        tsl: 'vec5_test', // doesn't matter
        inputs: {
            v: { type: 'vec4', default: [1, 2, 3, 4, 5], label: 'V' } // array length 5
        },
        outputs: { out: { type: 'any', label: 'Out' } }
    }
] as unknown as NodeDef[];

beforeAll(() => {
    registry.registerMany(mockDefs);
});

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

describe('Compiler Fixes', () => {
    it('should generate ivec2 for integer vector input', () => {
        // We need a node that takes ivec2 as input or has ivec2 default?
        // Actually getTSLDefaultForType is used when values are provided in node.data.values.
        // Let's assume we have a node that has an input of type 'ivec2'.
        // We need to register such a node.

        // Let's verify what happens when we use getTSLDefaultForType implicitly via compileGraph
        // logic.

        // But getTSLDefaultForType is internal. We can test compileGraph result.
        // However, the current logic in compiler.ts ignores the 'type' if value is array.

        // Let's create a node that accepts 'ivec2' and provide an array value.
        const ivNode = {
            type: 'test/accept_ivec2',
            label: 'Accept IVec2',
            category: 'Test',
            tsl: 'acceptIVec2',
            inputs: {
                v: { type: 'ivec2', default: [0, 0], label: 'V' }
            },
            outputs: { out: { type: 'any', label: 'Out' } }
        } as unknown as NodeDef;
        registry.register(ivNode);

        const nodes = [createNode('n1', 'test/accept_ivec2', { values: { v: [1, 2] } })];
        const code = compileGraph(nodes, []);

        // Current behavior: vec2(1, 2)
        // Desired behavior: ivec2(1, 2)
        expect(code).toContain('ivec2(1, 2)');
    });

    it('should handle array > 4 correctly', () => {
        const nodes = [createNode('n1', 'test/vec5', { values: { v: [1, 2, 3, 4, 5] } })];
        const code = compileGraph(nodes, []);

        // Should probably truncate to 4 or error?
        // Or maybe fall back to float array? TSL doesn't support generic arrays easily in constructors.
        // If the input type is vec4, it should probably take first 4.
        expect(code).toContain('vec4(1, 2, 3, 4)');
    });
});
