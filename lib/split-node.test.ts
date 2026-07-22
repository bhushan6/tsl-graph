import { describe, expect, it } from 'vitest';
import { getSplitComponentCount, getVisibleSplitOutputKeys } from './split-node';

describe('split node outputs', () => {
    it.each([
        ['float', 1],
        ['int', 1],
        ['uint', 1],
        ['bool', 1],
        ['vec2', 2],
        ['ivec3', 3],
        ['uvec4', 4],
        ['color', 3],
    ] as const)('shows the component count for %s', (type, expected) => {
        expect(getSplitComponentCount(type)).toBe(expected);
    });

    it.each([null, undefined, 'any' as const, 'texture' as const])(
        'falls back to four components for %s',
        (type) => {
            expect(getSplitComponentCount(type)).toBe(4);
        },
    );

    it('filters component handles while retaining the passthrough output', () => {
        expect(getVisibleSplitOutputKeys(['x', 'y', 'z', 'w', 'out'], 'vec2')).toEqual([
            'x',
            'y',
            'out',
        ]);
    });

    it('removes the passthrough output for scalar inputs', () => {
        expect(getVisibleSplitOutputKeys(['x', 'y', 'z', 'w', 'out'], 'float')).toEqual([
            'x',
        ]);
    });
});
