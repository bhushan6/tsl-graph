import { describe, it, expect } from 'vitest';
import { convertValue, inferType, hexToRgb, rgbToHex } from './AnyInput';

describe('inferType', () => {
    it('should identify float', () => {
        expect(inferType(0)).toBe('float');
        expect(inferType(1.5)).toBe('float');
        expect(inferType(-10)).toBe('float');
    });

    it('should identify bool', () => {
        expect(inferType(true)).toBe('bool');
        expect(inferType(false)).toBe('bool');
    });

    it('should identify color', () => {
        expect(inferType('#ffffff')).toBe('color');
        expect(inferType('#000000')).toBe('color');
        expect(inferType('#ff0000')).toBe('color');
    });

    it('should identify vec2', () => {
        expect(inferType([1, 2])).toBe('vec2');
    });

    it('should identify vec3', () => {
        expect(inferType([1, 2, 3])).toBe('vec3');
    });

    it('should identify vec4', () => {
        expect(inferType([1, 2, 3, 4])).toBe('vec4');
    });

    it('should default arrays to vec3', () => {
        expect(inferType([1])).toBe('vec3');
        expect(inferType([1, 2, 3, 4, 5])).toBe('vec3');
    });
});

describe('hexToRgb', () => {
    it('should convert white', () => {
        expect(hexToRgb('#ffffff')).toEqual([1, 1, 1]);
    });

    it('should convert black', () => {
        expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
    });

    it('should convert red', () => {
        expect(hexToRgb('#ff0000')).toEqual([1, 0, 0]);
    });

    it('should convert mid-gray', () => {
        const [r, g, b] = hexToRgb('#808080');
        expect(r).toBeCloseTo(0.5, 1);
        expect(g).toBeCloseTo(0.5, 1);
        expect(b).toBeCloseTo(0.5, 1);
    });

    it('should handle hex without #', () => {
        expect(hexToRgb('ff0000')).toEqual([1, 0, 0]);
    });

    it('should return white for invalid hex', () => {
        expect(hexToRgb('invalid')).toEqual([1, 1, 1]);
    });
});

describe('rgbToHex', () => {
    it('should convert white', () => {
        expect(rgbToHex(1, 1, 1)).toBe('#ffffff');
    });

    it('should convert black', () => {
        expect(rgbToHex(0, 0, 0)).toBe('#000000');
    });

    it('should convert red', () => {
        expect(rgbToHex(1, 0, 0)).toBe('#ff0000');
    });

    it('should clamp values above 1', () => {
        expect(rgbToHex(2, 0, 0)).toBe('#ff0000');
    });

    it('should clamp values below 0', () => {
        expect(rgbToHex(-1, 0, 0)).toBe('#000000');
    });
});

describe('convertValue', () => {
    describe('float conversions', () => {
        it('float → float (same type)', () => {
            expect(convertValue(5, 'float')).toBe(5);
        });

        it('float → vec2', () => {
            expect(convertValue(5, 'vec2')).toEqual([5, 0]);
        });

        it('float → vec3', () => {
            expect(convertValue(5, 'vec3')).toEqual([5, 0, 0]);
        });

        it('float → vec4 (alpha defaults to 1)', () => {
            expect(convertValue(5, 'vec4')).toEqual([5, 0, 0, 1]);
        });

        it('float → bool (non-zero = true)', () => {
            expect(convertValue(5, 'bool')).toBe(true);
            expect(convertValue(0, 'bool')).toBe(false);
        });

        it('float → color (r=value, g=b=1 default)', () => {
            // Float only provides one component (r), g and b default to 1
            expect(convertValue(1, 'color')).toBe('#ffffff');
            expect(convertValue(0, 'color')).toBe('#00ffff');
        });
    });

    describe('vec2 conversions', () => {
        it('vec2 → float (takes x)', () => {
            expect(convertValue([3, 4], 'float')).toBe(3);
        });

        it('vec2 → vec2 (same type)', () => {
            expect(convertValue([3, 4], 'vec2')).toEqual([3, 4]);
        });

        it('vec2 → vec3 (extends with 0)', () => {
            expect(convertValue([3, 4], 'vec3')).toEqual([3, 4, 0]);
        });

        it('vec2 → vec4 (extends with 0, alpha = 1)', () => {
            expect(convertValue([3, 4], 'vec4')).toEqual([3, 4, 0, 1]);
        });

        it('vec2 → bool (any non-zero = true)', () => {
            expect(convertValue([0, 1], 'bool')).toBe(true);
            expect(convertValue([0, 0], 'bool')).toBe(false);
        });
    });

    describe('vec3 conversions', () => {
        it('vec3 → float (takes x)', () => {
            expect(convertValue([1, 2, 3], 'float')).toBe(1);
        });

        it('vec3 → vec2 (truncates)', () => {
            expect(convertValue([1, 2, 3], 'vec2')).toEqual([1, 2]);
        });

        it('vec3 → vec3 (same type)', () => {
            expect(convertValue([1, 2, 3], 'vec3')).toEqual([1, 2, 3]);
        });

        it('vec3 → vec4 (extends with alpha = 1)', () => {
            expect(convertValue([1, 0, 0], 'vec4')).toEqual([1, 0, 0, 1]);
        });

        it('vec3 → color (RGB to hex)', () => {
            expect(convertValue([1, 0, 0], 'color')).toBe('#ff0000');
            expect(convertValue([0, 1, 0], 'color')).toBe('#00ff00');
            expect(convertValue([0, 0, 1], 'color')).toBe('#0000ff');
        });

        it('vec3 → bool', () => {
            expect(convertValue([0, 0, 1], 'bool')).toBe(true);
            expect(convertValue([0, 0, 0], 'bool')).toBe(false);
        });
    });

    describe('vec4 conversions', () => {
        it('vec4 → float (takes x)', () => {
            expect(convertValue([1, 2, 3, 4], 'float')).toBe(1);
        });

        it('vec4 → vec2 (truncates)', () => {
            expect(convertValue([1, 2, 3, 4], 'vec2')).toEqual([1, 2]);
        });

        it('vec4 → vec3 (truncates)', () => {
            expect(convertValue([1, 2, 3, 4], 'vec3')).toEqual([1, 2, 3]);
        });

        it('vec4 → vec4 (same type)', () => {
            expect(convertValue([1, 2, 3, 4], 'vec4')).toEqual([1, 2, 3, 4]);
        });

        it('vec4 → color (RGB to hex, ignores alpha)', () => {
            expect(convertValue([1, 0, 0, 0.5], 'color')).toBe('#ff0000');
        });
    });

    describe('color conversions', () => {
        it('color → float (luminance/r component)', () => {
            expect(convertValue('#ff0000', 'float')).toBe(1);
            expect(convertValue('#000000', 'float')).toBe(0);
        });

        it('color → vec2 (r, g)', () => {
            expect(convertValue('#ff0000', 'vec2')).toEqual([1, 0]);
        });

        it('color → vec3 (rgb normalized)', () => {
            expect(convertValue('#ff0000', 'vec3')).toEqual([1, 0, 0]);
        });

        it('color → vec4 (rgb + alpha = 1)', () => {
            expect(convertValue('#ff0000', 'vec4')).toEqual([1, 0, 0, 1]);
        });

        it('color → bool (non-black = true)', () => {
            expect(convertValue('#ff0000', 'bool')).toBe(true);
            expect(convertValue('#000000', 'bool')).toBe(false);
        });

        it('color → color (same type)', () => {
            expect(convertValue('#ff0000', 'color')).toBe('#ff0000');
        });
    });

    describe('bool conversions', () => {
        it('bool → float', () => {
            expect(convertValue(true, 'float')).toBe(1);
            expect(convertValue(false, 'float')).toBe(0);
        });

        it('bool → vec2', () => {
            expect(convertValue(true, 'vec2')).toEqual([1, 0]);
            expect(convertValue(false, 'vec2')).toEqual([0, 0]);
        });

        it('bool → vec3', () => {
            expect(convertValue(true, 'vec3')).toEqual([1, 0, 0]);
            expect(convertValue(false, 'vec3')).toEqual([0, 0, 0]);
        });

        it('bool → vec4 (alpha = 1)', () => {
            expect(convertValue(true, 'vec4')).toEqual([1, 0, 0, 1]);
            expect(convertValue(false, 'vec4')).toEqual([0, 0, 0, 1]);
        });

        it('bool → color (r=1|0, g=b=1 default)', () => {
            // Bool provides one component (r), g and b default to 1
            expect(convertValue(true, 'color')).toBe('#ffffff');
            expect(convertValue(false, 'color')).toBe('#00ffff');
        });

        it('bool → bool (same type)', () => {
            expect(convertValue(true, 'bool')).toBe(true);
            expect(convertValue(false, 'bool')).toBe(false);
        });
    });
});
