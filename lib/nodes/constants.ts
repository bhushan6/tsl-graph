import { BaseNodeDef } from './definitions';

export const constantNodes = [
    {
        type: 'const/float',
        label: 'Float',
        category: 'Constants',
        inputs: {
            value: { label: 'Value', type: 'float', default: 0 },
        },
        outputs: {
            out: { label: 'Out', type: 'float' },
        },
        tsl: 'float',
    },
    {
        type: 'const/int',
        label: 'Int',
        category: 'Constants',
        inputs: {
            value: { label: 'Value', type: 'int', default: 0 },
        },
        outputs: {
            out: { label: 'Out', type: 'int' },
        },
        tsl: 'int',
    },
    {
        type: 'const/vec2',
        label: 'Vec2',
        category: 'Constants',
        inputs: {
            x: { label: 'X', type: 'float', default: 0 },
            y: { label: 'Y', type: 'float', default: 0 },
        },
        outputs: {
            x: { label: 'X', type: 'float' },
            y: { label: 'Y', type: 'float' },
            out: { label: 'XY', type: 'vec2' },
        },
        tsl: 'vec2',
    },
    {
        type: 'const/vec3',
        label: 'Vec3',
        category: 'Constants',
        inputs: {
            x: { label: 'X', type: 'float', default: 0 },
            y: { label: 'Y', type: 'float', default: 0 },
            z: { label: 'Z', type: 'float', default: 0 },
        },
        outputs: {
            x: { label: 'X', type: 'float' },
            y: { label: 'Y', type: 'float' },
            z: { label: 'Z', type: 'float' },
            out: { label: 'XYZ', type: 'vec3' },
        },
        tsl: 'vec3',
    },
    {
        type: 'const/vec4',
        label: 'Vec4',
        category: 'Constants',
        inputs: {
            x: { label: 'X', type: 'float', default: 0 },
            y: { label: 'Y', type: 'float', default: 0 },
            z: { label: 'Z', type: 'float', default: 0 },
            w: { label: 'W', type: 'float', default: 1 },
        },
        outputs: {
            x: { label: 'X', type: 'float' },
            y: { label: 'Y', type: 'float' },
            z: { label: 'Z', type: 'float' },
            w: { label: 'W', type: 'float' },
            out: { label: 'XYZW', type: 'vec4' },
        },
        tsl: 'vec4',
    },
    {
        type: 'const/color',
        label: 'Color',
        category: 'Constants',
        inputs: {
            value: { label: 'Color', type: 'color', default: '#ffffff' },
        },
        outputs: {
            r: { label: 'R', type: 'float' },
            g: { label: 'G', type: 'float' },
            b: { label: 'B', type: 'float' },
            out: { label: 'RGB', type: 'color' },
        },
        tsl: 'color',
    },
] as const;

// Type check to ensure conformity without widening the inferred type
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _constantNodesCheck: readonly BaseNodeDef[] = constantNodes;
