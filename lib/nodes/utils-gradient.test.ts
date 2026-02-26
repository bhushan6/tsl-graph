import { beforeAll, describe, expect, it } from 'vitest';
import { Node } from '@xyflow/react';
import { compileGraph, getRequiredImportsByModule } from '../compiler';
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

describe('Utils Linear Gradient Node', () => {
    beforeAll(() => {
        registry.registerMany(utilsNodes);
    });

    it('compiles linearGradient with serialized stop literals and t fallback', () => {
        const nodes = [
            createNode('grad', 'utils/linearGradient', {
                values: {
                    mode: 1.0,
                    stops: [
                        { color: '#00d4ff', pos: 1.0 },
                        { color: '#020024', pos: 0.0 },
                    ],
                },
            }),
        ];

        const code = compileGraph(nodes, []);
        expect(code).toContain('linearGradient(float(0), 1,');
        expect(code).toContain('{ color: color("#020024"), pos: 0 }');
        expect(code).toContain('{ color: color("#00d4ff"), pos: 1 }');
    });

    it('routes linearGradient import to tsl-utils module', () => {
        const nodes = [createNode('grad', 'utils/linearGradient')];
        const groups = getRequiredImportsByModule(nodes);
        const byModule = new Map(groups.map((group) => [group.from, group.imports]));

        expect(byModule.get('@/lib/tsl-utils')).toEqual(['linearGradient']);
        expect(byModule.get('three/tsl') ?? []).not.toContain('linearGradient');
        expect(byModule.get('three/tsl') ?? []).toContain('color');
        expect(byModule.get('three/tsl') ?? []).toContain('float');
    });
});
