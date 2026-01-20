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
] as const;

// Type check
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _advancedNodesCheck: readonly BaseNodeDef[] = advancedNodes;
