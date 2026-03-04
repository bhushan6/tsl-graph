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

describe('Utils SDF Nodes', () => {
    beforeAll(() => {
        registry.registerMany(utilsNodes);
    });

    it('compiles sdfCircle2D helper call', () => {
        const nodes = [
            createNode('circle', 'utils/sdfCircle2D', {
                values: {
                    uv: [0.1, -0.2],
                    center: [0, 0],
                    radius: 0.35,
                },
            }),
        ];

        const code = compileGraph(nodes, []);
        expect(code).toContain('const _node0 = sdfCircle2D(vec2(0.1, -0.2), vec2(0, 0), 0.35);');
    });

    it('compiles sdfCapsule2D helper call', () => {
        const nodes = [
            createNode('capsule', 'utils/sdfCapsule2D', {
                values: {
                    uv: [0, 0],
                    pointA: [-0.25, 0],
                    pointB: [0.25, 0.3],
                    radius: 0.1,
                },
            }),
        ];

        const code = compileGraph(nodes, []);
        expect(code).toContain('const _node0 = sdfCapsule2D(');
    });

    it('compiles sdfCross2D helper call', () => {
        const nodes = [
            createNode('cross', 'utils/sdfCross2D', {
                values: {
                    uv: [0.2, -0.1],
                    center: [0, 0],
                    armLength: 0.8,
                    thickness: 0.2,
                },
            }),
        ];

        const code = compileGraph(nodes, []);
        expect(code).toContain('const _node0 = sdfCross2D(vec2(0.2, -0.1), vec2(0, 0), 0.8, 0.2);');
    });

    it('routes SDF helper imports via tsl-utils module', () => {
        const nodes = [
            createNode('circle', 'utils/sdfCircle2D'),
            createNode('box', 'utils/sdfBox2D'),
            createNode('rounded', 'utils/sdfRoundedBox2D'),
            createNode('capsule', 'utils/sdfCapsule2D'),
            createNode('cross', 'utils/sdfCross2D'),
        ];

        const groups = getRequiredImportsByModule(nodes);
        const byModule = new Map(groups.map((group) => [group.from, group.imports]));

        expect(byModule.get('@/lib/tsl-utils')).toEqual([
            'sdfBox2D',
            'sdfCapsule2D',
            'sdfCircle2D',
            'sdfCross2D',
            'sdfRoundedBox2D',
        ]);
        expect(byModule.get('three/tsl') ?? []).not.toContain('sdfCircle2D');
        expect(byModule.get('three/tsl') ?? []).not.toContain('sdfBox2D');
        expect(byModule.get('three/tsl') ?? []).not.toContain('sdfRoundedBox2D');
        expect(byModule.get('three/tsl') ?? []).not.toContain('sdfCapsule2D');
        expect(byModule.get('three/tsl') ?? []).not.toContain('sdfCross2D');
    });
});
