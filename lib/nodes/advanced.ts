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
] as const;

// Type check
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _advancedNodesCheck: readonly BaseNodeDef[] = advancedNodes;
