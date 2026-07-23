import { describe, expect, it } from 'vitest';
import {
    getComponentOutputHandle,
    getComponentOutputPorts,
    getComponentOutputType,
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
});
