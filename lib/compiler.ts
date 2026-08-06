import { Node, Edge } from '@xyflow/react';
import { TSLNodeData, SubgraphDefinition, CodeNodeDefinition, type Port, GlobalContextEntry, type NodeDef, type TSLValueType } from '@/lib/types';
import { registry } from './registry';
import { MATERIAL_NODE_TYPES, POST_ANCHOR_NODE_TYPES } from './nodes';
import { topologicalSort } from './graph-utils';
import { getMultiOpHandleId, getMultiOpParams, type MultiOp } from './multi-op';
import { UNIFORM_KINDS, formatUniformValueExpression, getUniformKindFromNode, type UniformKind } from './uniform-utils';
import { getMaterialActiveInputsSet } from './material-inputs';
import { TEXTURE_PROP_INPUTS } from './texture-props';
import { normalizeGradientStops } from './gradient-utils';
import {
    getLocalName,
    getLocalSourceId,
    isLocalGetType,
    isLocalScopeAccessible,
    isLocalSetNode,
    isLocalSetType,
    withLocalDependencyEdges,
} from './local-utils';
import { inferLiteralTSLType } from './value-type-utils';

interface CompiledNode {
    id: string;
    varName: string;
    code: string;
    singleOutput?: boolean;
}

export interface CompileOptions {
    uniformMode?: 'inline' | 'runtime';
    globals?: GlobalContextEntry[];
    // When true, the shared "// Global Context" declarations are not emitted.
    // Used when combining multiple root graphs into one file so the globals are
    // declared once at the top (see compileGlobalContext) instead of per-graph.
    omitGlobalContext?: boolean;
    runtimeCameraFromScope?: boolean;
    previewTarget?: {
        nodeId: string;
        outputHandle?: string | null;
        varName?: string;
    };
    previewSubgraphInputs?: boolean;
}

function wrapWgslTemplateLiteral(code: string): string {
    const escaped = code
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\$\{/g, '\\${');
    return `\`${escaped}\``;
}

const isUniformKindType = (type: string): type is UniformKind => {
    return UNIFORM_KINDS.includes(type as UniformKind);
};

// Component swizzle mapping for code generation
const COMPONENT_SWIZZLES: Record<string, string> = {
    'x': 'x',
    'y': 'y',
    'z': 'z',
    'w': 'w',
    'r': 'x',
    'g': 'y',
    'b': 'z',
    'near': 'x',
    'far': 'y',
};

const LOOP_INTERNAL_NODE_TYPES = new Set([
    'loop/count',
    'loop/start',
    'loop/end',
    'loop/index',
    'loop/count2',
    'loop/index2',
    'loop/accumulator',
    'loop/condition',
    'loop/output',
]);

const COMMENT_NODE_TYPE = 'utils/comment';

const ASSIGN_NODE_METHODS: Record<string, string> = {
    'assign/assign': 'assign',
    'assign/addAssign': 'addAssign',
    'assign/subAssign': 'subAssign',
    'assign/mulAssign': 'mulAssign',
    'assign/divAssign': 'divAssign',
    'assign/modAssign': 'modAssign',
    'assign/minAssign': 'minAssign',
    'assign/maxAssign': 'maxAssign',
    'assign/bitAndAssign': 'bitAndAssign',
    'assign/bitOrAssign': 'bitOrAssign',
    'assign/bitXorAssign': 'bitXorAssign',
    'assign/shiftLeftAssign': 'shiftLeftAssign',
    'assign/shiftRightAssign': 'shiftRightAssign',
};

const PHYSICAL_MATERIAL_FEATURE_KEYS = new Set([
    'clearcoatNode', 'clearcoatRoughnessNode',
    'sheenNode', 'sheenRoughnessNode',
    'iridescenceNode',
    'transmissionNode', 'thicknessNode',
]);

function isFiniteNumberArray(value: unknown): value is number[] {
    return Array.isArray(value) && value.every((entry) => {
        return typeof entry === 'number' && Number.isFinite(entry);
    });
}

function addGeneratedValueImports(
    imports: Set<string>,
    type: string,
    value: unknown
) {
    const valueType = type === 'any' && value !== undefined && value !== null
        ? inferLiteralTSLType(value as TSLValueType)
        : type;

    if (valueType === 'color') {
        imports.add('color');
        return;
    }

    if (!isFiniteNumberArray(value)) {
        return;
    }

    if (value.length === 2) imports.add('vec2');
    else if (value.length === 3) imports.add('vec3');
    else if (value.length === 4) imports.add('vec4');
}

function addFallbackInputImports(
    imports: Set<string>,
    node: Node<TSLNodeData>,
    def: NodeDef
) {
    for (const [key, inputDef] of Object.entries(def.inputs ?? {})) {
        if (node.data.connected?.[key]) {
            continue;
        }

        if (node.data.type === 'texture/sampleNode' && key === 'uv') {
            imports.add('screenUV');
            continue;
        }

        const value = node.data.values?.[key] ?? inputDef.default;
        addGeneratedValueImports(imports, inputDef.type, value);
    }
}

function addMaterialFallbackImports(
    imports: Set<string>,
    materialNode: Node<TSLNodeData>,
    materialDef: NodeDef
) {
    const activeInputs = getMaterialActiveInputsSet(materialNode.data, materialDef);

    for (const [key, inputDef] of Object.entries(materialDef.inputs ?? {})) {
        if (materialNode.data.connected?.[key] || !activeInputs.has(key) || inputDef.connectionOnly) {
            continue;
        }

        if (PHYSICAL_MATERIAL_FEATURE_KEYS.has(key)) {
            const userVal = materialNode.data.values?.[key];
            if (userVal === undefined || userVal === inputDef.default) {
                continue;
            }
        }

        if (inputDef.isMaterialProp) {
            continue;
        }

        const value = materialNode.data.values?.[key] ?? inputDef.default;
        addGeneratedValueImports(imports, inputDef.type, value);

        if (inputDef.type === 'float' || inputDef.type === 'any') {
            imports.add('float');
        } else if (inputDef.type === 'int' || inputDef.type === 'uint') {
            imports.add('int');
        } else if (inputDef.type === 'bool') {
            imports.add('bool');
        }
    }
}

/**
 * Get TSL default expression for a given type.
 * Used when code node inputs are not connected and have no explicit value.
 */
function getTSLDefaultForType(type: string, value?: unknown): string {
    // If a value is provided, use it
    if (value !== undefined && value !== null) {
        if (type === 'color') {
            return `color("${String(value)}")`;
        }
        if (type === 'bool') {
            return value ? 'true' : 'false';
        }
        if (Array.isArray(value)) {
            const components = value.map(v => String(Number(v ?? 0)));
            if (components.length === 2) return `vec2(${components.join(', ')})`;
            if (components.length === 3) return `vec3(${components.join(', ')})`;
            if (components.length === 4) return `vec4(${components.join(', ')})`;
            return `vec${components.length}(${components.join(', ')})`;
        }
        if (type === 'int' || type === 'uint') {
            return `int(${Math.round(Number(value))})`;
        }
        return `float(${Number(value)})`;
    }

    // Return type-appropriate defaults
    switch (type) {
        case 'color': return 'color("#ffffff")';
        case 'bool': return 'false';
        case 'vec2': return 'vec2(0, 0)';
        case 'vec3': return 'vec3(0, 0, 0)';
        case 'vec4': return 'vec4(0, 0, 0, 0)';
        case 'int':
        case 'uint': return 'int(0)';
        case 'float':
        case 'any':
        default: return 'float(0)';
    }
}

function sanitizeIdentifier(raw: string, fallback: string): string {
    const cleaned = String(raw).replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&');
    return cleaned.length > 0 ? cleaned : fallback;
}

function buildGlobalVarMap(globals: GlobalContextEntry[]): { varMap: Map<string, string>; reserved: Set<string> } {
    const reserved = new Set<string>();
    const varMap = new Map<string, string>();
    globals.forEach((entry, index) => {
        const base = sanitizeIdentifier(entry.name, `_global${index}`);
        let name = base;
        let suffix = 1;
        while (reserved.has(name)) {
            name = `${base}_${suffix++}`;
        }
        reserved.add(name);
        varMap.set(entry.id, name);
    });
    return { varMap, reserved };
}

/**
 * Emit the shared "// Global Context" declarations (uniforms, varyings,
 * constants) for a set of globals. Var names come from buildGlobalVarMap, which
 * is deterministic in `globals` alone, so the names match those referenced by
 * any compiled graph using the same globals. Returns '' when there are none.
 */
export function compileGlobalContext(
    globals: GlobalContextEntry[],
    options: { uniformMode?: 'inline' | 'runtime' } = {}
): string {
    if (globals.length === 0) {
        return '';
    }
    const uniformMode = options.uniformMode ?? 'inline';
    const { varMap: globalVarMap } = buildGlobalVarMap(globals);
    const lines: string[] = ['// Global Context'];
    globals.forEach((entry, index) => {
        const varName = globalVarMap.get(entry.id) ?? sanitizeIdentifier(entry.name, `_global${index}`);
        const defaultExpr = getTSLDefaultForType(entry.type, entry.defaultValue);

        if (entry.kind === 'uniform') {
            if (uniformMode === 'runtime' && isUniformKindType(entry.type)) {
                const valueExpr = formatUniformValueExpression(entry.type, entry.defaultValue);
                lines.push(`const ${varName} = __uniform("${entry.id}", ${valueExpr}, "${entry.type}");`);
            } else {
                lines.push(`const ${varName} = uniform(${defaultExpr});`);
            }
        } else if (entry.kind === 'varying') {
            lines.push(`const ${varName} = varying(${defaultExpr});`);
        } else {
            lines.push(`const ${varName} = ${defaultExpr};`);
        }
    });
    return lines.join('\n');
}

/**
 * Get swizzle suffix for a source handle.
 * @param sourceHandle The handle ID on the source node
 * @param isSingleOutput Whether the source node returns a single value directly (true) or an object (false)
 */
function getSwizzleSuffix(sourceHandle: string | null | undefined, isSingleOutput: boolean = false): string {
    if (!sourceHandle || sourceHandle === 'out') {
        return '';
    }
    const swizzle = COMPONENT_SWIZZLES[sourceHandle];

    if (swizzle) {
        return `.${swizzle}`;
    }

    // If upstream node returns a single value directly, we don't append property access
    // unless it was a swizzle (handled above).
    // This handles subgraph instances that return a value (not an object) but have port IDs like 'out_0'.
    if (isSingleOutput) {
        return '';
    }

    // Otherwise assume property access
    return `.${sourceHandle}`;
}

function getCompiledNodeOutputExpression(
    compiledNode: CompiledNode | undefined,
    outputHandle: string | null | undefined
): string | null {
    if (!compiledNode) return null;
    return `${compiledNode.varName}${getSwizzleSuffix(outputHandle, compiledNode.singleOutput)}`;
}

function getUserDefinedNodeName(node: Node<TSLNodeData>): string | null {
    const rawName = node.data.localName || (node.data.values?.localName as string | undefined);
    if (typeof rawName !== 'string' || rawName.trim().length === 0) {
        return null;
    }
    return rawName;
}

function isTransparentExpressionNode(node: Node<TSLNodeData> | undefined): boolean {
    if (!node) return false;
    return node.data.type === 'math/split'
        || isLocalSetType(node.data.type)
        || isLocalGetType(node.data.type);
}

/**
 * Count the number of final expression consumers for each node. Pass-through
 * nodes (Split and local portals) do not count as consumers themselves, so a
 * value feeding a Split with three connected components is treated as having
 * three uses rather than one.
 */
function createEffectiveUseCounter(
    nodes: Node<TSLNodeData>[],
    edges: Edge[],
    additionalUses: Map<string, number> = new Map()
): (nodeId: string) => number {
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const outgoingEdges = new Map<string, Edge[]>();
    for (const edge of edges) {
        const outgoing = outgoingEdges.get(edge.source) ?? [];
        outgoing.push(edge);
        outgoingEdges.set(edge.source, outgoing);
    }

    const memo = new Map<string, number>();
    const countUses = (nodeId: string, active: Set<string>): number => {
        const cached = memo.get(nodeId);
        if (cached !== undefined) return cached;
        if (active.has(nodeId)) return 1;

        const nextActive = new Set(active);
        nextActive.add(nodeId);
        let count = additionalUses.get(nodeId) ?? 0;

        for (const edge of outgoingEdges.get(nodeId) ?? []) {
            const target = nodesById.get(edge.target);
            const isNamedSplit = target?.data.type === 'math/split'
                && getUserDefinedNodeName(target) !== null;
            if (target && isTransparentExpressionNode(target) && !isNamedSplit) {
                const downstreamUses = countUses(target.id, nextActive);
                // Preserve a dangling pass-through node as the terminal consumer.
                count += Math.max(downstreamUses, 1);
            } else {
                count += 1;
            }
        }

        memo.set(nodeId, count);
        return count;
    };

    return (nodeId: string) => countUses(nodeId, new Set());
}

function collectAssignmentTargetSources(
    nodes: Node<TSLNodeData>[],
    edges: Edge[]
): Set<string> {
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const incomingEdges = new Map<string, Edge[]>();
    for (const edge of edges) {
        const incoming = incomingEdges.get(edge.target) ?? [];
        incoming.push(edge);
        incomingEdges.set(edge.target, incoming);
    }

    const sources = new Set<string>();
    const markSource = (nodeId: string) => {
        if (sources.has(nodeId)) return;
        sources.add(nodeId);

        const node = nodesById.get(nodeId);
        if (!isTransparentExpressionNode(node)) return;
        for (const edge of incomingEdges.get(nodeId) ?? []) {
            markSource(edge.source);
        }
    };

    for (const edge of edges) {
        const target = nodesById.get(edge.target);
        if (target && ASSIGN_NODE_METHODS[target.data.type] && edge.targetHandle === 'target') {
            markSource(edge.source);
        }
    }

    return sources;
}

function shouldInlineNodeExpression(
    node: Node<TSLNodeData>,
    def: NodeDef | undefined,
    effectiveUseCount: number,
    mustPreserveIdentity = false
): boolean {
    if (getUserDefinedNodeName(node) || effectiveUseCount === 0 || mustPreserveIdentity) {
        return false;
    }

    // Split is a code-generation alias, not a value worth declaring.
    if (node.data.type === 'math/split') {
        return true;
    }

    // Exported TSL values/functions and literal constructors remain readable
    // when repeated and do not benefit from generated temporary variables.
    const isCheapExpression = def?.pure === true
        || (node.data.type.startsWith('const/') && node.data.type !== 'const/uniform');

    return isCheapExpression || effectiveUseCount === 1;
}

function asInlineExpression(code: string): string {
    return code.trimStart().startsWith('{') ? `(${code})` : code;
}

function getAssignTargetExpression(
    node: Node<TSLNodeData>,
    edges: Edge[],
    compiledNodes: Map<string, CompiledNode>,
    argsMap?: Record<string, string>,
    nodesById?: Map<string, Node<TSLNodeData>>
): string | null {
    const edge = edges.find(e => e.target === node.id && e.targetHandle === 'target');
    if (!edge) return null;

    if (edge.source === 'subgraph-input' && argsMap && edge.sourceHandle) {
        return argsMap[edge.sourceHandle] || null;
    }

    const isAssignableSource = (sourceNode?: Node<TSLNodeData>) => {
        if (!sourceNode) return false;
        return sourceNode.data.type === 'advanced/var'
            || sourceNode.data.type === 'advanced/varying'
            || sourceNode.data.type === 'loop/accumulator';
    };

    // Special case: assigning to split(Var).y should map back to Var.y
    if (nodesById && edge.sourceHandle) {
        const sourceNode = nodesById.get(edge.source);
        if (sourceNode?.data.type === 'math/split') {
            const splitInputEdge = edges.find(
                (e) => e.target === sourceNode.id && e.targetHandle === 'in'
            );
            if (splitInputEdge) {
                const upstreamNode = nodesById.get(splitInputEdge.source);
                const upstream = compiledNodes.get(splitInputEdge.source);
                const swizzle = COMPONENT_SWIZZLES[edge.sourceHandle];
                if (upstream && swizzle && isAssignableSource(upstreamNode)) {
                    return `${upstream.varName}.${swizzle}`;
                }
            }
        }
    }

    const upstream = compiledNodes.get(edge.source);
    if (!upstream) return null;

    const swizzle = getSwizzleSuffix(edge.sourceHandle, upstream.singleOutput);
    return `${upstream.varName}${swizzle}`;
}

/**
 * Get the TSL expression for a node's input value.
 * Handles swizzling when source handle is a component.
 */
function getInputValue(
    node: Node<TSLNodeData>,
    inputKey: string,
    edges: Edge[],
    compiledNodes: Map<string, CompiledNode>,
    inputDef: Pick<Port, 'type' | 'default'>,
    argsMap?: Record<string, string>
): string {
    const edge = edges.find(e => e.target === node.id && e.targetHandle === inputKey);

    if (edge) {
        // Special case for subgraph arguments
        if (edge.source === 'subgraph-input' && argsMap && edge.sourceHandle) {
            return argsMap[edge.sourceHandle] || 'float(0)';
        }

        const upstream = compiledNodes.get(edge.source);
        if (upstream) {
            const swizzle = getSwizzleSuffix(edge.sourceHandle, upstream.singleOutput);
            return `${upstream.varName}${swizzle}`;
        }
    }

    // Sensible fallback for post texture sampling nodes.
    if (node.data.type === 'texture/sampleNode' && inputKey === 'uv') {
        return 'screenUV';
    }

    const value = node.data.values?.[inputKey] ?? inputDef.default;
    const valueType = inputDef.type === 'any' && value !== undefined && value !== null
        ? inferLiteralTSLType(value)
        : inputDef.type;

    if (valueType === 'color') {
        const hex = String(value ?? '#ffffff');
        return `color("${hex}")`;
    }

    if (valueType === 'bool') {
        return value ? 'true' : 'false';
    }

    // Handle numeric array values (vectors)
    if (Array.isArray(value) && value.every((entry) => {
        return typeof entry === 'number' && Number.isFinite(entry);
    })) {
        const components = value.map(v => String(Number(v ?? 0)));
        if (components.length === 2) return `vec2(${components.join(', ')})`;
        if (components.length === 3) return `vec3(${components.join(', ')})`;
        if (components.length === 4) return `vec4(${components.join(', ')})`;
        // Fallback for unknown sizes
        return `vec${components.length}(${components.join(', ')})`;
    }

    const num = Number(value ?? 0);
    if (valueType === 'int' || valueType === 'uint') {
        return String(Math.round(num));
    }

    return String(num);
}

function getLinearGradientArgs(
    node: Node<TSLNodeData>,
    edges: Edge[],
    compiledNodes: Map<string, CompiledNode>,
    inputs: Record<string, Port>,
    argsMap?: Record<string, string>
): { tArg: string; modeArg: string; stopsLiteral: string } {
    const tInput = inputs['t'] ?? { label: 'T', type: 'float', default: 0 };
    const modeInput = inputs['mode'] ?? { label: 'Mode', type: 'float', default: 0 };
    const tEdge = edges.find((edge) => edge.target === node.id && edge.targetHandle === 't');
    const tArg = tEdge
        ? getInputValue(node, 't', edges, compiledNodes, tInput, argsMap)
        : 'float(0)';
    const modeArg = getInputValue(node, 'mode', edges, compiledNodes, modeInput, argsMap);
    const stops = normalizeGradientStops(node.data.values?.stops);
    const stopsLiteral = `[${stops.map((stop) => `{ color: color("${stop.color}"), pos: ${stop.pos} }`).join(', ')}]`;

    return { tArg, modeArg, stopsLiteral };
}

function getPostConvenienceExpression(
    type: string,
    argsMap?: Record<string, string>
): string | null {
    switch (type) {
        case 'post/sceneColor':
            return argsMap?.['in_color'] ?? 'vec4(0, 0, 0, 1)';
        case 'post/sceneDepth':
            return argsMap?.['in_depth'] ?? 'float(0)';
        case 'post/sceneNormal':
            return argsMap?.['in_normal'] ?? 'vec3(0, 0, 1)';
        default:
            return null;
    }
}

function getMultiOpOperations(node: Node<TSLNodeData>): MultiOp[] {
    const ops = node.data.operations;
    return Array.isArray(ops) ? (ops as MultiOp[]) : [];
}

function compileMultiOpChain(
    node: Node<TSLNodeData>,
    edges: Edge[],
    compiledNodes: Map<string, CompiledNode>,
    argsMap?: Record<string, string>
): string {
    const ops = getMultiOpOperations(node);
    if (ops.length === 0) {
        return 'float(0)';
    }

    let expression = '';

    ops.forEach((op, index) => {
        const params = getMultiOpParams(op.op, index === 0);
        const args = params.map((param) => {
            const handleId = getMultiOpHandleId(op.id, param.key);
            return getInputValue(node, handleId, edges, compiledNodes, { type: param.type, default: param.default }, argsMap);
        });

        if (index === 0) {
            expression = `${op.op}(${args.join(', ')})`;
            return;
        }

        if (args.length === 0) {
            expression = `${expression}.${op.op}()`;
        } else {
            expression = `${expression}.${op.op}(${args.join(', ')})`;
        }
    });

    return expression;
}

/**
 * Get the string value for an input, evaluating node values or defaults.
 * Handles AssetValue objects by extracting the url property.
 */
function getStringValue(
    node: Node<TSLNodeData>,
    inputKey: string,
    inputDef: Pick<Port, 'default'>
): string {
    const value = node.data.values?.[inputKey] ?? inputDef.default;

    // Handle AssetValue objects (e.g., {url: "...", assetId: "..."})
    if (value && typeof value === 'object' && 'url' in value) {
        return String((value as { url: string }).url ?? '');
    }

    return String(value ?? '');
}

function emitTextureSampleNode(
    node: Node<TSLNodeData>,
    def: NodeDef,
    inputs: Record<string, Port>,
    edges: Edge[],
    compiledNodes: Map<string, CompiledNode>,
    targetLines: string[],
    texVarBaseName: string,
    argsMap?: Record<string, string>,
    indent = ''
): string {
    const url = getStringValue(node, 'url', inputs['url']);
    const texVarName = `${texVarBaseName}_tex`;
    targetLines.push(`${indent}const ${texVarName} = new THREE.TextureLoader().load("${url}");`);

    const texturePropKeys = new Set<string>(TEXTURE_PROP_INPUTS);
    const activeInputs = getMaterialActiveInputsSet(node.data, def);
    const isPropActive = (key: string) => !texturePropKeys.has(key) || activeInputs.has(key);

    if (isPropActive('colorSpace')) {
        const colorSpace = node.data.values?.['colorSpace'] ?? inputs['colorSpace']?.default ?? 'SRGBColorSpace';
        targetLines.push(`${indent}${texVarName}.colorSpace = THREE.${colorSpace};`);
    }

    if (isPropActive('wrapS')) {
        const wrapS = node.data.values?.['wrapS'] ?? inputs['wrapS']?.default ?? 'RepeatWrapping';
        targetLines.push(`${indent}${texVarName}.wrapS = THREE.${wrapS};`);
    }

    if (isPropActive('wrapT')) {
        const wrapT = node.data.values?.['wrapT'] ?? inputs['wrapT']?.default ?? 'RepeatWrapping';
        targetLines.push(`${indent}${texVarName}.wrapT = THREE.${wrapT};`);
    }

    if (isPropActive('minFilter')) {
        const minFilter = node.data.values?.['minFilter'] ?? inputs['minFilter']?.default ?? 'LinearMipmapLinearFilter';
        targetLines.push(`${indent}${texVarName}.minFilter = THREE.${minFilter};`);
    }

    if (isPropActive('magFilter')) {
        const magFilter = node.data.values?.['magFilter'] ?? inputs['magFilter']?.default ?? 'LinearFilter';
        targetLines.push(`${indent}${texVarName}.magFilter = THREE.${magFilter};`);
    }

    if (isPropActive('flipY')) {
        const flipY = node.data.values?.['flipY'] ?? inputs['flipY']?.default ?? true;
        targetLines.push(`${indent}${texVarName}.flipY = ${flipY ? 'true' : 'false'};`);
    }

    const uvInput = inputs['uv'];
    const uvEdge = edges.find(e => e.target === node.id && e.targetHandle === 'uv');

    let uvCode = '';
    if (uvEdge) {
        const uvVar = getInputValue(node, 'uv', edges, compiledNodes, uvInput, argsMap);
        uvCode = `, ${uvVar}`;
    }

    return `texture(${texVarName}${uvCode})`;
}

/**
 * Emit a node whose TSL function takes a single params object (e.g. tsl-textures).
 * Unconnected connectionOnly inputs are omitted so library defaults apply.
 * With def.outputMembers, emits an object literal mapping output handles to the
 * primary call (member null) and member calls (e.g. rotator.normal), reusing a
 * shared params const when more than one call is emitted.
 */
function emitParamsObjectNode(
    node: Node<TSLNodeData>,
    def: NodeDef,
    inputs: Record<string, Port>,
    edges: Edge[],
    compiledNodes: Map<string, CompiledNode>,
    targetLines: string[],
    varBaseName: string,
    argsMap?: Record<string, string>,
    indent = ''
): string {
    const entries: string[] = [];
    for (const key of Object.keys(inputs)) {
        const port = inputs[key];
        const connected = edges.some(e => e.target === node.id && e.targetHandle === key);
        if (port.connectionOnly && !connected) continue;
        entries.push(`${key}: ${getInputValue(node, key, edges, compiledNodes, port, argsMap)}`);
    }
    const paramsLiteral = entries.length > 0 ? `{ ${entries.join(', ')} }` : '{}';

    const members = def.outputMembers;
    if (!members) {
        return `${def.tsl}(${paramsLiteral})`;
    }

    const connectedHandles = new Set(
        edges.filter(e => e.source === node.id).map(e => e.sourceHandle ?? 'out')
    );
    const memberEntries = Object.entries(members);
    const activeEntries = memberEntries.filter(([handle, member]) =>
        connectedHandles.has(handle) || (member === null && connectedHandles.size === 0)
    );
    if (activeEntries.length === 0) {
        activeEntries.push(...memberEntries.filter(([, member]) => member === null));
    }

    let paramsExpr = paramsLiteral;
    if (activeEntries.length > 1) {
        const paramsVarName = `${varBaseName}_params`;
        targetLines.push(`${indent}const ${paramsVarName} = ${paramsLiteral};`);
        paramsExpr = paramsVarName;
    }

    const outputEntries = activeEntries.map(([handle, member]) => {
        const callee = member === null ? def.tsl : `${def.tsl}.${member}`;
        return `${handle}: ${callee}(${paramsExpr})`;
    });
    return `{ ${outputEntries.join(', ')} }`;
}

/**
 * Get the connected variable name for a material input.
 * Handles swizzling.
 */
function getMaterialInputVar(
    materialNode: Node<TSLNodeData>,
    inputKey: string,
    edges: Edge[],
    compiledNodes: Map<string, CompiledNode>
): string | null {
    const edge = edges.find(e => e.target === materialNode.id && e.targetHandle === inputKey);
    if (edge) {
        const upstream = compiledNodes.get(edge.source);
        if (upstream) {
            const swizzle = getSwizzleSuffix(edge.sourceHandle, upstream.singleOutput);
            return `${upstream.varName}${swizzle}`;
        }
    }
    return null;
}

/**
 * Compile a subgraph definition into a TSL Fn string.
 */
function compileSubgraphDefinition(
    subgraph: SubgraphDefinition,
    functionName: string,
    usedSubgraphs: Map<string, string>,
    subgraphsMap?: Record<string, SubgraphDefinition>,
    usedCodeNodes?: Map<string, string>,
    codeNodesMap?: Record<string, CodeNodeDefinition>,
    globalVarMap?: Map<string, string>,
    globalReservedNames?: Set<string>,
    options: CompileOptions = {},
    allowUniformNodes = false
): string[] {
    const uniformNodes = subgraph.nodes.filter((node) => node.data.type === 'const/uniform');
    if (uniformNodes.length > 0 && !allowUniformNodes) {
        throw new Error('Uniform nodes are not supported inside subgraphs yet.');
    }

    const lines: string[] = [];
    const internalNodes = subgraph.nodes;
    // We saved edges including those to anchor nodes in store/editor.ts
    const internalEdges = withLocalDependencyEdges(internalNodes, subgraph.edges);
    const nodesById = new Map(internalNodes.map((node) => [node.id, node]));
    const getEffectiveUseCount = createEffectiveUseCounter(internalNodes, internalEdges);
    const assignmentTargetSources = collectAssignmentTargetSources(internalNodes, internalEdges);

    const isLoopGroupNode = (node: Node<TSLNodeData>) => node.type === 'loop' || node.data.type === 'loop';
    const loopGroupIds = new Set(internalNodes.filter(isLoopGroupNode).map((node) => node.id));
    const isLoopInternalNode = (node: Node<TSLNodeData>) => !!node.parentId && loopGroupIds.has(node.parentId);
    const getLoopParentId = (node: Node<TSLNodeData>): string | null => {
        if (isLoopGroupNode(node)) return node.id;
        let parentId = node.parentId;
        while (parentId) {
            const parent = nodesById.get(parentId);
            if (!parent) break;
            if (isLoopGroupNode(parent)) return parent.id;
            parentId = parent.parentId;
        }
        return null;
    };

    const loopAwareEdges: Edge[] = [];
    for (const edge of internalEdges) {
        const sourceNode = nodesById.get(edge.source);
        const targetNode = nodesById.get(edge.target);
        const sourceLoopId = sourceNode ? getLoopParentId(sourceNode) : null;
        const targetLoopId = targetNode ? getLoopParentId(targetNode) : null;

        if (sourceLoopId && targetLoopId) {
            if (sourceLoopId === targetLoopId) {
                continue; // internal to same loop - handled inside loop
            }
            // Cross-loop connections are disallowed; skip for ordering
            continue;
        }

        if (sourceLoopId && !targetLoopId) {
            loopAwareEdges.push({ ...edge, source: sourceLoopId });
            continue;
        }

        if (!sourceLoopId && targetLoopId) {
            loopAwareEdges.push({ ...edge, target: targetLoopId });
            continue;
        }

        loopAwareEdges.push(edge);
    }

    // Map inputs to argument names
    // input.id maps to the sourceHandle of edges coming from 'subgraph-input'
    const argsMap: Record<string, string> = {};
    const argNames = subgraph.inputs.map((input) => {
        const argName = `arg_${input.id}`;
        argsMap[input.id] = argName;
        return argName;
    });

    const compiledNodes = new Map<string, CompiledNode>();
    const usedNames = new Set<string>([
        ...(globalReservedNames ?? []),
        ...usedSubgraphs.values(),
        ...(usedCodeNodes?.values() ?? []),
        functionName,
    ]);
    let nodeIndex = 0;

    // Post graphs compile through the subgraph path, but their uniforms must live
    // outside the generated Fn. Hoisting keeps one stable TSL uniform object that
    // the function captures instead of constructing one whenever the Fn is built.
    for (const node of uniformNodes) {
        const localName = node.data.localName || (node.data.values?.localName as string | undefined);
        const baseName = localName
            ? String(localName).replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&')
            : `_subgraph_node${nodeIndex}`;

        let displayName = baseName;
        let suffix = 1;
        while (usedNames.has(displayName)) {
            displayName = `${baseName}_${suffix++}`;
        }
        usedNames.add(displayName);
        nodeIndex++;

        const kind = getUniformKindFromNode(node);
        const valueExpr = formatUniformValueExpression(kind, node.data.values?.value);
        const uniformExpression = options.uniformMode === 'runtime'
            ? `__uniform("${node.id}", ${valueExpr}, "${kind}")`
            : `uniform(${valueExpr})`;

        lines.push(`const ${displayName} = ${uniformExpression};`);
        compiledNodes.set(node.id, {
            id: node.id,
            varName: displayName,
            code: `/* uniform ${kind} */`,
            singleOutput: true,
        });
    }
    if (uniformNodes.length > 0) {
        lines.push('');
    }

    lines.push(`const ${functionName} = Fn(([${argNames.join(', ')}]) => {`);

    // Prepare for internal graph compilation
    // Filter out anchor nodes for topological sort
    const nodesToSort = internalNodes.filter(
        n => n.id !== 'subgraph-input'
            && n.id !== 'subgraph-output'
            && !isLoopInternalNode(n)
            && n.data.type !== COMMENT_NODE_TYPE
            && n.data.type !== 'const/uniform'
    );
    const sorted = topologicalSort(nodesToSort, loopAwareEdges);

    const compileSubgraphNode = (node: Node<TSLNodeData>, targetLines: string[], indent: string = '    ') => {
        if (node.data.type === COMMENT_NODE_TYPE) {
            return;
        }

        // Handle Subgraph Instance inside Subgraph
        if (node.data.type.startsWith('custom/')) {
            const funcName = usedSubgraphs.get(node.data.type);
            const nestedSubgraph = subgraphsMap?.[node.data.type];

            if (funcName && nestedSubgraph) {
                // Generate unique name for this instance output
                const localName = node.data.localName || (node.data.values?.localName as string | undefined);
                const baseName = localName
                    ? String(localName).replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&')
                    : `_subgraph_node${nodeIndex}`;

                let displayName = baseName;
                let suffix = 1;
                while (usedNames.has(displayName)) {
                    displayName = `${baseName}_${suffix++}`;
                }
                usedNames.add(displayName);
                nodeIndex++;

                // Collect arguments
                const args: string[] = [];
                for (const inputPort of nestedSubgraph.inputs) {
                    // Check for connection from internal edges or argsMap
                    const edge = internalEdges.find(e => e.target === node.id && e.targetHandle === inputPort.id);
                    if (edge) {
                        if (edge.source === 'subgraph-input' && argsMap && edge.sourceHandle) {
                            args.push(argsMap[edge.sourceHandle] || 'float(0)');
                        } else {
                            const upstream = compiledNodes.get(edge.source);
                            if (upstream) {
                                const swizzle = getSwizzleSuffix(edge.sourceHandle, upstream.singleOutput);
                                args.push(`${upstream.varName}${swizzle}`);
                            } else {
                                args.push('float(0)');
                            }
                        }
                    } else {
                        args.push('float(0)');
                    }
                }

                targetLines.push(`${indent}const ${displayName} = ${funcName}(${args.join(', ')});`);

                const isSingleOutput = nestedSubgraph.outputs.length === 1;

                compiledNodes.set(node.id, {
                    id: node.id,
                    varName: displayName,
                    code: `/* ${funcName} call */`,
                    singleOutput: isSingleOutput
                });
                return;
            }
        }

        // Handle Code Node Instance inside Subgraph
        if (node.data.type.startsWith('code/')) {
            const funcName = usedCodeNodes?.get(node.data.type);
            const codeNode = codeNodesMap?.[node.data.type];

            if (funcName && codeNode) {
                // Generate unique name for this instance output
                const localName = node.data.localName || (node.data.values?.localName as string | undefined);
                const baseName = localName
                    ? String(localName).replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&')
                    : `_code_node${nodeIndex}`;

                let displayName = baseName;
                let suffix = 1;
                while (usedNames.has(displayName)) {
                    displayName = `${baseName}_${suffix++}`;
                }
                usedNames.add(displayName);
                nodeIndex++;

                // Collect arguments based on code node inputs
                const args: string[] = [];
                const argEntries: Array<{ name: string; value: string }> = [];
                for (const inputPort of codeNode.inputs) {
                    const edge = internalEdges.find(e => e.target === node.id && e.targetHandle === inputPort.id);
                    if (edge) {
                        if (edge.source === 'subgraph-input' && argsMap && edge.sourceHandle) {
                            const value = argsMap[edge.sourceHandle] || getTSLDefaultForType(inputPort.type);
                            args.push(value);
                            argEntries.push({ name: inputPort.label, value });
                        } else {
                            const upstream = compiledNodes.get(edge.source);
                            if (upstream) {
                                const swizzle = getSwizzleSuffix(edge.sourceHandle, upstream.singleOutput);
                                const value = `${upstream.varName}${swizzle}`;
                                args.push(value);
                                argEntries.push({ name: inputPort.label, value });
                            } else {
                                const value = getTSLDefaultForType(inputPort.type);
                                args.push(value);
                                argEntries.push({ name: inputPort.label, value });
                            }
                        }
                    } else {
                        // Not connected - use node value if available, otherwise type default
                        const nodeValue = node.data.values?.[inputPort.id];
                        const value = getTSLDefaultForType(inputPort.type, nodeValue);
                        args.push(value);
                        argEntries.push({ name: inputPort.label, value });
                    }
                }

                if ((codeNode.language ?? 'tsl') === 'wgsl') {
                    const argsObject = `{ ${argEntries.map(arg => `${arg.name}: ${arg.value}`).join(', ')} }`;
                    targetLines.push(`${indent}const ${displayName} = ${funcName}(${argsObject});`);
                } else {
                    targetLines.push(`${indent}const ${displayName} = ${funcName}(${args.join(', ')});`);
                }

                // Code nodes always have single output
                compiledNodes.set(node.id, {
                    id: node.id,
                    varName: displayName,
                    code: `/* ${funcName} call */`,
                    singleOutput: true
                });
                return;
            }
        }

        if (node.data.type === 'global/ref') {
            const globalId = node.data.values?.globalId as string | undefined;
            const globalVar = globalId ? globalVarMap?.get(globalId) : undefined;

            if (globalVar) {
                compiledNodes.set(node.id, {
                    id: node.id,
                    varName: globalVar,
                    code: '/* global */',
                    singleOutput: true,
                });
            } else {
                const baseName = `_subgraph_node${nodeIndex}`;
                let displayName = baseName;
                let suffix = 1;
                while (usedNames.has(displayName)) {
                    displayName = `${baseName}_${suffix++}`;
                }
                usedNames.add(displayName);
                nodeIndex++;

                const fallback = getTSLDefaultForType('any');
                targetLines.push(`${indent}const ${displayName} = ${fallback};`);
                compiledNodes.set(node.id, {
                    id: node.id,
                    varName: displayName,
                    code: fallback,
                    singleOutput: true,
                });
            }
            return;
        }

        if (isLocalSetType(node.data.type)) {
            const setName = getLocalName(node) || node.id;
            const valueEdge = internalEdges.find((edge) => edge.target === node.id && edge.targetHandle === 'value');
            if (!valueEdge) {
                throw new Error(`Set Local "${setName}" is missing its source connection.`);
            }

            if (valueEdge.source === 'subgraph-input' && argsMap && valueEdge.sourceHandle) {
                const argExpr = argsMap[valueEdge.sourceHandle];
                if (!argExpr) {
                    throw new Error(`Set Local "${setName}" references an unknown subgraph input "${valueEdge.sourceHandle}".`);
                }
                compiledNodes.set(node.id, {
                    id: node.id,
                    varName: argExpr,
                    code: '/* local set */',
                    singleOutput: true,
                });
                return;
            }

            const upstream = compiledNodes.get(valueEdge.source);
            if (!upstream) {
                throw new Error(`Set Local "${setName}" source node "${valueEdge.source}" is not compiled.`);
            }

            const swizzle = getSwizzleSuffix(valueEdge.sourceHandle, upstream.singleOutput);
            compiledNodes.set(node.id, {
                id: node.id,
                varName: `${upstream.varName}${swizzle}`,
                code: '/* local set */',
                singleOutput: true,
            });
            return;
        }

        if (isLocalGetType(node.data.type)) {
            const sourceId = getLocalSourceId(node);
            if (!sourceId) {
                throw new Error(`Get Local "${node.id}" is missing localSourceId.`);
            }

            const setNode = nodesById.get(sourceId);
            if (!setNode || !isLocalSetNode(setNode)) {
                throw new Error(`Get Local "${node.id}" references missing Set Local "${sourceId}".`);
            }

            if (!isLocalScopeAccessible(setNode, node, nodesById)) {
                throw new Error(`Get Local "${node.id}" cannot access Set Local "${sourceId}" due to loop scope.`);
            }

            const setCompiled = compiledNodes.get(sourceId);
            if (!setCompiled) {
                throw new Error(`Get Local "${node.id}" references Set Local "${sourceId}" before it is available.`);
            }

            compiledNodes.set(node.id, {
                id: node.id,
                varName: setCompiled.varName,
                code: '/* local get */',
                singleOutput: true,
            });
            return;
        }

        if (node.data.type === 'math/multiOp') {
            const localName = node.data.localName || (node.data.values?.localName as string | undefined);
            const baseName = localName
                ? String(localName).replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&')
                : `_subgraph_node${nodeIndex}`;

            let displayName = baseName;
            let suffix = 1;
            while (usedNames.has(displayName)) {
                displayName = `${baseName}_${suffix++}`;
            }
            usedNames.add(displayName);
            nodeIndex++;

            const code = compileMultiOpChain(node, internalEdges, compiledNodes, argsMap);
            const shouldInline = shouldInlineNodeExpression(
                node,
                registry.get(node.data.type),
                getEffectiveUseCount(node.id),
                assignmentTargetSources.has(node.id)
            );
            if (!shouldInline) {
                targetLines.push(`${indent}const ${displayName} = ${code};`);
            }

            compiledNodes.set(node.id, {
                id: node.id,
                varName: shouldInline ? asInlineExpression(code) : displayName,
                code,
                singleOutput: true,
            });
            return;
        }

        const assignMethod = ASSIGN_NODE_METHODS[node.data.type];
        if (assignMethod) {
            const targetExpr = getAssignTargetExpression(node, internalEdges, compiledNodes, argsMap, nodesById);
            const valueExpr = getInputValue(node, 'value', internalEdges, compiledNodes, { type: 'any', default: 0 }, argsMap);

            if (targetExpr) {
                targetLines.push(`${indent}${targetExpr}.${assignMethod}(${valueExpr});`);
                compiledNodes.set(node.id, {
                    id: node.id,
                    varName: targetExpr,
                    code: `/* ${assignMethod} */`,
                    singleOutput: true,
                });
            } else {
                const localName = node.data.localName || (node.data.values?.localName as string | undefined);
                const baseName = localName
                    ? String(localName).replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&')
                    : `_subgraph_node${nodeIndex}`;

                let displayName = baseName;
                let suffix = 1;
                while (usedNames.has(displayName)) {
                    displayName = `${baseName}_${suffix++}`;
                }
                usedNames.add(displayName);
                nodeIndex++;

                targetLines.push(`${indent}const ${displayName} = ${valueExpr};`);
                compiledNodes.set(node.id, {
                    id: node.id,
                    varName: displayName,
                    code: valueExpr,
                    singleOutput: true,
                });
            }
            return;
        }

        const def = registry.get(node.data.type);
        if (!def) {
            // Skip if strictly unknown, but custom/ handled above
            return;
        }

        // Ensure unique name
        const localName = node.data.localName || (node.data.values?.localName as string | undefined);
        const baseName = localName
            ? String(localName).replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&')
            : `_subgraph_node${nodeIndex}`;

        let displayName = baseName;
        let suffix = 1;
        while (usedNames.has(displayName)) {
            displayName = `${baseName}_${suffix++}`;
        }
        usedNames.add(displayName);
        nodeIndex++;

        const inputs = def.inputs ?? {};
        const inputKeys = Object.keys(inputs);
        let code: string;

        const postConvenienceCode = getPostConvenienceExpression(def.type, argsMap);
        if (postConvenienceCode) {
            code = postConvenienceCode;
        } else if (def.type === 'geo/camera') {
            code = options.runtimeCameraFromScope
                ? 'vec2(camera.near, camera.far)'
                : 'vec2(cameraNear, cameraFar)';
        } else if (def.pure && inputKeys.length === 0) {
            code = def.callable ? `${def.tsl}()` : def.tsl;
        } else if (def.type === 'const/color') {
            const hex = getStringValue(node, 'value', inputs['value']);
            code = `color("${hex}")`;
        } else if (def.type === 'utils/linearGradient') {
            const { tArg, modeArg, stopsLiteral } = getLinearGradientArgs(node, internalEdges, compiledNodes, inputs, argsMap);
            code = `linearGradient(${tArg}, ${modeArg}, ${stopsLiteral})`;
        } else if (def.type === 'math/split') {
            code = getInputValue(node, 'in', internalEdges, compiledNodes, inputs['in'], argsMap);
        } else if (def.type === 'advanced/perspectiveDepthToViewZ') {
            const depthArg = getInputValue(node, 'depth', internalEdges, compiledNodes, inputs['depth'], argsMap);
            const nearRaw = getInputValue(node, 'near', internalEdges, compiledNodes, inputs['near'], argsMap);
            const farRaw = getInputValue(node, 'far', internalEdges, compiledNodes, inputs['far'], argsMap);
            const nearConnected = internalEdges.some((e) => e.target === node.id && e.targetHandle === 'near');
            const farConnected = internalEdges.some((e) => e.target === node.id && e.targetHandle === 'far');
            const nearArg = nearConnected ? nearRaw : `float(${nearRaw})`;
            const farArg = farConnected ? farRaw : `float(${farRaw})`;
            code = `${def.tsl}(${depthArg}, ${nearArg}, ${farArg})`;
        } else if (def.type === 'advanced/viewZToOrthographicDepth') {
            const viewZArg = getInputValue(node, 'viewZ', internalEdges, compiledNodes, inputs['viewZ'], argsMap);
            const nearRaw = getInputValue(node, 'near', internalEdges, compiledNodes, inputs['near'], argsMap);
            const farRaw = getInputValue(node, 'far', internalEdges, compiledNodes, inputs['far'], argsMap);
            const nearConnected = internalEdges.some((e) => e.target === node.id && e.targetHandle === 'near');
            const farConnected = internalEdges.some((e) => e.target === node.id && e.targetHandle === 'far');
            const nearArg = nearConnected ? nearRaw : `float(${nearRaw})`;
            const farArg = farConnected ? farRaw : `float(${farRaw})`;
            code = `${def.tsl}(${viewZArg}, ${nearArg}, ${farArg})`;
        } else if (def.type === 'texture/sample') {
            code = emitTextureSampleNode(
                node,
                def,
                inputs,
                internalEdges,
                compiledNodes,
                targetLines,
                displayName,
                argsMap,
                indent
            );
        } else if (def.paramsObject) {
            code = emitParamsObjectNode(
                node,
                def,
                inputs,
                internalEdges,
                compiledNodes,
                targetLines,
                displayName,
                argsMap,
                indent
            );
        } else if (inputKeys.length === 0) {
            code = `${def.tsl}()`;
        } else {
            const args = inputKeys.map(key =>
                getInputValue(node, key, internalEdges, compiledNodes, inputs[key], argsMap)
            );
            code = `${def.tsl}(${args.join(', ')})`;
        }

        const shouldInline = shouldInlineNodeExpression(
            node,
            def,
            getEffectiveUseCount(node.id),
            assignmentTargetSources.has(node.id)
        );
        if (!shouldInline) {
            targetLines.push(`${indent}const ${displayName} = ${code};`);
        }

        compiledNodes.set(node.id, {
            id: node.id,
            varName: shouldInline ? asInlineExpression(code) : displayName,
            code,
        });
    };

    const compileLoopGroup = (loopNode: Node<TSLNodeData>, targetLines: string[], indent: string = '    ') => {
        const loopId = loopNode.id;
        const loopInternalNodes = internalNodes.filter(n => n.parentId === loopId);

        const countNode = loopInternalNodes.find(n => n.data.type === 'loop/count');
        const count2Node = loopInternalNodes.find(n => n.data.type === 'loop/count2');
        const startNode = loopInternalNodes.find(n => n.data.type === 'loop/start');
        const endNode = loopInternalNodes.find(n => n.data.type === 'loop/end');
        const indexNode = loopInternalNodes.find(n => n.data.type === 'loop/index');
        const index2Node = loopInternalNodes.find(n => n.data.type === 'loop/index2');
        const accNode = loopInternalNodes.find(n => n.data.type === 'loop/accumulator');
        const conditionNode = loopInternalNodes.find(n => n.data.type === 'loop/condition');
        const outputNode = loopInternalNodes.find(n => n.data.type === 'loop/output');

        const reserveName = (base: string) => {
            let name = base;
            let suffix = 1;
            while (usedNames.has(name)) {
                name = `${base}_${suffix++}`;
            }
            usedNames.add(name);
            return name;
        };

        const localName = loopNode.data.localName || (loopNode.data.values?.localName as string | undefined);
        const baseName = localName
            ? String(localName).replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&')
            : `_loop${nodeIndex}`;

        const loopVarName = reserveName(baseName);
        nodeIndex++;

        const countVarName = reserveName(`${loopVarName}_count`);
        const count2VarName = reserveName(`${loopVarName}_count2`);
        const loopFnName = reserveName(`${loopVarName}_fn`);
        const accVarName = reserveName(`${loopVarName}_acc`);

        const loopModeRaw = String(loopNode.data.values?.loopMode ?? 'count');
        const loopMode = ['count', 'range', 'reverse', 'nested', 'condition'].includes(loopModeRaw)
            ? loopModeRaw
            : 'count';
        const loopTypeRaw = String(loopNode.data.values?.loopType ?? 'int');
        const loopType = loopTypeRaw === 'float' ? 'float' : 'int';
        const compareOptions = ['<', '<=', '>', '>='];
        const compareRaw = String(loopNode.data.values?.loopCompare ?? (loopMode === 'reverse' ? '>' : '<'));
        const loopCompare = compareOptions.includes(compareRaw) ? compareRaw : (loopMode === 'reverse' ? '>' : '<');

        const countExpr = countNode
            ? getInputValue(countNode, 'count', internalEdges, compiledNodes, { type: 'int', default: 1 }, argsMap)
            : '1';

        const count2Expr = count2Node
            ? getInputValue(count2Node, 'count', internalEdges, compiledNodes, { type: 'int', default: 1 }, argsMap)
            : '1';

        const startExpr = startNode
            ? getInputValue(startNode, 'start', internalEdges, compiledNodes, { type: 'float', default: 0 }, argsMap)
            : '0';

        const endExpr = endNode
            ? getInputValue(endNode, 'end', internalEdges, compiledNodes, { type: 'float', default: 1 }, argsMap)
            : '1';

        const conditionExpr = conditionNode
            ? getInputValue(conditionNode, 'cond', internalEdges, compiledNodes, { type: 'bool', default: false }, argsMap)
            : 'false';

        if (loopMode === 'count' || loopMode === 'nested') {
            targetLines.push(`${indent}const ${countVarName} = max(int(${countExpr}), 0);`);
        }
        if (loopMode === 'nested') {
            targetLines.push(`${indent}const ${count2VarName} = max(int(${count2Expr}), 0);`);
        }

        let seedExpr = getTSLDefaultForType('any');
        if (accNode) {
            const seedEdge = internalEdges.find(e => e.target === accNode.id && e.targetHandle === 'seed');
            const seedValue = accNode.data.values?.['seed'];
            if (seedEdge || seedValue !== undefined) {
                seedExpr = getInputValue(accNode, 'seed', internalEdges, compiledNodes, { type: 'any', default: 0 }, argsMap);
            }
        }

        targetLines.push(`${indent}const ${loopFnName} = Fn(() => {`);
        targetLines.push(`${indent}    const ${accVarName} = Var(${seedExpr});`);
        if (loopMode === 'nested') {
            targetLines.push(`${indent}    Loop(${countVarName}, ${count2VarName}, ({ i, j }) => {`);
        } else if (loopMode === 'range') {
            targetLines.push(`${indent}    Loop({ start: ${startExpr}, end: ${endExpr}, type: '${loopType}', condition: '${loopCompare}', name: 'i' }, ({ i }) => {`);
        } else if (loopMode === 'reverse') {
            targetLines.push(`${indent}    Loop({ start: ${startExpr}, type: '${loopType}', condition: '${loopCompare}', name: 'i' }, ({ i }) => {`);
        } else if (loopMode === 'condition') {
            targetLines.push(`${indent}    Loop(${conditionExpr}, () => {`);
        } else {
            targetLines.push(`${indent}    Loop(${countVarName}, ({ i }) => {`);
        }

        if (countNode) {
            compiledNodes.set(countNode.id, { id: countNode.id, varName: countVarName, code: countVarName, singleOutput: true });
        }
        if (count2Node) {
            compiledNodes.set(count2Node.id, { id: count2Node.id, varName: count2VarName, code: count2VarName, singleOutput: true });
        }
        if (startNode) {
            compiledNodes.set(startNode.id, { id: startNode.id, varName: startExpr, code: startExpr, singleOutput: true });
        }
        if (endNode) {
            compiledNodes.set(endNode.id, { id: endNode.id, varName: endExpr, code: endExpr, singleOutput: true });
        }
        if (indexNode) {
            compiledNodes.set(indexNode.id, { id: indexNode.id, varName: 'i', code: 'i', singleOutput: true });
        }
        if (index2Node) {
            compiledNodes.set(index2Node.id, { id: index2Node.id, varName: 'j', code: 'j', singleOutput: true });
        }
        if (accNode) {
            compiledNodes.set(accNode.id, { id: accNode.id, varName: accVarName, code: accVarName, singleOutput: true });
        }
        if (conditionNode) {
            compiledNodes.set(conditionNode.id, { id: conditionNode.id, varName: conditionExpr, code: conditionExpr, singleOutput: true });
        }
        if (outputNode) {
            compiledNodes.set(outputNode.id, { id: outputNode.id, varName: loopVarName, code: loopVarName, singleOutput: true });
        }

        const bodyNodes = loopInternalNodes.filter(n => !LOOP_INTERNAL_NODE_TYPES.has(n.data.type));
        const bodySorted = topologicalSort(bodyNodes, internalEdges);
        const innerLines: string[] = [];

        for (const nodeId of bodySorted) {
            const node = nodesById.get(nodeId);
            if (!node) continue;
            compileSubgraphNode(node, innerLines, '');
        }

        if (outputNode) {
            const outputEdge = internalEdges.find(e => e.target === outputNode.id && e.targetHandle === 'next');
            if (outputEdge) {
                const nextExpr = getInputValue(outputNode, 'next', internalEdges, compiledNodes, { type: 'any', default: 0 }, argsMap);
                innerLines.push(`${accVarName}.assign(${nextExpr});`);
            }
        }

        for (const line of innerLines) {
            targetLines.push(`${indent}    ${line}`);
        }

        targetLines.push(`${indent}    });`);
        targetLines.push(`${indent}    return ${accVarName};`);
        targetLines.push(`${indent}});`);
        targetLines.push(`${indent}const ${loopVarName} = ${loopFnName}();`);

        compiledNodes.set(loopNode.id, {
            id: loopNode.id,
            varName: loopVarName,
            code: `/* loop */`,
            singleOutput: true,
        });
    };

    for (const nodeId of sorted) {
        const node = nodesById.get(nodeId);
        if (!node) continue;

        if (isLoopGroupNode(node)) {
            compileLoopGroup(node, lines);
            continue;
        }

        compileSubgraphNode(node, lines);
    }

    // Determine return value from connection to 'subgraph-output'
    // Note: Subgraphs are restricted to a single output
    if (subgraph.outputs.length > 0) {
        const outputPort = subgraph.outputs[0];
        const edge = internalEdges.find(e => e.target === 'subgraph-output' && e.targetHandle === outputPort.id);
        if (edge) {
            if (edge.source === 'subgraph-input' && argsMap && edge.sourceHandle) {
                lines.push(`    return ${argsMap[edge.sourceHandle] || 'float(0)'};`);
            } else {
                const upstream = compiledNodes.get(edge.source);
                if (upstream) {
                    const swizzle = getSwizzleSuffix(edge.sourceHandle, upstream.singleOutput);
                    lines.push(`    return ${upstream.varName}${swizzle};`);
                } else {
                    lines.push(`    return float(0);`);
                }
            }
        } else {
            lines.push(`    return float(0);`);
        }
    } else {
        lines.push(`    return float(0);`);
    }

    lines.push(`});`);
    return lines;
}

/**
 * recursively collect used subgraphs
 */
function collectSubgraphDependencies(
    nodes: Node<TSLNodeData>[],
    subgraphs: Record<string, SubgraphDefinition>,
    usedSubgraphs: Map<string, string>
) {
    for (const node of nodes) {
        if (node.data.type.startsWith('custom/')) {
            const subgraphId = node.data.type;
            if (subgraphs[subgraphId] && !usedSubgraphs.has(subgraphId)) {
                // Sanitize name
                const rawName = subgraphs[subgraphId].name;
                const safeName = rawName.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&');
                // Ensure unique function name
                let funcName = safeName;
                let i = 1;
                while ([...usedSubgraphs.values()].includes(funcName)) {
                    funcName = `${safeName}_${i++}`;
                }
                usedSubgraphs.set(subgraphId, funcName);

                // Recurse into the subgraph's nodes to find nested dependencies
                collectSubgraphDependencies(subgraphs[subgraphId].nodes, subgraphs, usedSubgraphs);
            }
        }
    }
}

/**
 * Compile a single subgraph definition (plus dependencies) into TSL code.
 */
function compileSubgraphCodeInternal(
    subgraph: SubgraphDefinition,
    subgraphs?: Record<string, SubgraphDefinition>,
    codeNodes?: Record<string, CodeNodeDefinition>,
    options: CompileOptions = {},
    allowRootUniformNodes = false
): string {
    if (!subgraph) {
        return '// No subgraph';
    }

    const uniformMode = options.uniformMode ?? 'inline';
    const globals = options.globals ?? [];
    const { varMap: globalVarMap, reserved: globalReservedNames } = buildGlobalVarMap(globals);

    const lines: string[] = [];
    const usedSubgraphs = new Map<string, string>();
    const usedCodeNodes = new Map<string, string>();

    if (subgraphs) {
        collectSubgraphDependencies(subgraph.nodes, subgraphs, usedSubgraphs);
    }

    if (codeNodes) {
        const addCodeNode = (nodeType: string) => {
            const codeNode = codeNodes[nodeType];
            if (!codeNode || usedCodeNodes.has(nodeType)) return;
            const safeName = codeNode.name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&');
            let funcName = safeName;
            let i = 1;
            while ([...usedCodeNodes.values()].includes(funcName)) {
                funcName = `${safeName}_${i++}`;
            }
            usedCodeNodes.set(nodeType, funcName);
        };

        for (const node of subgraph.nodes) {
            if (node.data.type.startsWith('code/')) {
                addCodeNode(node.data.type);
            }
        }

        if (subgraphs) {
            for (const subgraphId of usedSubgraphs.keys()) {
                const nested = subgraphs[subgraphId];
                if (!nested) continue;
                for (const node of nested.nodes) {
                    if (node.data.type.startsWith('code/')) {
                        addCodeNode(node.data.type);
                    }
                }
            }
        }
    }

    if (globals.length > 0 && !options.omitGlobalContext) {
        lines.push(compileGlobalContext(globals, { uniformMode }));
        lines.push('');
    }

    if (usedCodeNodes.size > 0) {
        lines.push('// Code Node Definitions');
        for (const [codeNodeId, funcName] of usedCodeNodes) {
            const codeNode = codeNodes![codeNodeId];
            lines.push(`// Code Node: ${codeNode.name}`);
            if ((codeNode.language ?? 'tsl') === 'wgsl') {
                lines.push(`const ${funcName} = wgslFn(${wrapWgslTemplateLiteral(codeNode.code)});`);
            } else {
                lines.push(`const ${funcName} = ${codeNode.code}`);
            }
            lines.push('');
        }
    }

    if (usedSubgraphs.size > 0 && subgraphs) {
        lines.push('// Subgraph Definitions');

        const subgraphIds = Array.from(usedSubgraphs.keys());
        const visited = new Set<string>();
        const sortedIds: string[] = [];

        const visit = (id: string) => {
            if (visited.has(id)) return;
            visited.add(id);
            const def = subgraphs[id];
            if (def) {
                for (const n of def.nodes) {
                    if (n.data.type.startsWith('custom/') && subgraphs[n.data.type]) {
                        visit(n.data.type);
                    }
                }
            }
            sortedIds.push(id);
        };

        subgraphIds.forEach(visit);

        for (const subgraphId of sortedIds) {
            if (!usedSubgraphs.has(subgraphId)) continue;
            const funcName = usedSubgraphs.get(subgraphId)!;
            const def = subgraphs[subgraphId];
            if (!def) continue;

            lines.push(`// Subgraph: ${def.name}`);
            const defLines = compileSubgraphDefinition(
                def,
                funcName,
                usedSubgraphs,
                subgraphs,
                usedCodeNodes,
                codeNodes,
                globalVarMap,
                globalReservedNames,
                options
            );
            lines.push(...defLines);
            lines.push('');
        }
    }

    const reservedNames = new Set<string>([
        ...globalReservedNames,
        ...usedCodeNodes.values(),
        ...usedSubgraphs.values(),
    ]);
    const baseName = sanitizeIdentifier(subgraph.name, 'Subgraph');
    let functionName = baseName;
    let suffix = 1;
    while (reservedNames.has(functionName)) {
        functionName = `${baseName}_${suffix++}`;
    }

    lines.push(`// Subgraph Definition: ${subgraph.name}`);
    const linesForSubgraph = compileSubgraphDefinition(
        subgraph,
        functionName,
        usedSubgraphs,
        subgraphs,
        usedCodeNodes,
        codeNodes,
        globalVarMap,
        globalReservedNames,
        options,
        allowRootUniformNodes
    );
    lines.push(...linesForSubgraph);

    return lines.join('\n');
}

export function compileSubgraphCode(
    subgraph: SubgraphDefinition,
    subgraphs?: Record<string, SubgraphDefinition>,
    codeNodes?: Record<string, CodeNodeDefinition>,
    options: CompileOptions = {}
): string {
    return compileSubgraphCodeInternal(subgraph, subgraphs, codeNodes, options);
}

export interface CompiledPostGraph {
    code: string;
    functionName: string;
}

const POST_INPUT_ID = 'post-input';
const POST_OUTPUT_ID = 'post-output';

/**
 * Compile the post-processing root graph by mapping post anchors to synthetic
 * subgraph anchors and reusing the subgraph compiler path.
 */
export function compilePostGraph(
    nodes: Node<TSLNodeData>[],
    edges: Edge[],
    subgraphs?: Record<string, SubgraphDefinition>,
    codeNodes?: Record<string, CodeNodeDefinition>,
    options: CompileOptions = {}
): CompiledPostGraph {
    const inputAnchor = nodes.find((node) => node.id === POST_INPUT_ID || node.data.type === 'post/input');
    const outputAnchor = nodes.find((node) => node.id === POST_OUTPUT_ID || node.data.type === 'post/output');

    if (!inputAnchor || !outputAnchor) {
        throw new Error('Post graph is missing required post/input or post/output anchors.');
    }

    const isPostAnchor = (node: Node<TSLNodeData>) =>
        node.id === POST_INPUT_ID ||
        node.id === POST_OUTPUT_ID ||
        (POST_ANCHOR_NODE_TYPES as readonly string[]).includes(node.data.type);

    const nodeIdMap = new Map<string, string>();
    nodeIdMap.set(inputAnchor.id, 'subgraph-input');
    nodeIdMap.set(outputAnchor.id, 'subgraph-output');

    const internalNodes = nodes
        .filter((node) => !isPostAnchor(node))
        .map((node) => {
            nodeIdMap.set(node.id, node.id);
            return {
                ...node,
                data: {
                    ...node.data,
                    values: { ...(node.data.values ?? {}) },
                    connected: { ...(node.data.connected ?? {}) },
                    activeInputs: node.data.activeInputs ? [...node.data.activeInputs] : undefined,
                    dynamicPorts: node.data.dynamicPorts ? node.data.dynamicPorts.map((port) => ({ ...port })) : undefined,
                    operations: Array.isArray(node.data.operations)
                        ? node.data.operations.map((op) => ({ ...op }))
                        : undefined,
                },
                style: node.style ? { ...node.style } : undefined,
            };
        });

    const syntheticEdges = edges
        .map((edge) => {
            const mappedSource = nodeIdMap.get(edge.source);
            const mappedTarget = nodeIdMap.get(edge.target);
            if (!mappedSource || !mappedTarget) return null;

            let mappedSourceHandle = edge.sourceHandle;
            if (mappedSource === 'subgraph-input') {
                switch (edge.sourceHandle) {
                    case 'sceneTexture':
                        mappedSourceHandle = 'in_sceneTexture';
                        break;
                    case 'depth':
                        mappedSourceHandle = 'in_depth';
                        break;
                    case 'depthTexture':
                        mappedSourceHandle = 'in_depthTexture';
                        break;
                    case 'normalTexture':
                        mappedSourceHandle = 'in_normalTexture';
                        break;
                    case 'normal':
                        mappedSourceHandle = edge.targetHandle === 'texture'
                            ? 'in_normalTexture'
                            : 'in_normal';
                        break;
                    case 'cameraNear':
                    case 'cameraFar':
                        return null;
                    case 'color':
                    default:
                        mappedSourceHandle = 'in_color';
                        break;
                }
            }

            return {
                ...edge,
                source: mappedSource,
                target: mappedTarget,
                sourceHandle: mappedSourceHandle,
                targetHandle: mappedTarget === 'subgraph-output' ? 'out_0' : edge.targetHandle,
            };
        })
        .filter((edge): edge is NonNullable<typeof edge> => edge !== null);

    const hasConnectedOutput = syntheticEdges.some(
        (edge) => edge.target === 'subgraph-output' && (edge.targetHandle ?? 'out_0') === 'out_0'
    );

    if (!hasConnectedOutput) {
        throw new Error('Post output is not connected.');
    }

    const syntheticSubgraph: SubgraphDefinition = {
        id: 'custom/post-root',
        name: 'PostGraph',
        scope: 'project',
        inputs: [
            { id: 'in_color', label: 'Color', type: 'vec4' },
            { id: 'in_depth', label: 'Depth', type: 'float' },
            { id: 'in_normal', label: 'Normal', type: 'vec3' },
            { id: 'in_sceneTexture', label: 'Scene Texture', type: 'texture' },
            { id: 'in_depthTexture', label: 'Depth Texture', type: 'texture' },
            { id: 'in_normalTexture', label: 'Normal Texture', type: 'texture' },
        ],
        outputs: [{ id: 'out_0', label: 'Output', type: 'vec4' }],
        nodes: internalNodes,
        edges: syntheticEdges,
        inputNodePosition: inputAnchor.position,
        outputNodePosition: outputAnchor.position,
        createdAt: 0,
        updatedAt: 0,
    };

    const code = compileSubgraphCodeInternal(
        syntheticSubgraph,
        subgraphs,
        codeNodes,
        { ...options, runtimeCameraFromScope: true },
        true
    );
    const fnMatches = Array.from(code.matchAll(/const\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*Fn\(\(\[/g));
    const functionName = fnMatches[fnMatches.length - 1]?.[1];

    if (!functionName) {
        throw new Error('Failed to locate compiled post-processing function.');
    }

    return { code, functionName };
}

/**
 * Compile a graph of nodes and edges into TSL code.
 * @param nodes - The nodes in the graph
 * @param edges - The edges in the graph
 * @param subgraphs - Optional map of subgraph definitions for compiling subgraph instances
 * @param codeNodes - Optional map of code node definitions for compiling code node instances
 */
export function compileGraph(
    nodes: Node<TSLNodeData>[],
    edges: Edge[],
    subgraphs?: Record<string, SubgraphDefinition>,
    codeNodes?: Record<string, CodeNodeDefinition>,
    options: CompileOptions = {}
): string {
    if (nodes.length === 0) {
        return '// No nodes in graph';
    }

    const uniformMode = options.uniformMode ?? 'inline';
    const globals = options.globals ?? [];
    const compileEdges = withLocalDependencyEdges(nodes, edges);
    const { varMap: globalVarMap, reserved: globalReservedNames } = buildGlobalVarMap(globals);

    const lines: string[] = [];
    const usedSubgraphs = new Map<string, string>(); // subgraphId -> functionName
    const usedCodeNodes = new Map<string, string>(); // codeNodeId -> functionName

    // 1. Identify used subgraphs (Recursive)
    if (subgraphs) {
        collectSubgraphDependencies(nodes, subgraphs, usedSubgraphs);
    }

    // 1b. Identify used code nodes (from main graph and from subgraphs)
    if (codeNodes) {
        // Collect from main graph
        for (const node of nodes) {
            if (node.data.type.startsWith('code/') && codeNodes[node.data.type] && !usedCodeNodes.has(node.data.type)) {
                const codeNode = codeNodes[node.data.type];
                const safeName = codeNode.name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&');
                let funcName = safeName;
                let i = 1;
                while ([...usedCodeNodes.values()].includes(funcName)) {
                    funcName = `${safeName}_${i++}`;
                }
                usedCodeNodes.set(node.data.type, funcName);
            }
        }

        // Collect from inside subgraphs
        if (subgraphs) {
            for (const subgraphId of usedSubgraphs.keys()) {
                const subgraph = subgraphs[subgraphId];
                if (subgraph) {
                    for (const node of subgraph.nodes) {
                        if (node.data.type.startsWith('code/') && codeNodes[node.data.type] && !usedCodeNodes.has(node.data.type)) {
                            const codeNode = codeNodes[node.data.type];
                            const safeName = codeNode.name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&');
                            let funcName = safeName;
                            let i = 1;
                            while ([...usedCodeNodes.values()].includes(funcName)) {
                                funcName = `${safeName}_${i++}`;
                            }
                            usedCodeNodes.set(node.data.type, funcName);
                        }
                    }
                }
            }
        }
    }

    if (globals.length > 0 && !options.omitGlobalContext) {
        lines.push(compileGlobalContext(globals, { uniformMode }));
        lines.push('');
    }

    // 2. Generate Code Node Definitions (before subgraphs, since subgraphs may use code nodes)
    if (usedCodeNodes.size > 0) {
        lines.push('// Code Node Definitions');
        for (const [codeNodeId, funcName] of usedCodeNodes) {
            const codeNode = codeNodes![codeNodeId];
            lines.push(`// Code Node: ${codeNode.name}`);
            if ((codeNode.language ?? 'tsl') === 'wgsl') {
                lines.push(`const ${funcName} = wgslFn(${wrapWgslTemplateLiteral(codeNode.code)});`);
            } else {
                // Code nodes already contain the full Fn definition, just assign to variable
                lines.push(`const ${funcName} = ${codeNode.code}`);
            }
            lines.push('');
        }
    }

    // 2b. Generate Subgraph Definitions
    // Variables must be defined before use.
    // So we need to topologically sort the usedSubgraphs based on dependency.
    if (usedSubgraphs.size > 0) {
        lines.push('// Subgraph Definitions');

        // Better: explicit topological sort of the used subgraphs.
        // Build dependency graph of subgraphs
        const subgraphIds = Array.from(usedSubgraphs.keys());
        const visited = new Set<string>();
        const sortedIds: string[] = [];

        const visit = (id: string) => {
            if (visited.has(id)) return;
            visited.add(id);
            const def = subgraphs?.[id];
            if (def) {
                for (const n of def.nodes) {
                    if (n.data.type.startsWith('custom/') && subgraphs?.[n.data.type]) {
                        visit(n.data.type);
                    }
                }
            }
            sortedIds.push(id);
        };

        subgraphIds.forEach(visit);

        for (const subgraphId of sortedIds) {
            if (!usedSubgraphs.has(subgraphId)) continue; // Should be there
            const funcName = usedSubgraphs.get(subgraphId)!;
            // re-fetch def
            const subgraph = subgraphs![subgraphId];

            lines.push(`// Subgraph: ${subgraph.name}`);
            const defLines = compileSubgraphDefinition(
                subgraph,
                funcName,
                usedSubgraphs,
                subgraphs,
                usedCodeNodes,
                codeNodes,
                globalVarMap,
                globalReservedNames,
                options
            );
            lines.push(...defLines);
            lines.push('');
        }
    }

    // 3. Generate Main Graph Code
    lines.push('// Generated TSL Code');
    lines.push('');

    const nodesById = new Map(nodes.map(n => [n.id, n]));
    const additionalExpressionUses = new Map<string, number>();
    if (options.previewTarget) {
        additionalExpressionUses.set(options.previewTarget.nodeId, 1);
    }
    const getEffectiveUseCount = createEffectiveUseCounter(
        nodes,
        compileEdges,
        additionalExpressionUses
    );
    const assignmentTargetSources = collectAssignmentTargetSources(nodes, compileEdges);

    const isLoopGroupNode = (node: Node<TSLNodeData>) => node.type === 'loop' || node.data.type === 'loop';

    const loopGroupIds = new Set(
        nodes.filter(isLoopGroupNode).map(n => n.id)
    );

    const isLoopInternalNode = (node: Node<TSLNodeData>) =>
        !!node.parentId && loopGroupIds.has(node.parentId);

    const getLoopParentId = (node: Node<TSLNodeData>): string | null => {
        if (isLoopGroupNode(node)) return node.id;
        let parentId = node.parentId;
        while (parentId) {
            const parent = nodesById.get(parentId);
            if (!parent) break;
            if (isLoopGroupNode(parent)) return parent.id;
            parentId = parent.parentId;
        }
        return null;
    };

    const loopAwareEdges: Edge[] = [];
    for (const edge of compileEdges) {
        const sourceNode = nodesById.get(edge.source);
        const targetNode = nodesById.get(edge.target);
        const sourceLoopId = sourceNode ? getLoopParentId(sourceNode) : null;
        const targetLoopId = targetNode ? getLoopParentId(targetNode) : null;

        if (sourceLoopId && targetLoopId) {
            if (sourceLoopId === targetLoopId) {
                continue; // internal to same loop - handled inside loop
            }
            // Cross-loop connections are disallowed; skip for ordering
            continue;
        }

        if (sourceLoopId && !targetLoopId) {
            loopAwareEdges.push({ ...edge, source: sourceLoopId });
            continue;
        }

        if (!sourceLoopId && targetLoopId) {
            loopAwareEdges.push({ ...edge, target: targetLoopId });
            continue;
        }

        loopAwareEdges.push(edge);
    }

    // Filter out material nodes, subgraph anchor nodes, and loop internals
    const otherNodes = nodes.filter(n =>
        !(MATERIAL_NODE_TYPES as readonly string[]).includes(n.data.type) &&
        n.data.type !== 'subgraph/input' &&
        n.data.type !== 'subgraph/output' &&
        n.data.type !== COMMENT_NODE_TYPE &&
        !isLoopInternalNode(n)
    );

    const sorted = topologicalSort(otherNodes, loopAwareEdges);
    const compiledNodes = new Map<string, CompiledNode>();
    const usedNames = new Set<string>(globalReservedNames);
    let nodeIndex = 0;

    if (options.previewSubgraphInputs) {
        const subgraphInputNodes = nodes.filter((node) => node.data.type === 'subgraph/input');
        for (const node of subgraphInputNodes) {
            const baseName = `_subgraph_input_${nodeIndex}`;
            let displayName = baseName;
            let suffix = 1;
            while (usedNames.has(displayName)) {
                displayName = `${baseName}_${suffix++}`;
            }
            usedNames.add(displayName);
            nodeIndex++;

            const ports = node.data.dynamicPorts ?? [];
            const entries = ports.map((port) => `${port.id}: ${getTSLDefaultForType(port.type)}`);
            lines.push(`const ${displayName} = { ${entries.join(', ')} };`);
            compiledNodes.set(node.id, {
                id: node.id,
                varName: displayName,
                code: '/* preview subgraph inputs */',
                singleOutput: false,
            });
        }
    }

    const compileSingleNode = (node: Node<TSLNodeData>, targetLines: string[], edgesForInputs: Edge[], inFn: boolean = false) => {
        if (node.data.type === COMMENT_NODE_TYPE) {
            return;
        }

        if (node.data.type === 'global/ref') {
            const globalId = node.data.values?.globalId as string | undefined;
            const globalVar = globalId ? globalVarMap.get(globalId) : undefined;
            if (globalVar) {
                compiledNodes.set(node.id, {
                    id: node.id,
                    varName: globalVar,
                    code: '/* global */',
                    singleOutput: true,
                });
            } else {
                const baseName = `_node${nodeIndex}`;
                let displayName = baseName;
                let suffix = 1;
                while (usedNames.has(displayName)) {
                    displayName = `${baseName}_${suffix++}`;
                }
                usedNames.add(displayName);
                nodeIndex++;

                const fallback = getTSLDefaultForType('any');
                targetLines.push(`const ${displayName} = ${fallback};`);
                compiledNodes.set(node.id, {
                    id: node.id,
                    varName: displayName,
                    code: fallback,
                    singleOutput: true,
                });
            }
            return;
        }

        // Handle Uniform node (single node with type selector)
        if (node.data.type === 'const/uniform') {
            const localName = node.data.localName || (node.data.values?.localName as string | undefined);
            const baseName = localName
                ? String(localName).replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&')
                : `_node${nodeIndex}`;

            let displayName = baseName;
            let suffix = 1;
            while (usedNames.has(displayName)) {
                displayName = `${baseName}_${suffix++}`;
            }
            usedNames.add(displayName);
            nodeIndex++;

            const kind = getUniformKindFromNode(node);
            const valueExpr = formatUniformValueExpression(kind, node.data.values?.value);

            if (uniformMode === 'runtime') {
                targetLines.push(`const ${displayName} = __uniform("${node.id}", ${valueExpr}, "${kind}");`);
            } else {
                targetLines.push(`const ${displayName} = uniform(${valueExpr});`);
            }

            compiledNodes.set(node.id, {
                id: node.id,
                varName: displayName,
                code: `/* uniform ${kind} */`,
            });
            return;
        }

        // Handle Subgraph Instance
        if (node.data.type.startsWith('custom/')) {
            const funcName = usedSubgraphs.get(node.data.type);
            const subgraph = subgraphs?.[node.data.type];

            if (funcName && subgraph) {
                const localName = node.data.localName || (node.data.values?.localName as string | undefined);
                const baseName = localName
                    ? String(localName).replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&')
                    : `_subgraph_inst_${nodeIndex}`;

                let displayName = baseName;
                let suffix = 1;
                while (usedNames.has(displayName)) {
                    displayName = `${baseName}_${suffix++}`;
                }
                usedNames.add(displayName);
                nodeIndex++;

                const args: string[] = [];
                for (const inputPort of subgraph.inputs) {
                    const edge = edgesForInputs.find(e => e.target === node.id && e.targetHandle === inputPort.id);
                    if (edge) {
                        const upstream = compiledNodes.get(edge.source);
                        if (upstream) {
                            const swizzle = getSwizzleSuffix(edge.sourceHandle, upstream.singleOutput);
                            args.push(`${upstream.varName}${swizzle}`);
                        } else {
                            args.push('float(0)');
                        }
                    } else {
                        args.push('float(0)');
                    }
                }

                targetLines.push(`const ${displayName} = ${funcName}(${args.join(', ')});`);

                const isSingleOutput = subgraph.outputs.length === 1;

                compiledNodes.set(node.id, {
                    id: node.id,
                    varName: displayName,
                    code: `/* ${funcName} call */`,
                    singleOutput: isSingleOutput
                });
                return;
            }
        }

        // Handle Code Node Instance
        if (node.data.type.startsWith('code/')) {
            const funcName = usedCodeNodes.get(node.data.type);
            const codeNode = codeNodes?.[node.data.type];

            if (funcName && codeNode) {
                const localName = node.data.localName || (node.data.values?.localName as string | undefined);
                const baseName = localName
                    ? String(localName).replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&')
                    : `_code_node_${nodeIndex}`;

                let displayName = baseName;
                let suffix = 1;
                while (usedNames.has(displayName)) {
                    displayName = `${baseName}_${suffix++}`;
                }
                usedNames.add(displayName);
                nodeIndex++;

                const args: string[] = [];
                const argEntries: Array<{ name: string; value: string }> = [];
                for (const inputPort of codeNode.inputs) {
                    const edge = edgesForInputs.find(e => e.target === node.id && e.targetHandle === inputPort.id);
                    if (edge) {
                        const upstream = compiledNodes.get(edge.source);
                        if (upstream) {
                            const swizzle = getSwizzleSuffix(edge.sourceHandle, upstream.singleOutput);
                            const value = `${upstream.varName}${swizzle}`;
                            args.push(value);
                            argEntries.push({ name: inputPort.label, value });
                        } else {
                            const value = getTSLDefaultForType(inputPort.type);
                            args.push(value);
                            argEntries.push({ name: inputPort.label, value });
                        }
                    } else {
                        const nodeValue = node.data.values?.[inputPort.id];
                        const value = getTSLDefaultForType(inputPort.type, nodeValue);
                        args.push(value);
                        argEntries.push({ name: inputPort.label, value });
                    }
                }

                if ((codeNode.language ?? 'tsl') === 'wgsl') {
                    const argsObject = `{ ${argEntries.map(arg => `${arg.name}: ${arg.value}`).join(', ')} }`;
                    targetLines.push(`const ${displayName} = ${funcName}(${argsObject});`);
                } else {
                    targetLines.push(`const ${displayName} = ${funcName}(${args.join(', ')});`);
                }

                compiledNodes.set(node.id, {
                    id: node.id,
                    varName: displayName,
                    code: `/* ${funcName} call */`,
                    singleOutput: true
                });
                return;
            }
        }

        if (isLocalSetType(node.data.type)) {
            const setName = getLocalName(node) || node.id;
            const valueEdge = edgesForInputs.find((edge) => edge.target === node.id && edge.targetHandle === 'value');
            if (!valueEdge) {
                throw new Error(`Set Local "${setName}" is missing its source connection.`);
            }

            const upstream = compiledNodes.get(valueEdge.source);
            if (!upstream) {
                throw new Error(`Set Local "${setName}" source node "${valueEdge.source}" is not compiled.`);
            }

            const swizzle = getSwizzleSuffix(valueEdge.sourceHandle, upstream.singleOutput);
            compiledNodes.set(node.id, {
                id: node.id,
                varName: `${upstream.varName}${swizzle}`,
                code: '/* local set */',
                singleOutput: true,
            });
            return;
        }

        if (isLocalGetType(node.data.type)) {
            const sourceId = getLocalSourceId(node);
            if (!sourceId) {
                throw new Error(`Get Local "${node.id}" is missing localSourceId.`);
            }

            const setNode = nodesById.get(sourceId);
            if (!setNode || !isLocalSetNode(setNode)) {
                throw new Error(`Get Local "${node.id}" references missing Set Local "${sourceId}".`);
            }

            if (!isLocalScopeAccessible(setNode, node, nodesById)) {
                throw new Error(`Get Local "${node.id}" cannot access Set Local "${sourceId}" due to loop scope.`);
            }

            const setCompiled = compiledNodes.get(sourceId);
            if (!setCompiled) {
                throw new Error(`Get Local "${node.id}" references Set Local "${sourceId}" before it is available.`);
            }

            compiledNodes.set(node.id, {
                id: node.id,
                varName: setCompiled.varName,
                code: '/* local get */',
                singleOutput: true,
            });
            return;
        }

        if (node.data.type === 'math/multiOp') {
            const localName = node.data.localName || (node.data.values?.localName as string | undefined);
            const baseName = localName
                ? String(localName).replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&')
                : `_node${nodeIndex}`;

            let displayName = baseName;
            let suffix = 1;
            while (usedNames.has(displayName)) {
                displayName = `${baseName}_${suffix++}`;
            }
            usedNames.add(displayName);
            nodeIndex++;

            const code = compileMultiOpChain(node, edgesForInputs, compiledNodes);
            const shouldInline = shouldInlineNodeExpression(
                node,
                registry.get(node.data.type),
                getEffectiveUseCount(node.id),
                assignmentTargetSources.has(node.id)
            );
            if (!shouldInline) {
                targetLines.push(`const ${displayName} = ${code};`);
            }

            compiledNodes.set(node.id, {
                id: node.id,
                varName: shouldInline ? asInlineExpression(code) : displayName,
                code,
                singleOutput: true,
            });
            return;
        }

        const assignMethod = ASSIGN_NODE_METHODS[node.data.type];
        if (assignMethod) {
            const targetExpr = getAssignTargetExpression(node, edgesForInputs, compiledNodes, undefined, nodesById);
            const valueExpr = getInputValue(node, 'value', edgesForInputs, compiledNodes, { type: 'any', default: 0 });

            if (targetExpr) {
                if (inFn) {
                    targetLines.push(`${targetExpr}.${assignMethod}(${valueExpr});`);
                    compiledNodes.set(node.id, {
                        id: node.id,
                        varName: targetExpr,
                        code: `/* ${assignMethod} */`,
                        singleOutput: true,
                    });
                } else {
                    const assignBase = `_assign_${nodeIndex}`;
                    let assignFnName = assignBase;
                    let assignSuffix = 1;
                    while (usedNames.has(assignFnName)) {
                        assignFnName = `${assignBase}_${assignSuffix++}`;
                    }
                    usedNames.add(assignFnName);

                    const baseName = `_node${nodeIndex}`;
                    let displayName = baseName;
                    let nodeSuffix = 1;
                    while (usedNames.has(displayName)) {
                        displayName = `${baseName}_${nodeSuffix++}`;
                    }
                    usedNames.add(displayName);
                    nodeIndex++;

                    targetLines.push(`const ${assignFnName} = Fn(() => {`);
                    targetLines.push(`    ${targetExpr}.${assignMethod}(${valueExpr});`);
                    targetLines.push(`    return ${targetExpr};`);
                    targetLines.push(`});`);
                    targetLines.push(`const ${displayName} = ${assignFnName}();`);

                    compiledNodes.set(node.id, {
                        id: node.id,
                        varName: displayName,
                        code: `/* ${assignMethod} */`,
                        singleOutput: true,
                    });
                }
            } else {
                const localName = node.data.localName || (node.data.values?.localName as string | undefined);
                const baseName = localName
                    ? String(localName).replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&')
                    : `_node${nodeIndex}`;

                let displayName = baseName;
                let suffix = 1;
                while (usedNames.has(displayName)) {
                    displayName = `${baseName}_${suffix++}`;
                }
                usedNames.add(displayName);
                nodeIndex++;

                targetLines.push(`const ${displayName} = ${valueExpr};`);

                compiledNodes.set(node.id, {
                    id: node.id,
                    varName: displayName,
                    code: valueExpr,
                    singleOutput: true,
                });
            }
            return;
        }

        const def = registry.get(node.data.type);
        if (!def) {
            targetLines.push(`// Unknown node type: ${node.data.type}`);
            return;
        }

        const localName = node.data.localName || (node.data.values?.localName as string | undefined);
        const baseName = localName
            ? String(localName).replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&')
            : `_node${nodeIndex}`;

        let displayName = baseName;
        let suffix = 1;
        while (usedNames.has(displayName)) {
            displayName = `${baseName}_${suffix++}`;
        }
        usedNames.add(displayName);
        nodeIndex++;

        const inputs = def.inputs ?? {};
        const inputKeys = Object.keys(inputs);
        let code: string;

        const postConvenienceCode = getPostConvenienceExpression(def.type);
        if (postConvenienceCode) {
            code = postConvenienceCode;
        } else if (def.type === 'geo/camera') {
            code = 'vec2(cameraNear, cameraFar)';
        } else if (def.pure && inputKeys.length === 0) {
            code = def.callable ? `${def.tsl}()` : def.tsl;
        } else if (def.type === 'const/color') {
            const hex = getStringValue(node, 'value', inputs['value']);
            code = `color("${hex}")`;
        } else if (def.type === 'utils/linearGradient') {
            const { tArg, modeArg, stopsLiteral } = getLinearGradientArgs(node, edgesForInputs, compiledNodes, inputs);
            code = `linearGradient(${tArg}, ${modeArg}, ${stopsLiteral})`;
        } else if (def.type === 'geo/uv') {
            const index = Number(node.data.values?.['index'] ?? 0);
            code = `uv(${index})`;
        } else if (def.type === 'geo/instanceCount') {
            const count = Number(node.data.values?.['value'] ?? 0);
            code = `int(${count})`;
        } else if (def.type === 'math/split') {
            code = getInputValue(node, 'in', edgesForInputs, compiledNodes, inputs['in']);
        } else if (def.type === 'advanced/perspectiveDepthToViewZ') {
            const depthArg = getInputValue(node, 'depth', edgesForInputs, compiledNodes, inputs['depth']);
            const nearRaw = getInputValue(node, 'near', edgesForInputs, compiledNodes, inputs['near']);
            const farRaw = getInputValue(node, 'far', edgesForInputs, compiledNodes, inputs['far']);
            const nearConnected = edgesForInputs.some((e) => e.target === node.id && e.targetHandle === 'near');
            const farConnected = edgesForInputs.some((e) => e.target === node.id && e.targetHandle === 'far');
            const nearArg = nearConnected ? nearRaw : `float(${nearRaw})`;
            const farArg = farConnected ? farRaw : `float(${farRaw})`;
            code = `${def.tsl}(${depthArg}, ${nearArg}, ${farArg})`;
        } else if (def.type === 'advanced/viewZToOrthographicDepth') {
            const viewZArg = getInputValue(node, 'viewZ', edgesForInputs, compiledNodes, inputs['viewZ']);
            const nearRaw = getInputValue(node, 'near', edgesForInputs, compiledNodes, inputs['near']);
            const farRaw = getInputValue(node, 'far', edgesForInputs, compiledNodes, inputs['far']);
            const nearConnected = edgesForInputs.some((e) => e.target === node.id && e.targetHandle === 'near');
            const farConnected = edgesForInputs.some((e) => e.target === node.id && e.targetHandle === 'far');
            const nearArg = nearConnected ? nearRaw : `float(${nearRaw})`;
            const farArg = farConnected ? farRaw : `float(${farRaw})`;
            code = `${def.tsl}(${viewZArg}, ${nearArg}, ${farArg})`;
        } else if (
            def.type === 'texture/sampleNode' ||
            (def.tsl === 'texture' && !!inputs['texture'] && !inputs['url'])
        ) {
            const texArg = getInputValue(node, 'texture', edgesForInputs, compiledNodes, inputs['texture']);
            const uvEdge = edgesForInputs.find(e => e.target === node.id && e.targetHandle === 'uv');

            if (uvEdge) {
                const uvArg = getInputValue(node, 'uv', edgesForInputs, compiledNodes, inputs['uv']);
                code = `texture(${texArg}, ${uvArg})`;
            } else {
                // Default to screen UV when no explicit UV input is connected.
                code = `texture(${texArg}, screenUV)`;
            }
        } else if (def.type === 'texture/sample') {
            code = emitTextureSampleNode(
                node,
                def,
                inputs,
                edgesForInputs,
                compiledNodes,
                targetLines,
                displayName
            );
        } else if (def.type === 'texture/viewportShared') {
            const uvEdge = edgesForInputs.find(e => e.target === node.id && e.targetHandle === 'uv');

            if (uvEdge) {
                const uvArg = getInputValue(node, 'uv', edgesForInputs, compiledNodes, inputs['uv']);
                code = `${def.tsl}(${uvArg})`;
            } else {
                code = `${def.tsl}()`;
            }
        } else if (def.type === 'texture/triplanar') {
            const connectedArg = (key: string) => {
                const edge = edgesForInputs.find(e => e.target === node.id && e.targetHandle === key);
                return edge ? getInputValue(node, key, edgesForInputs, compiledNodes, inputs[key]) : null;
            };

            // Magenta placeholder so an unwired node still compiles.
            const texXArg = connectedArg('textureX') ?? 'color(1.0, 0.0, 1.0)';
            // null makes triplanarTexture sample textureX for that axis.
            const texYArg = connectedArg('textureY') ?? 'null';
            const texZArg = connectedArg('textureZ') ?? 'null';

            const scaleArg = getInputValue(node, 'scale', edgesForInputs, compiledNodes, inputs['scale']);

            const posArg = connectedArg('position') ?? 'undefined';
            const normalArg = connectedArg('normal') ?? 'undefined';

            code = `${def.tsl}(${texXArg}, ${texYArg}, ${texZArg}, ${scaleArg}, ${posArg}, ${normalArg})`;
        } else if (def.paramsObject) {
            code = emitParamsObjectNode(
                node,
                def,
                inputs,
                edgesForInputs,
                compiledNodes,
                targetLines,
                displayName
            );
        } else if (inputKeys.length === 0) {
            code = `${def.tsl}()`;
        } else {
            const args = inputKeys.filter(k => !inputs[k].propertyOnly).map(key =>
                getInputValue(node, key, edgesForInputs, compiledNodes, inputs[key])
            );
            code = `${def.tsl}(${args.join(', ')})`;
        }

        const shouldInline = shouldInlineNodeExpression(
            node,
            def,
            getEffectiveUseCount(node.id),
            assignmentTargetSources.has(node.id)
        );
        if (!shouldInline) {
            targetLines.push(`const ${displayName} = ${code};`);
        }

        compiledNodes.set(node.id, {
            id: node.id,
            varName: shouldInline ? asInlineExpression(code) : displayName,
            code,
        });
    };

    const compileLoopGroup = (loopNode: Node<TSLNodeData>, targetLines: string[]) => {
        const loopId = loopNode.id;
        const internalNodes = nodes.filter(n => n.parentId === loopId);

        const countNode = internalNodes.find(n => n.data.type === 'loop/count');
        const count2Node = internalNodes.find(n => n.data.type === 'loop/count2');
        const startNode = internalNodes.find(n => n.data.type === 'loop/start');
        const endNode = internalNodes.find(n => n.data.type === 'loop/end');
        const indexNode = internalNodes.find(n => n.data.type === 'loop/index');
        const index2Node = internalNodes.find(n => n.data.type === 'loop/index2');
        const accNode = internalNodes.find(n => n.data.type === 'loop/accumulator');
        const conditionNode = internalNodes.find(n => n.data.type === 'loop/condition');
        const outputNode = internalNodes.find(n => n.data.type === 'loop/output');

        const reserveName = (base: string) => {
            let name = base;
            let suffix = 1;
            while (usedNames.has(name)) {
                name = `${base}_${suffix++}`;
            }
            usedNames.add(name);
            return name;
        };

        const localName = loopNode.data.localName || (loopNode.data.values?.localName as string | undefined);
        const baseName = localName
            ? String(localName).replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&')
            : `_loop${nodeIndex}`;

        const loopVarName = reserveName(baseName);
        nodeIndex++;

        const countVarName = reserveName(`${loopVarName}_count`);
        const count2VarName = reserveName(`${loopVarName}_count2`);
        const loopFnName = reserveName(`${loopVarName}_fn`);
        const accVarName = reserveName(`${loopVarName}_acc`);

        const loopModeRaw = String(loopNode.data.values?.loopMode ?? 'count');
        const loopMode = ['count', 'range', 'reverse', 'nested', 'condition'].includes(loopModeRaw)
            ? loopModeRaw
            : 'count';
        const loopTypeRaw = String(loopNode.data.values?.loopType ?? 'int');
        const loopType = loopTypeRaw === 'float' ? 'float' : 'int';
        const compareOptions = ['<', '<=', '>', '>='];
        const compareRaw = String(loopNode.data.values?.loopCompare ?? (loopMode === 'reverse' ? '>' : '<'));
        const loopCompare = compareOptions.includes(compareRaw) ? compareRaw : (loopMode === 'reverse' ? '>' : '<');

        const countExpr = countNode
            ? getInputValue(countNode, 'count', compileEdges, compiledNodes, { type: 'int', default: 1 })
            : '1';

        const count2Expr = count2Node
            ? getInputValue(count2Node, 'count', compileEdges, compiledNodes, { type: 'int', default: 1 })
            : '1';

        const startExpr = startNode
            ? getInputValue(startNode, 'start', compileEdges, compiledNodes, { type: 'float', default: 0 })
            : '0';

        const endExpr = endNode
            ? getInputValue(endNode, 'end', compileEdges, compiledNodes, { type: 'float', default: 1 })
            : '1';

        const conditionExpr = conditionNode
            ? getInputValue(conditionNode, 'cond', compileEdges, compiledNodes, { type: 'bool', default: false })
            : 'false';

        if (loopMode === 'count' || loopMode === 'nested') {
            targetLines.push(`const ${countVarName} = max(int(${countExpr}), 0);`);
        }
        if (loopMode === 'nested') {
            targetLines.push(`const ${count2VarName} = max(int(${count2Expr}), 0);`);
        }

        let seedExpr = getTSLDefaultForType('any');
        if (accNode) {
            const seedEdge = compileEdges.find(e => e.target === accNode.id && e.targetHandle === 'seed');
            const seedValue = accNode.data.values?.['seed'];
            if (seedEdge || seedValue !== undefined) {
                seedExpr = getInputValue(accNode, 'seed', compileEdges, compiledNodes, { type: 'any', default: 0 });
            }
        }
        targetLines.push(`const ${loopFnName} = Fn(() => {`);
        targetLines.push(`    const ${accVarName} = Var(${seedExpr});`);
        if (loopMode === 'nested') {
            targetLines.push(`    Loop(${countVarName}, ${count2VarName}, ({ i, j }) => {`);
        } else if (loopMode === 'range') {
            targetLines.push(`    Loop({ start: ${startExpr}, end: ${endExpr}, type: '${loopType}', condition: '${loopCompare}', name: 'i' }, ({ i }) => {`);
        } else if (loopMode === 'reverse') {
            targetLines.push(`    Loop({ start: ${startExpr}, type: '${loopType}', condition: '${loopCompare}', name: 'i' }, ({ i }) => {`);
        } else if (loopMode === 'condition') {
            targetLines.push(`    Loop(${conditionExpr}, () => {`);
        } else {
            targetLines.push(`    Loop(${countVarName}, ({ i }) => {`);
        }

        if (countNode) {
            compiledNodes.set(countNode.id, { id: countNode.id, varName: countVarName, code: countVarName, singleOutput: true });
        }
        if (count2Node) {
            compiledNodes.set(count2Node.id, { id: count2Node.id, varName: count2VarName, code: count2VarName, singleOutput: true });
        }
        if (startNode) {
            compiledNodes.set(startNode.id, { id: startNode.id, varName: startExpr, code: startExpr, singleOutput: true });
        }
        if (endNode) {
            compiledNodes.set(endNode.id, { id: endNode.id, varName: endExpr, code: endExpr, singleOutput: true });
        }
        if (indexNode) {
            compiledNodes.set(indexNode.id, { id: indexNode.id, varName: 'i', code: 'i', singleOutput: true });
        }
        if (index2Node) {
            compiledNodes.set(index2Node.id, { id: index2Node.id, varName: 'j', code: 'j', singleOutput: true });
        }
        if (accNode) {
            compiledNodes.set(accNode.id, { id: accNode.id, varName: accVarName, code: accVarName, singleOutput: true });
        }
        if (conditionNode) {
            compiledNodes.set(conditionNode.id, { id: conditionNode.id, varName: conditionExpr, code: conditionExpr, singleOutput: true });
        }
        if (outputNode) {
            compiledNodes.set(outputNode.id, { id: outputNode.id, varName: loopVarName, code: loopVarName, singleOutput: true });
        }

        const bodyNodes = internalNodes.filter(n => !LOOP_INTERNAL_NODE_TYPES.has(n.data.type));
        const bodySorted = topologicalSort(bodyNodes, compileEdges);
        const innerLines: string[] = [];

        for (const nodeId of bodySorted) {
            const node = nodesById.get(nodeId);
            if (!node) continue;
            compileSingleNode(node, innerLines, compileEdges, true);
        }

        if (outputNode) {
            const outputEdge = compileEdges.find(e => e.target === outputNode.id && e.targetHandle === 'next');
            if (outputEdge) {
                const nextExpr = getInputValue(outputNode, 'next', compileEdges, compiledNodes, { type: 'any', default: 0 });
                innerLines.push(`${accVarName}.assign(${nextExpr});`);
            }
        }

        for (const line of innerLines) {
            targetLines.push(`        ${line}`);
        }

        targetLines.push(`    });`);
        targetLines.push(`    return ${accVarName};`);
        targetLines.push(`});`);
        targetLines.push(`const ${loopVarName} = ${loopFnName}();`);

        compiledNodes.set(loopNode.id, {
            id: loopNode.id,
            varName: loopVarName,
            code: `/* loop */`,
            singleOutput: true,
        });
    };

    for (const nodeId of sorted) {
        const node = nodesById.get(nodeId);
        if (!node) continue;

        if (isLoopGroupNode(node)) {
            compileLoopGroup(node, lines);
            continue;
        }

        compileSingleNode(node, lines, compileEdges);
    }

    if (options.previewTarget) {
        const targetExpr = getCompiledNodeOutputExpression(
            compiledNodes.get(options.previewTarget.nodeId),
            options.previewTarget.outputHandle
        );
        if (!targetExpr) {
            throw new Error(`Preview target node "${options.previewTarget.nodeId}" did not compile.`);
        }
        lines.push(`const ${options.previewTarget.varName ?? '__preview_target__'} = ${targetExpr};`);
    }

    // Generate material code
    const materialNode = nodes.find(n => (MATERIAL_NODE_TYPES as readonly string[]).includes(n.data.type));
    if (materialNode) {
        const materialDef = registry.get(materialNode.data.type);
        if (materialDef) {
            lines.push('');
            lines.push('// Material');
            lines.push(`const material = new ${materialDef.tsl}();`);

            const connectedHandles = edges
                .filter((e) => e.target === materialNode.id)
                .map((e) => e.targetHandle);
            const activeInputs = getMaterialActiveInputsSet(materialNode.data, materialDef, connectedHandles);

            const inputKeys = Object.keys(materialDef.inputs ?? {});
            for (const key of inputKeys) {
                const inputDef = materialDef.inputs![key];

                // 1. Check for connection
                const varName = getMaterialInputVar(materialNode, key, edges, compiledNodes);
                if (varName) {
                    lines.push(`material.${key} = ${varName};`);
                    continue;
                }

                // Skip inactive inputs (only compile active ones)
                if (!activeInputs.has(key)) continue;

                // 2. Use local value (properties panel)
                // Skip connection-only inputs that aren't connected
                if (inputDef.connectionOnly) continue;

                // 2b. Skip physical-material feature-gating inputs when not connected.
                // Setting these to any non-null value (even float(0)) tricks Three.js into
                // enabling expensive features like transmission rendering, causing a black material.
                if (PHYSICAL_MATERIAL_FEATURE_KEYS.has(key)) {
                    const userVal = materialNode.data.values?.[key];
                    if (userVal === undefined || userVal === inputDef.default) {
                        continue;
                    }
                }

                // 3. Handle raw material properties (depthWrite, blending, etc)
                if (inputDef.isMaterialProp) {
                    // Use local value (properties panel)
                    const val = materialNode.data.values?.[key] ?? inputDef.default;

                    // Assign direclty
                    lines.push(`material.${key} = ${val};`);
                    continue;
                }

                const valExpression = getInputValue(materialNode, key, edges, compiledNodes, inputDef);

                // Wrap values in TSL constructors if they are primitives (to ensure they are Nodes)
                let wrappedVal = valExpression;

                if (inputDef.type === 'float') {
                    // getInputValue returns number string, wrap in float()
                    wrappedVal = `float(${valExpression})`;
                } else if (inputDef.type === 'int' || inputDef.type === 'uint') {
                    // getInputValue returns number string
                    wrappedVal = `int(${valExpression})`;
                } else if (inputDef.type === 'bool') {
                    // getInputValue returns true/false
                    wrappedVal = `bool(${valExpression})`;
                }
                // vec2, vec3, vec4 are already wrapped by getInputValue
                // NOTE: Switched to explicit vecN() in getInputValue

                lines.push(`material.${key} = ${wrappedVal};`);
            }
        }
    }

    return lines.join('\n');
}


/**
 * Get a list of TSL imports needed for the compiled code.
 */
export function getRequiredImports(
    nodes: Node<TSLNodeData>[],
    subgraphs?: Record<string, SubgraphDefinition>,
    codeNodes?: Record<string, CodeNodeDefinition>,
    globals: GlobalContextEntry[] = []
): string[] {
    const imports = new Set<string>();

    const addTypeImports = (type: string) => {
        switch (type) {
            case 'vec2':
                imports.add('vec2');
                break;
            case 'vec3':
                imports.add('vec3');
                break;
            case 'vec4':
                imports.add('vec4');
                break;
            case 'color':
                imports.add('color');
                break;
            case 'int':
            case 'uint':
                imports.add('int');
                break;
            case 'float':
            case 'any':
                imports.add('float');
                break;
            default:
                break;
        }
    };

    // Check for material node and add its import
    const materialNode = nodes.find(n => (MATERIAL_NODE_TYPES as readonly string[]).includes(n.data.type));
    if (materialNode) {
        const def = registry.get(materialNode.data.type);
        if (def) {
            imports.add(def.tsl);
            addMaterialFallbackImports(imports, materialNode, def);
        }
    }

    if (globals.length > 0) {
        for (const entry of globals) {
            if (entry.kind === 'uniform') {
                imports.add('uniform');
            } else if (entry.kind === 'varying') {
                imports.add('varying');
            }
            addTypeImports(entry.type);
        }
    }

    if (nodes.some((node) => node.data.type === 'global/ref')) {
        imports.add('float');
    }

    if (nodes.some((node) =>
        node.id === POST_INPUT_ID ||
        node.id === POST_OUTPUT_ID ||
        (POST_ANCHOR_NODE_TYPES as readonly string[]).includes(node.data.type)
    )) {
        imports.add('Fn');
    }

    let hasSubgraphs = false;

    // Helper to add imports from a node (recursive for subgraphs?)
    // Actually we only need imports for node types used in the graph or used subgraphs.
    // If a subgraph is used, we need 'Fn'. And we need imports for its internal nodes.

    const addMultiOpImports = (ops: MultiOp[]) => {
        if (ops.length === 0) {
            imports.add('float');
            return;
        }
        for (const op of ops) {
            imports.add(op.op);
        }
    };

    // We can define a helper to collect usage from a subgraph definition
    function collectSubgraphImports(subgraph: SubgraphDefinition, seenSubgraphs: Set<string>) {
        if (seenSubgraphs.has(subgraph.id)) return;
        seenSubgraphs.add(subgraph.id);

        hasSubgraphs = true;

        for (const node of subgraph.nodes) {
            if (node.data.type === COMMENT_NODE_TYPE) {
                continue;
            }
            // If internal node is subgraph instance (nested), recurse
            if (node.data.type.startsWith('custom/') && subgraphs) {
                const nested = subgraphs[node.data.type];
                if (nested) collectSubgraphImports(nested, seenSubgraphs);
            } else if (node.data.type === 'math/multiOp') {
                const ops = getMultiOpOperations(node);
                addMultiOpImports(ops);
            } else if (node.data.type.startsWith('code/')) {
                const codeNode = codeNodes?.[node.data.type];
                if ((codeNode?.language ?? 'tsl') === 'wgsl') {
                    imports.add('wgslFn');
                }
            } else if (node.data.type === 'utils/linearGradient') {
                imports.add('linearGradient');
                imports.add('color');
                imports.add('float');
            } else if (node.data.type === 'geo/camera') {
                imports.add('cameraNear');
                imports.add('cameraFar');
                imports.add('vec2');
            } else {
                const def = registry.get(node.data.type);
                if (def && !def.tsl.startsWith('__')) {
                    imports.add(def.tsl);
                    addFallbackInputImports(imports, node, def);
                }
            }

            // Collect vec imports from values
            if (node.data.values) {
                for (const value of Object.values(node.data.values)) {
                    if (isFiniteNumberArray(value)) {
                        if (value.length === 2) imports.add('vec2');
                        else if (value.length === 3) imports.add('vec3');
                        else if (value.length === 4) imports.add('vec4');
                    }
                }
            }
        }
    }

    const seenSubgraphs = new Set<string>();

    for (const node of nodes) {
        if ((MATERIAL_NODE_TYPES as readonly string[]).includes(node.data.type)) continue;
        if (node.data.type === 'subgraph/input' || node.data.type === 'subgraph/output') continue;
        if (node.data.type === COMMENT_NODE_TYPE) continue;

        // Handle subgraph instances
        if (node.data.type.startsWith('custom/') && subgraphs) {
            const subgraph = subgraphs[node.data.type];
            if (subgraph) {
                collectSubgraphImports(subgraph, seenSubgraphs);
            }
            continue;
        }

        if (node.data.type === 'math/multiOp') {
            const ops = getMultiOpOperations(node);
            addMultiOpImports(ops);
            continue;
        }

        if (node.data.type === 'texture/sampleNode') {
            imports.add('screenUV');
        }

        if (node.data.type === 'utils/linearGradient') {
            imports.add('color');
            imports.add('float');
        }

        if (node.data.type === 'geo/camera') {
            imports.add('cameraNear');
            imports.add('cameraFar');
            imports.add('vec2');
        }

        // Assign nodes require Fn wrapper in main graph
        if (ASSIGN_NODE_METHODS[node.data.type]) {
            imports.add('Fn');
        }

        // Handle Code Nodes - they use Fn
        if (node.data.type.startsWith('code/')) {
            hasSubgraphs = true;
            const codeNode = codeNodes?.[node.data.type];
            if ((codeNode?.language ?? 'tsl') === 'wgsl') {
                imports.add('wgslFn');
            }
            continue;
        }

        const def = registry.get(node.data.type);
        if (def && !def.tsl.startsWith('__') && node.data.type !== 'geo/camera') {
            imports.add(def.tsl);
            addFallbackInputImports(imports, node, def);
        }

        // Check node values for arrays (vectors) to add vec imports
        if (node.data.values) {
            for (const value of Object.values(node.data.values)) {
                if (isFiniteNumberArray(value)) {
                    if (value.length === 2) imports.add('vec2');
                    else if (value.length === 3) imports.add('vec3');
                    else if (value.length === 4) imports.add('vec4');
                }
            }
        }
    }

    const hasLoops = nodes.some(n => n.type === 'loop' || n.data.type.startsWith('loop/'));
    if (hasLoops) {
        imports.add('Fn');
        imports.add('Loop');
        imports.add('Var');
        imports.add('int');
        imports.add('max');
    }

    if (hasSubgraphs) {
        imports.add('Fn');
    }

    return Array.from(imports).sort();
}

const DEFAULT_TSL_IMPORT_SOURCE = 'three/tsl';

export interface ImportGroup {
    from: string;
    imports: string[];
}

function collectImportSourceOverrides(
    nodes: Node<TSLNodeData>[],
    subgraphs: Record<string, SubgraphDefinition> | undefined,
    byModule: Map<string, Set<string>>,
    visitedSubgraphs: Set<string>
) {
    for (const node of nodes) {
        if (node.data.type === COMMENT_NODE_TYPE) {
            continue;
        }
        if (node.data.type.startsWith('custom/') && subgraphs) {
            const subgraph = subgraphs[node.data.type];
            if (subgraph && !visitedSubgraphs.has(subgraph.id)) {
                visitedSubgraphs.add(subgraph.id);
                collectImportSourceOverrides(subgraph.nodes, subgraphs, byModule, visitedSubgraphs);
            }
        }

        const def = registry.get(node.data.type);
        if (!def || !def.importFrom || def.tsl.startsWith('__')) {
            continue;
        }

        const moduleImports = byModule.get(def.importFrom) ?? new Set<string>();
        moduleImports.add(def.tsl);
        byModule.set(def.importFrom, moduleImports);

        if (def.importFrom !== DEFAULT_TSL_IMPORT_SOURCE) {
            const defaultImports = byModule.get(DEFAULT_TSL_IMPORT_SOURCE);
            defaultImports?.delete(def.tsl);
        }
    }
}

export function getRequiredImportsByModule(
    nodes: Node<TSLNodeData>[],
    subgraphs?: Record<string, SubgraphDefinition>,
    codeNodes?: Record<string, CodeNodeDefinition>,
    globals: GlobalContextEntry[] = []
): ImportGroup[] {
    const flatImports = getRequiredImports(nodes, subgraphs, codeNodes, globals);
    const byModule = new Map<string, Set<string>>();

    if (flatImports.length > 0) {
        byModule.set(DEFAULT_TSL_IMPORT_SOURCE, new Set(flatImports));
    }

    collectImportSourceOverrides(nodes, subgraphs, byModule, new Set<string>());

    return Array.from(byModule.entries())
        .map(([from, importSet]) => ({ from, imports: Array.from(importSet).sort() }))
        .filter((entry) => entry.imports.length > 0)
        .sort((a, b) => a.from.localeCompare(b.from));
}
