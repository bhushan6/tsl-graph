import { describe, expect, it } from 'vitest';
import {
    getComponentOutputHandle,
    getComponentOutputPorts,
    getComponentOutputType,
    withComponentOutputPorts,
} from './component-outputs';

describe('component outputs', () => {
    it.each([
        ['float', []],
        ['vec2', ['x', 'y']],
        ['vec3', ['x', 'y', 'z']],
        ['vec4', ['x', 'y', 'z', 'w']],
        ['ivec2', ['x', 'y']],
        ['uvec3', ['x', 'y', 'z']],
        ['bvec4', ['x', 'y', 'z', 'w']],
        ['color', ['r', 'g', 'b']],
    ] as const)('derives the expected handles for %s', (type, expectedHandles) => {
        expect(Object.keys(getComponentOutputPorts(type))).toEqual(expectedHandles);
    });

    it.each([
        ['vec2', 'x', 'float'],
        ['ivec3', 'z', 'int'],
        ['uvec4', 'w', 'uint'],
        ['bvec2', 'y', 'bool'],
        ['color', 'g', 'float'],
    ] as const)('resolves %s.%s as %s', (type, handle, expectedType) => {
        expect(getComponentOutputType(type, handle)).toBe(expectedType);
    });

    it('rejects components outside the output width', () => {
        expect(getComponentOutputType('vec2', 'z')).toBeNull();
        expect(getComponentOutputHandle('vec2', 'b')).toBeNull();
    });

    it('maps color and vector swizzle aliases to their visible handles', () => {
        expect(getComponentOutputHandle('vec3', 'g')).toBe('y');
        expect(getComponentOutputHandle('color', 'y')).toBe('g');
    });

    it('adds components before a single typed output', () => {
        expect(Object.keys(withComponentOutputPorts({
            out: { label: 'Out', type: 'vec3' },
        }))).toEqual(['x', 'y', 'z', 'out']);
    });

    it('does not add ambiguous components to multiple outputs', () => {
        const outputs = {
            out_0: { label: 'First', type: 'vec3' as const },
            out_1: { label: 'Second', type: 'vec2' as const },
        };
        expect(withComponentOutputPorts(outputs)).toEqual(outputs);
    });
});
