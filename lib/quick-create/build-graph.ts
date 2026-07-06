import type { Edge } from '@xyflow/react';
import { registry } from '../registry';
import type { AppNode, NodeType, Port, TSLValueType } from '../types';
import type {
    BuildQuickCreateExpressionGraphOptions,
    QuickCreateExpressionGraph,
    QuickCreateExpressionIntent,
    QuickCreateExpressionNode,
} from './ast';
import { normalizeSwizzleChar } from './infer';

const HORIZONTAL_GAP = 220;
const VERTICAL_GAP = 96;
const VECTOR_COMPONENT_KEYS = ['x', 'y', 'z', 'w'] as const;
const FOLDABLE_PORT_TYPES = new Set(['float', 'int', 'uint', 'any']);

let graphIdCounter = 0;

interface BuildResult {
    id: string;
    nodeType: NodeType | null;
    relativeY: number;
    outputHandleId: string;
    /** True when the result is the drag source, which lives outside this graph */
    external?: boolean;
}

interface ChildSpec {
    ast: QuickCreateExpressionNode;
    handleId: string;
    port?: Port;
    foldable: boolean;
}

interface PendingNode {
    node: AppNode;
    depth: number;
    relativeY: number;
}

function createNode(
    id: string,
    nodeType: NodeType,
    values: Record<string, TSLValueType>,
    connected: Record<string, boolean>
): AppNode {
    return {
        id,
        type: nodeType,
        position: { x: 0, y: 0 },
        selected: false,
        data: {
            type: nodeType,
            values,
            connected,
        },
    };
}

function sanitizeIdPart(value: string): string {
    return value.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

function getFoldableScalarValue(ast: QuickCreateExpressionNode, port: Port | undefined, foldable: boolean): number | null {
    if (!foldable) return null;
    if (ast.kind !== 'constant') return null;

    const { nodeType, values } = ast.intent;
    if (nodeType !== 'const/float' && nodeType !== 'const/int') return null;

    const value = values.value;
    if (typeof value !== 'number') return null;

    if (port) {
        if (port.connectionOnly) return null;
        if (!FOLDABLE_PORT_TYPES.has(port.type)) return null;
    }

    return value;
}

/** Node type an expression will materialize as, when statically known */
function getProducedNodeType(ast: QuickCreateExpressionNode): NodeType | null {
    switch (ast.kind) {
        case 'constant': return ast.intent.nodeType;
        case 'ident': return ast.nodeType;
        case 'operator': return ast.nodeType;
        case 'unary': return ast.nodeType;
        case 'call': return ast.entry.nodeType;
        case 'ternary': return 'logic/select';
        default: return null;
    }
}

export function buildQuickCreateExpressionGraph(
    intent: QuickCreateExpressionIntent,
    options: BuildQuickCreateExpressionGraphOptions
): QuickCreateExpressionGraph {
    const idPrefix = options.idPrefix ?? `quick-expression-${Date.now()}-${graphIdCounter++}`;
    let nodeIndex = 0;
    let leafIndex = 0;
    const pendingNodes: PendingNode[] = [];
    const pendingByResultId = new Map<string, PendingNode>();
    const edges: Edge[] = [];
    const identCache = new Map<string, BuildResult>();

    const nextNodeId = (nodeType: NodeType) => `${idPrefix}-${sanitizeIdPart(nodeType)}-${nodeIndex++}`;

    const nextLeafSlot = () => {
        const relativeY = leafIndex * VERTICAL_GAP;
        leafIndex += 1;
        return relativeY;
    };

    const pushNode = (
        result: BuildResult,
        node: AppNode,
        depth: number
    ) => {
        const pending: PendingNode = { node, depth, relativeY: result.relativeY };
        pendingNodes.push(pending);
        pendingByResultId.set(result.id, pending);
    };

    const addEdge = (from: { id: string; handle: string }, targetId: string, targetHandle: string) => {
        edges.push({
            id: `edge-${from.id}-${from.handle}-${targetId}-${targetHandle}`,
            source: from.id,
            sourceHandle: from.handle,
            target: targetId,
            targetHandle,
        });
    };

    /** Deepen an already-built node when it is reused from a deeper context */
    const ensureDepth = (result: BuildResult, depth: number) => {
        const pending = pendingByResultId.get(result.id);
        if (pending && depth > pending.depth) {
            pending.depth = depth;
        }
    };

    const averageRelativeY = (results: BuildResult[]): number | null => {
        const internal = results.filter((result) => !result.external);
        if (internal.length === 0) return null;
        return internal.reduce((acc, result) => acc + result.relativeY, 0) / internal.length;
    };

    const buildComposite = (
        nodeType: NodeType,
        children: ChildSpec[],
        depth: number
    ): BuildResult => {
        const values: Record<string, TSLValueType> = {};
        const connected: Record<string, boolean> = {};
        const childResults: BuildResult[] = [];
        const pendingEdges: Array<{ from: { id: string; handle: string }; handleId: string }> = [];

        for (const child of children) {
            const folded = getFoldableScalarValue(child.ast, child.port, child.foldable);
            if (folded !== null) {
                values[child.handleId] = folded;
                continue;
            }

            const result = buildExpression(child.ast, depth + 1);
            if (!result.external) childResults.push(result);
            pendingEdges.push({
                from: { id: result.id, handle: result.outputHandleId },
                handleId: child.handleId,
            });
            connected[child.handleId] = true;
        }

        const id = nextNodeId(nodeType);
        const relativeY = averageRelativeY(childResults) ?? nextLeafSlot();
        const result: BuildResult = { id, nodeType, relativeY, outputHandleId: 'out' };
        pushNode(result, createNode(id, nodeType, values, connected), depth);

        for (const pendingEdge of pendingEdges) {
            addEdge(pendingEdge.from, id, pendingEdge.handleId);
        }

        return result;
    };

    const getPort = (nodeType: NodeType, handleId: string): Port | undefined =>
        registry.get(nodeType)?.inputs?.[handleId];

    const buildMember = (
        ast: Extract<QuickCreateExpressionNode, { kind: 'member' }>,
        depth: number
    ): BuildResult => {
        const chars = [...ast.swizzle];
        const combine = chars.length > 1;

        // Prefer the object's own component output handles (geo/uv exposes
        // x/y, const/color exposes r/g/b, …) over inserting a split node.
        const producedType = getProducedNodeType(ast.object);
        const objectOutputs = producedType ? registry.get(producedType)?.outputs : undefined;
        const resolveDirectHandle = (char: string): string | null => {
            if (!objectOutputs) return null;
            if (objectOutputs[char]) return char;
            const normalized = normalizeSwizzleChar(char);
            return objectOutputs[normalized] ? normalized : null;
        };

        const needsSplit = chars.some((char) => resolveDirectHandle(char) === null);
        const combineDepth = depth;
        const splitDepth = combine ? depth + 1 : depth;
        const objectDepth = splitDepth + (needsSplit ? 1 : 0);

        const object = buildExpression(ast.object, objectDepth);

        let split: BuildResult | null = null;
        if (needsSplit) {
            const id = nextNodeId('math/split');
            split = {
                id,
                nodeType: 'math/split',
                relativeY: object.external ? nextLeafSlot() : object.relativeY,
                outputHandleId: 'out',
            };
            pushNode(split, createNode(id, 'math/split', {}, { in: true }), splitDepth);
            addEdge({ id: object.id, handle: object.outputHandleId }, id, 'in');
        }

        const componentSource = (char: string): { id: string; handle: string } => {
            const direct = resolveDirectHandle(char);
            if (direct && !object.external) return { id: object.id, handle: direct };
            return { id: split!.id, handle: normalizeSwizzleChar(char) };
        };

        if (!combine) {
            const source = componentSource(chars[0]);
            const carrier = split ?? object;
            return { ...carrier, outputHandleId: source.handle, external: false };
        }

        const vectorType = `const/vec${chars.length}` as NodeType;
        const id = nextNodeId(vectorType);
        const connected: Record<string, boolean> = {};
        const carrier = split ?? object;
        const result: BuildResult = {
            id,
            nodeType: vectorType,
            relativeY: carrier.external ? nextLeafSlot() : carrier.relativeY,
            outputHandleId: 'out',
        };

        chars.forEach((char, index) => {
            const componentHandle = VECTOR_COMPONENT_KEYS[index];
            connected[componentHandle] = true;
            addEdge(componentSource(char), id, componentHandle);
        });
        pushNode(result, createNode(id, vectorType, {}, connected), combineDepth);

        return result;
    };

    const buildExpression = (ast: QuickCreateExpressionNode, depth: number): BuildResult => {
        switch (ast.kind) {
            case 'constant': {
                const id = nextNodeId(ast.intent.nodeType);
                const result: BuildResult = {
                    id,
                    nodeType: ast.intent.nodeType,
                    relativeY: nextLeafSlot(),
                    outputHandleId: ast.intent.outputHandleId,
                };
                pushNode(result, createNode(id, ast.intent.nodeType, { ...ast.intent.values }, {}), depth);
                return result;
            }
            case 'ident': {
                const cached = identCache.get(ast.nodeType);
                if (cached) {
                    ensureDepth(cached, depth);
                    return cached;
                }
                const id = nextNodeId(ast.nodeType);
                const result: BuildResult = {
                    id,
                    nodeType: ast.nodeType,
                    relativeY: nextLeafSlot(),
                    outputHandleId: ast.outputHandleId,
                };
                pushNode(result, createNode(id, ast.nodeType, {}, {}), depth);
                identCache.set(ast.nodeType, result);
                return result;
            }
            case 'source': {
                return {
                    id: options.source?.nodeId ?? '',
                    nodeType: null,
                    relativeY: 0,
                    outputHandleId: options.source?.handleId ?? 'out',
                    external: true,
                };
            }
            case 'operator': {
                return buildComposite(ast.nodeType, [
                    {
                        ast: ast.left,
                        handleId: ast.leftHandleId,
                        port: getPort(ast.nodeType, ast.leftHandleId),
                        foldable: ast.foldable,
                    },
                    {
                        ast: ast.right,
                        handleId: ast.rightHandleId,
                        port: getPort(ast.nodeType, ast.rightHandleId),
                        foldable: ast.foldable,
                    },
                ], depth);
            }
            case 'unary': {
                return buildComposite(ast.nodeType, [
                    {
                        ast: ast.operand,
                        handleId: ast.inputHandleId,
                        port: getPort(ast.nodeType, ast.inputHandleId),
                        foldable: ast.operator === '-',
                    },
                ], depth);
            }
            case 'ternary': {
                return buildComposite('logic/select', [
                    { ast: ast.cond, handleId: 'cond', port: getPort('logic/select', 'cond'), foldable: false },
                    { ast: ast.ifTrue, handleId: 'trueVal', port: getPort('logic/select', 'trueVal'), foldable: true },
                    { ast: ast.ifFalse, handleId: 'falseVal', port: getPort('logic/select', 'falseVal'), foldable: true },
                ], depth);
            }
            case 'call': {
                return buildComposite(ast.entry.nodeType, ast.args.map((arg, index) => {
                    const handleId = ast.entry.inputHandles[index];
                    return {
                        ast: arg,
                        handleId,
                        port: ast.entry.inputPorts[handleId],
                        foldable: true,
                    };
                }), depth);
            }
            case 'member': {
                return buildMember(ast, depth);
            }
        }
    };

    const output = buildExpression(intent.ast, 0);
    const yOffset = options.basePosition.y - output.relativeY;

    const nodes = pendingNodes.map(({ node, depth, relativeY }) => {
        const absolutePosition = {
            x: options.basePosition.x - depth * HORIZONTAL_GAP,
            y: relativeY + yOffset,
        };
        const position = options.parent
            ? {
                x: absolutePosition.x - options.parent.absolutePosition.x,
                y: absolutePosition.y - options.parent.absolutePosition.y,
            }
            : absolutePosition;

        return {
            ...node,
            parentId: options.parent?.id,
            extent: options.parent ? 'parent' as const : undefined,
            position,
            selected: true,
        };
    });

    return {
        nodes,
        edges,
        outputNodeId: output.id,
        outputHandleId: output.outputHandleId,
        outputType: intent.outputType,
    };
}
