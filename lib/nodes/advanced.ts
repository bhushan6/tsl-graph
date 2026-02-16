import { BaseNodeDef } from './definitions';

export const advancedNodes = [
    {
        type: 'advanced/varying',
        label: 'Varying',
        category: 'Advanced',
        inputs: {
            node: { label: 'Node', type: 'any' },
        },
        outputs: {
            out: { label: 'Out', type: 'any' },
        },
        tsl: 'varying',
    },
    {
        type: 'advanced/var',
        label: 'Var',
        category: 'Advanced',
        inputs: {
            node: { label: 'Node', type: 'any' },
        },
        outputs: {
            out: { label: 'Out', type: 'any' },
        },
        tsl: 'Var',
    },
    {
        type: 'advanced/linearDepth',
        label: 'Linear Depth',
        category: 'Advanced',
        outputs: {
            out: { label: 'Out', type: 'float' },
        },
        tsl: 'linearDepth',
        pure: true,
        callable: true,
    },
    {
        type: 'advanced/linearDepthFrom',
        label: 'Linear Depth (From)',
        category: 'Advanced',
        inputs: {
            depth: { label: 'Depth', type: 'float', default: 0 },
        },
        outputs: {
            out: { label: 'Out', type: 'float' },
        },
        tsl: 'linearDepth',
    },
    // Fragment properties
    {
        type: 'advanced/output',
        label: 'Output',
        category: 'Advanced',
        outputs: {
            out: { label: 'Out', type: 'vec4' },
        },
        tsl: 'output',
        pure: true,
    },
    {
        type: 'advanced/frontFacing',
        label: 'Front Facing',
        category: 'Advanced',
        outputs: {
            out: { label: 'Out', type: 'bool' },
        },
        tsl: 'frontFacing',
        pure: true,
    },

    {
        type: 'advanced/viewportLinearDepth',
        label: 'Viewport Linear Depth',
        category: 'Advanced',
        outputs: {
            out: { label: 'Out', type: 'float' },
        },
        tsl: 'viewportLinearDepth',
        pure: true,
    },
    {
        type: 'advanced/hashBlur',
        label: 'Hash Blur',
        category: 'Advanced',
        inputs: {
            texture: { label: 'Texture', type: 'any' },
            radius: { label: 'Radius', type: 'float', default: 0.01 },
            // count: { label: 'Count', type: 'float', default: 8 },
        },
        outputs: {
            out: { label: 'Out', type: 'vec4' },
        },
        tsl: 'hashBlur',
    },
] as const;

// Type check
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _advancedNodesCheck: readonly BaseNodeDef[] = advancedNodes;
