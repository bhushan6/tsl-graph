import { BaseNodeDef } from './definitions';

export const utilsNodes = [
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
        importFrom: '@/lib/tsl-utils',
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
        importFrom: '@/lib/tsl-utils',
    },
    {
        type: 'utils/rotate',
        label: 'Rotate',
        category: 'Utils',
        inputs: {
            pos: { label: 'Pos', type: 'any', default: 0 },
            rotation: { label: 'Rotation', type: 'any', default: 0 },
        },
        outputs: {
            out: { label: 'Out', type: 'any' },
        },
        tsl: 'rotate',
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
    // Blend modes
    {
        type: 'utils/blendColorDodge',
        label: 'Blend Color Dodge',
        category: 'Utils',
        inputs: {
            base: { label: 'Base', type: 'vec3', default: [0, 0, 0] },
            blend: { label: 'Blend', type: 'vec3', default: [0, 0, 0] },
        },
        outputs: { out: { label: 'Out', type: 'vec3' } },
        tsl: 'blendColorDodge',
        importFrom: '@/lib/tsl-utils',
    },
    {
        type: 'utils/blendOverlay',
        label: 'Blend Overlay',
        category: 'Utils',
        inputs: {
            base: { label: 'Base', type: 'vec3', default: [0, 0, 0] },
            blend: { label: 'Blend', type: 'vec3', default: [0, 0, 0] },
        },
        outputs: { out: { label: 'Out', type: 'vec3' } },
        tsl: 'blendOverlay',
        importFrom: '@/lib/tsl-utils',
    },
    {
        type: 'utils/blendSoftLight',
        label: 'Blend Soft Light',
        category: 'Utils',
        inputs: {
            base: { label: 'Base', type: 'vec3', default: [0, 0, 0] },
            blend: { label: 'Blend', type: 'vec3', default: [0, 0, 0] },
        },
        outputs: { out: { label: 'Out', type: 'vec3' } },
        tsl: 'blendSoftLight',
        importFrom: '@/lib/tsl-utils',
    },
    {
        type: 'utils/blendHardLight',
        label: 'Blend Hard Light',
        category: 'Utils',
        inputs: {
            base: { label: 'Base', type: 'vec3', default: [0, 0, 0] },
            blend: { label: 'Blend', type: 'vec3', default: [0, 0, 0] },
        },
        outputs: { out: { label: 'Out', type: 'vec3' } },
        tsl: 'blendHardLight',
        importFrom: '@/lib/tsl-utils',
    },
    {
        type: 'utils/blendScreen',
        label: 'Blend Screen',
        category: 'Utils',
        inputs: {
            base: { label: 'Base', type: 'vec3', default: [0, 0, 0] },
            blend: { label: 'Blend', type: 'vec3', default: [0, 0, 0] },
        },
        outputs: { out: { label: 'Out', type: 'vec3' } },
        tsl: 'blendScreen',
        importFrom: '@/lib/tsl-utils',
    },
    {
        type: 'utils/blendExclusion',
        label: 'Blend Exclusion',
        category: 'Utils',
        inputs: {
            base: { label: 'Base', type: 'vec3', default: [0, 0, 0] },
            blend: { label: 'Blend', type: 'vec3', default: [0, 0, 0] },
        },
        outputs: { out: { label: 'Out', type: 'vec3' } },
        tsl: 'blendExclusion',
        importFrom: '@/lib/tsl-utils',
    },
    {
        type: 'utils/blendMultiply',
        label: 'Blend Multiply',
        category: 'Utils',
        inputs: {
            base: { label: 'Base', type: 'vec3', default: [0, 0, 0] },
            blend: { label: 'Blend', type: 'vec3', default: [0, 0, 0] },
        },
        outputs: { out: { label: 'Out', type: 'vec3' } },
        tsl: 'blendMultiply',
        importFrom: '@/lib/tsl-utils',
    },
    {
        type: 'utils/blendPlusLighter',
        label: 'Blend Plus Lighter',
        category: 'Utils',
        inputs: {
            base: { label: 'Base', type: 'vec3', default: [0, 0, 0] },
            blend: { label: 'Blend', type: 'vec3', default: [0, 0, 0] },
        },
        outputs: { out: { label: 'Out', type: 'vec3' } },
        tsl: 'blendPlusLighter',
        importFrom: '@/lib/tsl-utils',
    },
    {
        type: 'utils/blendLuminosity',
        label: 'Blend Luminosity',
        category: 'Utils',
        inputs: {
            base: { label: 'Base', type: 'vec3', default: [0, 0, 0] },
            blend: { label: 'Blend', type: 'vec3', default: [0, 0, 0] },
        },
        outputs: { out: { label: 'Out', type: 'vec3' } },
        tsl: 'blendLuminosity',
        importFrom: '@/lib/tsl-utils',
    },
    {
        type: 'utils/blendDarken',
        label: 'Blend Darken',
        category: 'Utils',
        inputs: {
            base: { label: 'Base', type: 'vec3', default: [0, 0, 0] },
            blend: { label: 'Blend', type: 'vec3', default: [0, 0, 0] },
        },
        outputs: { out: { label: 'Out', type: 'vec3' } },
        tsl: 'blendDarken',
        importFrom: '@/lib/tsl-utils',
    },
    {
        type: 'utils/blendLighten',
        label: 'Blend Lighten',
        category: 'Utils',
        inputs: {
            base: { label: 'Base', type: 'vec3', default: [0, 0, 0] },
            blend: { label: 'Blend', type: 'vec3', default: [0, 0, 0] },
        },
        outputs: { out: { label: 'Out', type: 'vec3' } },
        tsl: 'blendLighten',
        importFrom: '@/lib/tsl-utils',
    },
    {
        type: 'utils/blendHue',
        label: 'Blend Hue',
        category: 'Utils',
        inputs: {
            base: { label: 'Base', type: 'vec3', default: [0, 0, 0] },
            blend: { label: 'Blend', type: 'vec3', default: [0, 0, 0] },
        },
        outputs: { out: { label: 'Out', type: 'vec3' } },
        tsl: 'blendHue',
        importFrom: '@/lib/tsl-utils',
    },
    {
        type: 'utils/blendColorBurn',
        label: 'Blend Color Burn',
        category: 'Utils',
        inputs: {
            base: { label: 'Base', type: 'vec3', default: [0, 0, 0] },
            blend: { label: 'Blend', type: 'vec3', default: [0, 0, 0] },
        },
        outputs: { out: { label: 'Out', type: 'vec3' } },
        tsl: 'blendColorBurn',
        importFrom: '@/lib/tsl-utils',
    },
    // Filter helpers
    {
        type: 'utils/adjustBrightness',
        label: 'Adjust Brightness',
        category: 'Utils',
        inputs: {
            color: { label: 'Color', type: 'vec3', default: [1, 1, 1] },
            brightness: { label: 'Brightness', type: 'float', default: 1 },
        },
        outputs: { out: { label: 'Out', type: 'vec3' } },
        tsl: 'adjustBrightness',
        importFrom: '@/lib/tsl-utils',
    },
    {
        type: 'utils/adjustContrast',
        label: 'Adjust Contrast',
        category: 'Utils',
        inputs: {
            color: { label: 'Color', type: 'vec3', default: [1, 1, 1] },
            contrast: { label: 'Contrast', type: 'float', default: 1 },
        },
        outputs: { out: { label: 'Out', type: 'vec3' } },
        tsl: 'adjustContrast',
        importFrom: '@/lib/tsl-utils',
    },
    {
        type: 'utils/adjustSaturate',
        label: 'Adjust Saturate',
        category: 'Utils',
        inputs: {
            color: { label: 'Color', type: 'vec3', default: [1, 1, 1] },
            saturation: { label: 'Saturation', type: 'float', default: 1 },
        },
        outputs: { out: { label: 'Out', type: 'vec3' } },
        tsl: 'adjustSaturate',
        importFrom: '@/lib/tsl-utils',
    },
    {
        type: 'utils/hslToRgb',
        label: 'HSL To RGB',
        category: 'Utils',
        inputs: {
            h: { label: 'Hue', type: 'float', default: 0 },
            s: { label: 'Sat', type: 'float', default: 1 },
            l: { label: 'Light', type: 'float', default: 0.5 },
        },
        outputs: { out: { label: 'Out', type: 'vec3' } },
        tsl: 'hslToRgb',
        importFrom: '@/lib/tsl-utils',
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
        importFrom: '@/lib/tsl-utils',
    },
    {
        type: 'utils/spherizeUV',
        label: 'Spherize UV',
        category: 'Utils',
        inputs: {
            uv: { label: 'UV', type: 'vec2', default: [0, 0] },
            strength: { label: 'Strength', type: 'float', default: 0 },
            center: { label: 'Center', type: 'vec2', default: [0.5, 0.5] },
        },
        outputs: { out: { label: 'Out', type: 'vec2' } },
        tsl: 'spherizeUV',
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
        importFrom: '@/lib/tsl-utils',
    }
] as const;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _utilsNodesCheck: readonly BaseNodeDef[] = utilsNodes;
