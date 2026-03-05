import { beforeAll, describe, expect, it } from 'vitest';
import { Node } from '@xyflow/react';
import { compileGraph, getRequiredImportsByModule } from '../compiler';
import { registry } from '../registry';
import { TSLNodeData, NodeType } from '@/lib/types';
import { easingNodes } from './easing';

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

describe('Easing Nodes', () => {
    beforeAll(() => {
        registry.registerMany(easingNodes);
    });

    it('compiles easing node calls', () => {
        const nodes = [
            createNode('ease', 'easing/easeInOutCubic', {
                values: { t: 0.35 },
            }),
        ];

        const code = compileGraph(nodes, []);
        expect(code).toContain('const _node0 = easeInOutCubic(0.35);');
    });

    it('routes easing imports to tsl-easings module', () => {
        const nodes = [createNode('ease', 'easing/easeOutCircular')];
        const groups = getRequiredImportsByModule(nodes);
        const byModule = new Map(groups.map((group) => [group.from, group.imports]));

        expect(byModule.get('tsl-easings')).toEqual(['easeOutCircular']);
        expect(byModule.get('three/tsl') ?? []).not.toContain('easeOutCircular');
    });
});
