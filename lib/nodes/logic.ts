import { BaseNodeDef } from './definitions';

export const logicNodes = [
    // Conditional
    {
        type: 'logic/select',
        label: 'Select',
        category: 'Logic',
        inputs: {
            cond: { label: 'Condition', type: 'bool', default: false },
            trueVal: { label: 'True', type: 'any', default: 1 },
            falseVal: { label: 'False', type: 'any', default: 0 },
        },
        outputs: { out: { label: 'Out', type: 'any' } },
        tsl: 'select',
    },
    // Comparison
    {
        type: 'logic/lessThan',
        label: 'Less Than',
        category: 'Logic',
        inputs: {
            a: { label: 'A', type: 'any', default: 0 },
            b: { label: 'B', type: 'any', default: 0 },
        },
        outputs: { out: { label: 'Out', type: 'bool' } },
        tsl: 'lessThan',
    },
    {
        type: 'logic/greaterThan',
        label: 'Greater Than',
        category: 'Logic',
        inputs: {
            a: { label: 'A', type: 'any', default: 0 },
            b: { label: 'B', type: 'any', default: 0 },
        },
        outputs: { out: { label: 'Out', type: 'bool' } },
        tsl: 'greaterThan',
    },
    {
        type: 'logic/lessThanEqual',
        label: 'Less Equal',
        category: 'Logic',
        inputs: {
            a: { label: 'A', type: 'any', default: 0 },
            b: { label: 'B', type: 'any', default: 0 },
        },
        outputs: { out: { label: 'Out', type: 'bool' } },
        tsl: 'lessThanEqual',
    },
    {
        type: 'logic/greaterThanEqual',
        label: 'Greater Equal',
        category: 'Logic',
        inputs: {
            a: { label: 'A', type: 'any', default: 0 },
            b: { label: 'B', type: 'any', default: 0 },
        },
        outputs: { out: { label: 'Out', type: 'bool' } },
        tsl: 'greaterThanEqual',
    },
    // Boolean Logic
    {
        type: 'logic/and',
        label: 'And',
        category: 'Logic',
        inputs: {
            a: { label: 'A', type: 'bool', default: false },
            b: { label: 'B', type: 'bool', default: false },
        },
        outputs: { out: { label: 'Out', type: 'bool' } },
        tsl: 'and',
    },
    {
        type: 'logic/or',
        label: 'Or',
        category: 'Logic',
        inputs: {
            a: { label: 'A', type: 'bool', default: false },
            b: { label: 'B', type: 'bool', default: false },
        },
        outputs: { out: { label: 'Out', type: 'bool' } },
        tsl: 'or',
    },
    {
        type: 'logic/xor',
        label: 'Xor',
        category: 'Logic',
        inputs: {
            a: { label: 'A', type: 'bool', default: false },
            b: { label: 'B', type: 'bool', default: false },
        },
        outputs: { out: { label: 'Out', type: 'bool' } },
        tsl: 'xor',
    },
    {
        type: 'logic/not',
        label: 'Not',
        category: 'Logic',
        inputs: {
            a: { label: 'In', type: 'bool', default: false },
        },
        outputs: { out: { label: 'Out', type: 'bool' } },
        tsl: 'not',
    },
    // Fragment Control
    {
        type: 'logic/discard',
        label: 'Discard',
        category: 'Logic',
        inputs: {
            cond: { label: 'Condition', type: 'bool', default: false },
        },
        outputs: {},
        tsl: 'Discard',
    },
] as const;

// Type check
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _logicNodesCheck: readonly BaseNodeDef[] = logicNodes;
