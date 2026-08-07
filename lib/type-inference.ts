import type { Edge, Node } from '@xyflow/react';
import { getMultiOpChainKey, getMultiOpHandleId, getMultiOpParams, type MultiOp } from './multi-op';
import { registry } from './registry';
import type { GlobalContextEntry, Port, SubgraphDefinition, TSLNodeData, TSLType } from './types';
import { inferLiteralTSLType } from './value-type-utils';
import { getComponentOutputType } from './component-outputs';
import { getUniformKindFromNode } from './uniform-utils';

const LOCAL_SET_NODE_TYPE = 'local/set' as const;
const LOCAL_GET_NODE_TYPE = 'local/get' as const;
const LOCAL_SET_INPUT_HANDLE = 'value' as const;
const VAR_NODE_TYPE = 'advanced/var' as const;
const VAR_INPUT_HANDLE = 'node' as const;

interface ResolverContext {
    nodesById: Map<string, Node<TSLNodeData>>;
    edges: Edge[];
    globals: GlobalContextEntry[];
    subgraphs?: Record<string, SubgraphDefinition>;
    visitedLocalSets: Set<string>;
}

function isLocalSetType(type: string): boolean {
    return type === LOCAL_SET_NODE_TYPE;
}

function isLocalGetType(type: string): boolean {
    return type === LOCAL_GET_NODE_TYPE;
}

function getLocalSourceId(node: Node<TSLNodeData> | undefined): string | null {
    if (!node) return null;
    const localSourceId = node.data.values?.localSourceId;
    return typeof localSourceId === 'string' && localSourceId.length > 0 ? localSourceId : null;
}

function getLoopAncestorIds(
    node: Node<TSLNodeData>,
    nodesById: Map<string, Node<TSLNodeData>>
): string[] {
    const ids: string[] = [];
    let parentId = node.parentId;

    while (parentId) {
        const parent = nodesById.get(parentId);
        if (!parent) break;
        if (parent.type === 'loop' || parent.data.type === 'loop') {
            ids.push(parent.id);
        }
        parentId = parent.parentId;
    }

    return ids;
}

function isLocalScopeAccessible(
    setNode: Node<TSLNodeData>,
    getNode: Node<TSLNodeData>,
    nodesById: Map<string, Node<TSLNodeData>>
): boolean {
    const setLoopAncestors = getLoopAncestorIds(setNode, nodesById);

    if (setLoopAncestors.length === 0) return true;

    const setScopeLoopId = setLoopAncestors[0];
    const getLoopAncestors = getLoopAncestorIds(getNode, nodesById);
    return getLoopAncestors.includes(setScopeLoopId);
}

function getTypeLength(type: TSLType): number {
    if (type === 'color') return 3;
    if (type === 'float' || type === 'int' || type === 'uint' || type === 'bool') return 1;
    const vectorMatch = /^[biu]?vec([2-4])$/.exec(type);
    if (vectorMatch) return Number(vectorMatch[1]);
    if (type === 'mat2') return 4;
    if (type === 'mat3') return 9;
    if (type === 'mat4') return 16;
    return 0;
}

function isMatrixType(type: TSLType): boolean {
    return type === 'mat2' || type === 'mat3' || type === 'mat4';
}

function isVectorType(type: TSLType): boolean {
    return /^[biu]?vec[2-4]$/.test(type);
}

function getVectorFromMatrix(type: TSLType): TSLType {
    if (type === 'mat2') return 'vec2';
    if (type === 'mat3') return 'vec3';
    if (type === 'mat4') return 'vec4';
    return 'any';
}

function pickLongestType(types: readonly TSLType[]): TSLType {
    let winner: TSLType = 'any';
    let winnerLength = 0;

    for (const type of types) {
        const length = getTypeLength(type);
        if (length > winnerLength) {
            winner = type;
            winnerLength = length;
        }
    }

    return winner;
}

function resolveBinaryOperatorResultType(op: string, aType: TSLType, bType: TSLType): TSLType {
    if (op === '%') {
        return aType;
    }

    if (isMatrixType(aType)) {
        if (bType === 'float') return aType;
        if (isVectorType(bType)) return getVectorFromMatrix(aType);
        if (isMatrixType(bType)) return aType;
    } else if (isMatrixType(bType)) {
        if (aType === 'float') return bType;
        if (isVectorType(aType)) return getVectorFromMatrix(bType);
    }

    if (getTypeLength(bType) > getTypeLength(aType)) {
        return bType;
    }

    return aType;
}

function resolveGlobalRefType(node: Node<TSLNodeData>, globals: GlobalContextEntry[]): TSLType {
    const globalId = node.data.values?.globalId;
    if (typeof globalId !== 'string') return 'any';
    const entry = globals.find((item) => item.id === globalId);
    return (entry?.type as TSLType) ?? 'any';
}

function resolveSingleOutputType(
    outputType: TSLType,
    outputHandleId: string,
    requestedHandleId: string,
): TSLType {
    if (requestedHandleId === outputHandleId || requestedHandleId === 'out') {
        return outputType;
    }
    return getComponentOutputType(outputType, requestedHandleId) ?? 'any';
}

function resolveDeclaredOutputType(
    node: Node<TSLNodeData>,
    handleId: string | null | undefined,
    subgraphs?: Record<string, SubgraphDefinition>
): TSLType {
    if (node.data.type === 'math/multiOp') return 'any';
    if (node.data.type === 'global/ref') return 'any';

    const resolvedHandle = handleId ?? 'out';

    if (node.data.type === 'const/uniform') {
        const uniformType = getUniformKindFromNode(node);
        if (resolvedHandle === 'out') return uniformType;
        return getComponentOutputType(uniformType, resolvedHandle) ?? 'any';
    }

    if (node.data.type.startsWith('custom/') && subgraphs) {
        const subgraph = subgraphs[node.data.type];
        if (subgraph) {
            const directOutput = subgraph.outputs.find((port) => port.id === resolvedHandle);
            if (directOutput) return directOutput.type as TSLType;

            if (resolvedHandle === 'out') {
                const fallbackOutput = subgraph.outputs.find((port) => port.id === 'out_0')
                    ?? subgraph.outputs[0];
                return (fallbackOutput?.type as TSLType) ?? 'any';
            }

            if (subgraph.outputs.length === 1) {
                const output = subgraph.outputs[0];
                return resolveSingleOutputType(output.type as TSLType, output.id, resolvedHandle);
            }
            return 'any';
        }
    }

    if (node.data.dynamicPorts && node.data.dynamicPorts.length > 0) {
        const outputPorts = node.data.dynamicPorts.filter((port) => (
            port.id === 'out' || port.id.startsWith('out_')
        ));
        const dynamicPort = outputPorts.find((port) => port.id === resolvedHandle);
        if (dynamicPort?.type) return dynamicPort.type;

        if (resolvedHandle === 'out') {
            const fallbackOutput = outputPorts.find((port) => port.id === 'out_0')
                ?? outputPorts[0];
            return fallbackOutput?.type ?? 'any';
        }

        if (outputPorts.length === 1) {
            const output = outputPorts[0];
            return resolveSingleOutputType(output.type, output.id, resolvedHandle);
        }
    }

    const def = registry.get(node.data.type);
    if (!def?.outputs) return 'any';
    const output = def.outputs[resolvedHandle] ?? def.outputs['out'];
    return (output?.type as TSLType) ?? 'any';
}

function resolveInputPortType(
    node: Node<TSLNodeData>,
    inputKey: string,
    inputDef: Pick<Port, 'type' | 'default'> | undefined,
    context: ResolverContext
): TSLType {
    if (!inputDef) return 'any';

    const edge = context.edges.find((entry) => entry.target === node.id && entry.targetHandle === inputKey);
    if (edge) {
        return resolveNodeOutputTypeById(
            edge.source,
            edge.sourceHandle,
            context.nodesById,
            context.edges,
            context.globals,
            context.subgraphs,
            context.visitedLocalSets
        );
    }

    if (inputDef.type !== 'any') {
        return inputDef.type;
    }

    const value = node.data.values?.[inputKey] ?? inputDef.default;
    if (value === undefined) return 'any';

    return inferLiteralTSLType(value);
}

function inferMathOutputTypeFromTsl(tsl: string, inputTypes: Map<string, TSLType>): TSLType {
    switch (tsl) {
        case 'length':
        case 'distance':
        case 'dot':
            return 'float';
        case 'cross':
            return 'vec3';
        case 'all':
        case 'any':
            return 'bool';
        case 'add':
            return resolveBinaryOperatorResultType('+', inputTypes.get('a') ?? 'any', inputTypes.get('b') ?? 'any');
        case 'sub':
            return resolveBinaryOperatorResultType('-', inputTypes.get('a') ?? 'any', inputTypes.get('b') ?? 'any');
        case 'mul':
            return resolveBinaryOperatorResultType('*', inputTypes.get('a') ?? 'any', inputTypes.get('b') ?? 'any');
        case 'div':
            return resolveBinaryOperatorResultType('/', inputTypes.get('a') ?? 'any', inputTypes.get('b') ?? 'any');
        case 'mod':
            return resolveBinaryOperatorResultType('%', inputTypes.get('x') ?? 'any', inputTypes.get('y') ?? 'any');
        case 'oneMinus':
            return resolveBinaryOperatorResultType('-', 'float', inputTypes.get('x') ?? 'any');
        case 'reciprocal':
            return resolveBinaryOperatorResultType('/', 'float', inputTypes.get('x') ?? 'any');
        case 'difference':
            return resolveBinaryOperatorResultType('-', inputTypes.get('a') ?? 'any', inputTypes.get('b') ?? 'any');
        default:
            return pickLongestType([...inputTypes.values()]);
    }
}

function resolveMultiOpParamType(
    node: Node<TSLNodeData>,
    handleId: string,
    param: { type: TSLType; default: unknown },
    context: ResolverContext
): TSLType {
    const edge = context.edges.find((entry) => entry.target === node.id && entry.targetHandle === handleId);
    if (edge) {
        return resolveNodeOutputTypeById(
            edge.source,
            edge.sourceHandle,
            context.nodesById,
            context.edges,
            context.globals,
            context.subgraphs,
            context.visitedLocalSets
        );
    }

    if (param.type !== 'any') {
        return param.type;
    }

    const value = node.data.values?.[handleId] ?? param.default;
    if (value === undefined) return 'any';

    return inferLiteralTSLType(value as Parameters<typeof inferLiteralTSLType>[0]);
}

function resolveMultiOpOutputType(
    node: Node<TSLNodeData>,
    context: ResolverContext
): TSLType {
    const operations = Array.isArray(node.data.operations) ? (node.data.operations as MultiOp[]) : [];
    if (operations.length === 0) return 'any';

    let currentType: TSLType = 'any';

    operations.forEach((operation, index) => {
        const chainKey = getMultiOpChainKey(operation.op);
        const params = getMultiOpParams(operation.op, index === 0);
        const inputTypes = new Map<string, TSLType>();

        if (index > 0 && chainKey) {
            inputTypes.set(chainKey, currentType);
        }

        for (const param of params) {
            const handleId = getMultiOpHandleId(operation.id, param.key);
            inputTypes.set(param.key, resolveMultiOpParamType(node, handleId, param, context));
        }

        currentType = inferMathOutputTypeFromTsl(operation.op, inputTypes);
    });

    return currentType;
}

function resolveMathNodeOutputType(
    node: Node<TSLNodeData>,
    handleId: string | null | undefined,
    context: ResolverContext
): TSLType {
    const def = registry.get(node.data.type);
    if (!def) return 'any';

    const resolvedHandle = handleId ?? 'out';

    if (node.data.type === 'math/split') {
        if (resolvedHandle === 'out') {
            return resolveInputPortType(node, 'in', def.inputs?.in, context);
        }
        return def.outputs?.[resolvedHandle]?.type ?? 'any';
    }

    let outputType: TSLType;
    if (node.data.type === 'math/multiOp') {
        outputType = resolveMultiOpOutputType(node, context);
    } else if (node.data.type === 'math/range') {
        outputType = 'any';
    } else {
        const declaredOutputType = def.outputs?.out?.type;
        if (declaredOutputType && declaredOutputType !== 'any') {
            outputType = declaredOutputType;
        } else {
            const inputTypes = new Map<string, TSLType>();
            for (const [inputKey, inputDef] of Object.entries(def.inputs ?? {})) {
                inputTypes.set(inputKey, resolveInputPortType(node, inputKey, inputDef, context));
            }
            outputType = inferMathOutputTypeFromTsl(def.tsl, inputTypes);
        }
    }

    if (resolvedHandle === 'out') return outputType;
    return getComponentOutputType(outputType, resolvedHandle) ?? 'any';
}

function resolveLocalSetSourceType(
    node: Node<TSLNodeData>,
    context: ResolverContext
): TSLType {
    if (context.visitedLocalSets.has(node.id)) return 'any';
    context.visitedLocalSets.add(node.id);

    const valueEdge = context.edges.find((edge) => edge.target === node.id && edge.targetHandle === LOCAL_SET_INPUT_HANDLE);
    if (!valueEdge) return 'any';

    return resolveNodeOutputTypeById(
        valueEdge.source,
        valueEdge.sourceHandle,
        context.nodesById,
        context.edges,
        context.globals,
        context.subgraphs,
        context.visitedLocalSets
    );
}

function isMathNodeType(type: string): boolean {
    return type === 'math/multiOp' || type.startsWith('math/');
}

function resolvePassthroughOutputType(
    node: Node<TSLNodeData>,
    inputHandle: string,
    outputHandle: string | null | undefined,
    context: ResolverContext,
): TSLType {
    const def = registry.get(node.data.type);
    const outputType = resolveInputPortType(node, inputHandle, def?.inputs?.[inputHandle], context);
    if (!outputHandle || outputHandle === 'out') return outputType;
    return getComponentOutputType(outputType, outputHandle) ?? 'any';
}

export function resolveNodeOutputTypeById(
    nodeId: string,
    handleId: string | null | undefined,
    nodesById: Map<string, Node<TSLNodeData>>,
    edges: Edge[],
    globals: GlobalContextEntry[],
    subgraphs?: Record<string, SubgraphDefinition>,
    visitedLocalSets: Set<string> = new Set()
): TSLType {
    const node = nodesById.get(nodeId);
    if (!node) return 'any';

    const context: ResolverContext = {
        nodesById,
        edges,
        globals,
        subgraphs,
        visitedLocalSets,
    };

    if (isLocalGetType(node.data.type)) {
        const setId = getLocalSourceId(node);
        if (!setId) return 'any';
        const setNode = nodesById.get(setId);
        if (!setNode || !isLocalSetType(setNode.data.type)) return 'any';
        if (!isLocalScopeAccessible(setNode, node, nodesById)) return 'any';
        const outputType = resolveLocalSetSourceType(setNode, context);
        if (!handleId || handleId === 'out') return outputType;
        return getComponentOutputType(outputType, handleId) ?? 'any';
    }

    if (isLocalSetType(node.data.type)) {
        const outputType = resolveLocalSetSourceType(node, context);
        if (!handleId || handleId === 'out') return outputType;
        return getComponentOutputType(outputType, handleId) ?? 'any';
    }

    if (node.data.type === VAR_NODE_TYPE) {
        return resolvePassthroughOutputType(node, VAR_INPUT_HANDLE, handleId, context);
    }

    if (node.data.type === 'global/ref') {
        const outputType = resolveGlobalRefType(node, globals);
        if (!handleId || handleId === 'out') return outputType;
        return getComponentOutputType(outputType, handleId) ?? 'any';
    }

    if (isMathNodeType(node.data.type)) {
        return resolveMathNodeOutputType(node, handleId, context);
    }

    return resolveDeclaredOutputType(node, handleId, subgraphs);
}
