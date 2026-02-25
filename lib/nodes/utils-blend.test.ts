import { describe, it, expect, beforeAll } from 'vitest';
import { Node } from '@xyflow/react';
import { compileGraph, getRequiredImports, getRequiredImportsByModule } from '../compiler';
import { registry } from '../registry';
import { TSLNodeData, NodeType } from '@/lib/types';
import { utilsNodes } from './utils';

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

describe('Utils Blend/Filter Nodes', () => {
    beforeAll(() => {
        registry.registerMany(utilsNodes);
    });

    it('compiles blend overlay as custom TSL helper call', () => {
        const nodes = [
            createNode('blend', 'utils/blendOverlay', {
                values: {
                    base: [0.2, 0.4, 0.6],
                    blend: [0.9, 0.3, 0.1],
                },
            }),
        ];

        const code = compileGraph(nodes, []);
        expect(code).toContain('const _node0 = blendOverlay(');
    });

    it('compiles adjust saturate as custom TSL helper call', () => {
        const nodes = [
            createNode('sat', 'utils/adjustSaturate', {
                values: {
                    color: [0.5, 0.2, 0.8],
                    saturation: 1.25,
                },
            }),
        ];

        const code = compileGraph(nodes, []);
        expect(code).toContain('const _node0 = adjustSaturate(');
    });

    it('routes custom helper imports via tsl-utils module', () => {
        const nodes = [createNode('dodge', 'utils/blendColorDodge')];
        const imports = getRequiredImports(nodes);
        const groups = getRequiredImportsByModule(nodes);
        const byModule = new Map(groups.map((group) => [group.from, group.imports]));

        expect(imports).toContain('blendColorDodge');
        expect(byModule.get('@/lib/tsl-utils')).toEqual(['blendColorDodge']);
        expect(byModule.get('three/tsl') ?? []).not.toContain('blendColorDodge');
    });

    it('compiles hslToRgb via tsl-utils helper and module import', () => {
        const nodes = [
            createNode('hsl', 'utils/hslToRgb', {
                values: {
                    h: 120,
                    s: 0.5,
                    l: 0.4,
                },
            }),
        ];

        const code = compileGraph(nodes, []);
        const groups = getRequiredImportsByModule(nodes);
        const byModule = new Map(groups.map((group) => [group.from, group.imports]));

        expect(code).toContain('const _node0 = hslToRgb(120, 0.5, 0.4);');
        expect(byModule.get('@/lib/tsl-utils')).toEqual(['hslToRgb']);
    });
});
