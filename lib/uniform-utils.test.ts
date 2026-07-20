import { describe, it, expect } from 'vitest';
import {
    getUniformRange,
    hasSliderRange,
    uniformKindSupportsRange,
    clampUniformValue,
    getEffectiveStep,
} from './uniform-utils';

describe('uniformKindSupportsRange', () => {
    it('supports numeric kinds only', () => {
        expect(uniformKindSupportsRange('float')).toBe(true);
        expect(uniformKindSupportsRange('int')).toBe(true);
        expect(uniformKindSupportsRange('vec2')).toBe(true);
        expect(uniformKindSupportsRange('vec3')).toBe(true);
        expect(uniformKindSupportsRange('vec4')).toBe(true);
        expect(uniformKindSupportsRange('bool')).toBe(false);
        expect(uniformKindSupportsRange('color')).toBe(false);
    });
});

describe('getUniformRange', () => {
    it('passes through finite numbers', () => {
        expect(getUniformRange({ min: 0, max: 1, step: 0.05 }, 'float')).toEqual({
            min: 0,
            max: 1,
            step: 0.05,
        });
    });

    it('drops non-numeric and non-finite values', () => {
        expect(getUniformRange({ min: 'abc', max: NaN, step: Infinity }, 'float')).toEqual({});
    });

    it('parses numeric strings', () => {
        expect(getUniformRange({ min: '0', max: '2.5' }, 'float')).toEqual({ min: 0, max: 2.5 });
    });

    it('drops the pair when min > max', () => {
        expect(getUniformRange({ min: 5, max: 1, step: 0.1 }, 'float')).toEqual({ step: 0.1 });
    });

    it('keeps partial bounds', () => {
        expect(getUniformRange({ min: 2 }, 'float')).toEqual({ min: 2 });
        expect(getUniformRange({ max: 7 }, 'float')).toEqual({ max: 7 });
    });

    it('drops non-positive steps', () => {
        expect(getUniformRange({ step: 0 }, 'float')).toEqual({});
        expect(getUniformRange({ step: -1 }, 'float')).toEqual({});
    });

    it('rounds bounds and forces integer step >= 1 for int', () => {
        expect(getUniformRange({ min: 0.4, max: 9.6, step: 0.2 }, 'int')).toEqual({
            min: 0,
            max: 10,
            step: 1,
        });
        expect(getUniformRange({ step: 2.6 }, 'int')).toEqual({ step: 3 });
        expect(getUniformRange({}, 'int')).toEqual({ step: 1 });
    });

    it('returns empty range for bool and color', () => {
        expect(getUniformRange({ min: 0, max: 1, step: 0.1 }, 'bool')).toEqual({});
        expect(getUniformRange({ min: 0, max: 1, step: 0.1 }, 'color')).toEqual({});
    });
});

describe('hasSliderRange', () => {
    it('requires both min and max', () => {
        expect(hasSliderRange({ min: 0, max: 1 })).toBe(true);
        expect(hasSliderRange({ min: 0 })).toBe(false);
        expect(hasSliderRange({ max: 1 })).toBe(false);
        expect(hasSliderRange({})).toBe(false);
    });
});

describe('getEffectiveStep', () => {
    it('defaults to 0.1 for floats and vectors', () => {
        expect(getEffectiveStep('float', {})).toBe(0.1);
        expect(getEffectiveStep('vec3', {})).toBe(0.1);
        expect(getEffectiveStep('float', { step: 0.25 })).toBe(0.25);
    });

    it('returns integer step >= 1 for int', () => {
        expect(getEffectiveStep('int', {})).toBe(1);
        expect(getEffectiveStep('int', { step: 5 })).toBe(5);
        expect(getEffectiveStep('int', { step: 2.4 })).toBe(2);
    });
});

describe('clampUniformValue', () => {
    it('clamps floats to the range', () => {
        expect(clampUniformValue('float', 5, { min: 0, max: 1 })).toBe(1);
        expect(clampUniformValue('float', -3, { min: 0, max: 1 })).toBe(0);
        expect(clampUniformValue('float', 0.5, { min: 0, max: 1 })).toBe(0.5);
    });

    it('clamps with partial bounds', () => {
        expect(clampUniformValue('float', -3, { min: 0 })).toBe(0);
        expect(clampUniformValue('float', 99, { min: 0 })).toBe(99);
        expect(clampUniformValue('float', 99, { max: 10 })).toBe(10);
    });

    it('clamps each vector component', () => {
        expect(clampUniformValue('vec3', [-1, 0.5, 2], { min: 0, max: 1 })).toEqual([0, 0.5, 1]);
        expect(clampUniformValue('vec4', [-1, 0.5, 2, 3], { min: 0, max: 1 })).toEqual([0, 0.5, 1, 1]);
    });

    it('rounds ints after clamping', () => {
        expect(clampUniformValue('int', 7.6, { min: 0, max: 10 })).toBe(8);
        expect(clampUniformValue('int', 20, { min: 0, max: 10 })).toBe(10);
    });

    it('is a no-op for bool and color', () => {
        expect(clampUniformValue('bool', true, { min: 0, max: 1 })).toBe(true);
        expect(clampUniformValue('color', '#ff0000', { min: 0, max: 1 })).toBe('#ff0000');
    });

    it('returns coerced value when range is empty', () => {
        expect(clampUniformValue('float', 5, {})).toBe(5);
        expect(clampUniformValue('vec2', [1, 2], {})).toEqual([1, 2]);
    });
});
