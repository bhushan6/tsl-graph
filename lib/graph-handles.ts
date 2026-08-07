import type { Edge } from '@xyflow/react';
import { registry } from './registry';
import type {
    AppNode,
    CodeNodeDefinition,
    GlobalContextEntry,
    Port,
    SubgraphDefinition,
    TSLType,
} from './types';
import { POST_INPUT_DEFAULT_OUTPUTS } from './nodes/post';
import {
    getVisibleInputHandles,
    getVisibleOutputHandles,
    type PickerHandle,
} from './node-picker-utils';
import { getMultiOpInputs } from './multi-op';
import { resolveNodeOutputTypeById } from './type-inference';
import { getUniformKindFromNode, getUniformOutputs } from './uniform-utils';
import { getVisibleSplitOutputKeys } from './split-node';
import { getComponentOutputPorts, withComponentOutputPorts } from './component-outputs';

export interface GraphHandleContext {
    nodesById: Map<string, AppNode>;
    edges: Edge[];
    globals: GlobalContextEntry[];
    subgraphs: Record<string, SubgraphDefinition>;
    codeNodes: Record<string, CodeNodeDefinition>;
}

const NON_CONNECTABLE_TYPES = new Set(['group', 'loop', 'utils/comment']);

function isNonConnectable(node: AppNode): boolean {
    return (
        node.type === 'group' ||
        NON_CONNECTABLE_TYPES.has(node.data.type)
    );
}

/**
 * Instance-aware port derivation, mirroring TSLNode's rendering logic:
 * registry defs for plain nodes, subgraph/code template ports (falling back
 * to dynamicPorts), globals-typed output for global/ref, anchor dynamic
 * ports, uniform-kind outputs, and multiOp operation inputs.
 */
function collectPorts(
    node: AppNode,
    ctx: GraphHandleContext
): { inputs: Record<string, Port>; outputs: Record<string, Port> } {
    const type = node.data.type;
    let inputs: Record<string, Port> = {};
    let outputs: Record<string, Port> = {};

    if (type.startsWith('custom/')) {
        const subgraphDef = ctx.subgraphs[type];
        const ports = subgraphDef
            ? [...(subgraphDef.inputs || []), ...(subgraphDef.outputs || [])]
            : node.data.dynamicPorts || [];
        for (const port of ports) {
            if (port.id.startsWith('in_')) {
                inputs[port.id] = { label: port.label, type: port.type as TSLType, connectionOnly: true };
            } else if (port.id.startsWith('out_') || port.id === 'out') {
                outputs[port.id] = { label: port.label, type: port.type as TSLType };
            }
        }
        return { inputs, outputs: withComponentOutputPorts(outputs) };
    }

    if (type.startsWith('code/')) {
        const codeDef = ctx.codeNodes[type];
        const ports = node.data.dynamicPorts
            ?? (codeDef ? [...codeDef.inputs, codeDef.output] : []);
        for (const port of ports) {
            if (port.id.startsWith('in_')) {
                inputs[port.id] = { label: port.label, type: port.type as TSLType };
            } else if (port.id === 'out') {
                outputs[port.id] = { label: port.label, type: port.type as TSLType };
            }
        }
        return { inputs, outputs: withComponentOutputPorts(outputs) };
    }

    if (type === 'global/ref') {
        const globalId = typeof node.data.values?.globalId === 'string' ? node.data.values.globalId : '';
        const entry = globalId ? ctx.globals.find((g) => g.id === globalId) : undefined;
        outputs = { out: { label: entry?.name || 'Global', type: (entry?.type as TSLType) || 'any' } };
        return { inputs, outputs: withComponentOutputPorts(outputs) };
    }

    if ((type === 'subgraph/input' || type === 'subgraph/output') && node.data.dynamicPorts) {
        for (const port of node.data.dynamicPorts) {
            if (type === 'subgraph/input') {
                outputs[port.id] = { label: port.label, type: port.type as TSLType };
            } else {
                inputs[port.id] = { label: port.label, type: port.type as TSLType, connectionOnly: true };
            }
        }
        return { inputs, outputs };
    }

    const def = registry.get(type);
    if (!def) return { inputs, outputs };

    inputs = { ...(def.inputs ?? {}) };
    outputs = { ...(def.outputs ?? {}) };

    if (type === 'const/uniform') {
        inputs = {};
        outputs = getUniformOutputs(getUniformKindFromNode(node));
    }

    if (type === 'math/multiOp') {
        inputs = {};
        for (const entry of getMultiOpInputs(node.data.operations ?? [])) {
            inputs[entry.handleId] = { label: entry.param.label, type: entry.param.type };
        }
    }

    return { inputs, outputs };
}

/**
 * Input handles a wire can land on. Material/texture toggle inputs are
 * included even when currently inactive — connecting activates them
 * (store onConnect), matching drag-connect behavior.
 */
export function getConnectableInputHandles(node: AppNode, ctx: GraphHandleContext): PickerHandle[] {
    if (isNonConnectable(node)) return [];
    const { inputs } = collectPorts(node, ctx);
    return getVisibleInputHandles(inputs);
}

/**
 * Output handles a wire can start from. Types are resolved through the
 * graph (many nodes declare 'any' and infer the real type from upstream).
 */
export function getConnectableOutputHandles(node: AppNode, ctx: GraphHandleContext): PickerHandle[] {
    if (isNonConnectable(node)) return [];
    const { outputs } = collectPorts(node, ctx);
    let handles = getVisibleOutputHandles(outputs);

    if (node.data.type === 'local/get' || node.data.type === 'advanced/var') {
        const outputType = resolveNodeOutputTypeById(
            node.id,
            'out',
            ctx.nodesById,
            ctx.edges,
            ctx.globals,
            ctx.subgraphs
        );
        const componentHandles = getVisibleOutputHandles(getComponentOutputPorts(outputType));
        handles = [
            ...componentHandles,
            ...handles.filter((handle) => handle.id !== 'out'),
            { id: 'out', label: 'Out', type: outputType },
        ];
    }

    if (node.data.type === 'math/split') {
        const inputConnected = ctx.edges.some(
            (edge) => edge.target === node.id && edge.targetHandle === 'in'
        );
        const inputType = inputConnected
            ? resolveNodeOutputTypeById(node.id, 'out', ctx.nodesById, ctx.edges, ctx.globals, ctx.subgraphs)
            : null;
        const visibleKeys = new Set(getVisibleSplitOutputKeys(handles.map((h) => h.id), inputType));
        handles = handles.filter((h) => visibleKeys.has(h.id));
    }

    if (node.data.type === 'post/input') {
        const active = new Set<string>(
            Array.isArray(node.data.activeInputs)
                ? node.data.activeInputs
                : POST_INPUT_DEFAULT_OUTPUTS
        );
        for (const edge of ctx.edges) {
            if (edge.source === node.id && edge.sourceHandle) active.add(edge.sourceHandle);
        }
        handles = handles.filter((h) => active.has(h.id));
    }

    return handles.map((h) => {
        const resolved = resolveNodeOutputTypeById(
            node.id,
            h.id,
            ctx.nodesById,
            ctx.edges,
            ctx.globals,
            ctx.subgraphs
        );
        return resolved ? { ...h, type: resolved } : h;
    });
}

/**
 * Declared type of one input handle, instance-aware (multiOp params,
 * subgraph/code/anchor dynamic ports). Same chain TSLEdge uses for its
 * target color.
 */
export function resolveInputHandleType(
    node: AppNode,
    handleId: string,
    ctx: GraphHandleContext
): TSLType {
    if (node.data.type === 'math/multiOp') {
        const entry = getMultiOpInputs(node.data.operations ?? []).find(
            (input) => input.handleId === handleId
        );
        if (entry) return entry.param.type;
    }

    const def = registry.get(node.data.type);
    const declared = def?.inputs?.[handleId]?.type;
    if (declared) return declared;

    if (node.data.type.startsWith('custom/')) {
        const subgraphDef = ctx.subgraphs[node.data.type];
        const port = subgraphDef?.inputs.find((p) => p.id === handleId);
        if (port) return port.type as TSLType;
    }

    if (node.data.type.startsWith('code/')) {
        const codeDef = ctx.codeNodes[node.data.type];
        const port = codeDef?.inputs.find((p) => p.id === handleId);
        if (port) return port.type as TSLType;
    }

    const dynamicPort = node.data.dynamicPorts?.find((port) => port.id === handleId);
    if (dynamicPort) return dynamicPort.type as TSLType;

    return 'any';
}
