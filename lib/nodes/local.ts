import { BaseNodeDef } from './definitions';

export const localNodes = [
    {
        type: 'local/set',
        label: 'Set Local',
        category: 'Locals',
        inputs: {
            value: { label: 'Value', type: 'any', connectionOnly: true },
        },
        outputs: {
            out: { label: 'Out', type: 'any' },
        },
        tsl: '__local_set__',
    },
    {
        type: 'local/get',
        label: 'Get Local',
        category: 'Locals',
        inputs: {},
        outputs: {
            out: { label: 'Out', type: 'any' },
        },
        tsl: '__local_get__',
        pure: true,
    },
] as const;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _localNodesCheck: readonly BaseNodeDef[] = localNodes;
