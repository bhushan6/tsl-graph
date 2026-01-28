import { BaseNodeDef } from './definitions';

export const utilsNodes: readonly BaseNodeDef[] = [
    {
        type: 'utils/rotation3d',
        label: 'Rotation 3D',
        category: 'Utils',
        inputs: {
            pos: { label: 'Pos', type: 'vec3', default: [0, 0, 0] },
            axis: { label: 'Axis', type: 'vec3', default: [0, 1, 0] },
            angle: { label: 'Angle', type: 'float', default: 0 },
        },
        outputs: {
            out: { label: 'Out', type: 'vec3' },
        },
        tsl: 'rotation3d',
        pure: true,
    },
    {
        type: 'utils/rotate2D',
        label: 'Rotation 2D',
        category: 'Utils',
        inputs: {
            pos: { label: 'Pos', type: 'vec2', default: [0, 0] },
            angle: { label: 'Angle', type: 'float', default: 0 },
        },
        outputs: {
            out: { label: 'Out', type: 'vec2' },
        },
        tsl: 'rotate2D',
        pure: true,
    },
    // Color Adjustments
    {
        type: 'utils/luminance',
        label: 'Luminance',
        category: 'Utils',
        inputs: {
            color: { label: 'Color', type: 'color', default: [1, 1, 1] },
        },
        outputs: { out: { label: 'Out', type: 'float' } },
        tsl: 'luminance',
    },
    {
        type: 'utils/saturation',
        label: 'Saturation',
        category: 'Utils',
        inputs: {
            color: { label: 'Color', type: 'color', default: [1, 1, 1] },
            adjustment: { label: 'Adj', type: 'float', default: 1 },
        },
        outputs: { out: { label: 'Out', type: 'vec3' } },
        tsl: 'saturation',
    },
    {
        type: 'utils/vibrance',
        label: 'Vibrance',
        category: 'Utils',
        inputs: {
            color: { label: 'Color', type: 'color', default: [1, 1, 1] },
            adjustment: { label: 'Adj', type: 'float', default: 1 },
        },
        outputs: { out: { label: 'Out', type: 'vec3' } },
        tsl: 'vibrance',
    },
    {
        type: 'utils/hue',
        label: 'Hue',
        category: 'Utils',
        inputs: {
            color: { label: 'Color', type: 'color', default: [1, 1, 1] },
            adjustment: { label: 'Adj', type: 'float', default: 0 },
        },
        outputs: { out: { label: 'Out', type: 'vec3' } },
        tsl: 'hue',
    },
    {
        type: 'utils/posterize',
        label: 'Posterize',
        category: 'Utils',
        inputs: {
            color: { label: 'Color', type: 'color', default: [1, 1, 1] },
            steps: { label: 'Steps', type: 'float', default: 4 },
        },
        outputs: { out: { label: 'Out', type: 'vec3' } },
        tsl: 'posterize',
    },
    // Patterns
    {
        type: 'utils/checker',
        label: 'Checker',
        category: 'Utils',
        inputs: {
            coord: { label: 'UV', type: 'vec2', default: [0, 0] },
        },
        outputs: { out: { label: 'Out', type: 'float' } },
        tsl: 'checker',
    },
    // Transforms
    {
        type: 'utils/remap',
        label: 'Remap',
        category: 'Utils',
        inputs: {
            node: { label: 'In', type: 'any', default: 0 },
            inLow: { label: 'InMin', type: 'any', default: 0 },
            inHigh: { label: 'InMax', type: 'any', default: 1 },
            outLow: { label: 'OutMin', type: 'any', default: 0 },
            outHigh: { label: 'OutMax', type: 'any', default: 1 },
        },
        outputs: { out: { label: 'Out', type: 'any' } },
        tsl: 'remap',
    },
    {
        type: 'utils/remapClamp',
        label: 'Remap Clamp',
        category: 'Utils',
        inputs: {
            node: { label: 'In', type: 'any', default: 0 },
            inLow: { label: 'InMin', type: 'any', default: 0 },
            inHigh: { label: 'InMax', type: 'any', default: 1 },
            outLow: { label: 'OutMin', type: 'any', default: 0 },
            outHigh: { label: 'OutMax', type: 'any', default: 1 },
        },
        outputs: { out: { label: 'Out', type: 'any' } },
        tsl: 'remapClamp',
    },
    // Helper
    {
        type: 'utils/transformDirection',
        label: 'Transform Dir',
        category: 'Utils',
        inputs: {
            dir: { label: 'Dir', type: 'vec3', default: [0, 0, 1] },
            matrix: { label: 'Mat', type: 'mat4' },
        },
        outputs: { out: { label: 'Out', type: 'vec3' } },
        tsl: 'transformDirection',
    },
    {
        type: 'utils/uvTransform',
        label: 'UV Transform',
        category: 'Utils',
        inputs: {
            uv: { label: 'UV', type: 'vec2', default: [0, 0] },
            scale: { label: 'Scale', type: 'vec2', default: [1, 1] },
            offset: { label: 'Offset', type: 'vec2', default: [0, 0] },
        },
        outputs: { out: { label: 'Out', type: 'vec2' } },
        tsl: 'uvTransform',
        pure: true,
    },
    {
        type: 'utils/fresnel',
        label: 'Fresnel',
        category: 'Utils',
        inputs: {
            bias: { label: 'Bias', type: 'float', default: 0 },
            scale: { label: 'Scale', type: 'float', default: 1 },
            power: { label: 'Power', type: 'float', default: 2 },
            normal: { label: 'Normal', type: 'vec3', default: [0, 0, 1] },
            viewDir: { label: 'View Dir', type: 'vec3', default: [0, 0, 1] },
        },
        outputs: { out: { label: 'Out', type: 'float' } },
        tsl: 'fresnelFull',
    }
] as const;
