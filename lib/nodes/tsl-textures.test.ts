import { beforeAll, describe, expect, it } from 'vitest';
import { Node, Edge } from '@xyflow/react';
import { compileGraph, getRequiredImportsByModule } from '../compiler';
import { TSLNodeData, NodeType, SubgraphDefinition } from '@/lib/types';
import { initializeNodes } from './index';

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

describe('TSL Textures Nodes', () => {
    beforeAll(() => {
        initializeNodes();
    });

    it('compiles a params-object call with defaults', () => {
        const nodes = [createNode('m', 'tslTextures/marble')];

        const code = compileGraph(nodes, []);
        expect(code).toContain(
            'const _node0 = marble({ scale: 1.2, thinness: 5, noise: 0.3, color: color("#4545d3"), background: color("#f0f8ff"), seed: 0 });'
        );
    });

    it('omits unconnected connectionOnly inputs so library defaults apply', () => {
        const nodes = [createNode('m', 'tslTextures/marble')];

        const code = compileGraph(nodes, []);
        expect(code).not.toContain('position:');
        expect(code).not.toContain('positionGeometry');
    });

    it('includes connectionOnly inputs when connected', () => {
        const nodes = [
            createNode('pos', 'geo/positionWorld'),
            createNode('m', 'tslTextures/marble'),
        ];
        const edges: Edge[] = [
            { id: 'e1', source: 'pos', target: 'm', sourceHandle: 'out', targetHandle: 'position' },
        ];

        const code = compileGraph(nodes, edges);
        expect(code).toMatch(/marble\(\{ position: _node\d+/);
    });

    it('includes propertyOnly params in the params object', () => {
        const nodes = [
            createNode('dots', 'tslTextures/polkaDots', {
                values: { flat: 1 },
            }),
        ];

        const code = compileGraph(nodes, []);
        expect(code).toContain('flat: 1');
    });

    it('emits only the primary call when no member outputs are connected', () => {
        const nodes = [createNode('br', 'tslTextures/brain')];

        const code = compileGraph(nodes, []);
        expect(code).toContain('color: brain({');
        expect(code).not.toContain('brain.normal');
    });

    it('emits member calls with a shared params const when both outputs are connected', () => {
        const material = createNode('mat', 'material/standard', {
            activeInputs: ['colorNode', 'normalNode'],
        });
        const nodes = [createNode('br', 'tslTextures/brain'), material];
        const edges: Edge[] = [
            { id: 'e1', source: 'br', target: 'mat', sourceHandle: 'color', targetHandle: 'colorNode' },
            { id: 'e2', source: 'br', target: 'mat', sourceHandle: 'normal', targetHandle: 'normalNode' },
        ];

        const code = compileGraph(nodes, edges);
        expect(code).toContain('_node0_params = {');
        expect(code).toContain('color: brain(_node0_params)');
        expect(code).toContain('normal: brain.normal(_node0_params)');
        expect(code).toContain('material.colorNode = _node0.color');
        expect(code).toContain('material.normalNode = _node0.normal');
    });

    it('emits only the connected member call', () => {
        const material = createNode('mat', 'material/standard', {
            activeInputs: ['opacityNode'],
        });
        const nodes = [createNode('cl', 'tslTextures/clouds'), material];
        const edges: Edge[] = [
            { id: 'e1', source: 'cl', target: 'mat', sourceHandle: 'opacity', targetHandle: 'opacityNode' },
        ];

        const code = compileGraph(nodes, edges);
        expect(code).toMatch(/const _node0 = \{ opacity: clouds\.opacity\(\{/);
        expect(code).not.toContain('color: clouds(');
        expect(code).toContain('material.opacityNode = _node0.opacity');
    });

    it('compiles a plain-color texture with all its defaults', () => {
        const nodes = [createNode('c', 'tslTextures/camouflage')];

        const code = compileGraph(nodes, []);
        expect(code).toContain(
            'const _node0 = camouflage({ scale: 2, colorA: color("#c2bea8"), colorB: color("#9c895e"), colorC: color("#92a375"), colorD: color("#717561"), seed: 0 });'
        );
    });

    it('includes a propertyOnly dropdown value for neonLights mode', () => {
        const nodes = [
            createNode('n', 'tslTextures/neonLights', { values: { mode: 1 } }),
        ];

        const code = compileGraph(nodes, []);
        expect(code).toContain('mode: 1');
    });

    it('emits all three runnyEggs member calls when connected', () => {
        const material = createNode('mat', 'material/standard', {
            activeInputs: ['normalNode', 'roughnessNode'],
        });
        const nodes = [createNode('egg', 'tslTextures/runnyEggs'), material];
        const edges: Edge[] = [
            { id: 'e1', source: 'egg', target: 'mat', sourceHandle: 'normal', targetHandle: 'normalNode' },
            { id: 'e2', source: 'egg', target: 'mat', sourceHandle: 'roughness', targetHandle: 'roughnessNode' },
        ];

        const code = compileGraph(nodes, edges);
        expect(code).toContain('_node0_params = {');
        expect(code).toContain('normal: runnyEggs.normal(_node0_params)');
        expect(code).toContain('roughness: runnyEggs.roughness(_node0_params)');
    });

    it('routes imports to the tsl-textures module', () => {
        const nodes = [
            createNode('m', 'tslTextures/marble'),
            createNode('br', 'tslTextures/brain'),
        ];
        const groups = getRequiredImportsByModule(nodes);
        const byModule = new Map(groups.map((group) => [group.from, group.imports]));

        expect(byModule.get('tsl-textures')).toEqual(['brain', 'marble']);
        expect(byModule.get('three/tsl') ?? []).not.toContain('marble');
    });

    it('compiles inside subgraphs', () => {
        const subgraph: SubgraphDefinition = {
            id: 'custom/sub1',
            name: 'Sub',
            inputs: [],
            outputs: [{ id: 'out_0', label: 'out', type: 'vec3' }],
            nodes: [createNode('m', 'tslTextures/marble')],
            edges: [
                { id: 'se1', source: 'm', target: 'subgraph-output', sourceHandle: 'out', targetHandle: 'out_0' },
            ],
            createdAt: 0,
            updatedAt: 0,
        };

        const nodes = [createNode('inst', 'custom/sub1')];
        const code = compileGraph(nodes, [], { 'custom/sub1': subgraph });
        expect(code).toContain('marble({');
    });
});
