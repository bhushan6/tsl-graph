import { describe, it, expect, beforeAll } from 'vitest';
import type { Node } from '@xyflow/react';
import type { NodeType, TSLNodeData } from '@/lib/types';
import { registry } from './registry';
import { getNodeDisplayName } from './node-display-name';

const createNode = (id: string, type: string): Node<TSLNodeData> => ({
    id,
    type,
    position: { x: 0, y: 0 },
    data: { type: type as NodeType, values: {}, connected: {} },
});

beforeAll(() => {
    registry.registerMany([
        {
            type: 'const/float' as NodeType,
            label: 'Float',
            category: 'Constants',
            tsl: 'float',
            outputs: { out: { type: 'float', label: 'Out' } },
        },
    ] as never[]);
});

describe('getNodeDisplayName', () => {
    it('uses the registry label when available', () => {
        expect(getNodeDisplayName(createNode('a', 'const/float'), {}, {})).toBe('Float');
    });

    it('uses subgraph and code node template names', () => {
        const subgraphs = {
            'custom/blur-1': { name: 'Blur' },
        } as never;
        const codeNodes = {
            'code/fx-1': { name: 'FX' },
        } as never;
        expect(getNodeDisplayName(createNode('a', 'custom/blur-1'), subgraphs, {})).toBe('Blur');
        expect(getNodeDisplayName(createNode('a', 'code/fx-1'), {}, codeNodes)).toBe('FX');
    });

    it('strips prefixes when the template is missing and falls back to the raw type', () => {
        expect(getNodeDisplayName(createNode('a', 'custom/blur-1'), {}, {})).toBe('blur-1');
        expect(getNodeDisplayName(createNode('a', 'code/fx-1'), {}, {})).toBe('fx-1');
        expect(getNodeDisplayName(createNode('a', 'mystery/x'), {}, {})).toBe('mystery/x');
    });
});
