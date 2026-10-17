import { describe, expect, it } from 'vitest';
import type { NodeDef, NodeType, TSLType } from './types';
import type { TSLFunction } from './nodes/inferred-types';
import { registry } from './registry';
import { initializeNodes } from './nodes';

function registerTestNode(type: string, outputType: TSLType, outputs?: NodeDef['outputs']) {
    registry.register({
        type: type as NodeType,
        label: type,
        category: 'Advanced',
        tsl: type as TSLFunction,
        outputs: outputs ?? { out: { label: 'Out', type: outputType } },
    });
}

describe('NodeRegistry component outputs', () => {
    it('adds channels to Advanced, Noise, Utils, and TSL Texture nodes', () => {
        initializeNodes();

        expect(Object.keys(registry.get('advanced/output')?.outputs ?? {}))
            .toEqual(['x', 'y', 'z', 'w', 'out']);
        expect(Object.keys(registry.get('noise/fractal_noise_vec2')?.outputs ?? {}))
            .toEqual(['x', 'y', 'out']);
        expect(Object.keys(registry.get('noise/noise_vec3')?.outputs ?? {}))
            .toEqual(['x', 'y', 'z', 'out']);
        expect(Object.keys(registry.get('utils/linearGradient')?.outputs ?? {}))
            .toEqual(['r', 'g', 'b', 'out']);
        expect(Object.keys(registry.get('tslTextures/marble')?.outputs ?? {}))
            .toEqual(['x', 'y', 'z', 'out']);
    });

    it.each([
        ['vec2', ['x', 'y', 'out']],
        ['vec3', ['x', 'y', 'z', 'out']],
        ['vec4', ['x', 'y', 'z', 'w', 'out']],
        ['color', ['r', 'g', 'b', 'out']],
    ] as const)('adds channel ports to a single %s output', (outputType, expectedHandles) => {
        const type = `test/component-${outputType}`;
        registerTestNode(type, outputType);

        expect(Object.keys(registry.get(type)?.outputs ?? {})).toEqual(expectedHandles);
    });

    it('leaves scalar outputs unchanged', () => {
        const type = 'test/component-float';
        registerTestNode(type, 'float');

        expect(Object.keys(registry.get(type)?.outputs ?? {})).toEqual(['out']);
    });

    it('does not add ambiguous channels to nodes with multiple outputs', () => {
        const type = 'test/component-multiple';
        registerTestNode(type, 'vec3', {
            first: { label: 'First', type: 'vec3' },
            second: { label: 'Second', type: 'vec2' },
        });

        expect(Object.keys(registry.get(type)?.outputs ?? {})).toEqual(['first', 'second']);
    });
});
