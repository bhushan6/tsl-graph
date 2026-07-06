import { describe, expect, it } from 'vitest';
import {
    getQuickCreateConstantSuggestion,
    getQuickCreateConstantSuggestions,
    parseQuickCreateConstant,
} from './quick-create-constants';

describe('parseQuickCreateConstant', () => {
    it('parses finite float literals', () => {
        expect(parseQuickCreateConstant('3')).toMatchObject({
            nodeType: 'const/float',
            values: { value: 3 },
            label: 'Create Float 3',
            outputHandleId: 'out',
            outputType: 'float',
        });
        expect(parseQuickCreateConstant('-3')?.values).toEqual({ value: -3 });
        expect(parseQuickCreateConstant('0.5')?.values).toEqual({ value: 0.5 });
        expect(parseQuickCreateConstant('.5')?.values).toEqual({ value: 0.5 });
    });

    it('suggests float and int for bare integer literals', () => {
        expect(getQuickCreateConstantSuggestions('3')).toMatchObject([
            {
                nodeType: 'const/float',
                values: { value: 3 },
                label: 'Create Float 3',
                outputType: 'float',
            },
            {
                nodeType: 'const/int',
                values: { value: 3 },
                label: 'Create Int 3',
                outputType: 'int',
            },
        ]);
        expect(getQuickCreateConstantSuggestions('-3').map((intent) => intent.nodeType)).toEqual([
            'const/float',
            'const/int',
        ]);
        expect(getQuickCreateConstantSuggestions('0.5').map((intent) => intent.nodeType)).toEqual([
            'const/float',
        ]);
    });

    it('parses scalar constructors for existing scalar constant nodes', () => {
        expect(parseQuickCreateConstant('float(0)')).toMatchObject({
            nodeType: 'const/float',
            values: { value: 0 },
            label: 'Create Float 0',
            outputType: 'float',
        });
        expect(parseQuickCreateConstant(' FLOAT ( .5 ) ')?.values).toEqual({ value: 0.5 });
        expect(parseQuickCreateConstant('int(0)')).toMatchObject({
            nodeType: 'const/int',
            values: { value: 0 },
            label: 'Create Int 0',
            outputType: 'int',
        });
        expect(parseQuickCreateConstant(' INT ( -3 ) ')?.values).toEqual({ value: -3 });
    });

    it('rejects invalid numeric and future expression syntax', () => {
        expect(parseQuickCreateConstant('3 * 5')).toBeNull();
        expect(parseQuickCreateConstant('Infinity')).toBeNull();
        expect(parseQuickCreateConstant('1e3')).toBeNull();
        expect(parseQuickCreateConstant('-')).toBeNull();
        expect(parseQuickCreateConstant('int(0.5)')).toBeNull();
        expect(parseQuickCreateConstant('uint(0)')).toBeNull();
        expect(getQuickCreateConstantSuggestions('uint(0)')).toEqual([]);
    });

    it('parses vector constructors using TSL primitive arity behavior', () => {
        expect(parseQuickCreateConstant('vec2()')?.values).toEqual({ x: 0, y: 0 });
        expect(parseQuickCreateConstant('vec2(3)')?.values).toEqual({ x: 3, y: 3 });
        expect(parseQuickCreateConstant('vec2(2, 4)')).toMatchObject({
            nodeType: 'const/vec2',
            values: { x: 2, y: 4 },
            label: 'Create Vec2 (2, 4)',
            outputType: 'vec2',
        });

        expect(parseQuickCreateConstant('vec3()')?.values).toEqual({ x: 0, y: 0, z: 0 });
        expect(parseQuickCreateConstant('vec3(3)')?.values).toEqual({ x: 3, y: 3, z: 3 });
        expect(parseQuickCreateConstant('vec3(2, 4)')?.values).toEqual({ x: 2, y: 4, z: 0 });
        expect(parseQuickCreateConstant('vec3(1, 2, 3)')?.values).toEqual({ x: 1, y: 2, z: 3 });
        expect(parseQuickCreateConstant(' VEC3 ( .5 , -2 , 3.25 ) ')?.values).toEqual({
            x: 0.5,
            y: -2,
            z: 3.25,
        });

        expect(parseQuickCreateConstant('vec4()')?.values).toEqual({ x: 0, y: 0, z: 0, w: 1 });
        expect(parseQuickCreateConstant('vec4(3)')?.values).toEqual({ x: 3, y: 3, z: 3, w: 3 });
        expect(parseQuickCreateConstant('vec4(1, 2)')?.values).toEqual({ x: 1, y: 2, z: 0, w: 1 });
        expect(parseQuickCreateConstant('vec4(1, 2, 3)')?.values).toEqual({ x: 1, y: 2, z: 3, w: 1 });
        expect(parseQuickCreateConstant('vec4(1, 2, 3, 4)')).toMatchObject({
            nodeType: 'const/vec4',
            values: { x: 1, y: 2, z: 3, w: 4 },
            label: 'Create Vec4 (1, 2, 3, 4)',
            outputType: 'vec4',
        });
    });

    it('rejects unsupported vector constructors', () => {
        expect(parseQuickCreateConstant('vec2(1, 2, 3)')).toBeNull();
        expect(parseQuickCreateConstant('vec3(1, 2, 3, 4)')).toBeNull();
        expect(parseQuickCreateConstant('vec3(red)')).toBeNull();
        expect(parseQuickCreateConstant('vec3(1,)')).toBeNull();
        expect(parseQuickCreateConstant('vec4(1, 2, 3, 4, 5)')).toBeNull();
        expect(parseQuickCreateConstant('ivec3(3)')).toBeNull();
    });

    it('suggests completed vector constructors for incomplete input', () => {
        expect(getQuickCreateConstantSuggestion('vec2(0')).toMatchObject({
            nodeType: 'const/vec2',
            values: { x: 0, y: 0 },
            label: 'Create Vec2 (0, 0)',
        });
        expect(getQuickCreateConstantSuggestion('vec3(2, 4')).toMatchObject({
            nodeType: 'const/vec3',
            values: { x: 2, y: 4, z: 0 },
            label: 'Create Vec3 (2, 4, 0)',
        });
        expect(getQuickCreateConstantSuggestion('vec4(1, 2, 3')).toMatchObject({
            nodeType: 'const/vec4',
            values: { x: 1, y: 2, z: 3, w: 1 },
            label: 'Create Vec4 (1, 2, 3, 1)',
        });
        expect(getQuickCreateConstantSuggestion('vec2(')).toMatchObject({
            nodeType: 'const/vec2',
            values: { x: 0, y: 0 },
        });
    });

    it('does not suggest invalid incomplete vector constructors', () => {
        expect(getQuickCreateConstantSuggestion('vec2(0,')).toBeNull();
        expect(getQuickCreateConstantSuggestion('vec2(red')).toBeNull();
        expect(getQuickCreateConstantSuggestion('vec2(1, 2, 3')).toBeNull();
    });

    it('parses full hex colors with lowercase normalization', () => {
        expect(parseQuickCreateConstant('#FF0000')).toMatchObject({
            nodeType: 'const/color',
            values: { value: '#ff0000' },
            label: 'Create Color #ff0000',
            outputHandleId: 'out',
            outputType: 'color',
        });
        expect(parseQuickCreateConstant('#f00')).toBeNull();
    });

    it('parses CSS named colors and excludes transparent', () => {
        expect(parseQuickCreateConstant('red')?.values).toEqual({ value: '#ff0000' });
        expect(parseQuickCreateConstant('blue')?.values).toEqual({ value: '#0000ff' });
        expect(parseQuickCreateConstant('rebeccapurple')?.values).toEqual({ value: '#663399' });
        expect(parseQuickCreateConstant('transparent')).toBeNull();
    });

    it('parses color constructors', () => {
        expect(parseQuickCreateConstant('color(1, 0, 0)')).toMatchObject({
            nodeType: 'const/color',
            values: { value: '#ff0000' },
            outputType: 'color',
        });
        expect(parseQuickCreateConstant('color(0.5, 0.5, 0.5)')?.values).toEqual({ value: '#808080' });
        // Components clamp to [0, 1]
        expect(parseQuickCreateConstant('color(2, -1, 0)')?.values).toEqual({ value: '#ff0000' });
        // Single argument: color name, hex, or grayscale
        expect(parseQuickCreateConstant('color(red)')?.values).toEqual({ value: '#ff0000' });
        expect(parseQuickCreateConstant('color(#00ff00)')?.values).toEqual({ value: '#00ff00' });
        expect(parseQuickCreateConstant('color(0.5)')?.values).toEqual({ value: '#808080' });
        // Wrong arity fails
        expect(parseQuickCreateConstant('color(1, 0)')).toBeNull();
        expect(parseQuickCreateConstant('color()')).toBeNull();
    });
});
