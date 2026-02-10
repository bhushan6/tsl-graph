import { BaseNodeDef } from './definitions';

export const assignNodes = [
    {
        type: 'assign/assign',
        label: 'Assign',
        category: 'Math',
        inputs: {
            target: { label: 'Target', type: 'any', connectionOnly: true },
            value: { label: 'Value', type: 'any', default: 0 },
        },
        outputs: {
            out: { label: 'Out', type: 'any' },
        },
        tsl: '__assign__',
    },
    {
        type: 'assign/addAssign',
        label: 'Add Assign',
        category: 'Math',
        inputs: {
            target: { label: 'Target', type: 'any', connectionOnly: true },
            value: { label: 'Value', type: 'any', default: 0 },
        },
        outputs: {
            out: { label: 'Out', type: 'any' },
        },
        tsl: '__add_assign__',
    },
    {
        type: 'assign/subAssign',
        label: 'Sub Assign',
        category: 'Math',
        inputs: {
            target: { label: 'Target', type: 'any', connectionOnly: true },
            value: { label: 'Value', type: 'any', default: 0 },
        },
        outputs: {
            out: { label: 'Out', type: 'any' },
        },
        tsl: '__sub_assign__',
    },
    {
        type: 'assign/mulAssign',
        label: 'Mul Assign',
        category: 'Math',
        inputs: {
            target: { label: 'Target', type: 'any', connectionOnly: true },
            value: { label: 'Value', type: 'any', default: 0 },
        },
        outputs: {
            out: { label: 'Out', type: 'any' },
        },
        tsl: '__mul_assign__',
    },
    {
        type: 'assign/divAssign',
        label: 'Div Assign',
        category: 'Math',
        inputs: {
            target: { label: 'Target', type: 'any', connectionOnly: true },
            value: { label: 'Value', type: 'any', default: 0 },
        },
        outputs: {
            out: { label: 'Out', type: 'any' },
        },
        tsl: '__div_assign__',
    },
    {
        type: 'assign/modAssign',
        label: 'Mod Assign',
        category: 'Math',
        inputs: {
            target: { label: 'Target', type: 'any', connectionOnly: true },
            value: { label: 'Value', type: 'any', default: 1 },
        },
        outputs: {
            out: { label: 'Out', type: 'any' },
        },
        tsl: '__mod_assign__',
    },
    {
        type: 'assign/minAssign',
        label: 'Min Assign',
        category: 'Math',
        inputs: {
            target: { label: 'Target', type: 'any', connectionOnly: true },
            value: { label: 'Value', type: 'any', default: 0 },
        },
        outputs: {
            out: { label: 'Out', type: 'any' },
        },
        tsl: '__min_assign__',
    },
    {
        type: 'assign/maxAssign',
        label: 'Max Assign',
        category: 'Math',
        inputs: {
            target: { label: 'Target', type: 'any', connectionOnly: true },
            value: { label: 'Value', type: 'any', default: 0 },
        },
        outputs: {
            out: { label: 'Out', type: 'any' },
        },
        tsl: '__max_assign__',
    },
    {
        type: 'assign/bitAndAssign',
        label: 'Bit And Assign',
        category: 'Math',
        inputs: {
            target: { label: 'Target', type: 'any', connectionOnly: true },
            value: { label: 'Value', type: 'any', default: 0 },
        },
        outputs: {
            out: { label: 'Out', type: 'any' },
        },
        tsl: '__bit_and_assign__',
    },
    {
        type: 'assign/bitOrAssign',
        label: 'Bit Or Assign',
        category: 'Math',
        inputs: {
            target: { label: 'Target', type: 'any', connectionOnly: true },
            value: { label: 'Value', type: 'any', default: 0 },
        },
        outputs: {
            out: { label: 'Out', type: 'any' },
        },
        tsl: '__bit_or_assign__',
    },
    {
        type: 'assign/bitXorAssign',
        label: 'Bit Xor Assign',
        category: 'Math',
        inputs: {
            target: { label: 'Target', type: 'any', connectionOnly: true },
            value: { label: 'Value', type: 'any', default: 0 },
        },
        outputs: {
            out: { label: 'Out', type: 'any' },
        },
        tsl: '__bit_xor_assign__',
    },
    {
        type: 'assign/shiftLeftAssign',
        label: 'Shift Left Assign',
        category: 'Math',
        inputs: {
            target: { label: 'Target', type: 'any', connectionOnly: true },
            value: { label: 'Value', type: 'any', default: 0 },
        },
        outputs: {
            out: { label: 'Out', type: 'any' },
        },
        tsl: '__shift_left_assign__',
    },
    {
        type: 'assign/shiftRightAssign',
        label: 'Shift Right Assign',
        category: 'Math',
        inputs: {
            target: { label: 'Target', type: 'any', connectionOnly: true },
            value: { label: 'Value', type: 'any', default: 0 },
        },
        outputs: {
            out: { label: 'Out', type: 'any' },
        },
        tsl: '__shift_right_assign__',
    },
] as const;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _assignNodesCheck: readonly BaseNodeDef[] = assignNodes;
