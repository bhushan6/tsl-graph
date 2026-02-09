import { BaseNodeDef } from './definitions';

export const loopNodes = [
    {
        type: 'loop',
        label: 'Loop',
        category: 'Loop',
        inputs: {},
        outputs: {},
        tsl: '__loop_group__',
    },
    {
        type: 'loop/count',
        label: 'Count',
        category: 'Loop',
        inputs: {
            count: { label: 'Count', type: 'int', default: 1 },
        },
        outputs: {
            count: { label: 'Count', type: 'int' },
        },
        tsl: '__loop_count__',
    },
    {
        type: 'loop/index',
        label: 'Index',
        category: 'Loop',
        inputs: {},
        outputs: {
            index: { label: 'Index', type: 'int' },
        },
        tsl: '__loop_index__',
        pure: true,
    },
    {
        type: 'loop/accumulator',
        label: 'Accumulator',
        category: 'Loop',
        inputs: {
            seed: { label: 'Seed', type: 'any', default: 0 },
        },
        outputs: {
            acc: { label: 'Acc', type: 'any' },
        },
        tsl: '__loop_accumulator__',
    },
    {
        type: 'loop/output',
        label: 'Output',
        category: 'Loop',
        inputs: {
            next: { label: 'Next', type: 'any', connectionOnly: true },
        },
        outputs: {
            out: { label: 'Out', type: 'any' },
        },
        tsl: '__loop_output__',
    },
] as const;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _loopNodesCheck: readonly BaseNodeDef[] = loopNodes;
