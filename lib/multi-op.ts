import type { TSLType, TSLValueType, Port } from './nodes/definitions';
import { mathNodes } from './nodes/math';

export type MultiOpType = string;

export interface MultiOp {
    id: string;
    op: MultiOpType;
}

export interface MultiOpParamDef {
    key: string;
    label: string;
    type: TSLType;
    default: TSLValueType;
}

export interface MultiOpInputDef {
    handleId: string;
    opId: string;
    op: MultiOpType;
    index: number;
    param: MultiOpParamDef;
}

const CHAIN_INPUT_PRIORITY = ['x', 'node', 'in', 'a', 'p', 'i', 'n'];

type MathNodeDef = (typeof mathNodes)[number];

const getInputs = (def: MathNodeDef): Record<string, Port> | null => {
    const inputs = (def as { inputs?: Record<string, Port> }).inputs;
    if (!inputs || Object.keys(inputs).length === 0) return null;
    return inputs;
};

const getOutputs = (def: MathNodeDef): Record<string, Port> | null => {
    const outputs = (def as { outputs?: Record<string, Port> }).outputs;
    if (!outputs || Object.keys(outputs).length !== 1) return null;
    return outputs;
};

const MULTI_OP_DEFS: { tsl: string; label: string; inputs: Record<string, Port> }[] = mathNodes.flatMap(
    (def) => {
        if (def.type === 'math/multiOp') return [];
        if (def.type === 'math/assign' || def.type === 'math/addAssign') return [];
        const inputs = getInputs(def);
        const outputs = getOutputs(def);
        if (!inputs || !outputs) return [];
        return [
            {
                tsl: def.tsl,
                label: def.label,
                inputs,
            },
        ];
    }
);

const MULTI_OP_DEF_MAP = new Map(
    MULTI_OP_DEFS.map((def) => {
        const inputKeys = Object.keys(def.inputs);
        let chainKey = inputKeys[0] ?? '';
        for (const preferred of CHAIN_INPUT_PRIORITY) {
            const match = inputKeys.find((key) => key.toLowerCase() === preferred);
            if (match) {
                chainKey = match;
                break;
            }
        }
        return [def.tsl, { ...def, chainKey }] as const;
    })
);

export const MULTI_OP_OPTIONS: { value: MultiOpType; label: string }[] = MULTI_OP_DEFS.map((def) => ({
    value: def.tsl,
    label: def.label,
}));

export function getMultiOpLabel(op: MultiOpType): string {
    return MULTI_OP_DEF_MAP.get(op)?.label ?? op;
}

export function getMultiOpParams(op: MultiOpType, isFirst: boolean): MultiOpParamDef[] {
    const def = MULTI_OP_DEF_MAP.get(op);
    if (!def) return [];
    const entries = Object.entries(def.inputs);
    const params = entries.map(([key, input]) => ({
        key,
        label: input.label,
        type: input.type,
        default: input.default ?? 0,
    }));
    if (isFirst) return params;
    return params.filter((param) => param.key !== def.chainKey);
}

export function getMultiOpHandleId(opId: string, paramKey: string): string {
    return `op_${opId}_${paramKey}`;
}

export function getMultiOpInputs(ops: MultiOp[]): MultiOpInputDef[] {
    const inputs: MultiOpInputDef[] = [];
    ops.forEach((op, index) => {
        const params = getMultiOpParams(op.op, index === 0);
        for (const param of params) {
            inputs.push({
                handleId: getMultiOpHandleId(op.id, param.key),
                opId: op.id,
                op: op.op,
                index,
                param,
            });
        }
    });
    return inputs;
}

export function getMultiOpInputHandleIds(ops: MultiOp[]): string[] {
    return getMultiOpInputs(ops).map((input) => input.handleId);
}
