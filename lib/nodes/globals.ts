import { BaseNodeDef } from './definitions';

export const globalNodes = [
    {
        type: 'global/ref',
        label: 'Global',
        category: 'Globals',
        inputs: {},
        outputs: {
            out: { label: 'Value', type: 'any' },
        },
        tsl: '__global_ref__',
        pure: true,
    },
] as const;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _globalNodesCheck: readonly BaseNodeDef[] = globalNodes;
