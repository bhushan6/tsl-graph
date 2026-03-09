import type { Edge, Node } from '@xyflow/react';
import type { AppNode, GlobalContextEntry, SubgraphDefinition, TSLNodeData, TSLType } from '@/lib/types';
import { registry } from './registry';
import { getMultiOpChainKey, getMultiOpInputs, type MultiOp } from './multi-op';
import { getUniformKindFromNode, getUniformOutputs } from './uniform-utils';

export const LOCAL_SET_NODE_TYPE = 'local/set' as const;
export const LOCAL_GET_NODE_TYPE = 'local/get' as const;
export const LOCAL_SET_INPUT_HANDLE = 'value' as const;

const OPERATOR_MATH_NODE_TYPES = new Set(['math/add', 'math/sub', 'math/mul', 'math/div']);
const FIXED_FLOAT_TSL = new Set(['length', 'distance', 'dot']);
const FIXED_BOOL_TSL = new Set(['all', 'any']);
const FIXED_VEC3_TSL = new Set(['cross']);

interface TypeInferenceState {
    nodesById: Map<string, Node<TSLNodeData>>;
    edges: Edge[];
    globals: GlobalContextEntry[];
    subgraphs?: Record<string, SubgraphDefinition>;
    outputMemo: Map<string, TSLType>;
    inputMemo: Map<string, TSLType>;
    outputStack: Set<string>;
    inputStack: Set<string>;
}

export interface TypeInferenceResolver {
    resolveOutputType: (nodeId: string, handleId?: string | null) => TSLType;
    resolveInputType: (nodeId: string, handleId?: string | null) => TSLType;
}

function createTypeInferenceState(
    nodesById: Map<string, Node<TSLNodeData>>,
    edges: Edge[],
    globals: GlobalContextEntry[],
    subgraphs?: Record<string, SubgraphDefinition>
): TypeInferenceState {
    return {
        nodesById,
        edges,
        globals,
        subgraphs,
        outputMemo: new Map<string, TSLType>(),
        inputMemo: new Map<string, TSLType>(),
        outputStack: new Set<string>(),
        inputStack: new Set<string>(),
    };
}

function normalizeOutputHandleId(handleId: string | null | undefined): string {
    return handleId ?? 'out';
}

function normalizeInputHandleId(handleId: string | null | undefined): string {
    return handleId ?? '';
}

function isMatrixType(type: TSLType): type is 'mat2' | 'mat3' | 'mat4' {
    return type === 'mat2' || type === 'mat3' || type === 'mat4';
}

function isVectorType(type: TSLType): boolean {
    return type === 'vec2'
        || type === 'vec3'
        || type === 'vec4'
        || type === 'ivec2'
        || type === 'ivec3'
        || type === 'ivec4'
        || type === 'uvec2'
        || type === 'uvec3'
        || type === 'uvec4'
        || type === 'bvec2'
        || type === 'bvec3'
        || type === 'bvec4'
        || type === 'color';
}

function getTypeLength(type: TSLType): number {
    if (type === 'vec2' || type === 'ivec2' || type === 'uvec2' || type === 'bvec2' || type === 'mat2') return 2;
    if (type === 'vec3' || type === 'ivec3' || type === 'uvec3' || type === 'bvec3' || type === 'color' || type === 'mat3') return 3;
    if (type === 'vec4' || type === 'ivec4' || type === 'uvec4' || type === 'bvec4' || type === 'mat4') return 4;
    if (type === 'float' || type === 'int' || type === 'uint' || type === 'bool') return 1;
    return 0;
}

function getVectorFromMatrixType(type: 'mat2' | 'mat3' | 'mat4'): TSLType {
    if (type === 'mat2') return 'vec2';
    if (type === 'mat3') return 'vec3';
    return 'vec4';
}

function inferLiteralTypeFromValue(value: unknown): TSLType {
    if (typeof value === 'boolean') return 'bool';

    if (typeof value === 'number') {
        return Number.isFinite(value) ? 'float' : 'any';
    }

    if (typeof value === 'string') {
        return value.startsWith('#') ? 'color' : 'any';
    }

    if (Array.isArray(value)) {
        const isNumericArray = value.every((entry) => typeof entry === 'number' && Number.isFinite(entry));
        if (!isNumericArray) return 'any';

        if (value.length === 1) return 'float';
        if (value.length === 2) return 'vec2';
        if (value.length === 3) return 'vec3';
        if (value.length === 4) return 'vec4';
    }

    return 'any';
}

function chooseMathDominantType(types: TSLType[]): TSLType {
    let dominant: TSLType | null = null;

    for (const type of types) {
        if (type === 'any') continue;

        if (!dominant) {
            dominant = type;
            continue;
        }

        const dominantLength = isMatrixType(dominant) ? 0 : getTypeLength(dominant);
        const currentLength = isMatrixType(type) ? 0 : getTypeLength(type);

        if (currentLength > dominantLength) {
            dominant = type;
        }
    }

    return dominant ?? 'any';
}

function inferOperatorResultType(typeA: TSLType, typeB: TSLType): TSLType {
    if (typeA === 'any') return typeB;
    if (typeB === 'any') return typeA;

    if (isMatrixType(typeA)) {
        if (typeB === 'float') {
            return typeA;
        }

        if (isVectorType(typeB)) {
            return getVectorFromMatrixType(typeA);
        }

        if (isMatrixType(typeB)) {
            return typeA;
        }
    } else if (isMatrixType(typeB)) {
        if (typeA === 'float') {
            return typeB;
        }

        if (isVectorType(typeA)) {
            return getVectorFromMatrixType(typeB);
        }
    }

    return getTypeLength(typeB) > getTypeLength(typeA) ? typeB : typeA;
}

function inferMathOperationType(
    tsl: string,
    argTypes: TSLType[],
    argKeys: string[]
): TSLType {
    if (FIXED_FLOAT_TSL.has(tsl)) return 'float';
    if (FIXED_BOOL_TSL.has(tsl)) return 'bool';
    if (FIXED_VEC3_TSL.has(tsl)) return 'vec3';

    if (tsl === 'split') {
        return argTypes[0] ?? 'any';
    }

    if (tsl === 'remap' || tsl === 'remapClamp') {
        const nodeIndex = argKeys.indexOf('node');
        if (nodeIndex >= 0) return argTypes[nodeIndex] ?? 'any';
        return argTypes[0] ?? 'any';
    }

    if (tsl === 'range') {
        return chooseMathDominantType(argTypes.slice(0, 2));
    }

    if (tsl === 'add' || tsl === 'sub' || tsl === 'mul' || tsl === 'div') {
        if (argTypes.length === 0) return 'any';

        let result = argTypes[0] ?? 'any';
        for (let index = 1; index < argTypes.length; index += 1) {
            result = inferOperatorResultType(result, argTypes[index]);
        }

        return result;
    }

    return chooseMathDominantType(argTypes);
}

function getNodeInputHandles(node: Node<TSLNodeData>): string[] {
    if (node.data.type === 'math/multiOp') {
        const operations = Array.isArray(node.data.operations) ? (node.data.operations as MultiOp[]) : [];
        return getMultiOpInputs(operations).map((entry) => entry.handleId);
    }

    const def = registry.get(node.data.type);
    return Object.keys(def?.inputs ?? {});
}

function getMultiOpInputMeta(node: Node<TSLNodeData>, handleId: string): { type: TSLType; defaultValue: unknown } | null {
    if (node.data.type !== 'math/multiOp') return null;

    const operations = Array.isArray(node.data.operations) ? (node.data.operations as MultiOp[]) : [];
    const inputEntry = getMultiOpInputs(operations).find((entry) => entry.handleId === handleId);
    if (!inputEntry) return null;

    return {
        type: inputEntry.param.type,
        defaultValue: inputEntry.param.default,
    };
}

function resolveInputDefaultValue(node: Node<TSLNodeData>, handleId: string): unknown {
    const multiOpMeta = getMultiOpInputMeta(node, handleId);
    if (multiOpMeta) {
        return multiOpMeta.defaultValue;
    }

    const def = registry.get(node.data.type);
    return def?.inputs?.[handleId]?.default;
}

function resolveDeclaredInputType(node: Node<TSLNodeData>, handleId: string, state: TypeInferenceState): TSLType {
    if (!handleId) return 'any';

    const multiOpMeta = getMultiOpInputMeta(node, handleId);
    if (multiOpMeta) return multiOpMeta.type;

    if (node.data.type.startsWith('custom/')) {
        const subgraph = state.subgraphs?.[node.data.type];
        const subgraphInput = subgraph?.inputs.find((port) => port.id === handleId);
        if (subgraphInput) return subgraphInput.type;

        const dynamicPort = node.data.dynamicPorts?.find((port) => port.id === handleId);
        return (dynamicPort?.type as TSLType) ?? 'any';
    }

    if (node.data.type.startsWith('code/')) {
        const dynamicPort = node.data.dynamicPorts?.find((port) => port.id === handleId);
        return (dynamicPort?.type as TSLType) ?? 'any';
    }

    if (node.data.dynamicPorts && node.data.dynamicPorts.length > 0) {
        const dynamicPort = node.data.dynamicPorts.find((port) => port.id === handleId);
        if (dynamicPort?.type) return dynamicPort.type;
    }

    const def = registry.get(node.data.type);
    const input = def?.inputs?.[handleId];
    return (input?.type as TSLType) ?? 'any';
}

function resolveDeclaredOutputType(node: Node<TSLNodeData>, handleId: string | null | undefined, state: TypeInferenceState): TSLType {
    const resolvedHandle = normalizeOutputHandleId(handleId);

    if (node.data.type === 'global/ref') {
        return resolveGlobalRefType(node, state.globals);
    }

    if (node.data.type === 'const/uniform') {
        const kind = getUniformKindFromNode({ data: node.data } as Pick<AppNode, 'data'>);
        const outputs = getUniformOutputs(kind);
        return outputs[resolvedHandle]?.type ?? outputs.out?.type ?? 'float';
    }

    if (node.data.type.startsWith('custom/')) {
        const subgraph = state.subgraphs?.[node.data.type];
        const output = subgraph?.outputs.find((port) => port.id === resolvedHandle)
            ?? subgraph?.outputs.find((port) => port.id === 'out_0')
            ?? subgraph?.outputs[0];
        if (output?.type) return output.type;

        const dynamicPort = node.data.dynamicPorts?.find((port) => port.id === resolvedHandle);
        return (dynamicPort?.type as TSLType) ?? 'any';
    }

    if (node.data.type.startsWith('code/')) {
        const dynamicPort = node.data.dynamicPorts?.find((port) => port.id === resolvedHandle);
        return (dynamicPort?.type as TSLType) ?? 'any';
    }

    if (node.data.dynamicPorts && node.data.dynamicPorts.length > 0) {
        const dynamicPort = node.data.dynamicPorts.find((port) => port.id === resolvedHandle)
            ?? node.data.dynamicPorts.find((port) => port.id === 'out');
        if (dynamicPort?.type) return dynamicPort.type;
    }

    const def = registry.get(node.data.type);
    if (!def?.outputs) return 'any';

    const output = def.outputs[resolvedHandle] ?? def.outputs.out;
    return (output?.type as TSLType) ?? 'any';
}

function getConnectedInputType(
    node: Node<TSLNodeData>,
    handleId: string,
    state: TypeInferenceState,
    visitedLocalSets: Set<string>
): TSLType {
    const edge = state.edges.find((entry) => entry.target === node.id && (entry.targetHandle ?? '') === handleId);
    if (!edge) return 'any';

    return resolveNodeOutputTypeInternal(
        edge.source,
        edge.sourceHandle,
        state,
        visitedLocalSets
    );
}

function getLiteralInputType(node: Node<TSLNodeData>, handleId: string): TSLType {
    const value = node.data.values?.[handleId] ?? resolveInputDefaultValue(node, handleId);
    if (value === undefined || value === null) return 'any';

    return inferLiteralTypeFromValue(value);
}

function inferMathInputFromSiblings(
    node: Node<TSLNodeData>,
    targetHandleId: string,
    state: TypeInferenceState,
    visitedLocalSets: Set<string>
): TSLType {
    const handles = getNodeInputHandles(node);
    const siblingTypes: TSLType[] = [];

    for (const handleId of handles) {
        if (handleId === targetHandleId) continue;

        const connectedType = getConnectedInputType(node, handleId, state, visitedLocalSets);
        if (connectedType !== 'any') {
            siblingTypes.push(connectedType);
            continue;
        }

        const literalType = getLiteralInputType(node, handleId);
        if (literalType !== 'any') {
            siblingTypes.push(literalType);
            continue;
        }

        const declaredType = resolveDeclaredInputType(node, handleId, state);
        if (declaredType !== 'any') {
            siblingTypes.push(declaredType);
        }
    }

    if (siblingTypes.length === 0) return 'any';

    if (OPERATOR_MATH_NODE_TYPES.has(node.data.type)) {
        let result = siblingTypes[0];
        for (let index = 1; index < siblingTypes.length; index += 1) {
            result = inferOperatorResultType(result, siblingTypes[index]);
        }
        return result;
    }

    return chooseMathDominantType(siblingTypes);
}

function inferMultiOpOutputType(node: Node<TSLNodeData>, state: TypeInferenceState): TSLType {
    const operations = Array.isArray(node.data.operations) ? (node.data.operations as MultiOp[]) : [];
    if (operations.length === 0) return 'any';

    const inputDefs = getMultiOpInputs(operations);
    let chainType: TSLType = 'any';

    for (let index = 0; index < operations.length; index += 1) {
        const operation = operations[index];
        const opInputs = inputDefs.filter((entry) => entry.opId === operation.id);

        const argTypes: TSLType[] = [];
        const argKeys: string[] = [];

        if (index > 0) {
            const chainKey = getMultiOpChainKey(operation.op) ?? 'x';
            argTypes.push(chainType);
            argKeys.push(chainKey);
        }

        for (const input of opInputs) {
            argTypes.push(resolveNodeInputTypeInternal(node.id, input.handleId, state));
            argKeys.push(input.param.key);
        }

        chainType = inferMathOperationType(operation.op, argTypes, argKeys);
    }

    return chainType;
}

function inferMathOutputType(
    node: Node<TSLNodeData>,
    handleId: string | null | undefined,
    state: TypeInferenceState,
    visitedLocalSets: Set<string>
): TSLType {
    const declaredType = resolveDeclaredOutputType(node, handleId, state);
    if (declaredType !== 'any') return declaredType;

    if (node.data.type === 'math/multiOp') {
        return inferMultiOpOutputType(node, state);
    }

    const def = registry.get(node.data.type);
    const inputHandles = Object.keys(def?.inputs ?? {});
    const inputTypes = inputHandles.map((inputHandle) =>
        resolveNodeInputTypeInternal(node.id, inputHandle, state, visitedLocalSets)
    );

    return inferMathOperationType(def?.tsl ?? '', inputTypes, inputHandles);
}

export function isLoopGroupNode(node: Node<TSLNodeData> | undefined): boolean {
    if (!node) return false;
    return node.type === 'loop' || node.data.type === 'loop';
}

export function isLocalSetType(type: string): boolean {
    return type === LOCAL_SET_NODE_TYPE;
}

export function isLocalGetType(type: string): boolean {
    return type === LOCAL_GET_NODE_TYPE;
}

export function isLocalSetNode(node: Node<TSLNodeData> | undefined): node is Node<TSLNodeData> {
    return !!node && isLocalSetType(node.data.type);
}

export function isLocalGetNode(node: Node<TSLNodeData> | undefined): node is Node<TSLNodeData> {
    return !!node && isLocalGetType(node.data.type);
}

export function getLocalName(node: Node<TSLNodeData> | undefined): string {
    if (!node) return '';
    const localName = node.data.values?.localName;
    if (typeof localName === 'string') return localName;
    const dataLocalName = node.data.localName;
    return typeof dataLocalName === 'string' ? dataLocalName : '';
}

export function normalizeLocalName(name: string): string {
    return name.trim().toLowerCase();
}

export function sanitizeLocalIdentifier(name: string, fallback: string): string {
    const trimmed = name.trim();
    const raw = trimmed.length > 0 ? trimmed : fallback;
    return raw.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&') || fallback;
}

export function getLocalSourceId(node: Node<TSLNodeData> | undefined): string | null {
    if (!node) return null;
    const localSourceId = node.data.values?.localSourceId;
    return typeof localSourceId === 'string' && localSourceId.length > 0 ? localSourceId : null;
}

export function getLocalSetSourceEdge(
    setNode: Node<TSLNodeData>,
    edges: Edge[]
): Edge | null {
    return edges.find((edge) => edge.target === setNode.id && edge.targetHandle === LOCAL_SET_INPUT_HANDLE) ?? null;
}

export function getLocalSetSourceNode(
    setNode: Node<TSLNodeData>,
    nodesById: Map<string, Node<TSLNodeData>>,
    edges: Edge[]
): Node<TSLNodeData> | null {
    const sourceEdge = getLocalSetSourceEdge(setNode, edges);
    if (!sourceEdge) return null;
    return nodesById.get(sourceEdge.source) ?? null;
}

export function getLocalSetReferenceLabel(
    setNode: Node<TSLNodeData>,
    nodesById: Map<string, Node<TSLNodeData>>,
    edges: Edge[]
): string {
    const sourceEdge = getLocalSetSourceEdge(setNode, edges);
    if (!sourceEdge) return setNode.id;

    const sourceNode = nodesById.get(sourceEdge.source);
    const sourceBaseName = getLocalName(sourceNode).trim() || sourceNode?.id || sourceEdge.source;
    const handle = sourceEdge.sourceHandle;
    if (!handle || handle === 'out') return sourceBaseName;
    return `${sourceBaseName}.${handle}`;
}

export function getLoopAncestorIds(
    node: Node<TSLNodeData>,
    nodesById: Map<string, Node<TSLNodeData>>
): string[] {
    const ids: string[] = [];
    let parentId = node.parentId;

    while (parentId) {
        const parent = nodesById.get(parentId);
        if (!parent) break;
        if (isLoopGroupNode(parent)) {
            ids.push(parent.id);
        }
        parentId = parent.parentId;
    }

    return ids;
}

export function isLocalScopeAccessible(
    setNode: Node<TSLNodeData>,
    getNode: Node<TSLNodeData>,
    nodesById: Map<string, Node<TSLNodeData>>
): boolean {
    const setLoopAncestors = getLoopAncestorIds(setNode, nodesById);

    // Set outside loops can be read from anywhere.
    if (setLoopAncestors.length === 0) return true;

    // Set is scoped to its nearest loop context.
    const setScopeLoopId = setLoopAncestors[0];
    const getLoopAncestors = getLoopAncestorIds(getNode, nodesById);
    return getLoopAncestors.includes(setScopeLoopId);
}

export function withLocalDependencyEdges(
    nodes: Node<TSLNodeData>[],
    edges: Edge[]
): Edge[] {
    const result = [...edges];
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edgeKeys = new Set(result.map((edge) => `${edge.source}->${edge.target}`));
    const nodesById = new Map(nodes.map((node) => [node.id, node]));

    for (const node of nodes) {
        if (!isLocalSetNode(node)) continue;
        const valueEdge = edges.find((edge) => edge.target === node.id && edge.targetHandle === LOCAL_SET_INPUT_HANDLE);
        if (!valueEdge || !nodeIds.has(valueEdge.source)) continue;

        const key = `${valueEdge.source}->${node.id}`;
        if (edgeKeys.has(key)) continue;

        result.push({
            id: `__local_set_dep__${valueEdge.source}__${node.id}`,
            source: valueEdge.source,
            target: node.id,
            sourceHandle: valueEdge.sourceHandle,
            targetHandle: LOCAL_SET_INPUT_HANDLE,
        });
        edgeKeys.add(key);
    }

    for (const node of nodes) {
        if (!isLocalGetType(node.data.type)) continue;

        const setId = getLocalSourceId(node);
        if (!setId || !nodeIds.has(setId)) continue;

        const setNode = nodesById.get(setId);
        if (!setNode || !isLocalSetNode(setNode)) continue;

        const key = `${setId}->${node.id}`;
        if (edgeKeys.has(key)) continue;

        result.push({
            id: `__local_dep__${setId}__${node.id}`,
            source: setId,
            target: node.id,
            sourceHandle: 'out',
            targetHandle: '__local_dep__',
        });
        edgeKeys.add(key);
    }

    return result;
}

export function getValidLocalSetNodesForGetNode(
    getNode: Node<TSLNodeData>,
    nodesById: Map<string, Node<TSLNodeData>>
): Node<TSLNodeData>[] {
    const results: Node<TSLNodeData>[] = [];
    for (const candidate of nodesById.values()) {
        if (!isLocalSetNode(candidate)) continue;
        if (!isLocalScopeAccessible(candidate, getNode, nodesById)) continue;
        results.push(candidate);
    }
    return results;
}

function resolveLocalSetSourceTypeInternal(
    node: Node<TSLNodeData>,
    state: TypeInferenceState,
    visitedLocalSets: Set<string>
): TSLType {
    if (visitedLocalSets.has(node.id)) return 'any';
    visitedLocalSets.add(node.id);

    const valueEdge = state.edges.find((edge) => edge.target === node.id && edge.targetHandle === LOCAL_SET_INPUT_HANDLE);
    if (!valueEdge) return 'any';

    return resolveNodeOutputTypeInternal(
        valueEdge.source,
        valueEdge.sourceHandle,
        state,
        visitedLocalSets
    );
}

function resolveGlobalRefType(node: Node<TSLNodeData>, globals: GlobalContextEntry[]): TSLType {
    const globalId = node.data.values?.globalId;
    if (typeof globalId !== 'string') return 'any';
    const entry = globals.find((item) => item.id === globalId);
    return (entry?.type as TSLType) ?? 'any';
}

function resolveNodeInputTypeInternal(
    nodeId: string,
    handleId: string | null | undefined,
    state: TypeInferenceState,
    visitedLocalSets: Set<string> = new Set()
): TSLType {
    const resolvedHandle = normalizeInputHandleId(handleId);
    if (!resolvedHandle) return 'any';

    const cacheKey = `${nodeId}::${resolvedHandle}`;
    const cached = state.inputMemo.get(cacheKey);
    if (cached) return cached;

    if (state.inputStack.has(cacheKey)) return 'any';
    state.inputStack.add(cacheKey);

    let resolved: TSLType = 'any';

    try {
        const node = state.nodesById.get(nodeId);
        if (!node) {
            resolved = 'any';
        } else {
            const declaredType = resolveDeclaredInputType(node, resolvedHandle, state);

            if (!node.data.type.startsWith('math/') || declaredType !== 'any') {
                resolved = declaredType;
            } else {
                const connectedType = getConnectedInputType(node, resolvedHandle, state, visitedLocalSets);
                const siblingType = inferMathInputFromSiblings(node, resolvedHandle, state, visitedLocalSets);
                const literalType = getLiteralInputType(node, resolvedHandle);

                if (connectedType !== 'any') {
                    resolved = connectedType;
                } else if (siblingType !== 'any') {
                    resolved = siblingType;
                } else {
                    resolved = literalType;
                }

                if (resolved !== 'any' && siblingType !== 'any') {
                    if (OPERATOR_MATH_NODE_TYPES.has(node.data.type)) {
                        resolved = inferOperatorResultType(resolved, siblingType);
                    } else {
                        resolved = chooseMathDominantType([resolved, siblingType]);
                    }
                }
            }
        }
    } finally {
        state.inputStack.delete(cacheKey);
    }

    state.inputMemo.set(cacheKey, resolved);
    return resolved;
}

function resolveNodeOutputTypeInternal(
    nodeId: string,
    handleId: string | null | undefined,
    state: TypeInferenceState,
    visitedLocalSets: Set<string>
): TSLType {
    const resolvedHandle = normalizeOutputHandleId(handleId);
    const cacheKey = `${nodeId}::${resolvedHandle}`;
    const cached = state.outputMemo.get(cacheKey);
    if (cached) return cached;

    if (state.outputStack.has(cacheKey)) return 'any';
    state.outputStack.add(cacheKey);

    let resolved: TSLType = 'any';

    try {
        const node = state.nodesById.get(nodeId);
        if (!node) {
            resolved = 'any';
        } else if (isLocalGetType(node.data.type)) {
            const setId = getLocalSourceId(node);
            if (!setId) {
                resolved = 'any';
            } else {
                const setNode = state.nodesById.get(setId);
                if (!setNode || !isLocalSetNode(setNode)) {
                    resolved = 'any';
                } else if (!isLocalScopeAccessible(setNode, node, state.nodesById)) {
                    resolved = 'any';
                } else {
                    resolved = resolveLocalSetSourceTypeInternal(setNode, state, visitedLocalSets);
                }
            }
        } else if (isLocalSetType(node.data.type)) {
            resolved = resolveLocalSetSourceTypeInternal(node, state, visitedLocalSets);
        } else if (node.data.type === 'global/ref') {
            resolved = resolveGlobalRefType(node, state.globals);
        } else if (node.data.type.startsWith('math/')) {
            resolved = inferMathOutputType(node, resolvedHandle, state, visitedLocalSets);
        } else {
            resolved = resolveDeclaredOutputType(node, resolvedHandle, state);
        }
    } finally {
        state.outputStack.delete(cacheKey);
    }

    state.outputMemo.set(cacheKey, resolved);
    return resolved;
}

export function createTypeInferenceResolver(
    nodesById: Map<string, Node<TSLNodeData>>,
    edges: Edge[],
    globals: GlobalContextEntry[],
    subgraphs?: Record<string, SubgraphDefinition>
): TypeInferenceResolver {
    const state = createTypeInferenceState(nodesById, edges, globals, subgraphs);

    return {
        resolveOutputType: (nodeId: string, handleId?: string | null): TSLType => {
            return resolveNodeOutputTypeInternal(nodeId, handleId, state, new Set());
        },
        resolveInputType: (nodeId: string, handleId?: string | null): TSLType => {
            return resolveNodeInputTypeInternal(nodeId, handleId, state, new Set());
        },
    };
}

export function resolveNodeInputTypeById(
    nodeId: string,
    handleId: string | null | undefined,
    nodesById: Map<string, Node<TSLNodeData>>,
    edges: Edge[],
    globals: GlobalContextEntry[],
    subgraphs?: Record<string, SubgraphDefinition>
): TSLType {
    const state = createTypeInferenceState(nodesById, edges, globals, subgraphs);
    return resolveNodeInputTypeInternal(nodeId, handleId, state, new Set());
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
    const state = createTypeInferenceState(nodesById, edges, globals, subgraphs);
    return resolveNodeOutputTypeInternal(nodeId, handleId, state, visitedLocalSets);
}

export function collectLocalSetNames(nodes: Node<TSLNodeData>[]): Map<string, string[]> {
    const result = new Map<string, string[]>();

    for (const node of nodes) {
        if (!isLocalSetNode(node)) continue;
        const name = normalizeLocalName(getLocalName(node));
        if (!name) continue;
        const list = result.get(name) ?? [];
        list.push(node.id);
        result.set(name, list);
    }

    return result;
}
