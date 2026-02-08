import { Node, Edge } from '@xyflow/react';
import { TSLNodeData, SubgraphDefinition, CodeNodeDefinition, type Port } from '@/lib/types';
import { registry } from './registry';
import { MATERIAL_NODE_TYPES } from './nodes';
import { topologicalSort } from './graph-utils';
import { getMultiOpHandleId, getMultiOpParams, type MultiOp } from './multi-op';
import { ASSIGN_NODE_TYPES } from './assign-node-types';

interface CompiledNode {
    id: string;
    varName: string;
    code: string;
    singleOutput?: boolean;
}

// Component swizzle mapping for code generation
const COMPONENT_SWIZZLES: Record<string, string> = {
    'x': 'x',
    'y': 'y',
    'z': 'z',
    'w': 'w',
    'r': 'x',
    'g': 'y',
    'b': 'z',
};


function makeUniqueName(baseName: string, usedNames: Set<string>): string {
    let name = baseName;
    let suffix = 1;
    while (usedNames.has(name)) {
        name = `${baseName}_${suffix++}`;
    }
    usedNames.add(name);
    return name;
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

    const value = node.data.values?.[inputKey] ?? inputDef.default;

    if (inputDef.type === 'color') {
        const hex = String(value ?? '#ffffff');
        return `color("${hex}")`;
    }

    if (inputDef.type === 'bool') {
        return value ? 'true' : 'false';
    }

    // Handle array values (vectors)
    if (Array.isArray(value)) {
        const components = value.map(v => String(Number(v ?? 0)));
        if (components.length === 2) return `vec2(${components.join(', ')})`;
        if (components.length === 3) return `vec3(${components.join(', ')})`;
        if (components.length === 4) return `vec4(${components.join(', ')})`;
        // Fallback for unknown sizes
        return `vec${components.length}(${components.join(', ')})`;
    }

    const num = Number(value ?? 0);
    if (inputDef.type === 'int' || inputDef.type === 'uint') {
        return String(Math.round(num));
    }

    return String(num);
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

/**
 * Get the connected variable name for a material input.
 * Handles swizzling.
 */
function getMaterialInputVar(
    materialNode: Node<TSLNodeData>,
    inputKey: string,
    edges: Edge[],
    compiledNodes: Map<string, CompiledNode>,
    loopOutputToGroup: Map<string, string>
): string | null {
    const edge = edges.find(e => e.target === materialNode.id && e.targetHandle === inputKey);
    if (edge) {
        const upstream = compiledNodes.get(edge.source);
        if (upstream) {
            const swizzle = getSwizzleSuffix(edge.sourceHandle, upstream.singleOutput);
            return `${upstream.varName}${swizzle}`;
        }
        const loopGroupId = loopOutputToGroup.get(edge.source);
        if (loopGroupId) {
            const loopCompiled = compiledNodes.get(loopGroupId);
            if (loopCompiled) {
                const swizzle = getSwizzleSuffix(edge.sourceHandle, loopCompiled.singleOutput);
                return `${loopCompiled.varName}${swizzle}`;
            }
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
    codeNodesMap?: Record<string, CodeNodeDefinition>
): string[] {
    const lines: string[] = [];
    const internalNodes = subgraph.nodes;
    // We saved edges including those to anchor nodes in store/editor.ts
    const internalEdges = subgraph.edges;

    // Map inputs to argument names
    // input.id maps to the sourceHandle of edges coming from 'subgraph-input'
    const argsMap: Record<string, string> = {};
    const argNames = subgraph.inputs.map((input, i) => {
        const argName = `arg_${input.id}`;
        argsMap[input.id] = argName;
        return argName;
    });

    lines.push(`const ${functionName} = Fn(([${argNames.join(', ')}]) => {`);

    // Prepare for internal graph compilation
    // Filter out anchor nodes for topological sort
    const nodesToSort = internalNodes.filter(n => n.id !== 'subgraph-input' && n.id !== 'subgraph-output');
    const sorted = topologicalSort(nodesToSort, internalEdges);
    const compiledNodes = new Map<string, CompiledNode>();
    const usedNames = new Set<string>();
    let nodeIndex = 0;

    for (const nodeId of sorted) {
        const node = internalNodes.find(n => n.id === nodeId);
        if (!node) continue;

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

                lines.push(`    const ${displayName} = ${funcName}(${args.join(', ')});`);

                const isSingleOutput = nestedSubgraph.outputs.length === 1;

                compiledNodes.set(nodeId, {
                    id: nodeId,
                    varName: displayName,
                    code: `/* ${funcName} call */`,
                    singleOutput: isSingleOutput
                });
                continue;
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
                for (const inputPort of codeNode.inputs) {
                    const edge = internalEdges.find(e => e.target === node.id && e.targetHandle === inputPort.id);
                    if (edge) {
                        if (edge.source === 'subgraph-input' && argsMap && edge.sourceHandle) {
                            args.push(argsMap[edge.sourceHandle] || getTSLDefaultForType(inputPort.type));
                        } else {
                            const upstream = compiledNodes.get(edge.source);
                            if (upstream) {
                                const swizzle = getSwizzleSuffix(edge.sourceHandle, upstream.singleOutput);
                                args.push(`${upstream.varName}${swizzle}`);
                            } else {
                                args.push(getTSLDefaultForType(inputPort.type));
                            }
                        }
                    } else {
                        // Not connected - use node value if available, otherwise type default
                        const nodeValue = node.data.values?.[inputPort.id];
                        args.push(getTSLDefaultForType(inputPort.type, nodeValue));
                    }
                }

                lines.push(`    const ${displayName} = ${funcName}(${args.join(', ')});`);

                // Code nodes always have single output
                compiledNodes.set(nodeId, {
                    id: nodeId,
                    varName: displayName,
                    code: `/* ${funcName} call */`,
                    singleOutput: true
                });
                continue;
            }
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
            lines.push(`    const ${displayName} = ${code};`);

            compiledNodes.set(nodeId, {
                id: nodeId,
                varName: displayName,
                code,
                singleOutput: true,
            });
            continue;
        }

        const def = registry.get(node.data.type);
        if (!def) {
            // Skip if strictly unknown, but custom/ handled above
            continue;
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

        if (def.pure && inputKeys.length === 0) {
            code = def.callable ? `${def.tsl}()` : def.tsl;
        } else if (inputKeys.length === 0) {
            code = `${def.tsl}()`;
        } else {
            const args = inputKeys.map(key =>
                getInputValue(node, key, internalEdges, compiledNodes, inputs[key], argsMap)
            );
            code = `${def.tsl}(${args.join(', ')})`;
        }

        lines.push(`    const ${displayName} = ${code};`);

        compiledNodes.set(nodeId, {
            id: nodeId,
            varName: displayName,
            code,
        });
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
    codeNodes?: Record<string, CodeNodeDefinition>
): string {
    if (nodes.length === 0) {
        return '// No nodes in graph';
    }

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

    // 2. Generate Code Node Definitions (before subgraphs, since subgraphs may use code nodes)
    if (usedCodeNodes.size > 0) {
        lines.push('// Code Node Definitions');
        for (const [codeNodeId, funcName] of usedCodeNodes) {
            const codeNode = codeNodes![codeNodeId];
            lines.push(`// Code Node: ${codeNode.name}`);
            // Code nodes already contain the full Fn definition, just assign to variable
            lines.push(`const ${funcName} = ${codeNode.code}`);
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
            const defLines = compileSubgraphDefinition(subgraph, funcName, usedSubgraphs, subgraphs, usedCodeNodes, codeNodes);
            lines.push(...defLines);
            lines.push('');
        }
    }

    // 3. Generate Main Graph Code
    lines.push('// Generated TSL Code');
    lines.push('');

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const loopOutputToGroup = new Map<string, string>();
    for (const node of nodes) {
        if (node.type === 'loop/output' && node.parentId) {
            const parent = nodeMap.get(node.parentId);
            if (parent?.type === 'group' && parent.data?.loop?.kind === 'loop') {
                loopOutputToGroup.set(node.id, parent.id);
            }
        }
    }
    const isLoopGroup = (node: Node<TSLNodeData>) =>
        node.type === 'group' && node.data?.loop?.kind === 'loop';

    const compiledNodes = new Map<string, CompiledNode>();
    const usedNames = new Set<string>();
    const nodeIndex = { value: 0 };

    const loopAncestorCache = new Map<string, string | null>();
    const getLoopAncestorId = (nodeId: string): string | null => {
        if (loopAncestorCache.has(nodeId)) {
            return loopAncestorCache.get(nodeId) ?? null;
        }
        const current = nodeMap.get(nodeId);
        let parentId = current?.parentId ?? null;
        while (parentId) {
            const parent = nodeMap.get(parentId);
            if (parent?.type === 'group' && parent.data?.loop?.kind === 'loop') {
                loopAncestorCache.set(nodeId, parent.id);
                return parent.id;
            }
            parentId = parent?.parentId ?? null;
        }
        loopAncestorCache.set(nodeId, null);
        return null;
    };

    const buildScopeGraph = (scopeLoopId: string | null) => {
        const scopeNodes = nodes.filter(n => getLoopAncestorId(n.id) === scopeLoopId);
        const scopeNodeIds = new Set(scopeNodes.map(n => n.id));
        const loopGroups = scopeNodes.filter(isLoopGroup);
        const loopGroupIds = new Set(loopGroups.map(n => n.id));
        const loopChildToLoopId = new Map<string, string>();

        for (const n of nodes) {
            const loopAncestor = getLoopAncestorId(n.id);
            if (loopAncestor && loopGroupIds.has(loopAncestor)) {
                loopChildToLoopId.set(n.id, loopAncestor);
            }
        }

        const scopeEdges: Edge[] = [];

        for (const edge of edges) {
            const sourceInScope = scopeNodeIds.has(edge.source);
            const targetInScope = scopeNodeIds.has(edge.target);
            const sourceLoop = loopChildToLoopId.get(edge.source);
            const targetLoop = loopChildToLoopId.get(edge.target);
            const sourceAncestor = getLoopAncestorId(edge.source);
            const targetAncestor = getLoopAncestorId(edge.target);

            if (!sourceInScope && targetInScope && targetAncestor === scopeLoopId) {
                scopeEdges.push(edge);
                continue;
            }

            if (scopeLoopId === null && sourceInScope && !targetInScope && targetAncestor) {
                scopeEdges.push({
                    ...edge,
                    id: `loop-dep-${edge.id}`,
                    target: targetAncestor,
                });
                continue;
            }

            if (scopeLoopId === null && sourceLoop && !targetLoop && targetInScope) {
                const sourceNode = nodeMap.get(edge.source);
                if (sourceNode?.type === 'loop/output') {
                    const sourceHandle = sourceNode.data?.loopPort?.portId ?? edge.sourceHandle ?? 'out';
                    scopeEdges.push({
                        ...edge,
                        id: `loop-out-${edge.id}`,
                        source: sourceLoop,
                        sourceHandle,
                    });
                }
                continue;
            }

            if (sourceInScope && targetInScope) {
                scopeEdges.push(edge);
                continue;
            }

            if (sourceLoop || targetLoop) {
                if (sourceLoop && targetLoop && sourceLoop === targetLoop) {
                    continue; // internal to a nested loop
                }

                if (sourceLoop && targetLoop && sourceLoop !== targetLoop) {
                    const sourceNode = nodeMap.get(edge.source);
                    const targetNode = nodeMap.get(edge.target);
                    if (sourceNode?.type === 'loop/output' && targetNode?.type === 'loop/input') {
                        const sourceHandle = sourceNode.data?.loopPort?.portId ?? edge.sourceHandle ?? 'out';
                        const targetHandle = targetNode.data?.loopPort?.portId ?? edge.targetHandle ?? 'in';
                        scopeEdges.push({
                            ...edge,
                            id: `loop-edge-${edge.id}`,
                            source: sourceLoop,
                            target: targetLoop,
                            sourceHandle,
                            targetHandle,
                        });
                    }
                    continue;
                }

                if (!sourceLoop && targetLoop && sourceInScope) {
                    scopeEdges.push(edge);
                    continue;
                }

                if (sourceLoop && !targetLoop && targetInScope) {
                    const sourceNode = nodeMap.get(edge.source);
                    if (sourceNode?.type === 'loop/output') {
                        const sourceHandle = sourceNode.data?.loopPort?.portId ?? edge.sourceHandle ?? 'out';
                        scopeEdges.push({
                            ...edge,
                            id: `loop-edge-${edge.id}`,
                            source: sourceLoop,
                            sourceHandle,
                        });
                    }
                    continue;
                }
            }
        }

        return { scopeNodes, scopeEdges };
    };

    const compileNodeInstance = (
        node: Node<TSLNodeData>,
        scopeEdges: Edge[],
        localCompiled: Map<string, CompiledNode>,
        lineIndent: string,
        outLines: string[]
    ): CompiledNode | null => {
        // Handle Subgraph Instance
        if (node.data.type.startsWith('custom/')) {
            const funcName = usedSubgraphs.get(node.data.type);
            const subgraph = subgraphs?.[node.data.type];

            if (funcName && subgraph) {
                const localName = node.data.localName || (node.data.values?.localName as string | undefined);
                const baseName = localName
                    ? String(localName).replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&')
                    : `_subgraph_inst_${nodeIndex.value++}`;

                const displayName = makeUniqueName(baseName, usedNames);

                const args: string[] = [];
                for (const inputPort of subgraph.inputs) {
                    const edge = scopeEdges.find(e => e.target === node.id && e.targetHandle === inputPort.id);
                    if (edge) {
                        const upstream = localCompiled.get(edge.source);
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

                outLines.push(`${lineIndent}const ${displayName} = ${funcName}(${args.join(', ')});`);
                return {
                    id: node.id,
                    varName: displayName,
                    code: `/* ${funcName} call */`,
                    singleOutput: subgraph.outputs.length === 1,
                };
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
                    : `_code_node_${nodeIndex.value++}`;

                const displayName = makeUniqueName(baseName, usedNames);

                const args: string[] = [];
                for (const inputPort of codeNode.inputs) {
                    const edge = scopeEdges.find(e => e.target === node.id && e.targetHandle === inputPort.id);
                    if (edge) {
                        const upstream = localCompiled.get(edge.source);
                        if (upstream) {
                            const swizzle = getSwizzleSuffix(edge.sourceHandle, upstream.singleOutput);
                            args.push(`${upstream.varName}${swizzle}`);
                        } else {
                            args.push(getTSLDefaultForType(inputPort.type));
                        }
                    } else {
                        const nodeValue = node.data.values?.[inputPort.id];
                        args.push(getTSLDefaultForType(inputPort.type, nodeValue));
                    }
                }

                outLines.push(`${lineIndent}const ${displayName} = ${funcName}(${args.join(', ')});`);
                return {
                    id: node.id,
                    varName: displayName,
                    code: `/* ${funcName} call */`,
                    singleOutput: true,
                };
            }
        }

        if (node.data.type === 'math/multiOp') {
            const localName = node.data.localName || (node.data.values?.localName as string | undefined);
            const baseName = localName
                ? String(localName).replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&')
                : `_node${nodeIndex.value++}`;

            const displayName = makeUniqueName(baseName, usedNames);
            const code = compileMultiOpChain(node, scopeEdges, localCompiled);
            outLines.push(`${lineIndent}const ${displayName} = ${code};`);
            return {
                id: node.id,
                varName: displayName,
                code,
                singleOutput: true,
            };
        }

        const def = registry.get(node.data.type);
        if (!def) {
            outLines.push(`${lineIndent}// Unknown node type: ${node.data.type}`);
            return null;
        }

        const localName = node.data.localName || (node.data.values?.localName as string | undefined);
        const baseName = localName
            ? String(localName).replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&')
            : `_node${nodeIndex.value++}`;

        const displayName = makeUniqueName(baseName, usedNames);

        const inputs = def.inputs ?? {};
        const inputKeys = Object.keys(inputs);
        let code: string;

        if (ASSIGN_NODE_TYPES.has(def.type)) {
            const hasTarget = scopeEdges.some(e => e.target === node.id && e.targetHandle === 'target');
            if (!hasTarget) {
                return null;
            }
            const targetExpr = getInputValue(node, 'target', scopeEdges, localCompiled, inputs['target']);
            const valueExpr = getInputValue(node, 'value', scopeEdges, localCompiled, inputs['value']);
            outLines.push(`${lineIndent}${targetExpr}.${def.tsl}(${valueExpr});`);
            return {
                id: node.id,
                varName: targetExpr,
                code: `${targetExpr}.${def.tsl}(${valueExpr})`,
                singleOutput: true,
            };
        } else if (def.pure && inputKeys.length === 0) {
            code = def.callable ? `${def.tsl}()` : def.tsl;
        } else if (def.type === 'geo/uv') {
            const index = Number(node.data.values?.['index'] ?? 0);
            code = `uv(${index})`;
        } else if (def.type === 'geo/instanceCount') {
            const count = Number(node.data.values?.['value'] ?? 0);
            code = `int(${count})`;
        } else if (def.type === 'math/split') {
            code = getInputValue(node, 'in', scopeEdges, localCompiled, inputs['in']);
        } else if (def.type === 'texture/sample') {
            const url = getStringValue(node, 'url', inputs['url']);
            const texVarName = `${baseName}_tex`;
            outLines.push(`${lineIndent}const ${texVarName} = new THREE.TextureLoader().load("${url}");`);
            outLines.push(`${lineIndent}${texVarName}.colorSpace = THREE.SRGBColorSpace;`);

            const wrapS = node.data.values?.['wrapS'] ?? inputs['wrapS']?.default ?? 'RepeatWrapping';
            const wrapT = node.data.values?.['wrapT'] ?? inputs['wrapT']?.default ?? 'RepeatWrapping';
            const minFilter = node.data.values?.['minFilter'] ?? inputs['minFilter']?.default ?? 'LinearMipmapLinearFilter';
            const magFilter = node.data.values?.['magFilter'] ?? inputs['magFilter']?.default ?? 'LinearFilter';

            outLines.push(`${lineIndent}${texVarName}.wrapS = THREE.${wrapS};`);
            outLines.push(`${lineIndent}${texVarName}.wrapT = THREE.${wrapT};`);
            outLines.push(`${lineIndent}${texVarName}.minFilter = THREE.${minFilter};`);
            outLines.push(`${lineIndent}${texVarName}.magFilter = THREE.${magFilter};`);

            const uvInput = inputs['uv'];
            const uvEdge = scopeEdges.find(e => e.target === node.id && e.targetHandle === 'uv');

            let uvCode = '';
            if (uvEdge) {
                const uvVar = getInputValue(node, 'uv', scopeEdges, localCompiled, uvInput);
                uvCode = `, ${uvVar}`;
            }
            code = `texture(${texVarName}${uvCode})`;
        } else if (def.type === 'texture/viewportShared') {
            const uvEdge = scopeEdges.find(e => e.target === node.id && e.targetHandle === 'uv');
            if (uvEdge) {
                const uvArg = getInputValue(node, 'uv', scopeEdges, localCompiled, inputs['uv']);
                code = `${def.tsl}(${uvArg})`;
            } else {
                code = `${def.tsl}()`;
            }
        } else if (def.type === 'texture/triplanar') {
            const texEdge = scopeEdges.find(e => e.target === node.id && e.targetHandle === 'texture');
            let texArg = 'color(1.0, 0.0, 1.0)';
            if (texEdge) {
                texArg = getInputValue(node, 'texture', scopeEdges, localCompiled, inputs['texture']);
            }

            const scaleArg = getInputValue(node, 'scale', scopeEdges, localCompiled, inputs['scale']);
            const posEdge = scopeEdges.find(e => e.target === node.id && e.targetHandle === 'position');
            const posArg = posEdge ? getInputValue(node, 'position', scopeEdges, localCompiled, inputs['position']) : 'undefined';
            const normalEdge = scopeEdges.find(e => e.target === node.id && e.targetHandle === 'normal');
            const normalArg = normalEdge ? getInputValue(node, 'normal', scopeEdges, localCompiled, inputs['normal']) : 'undefined';
            code = `${def.tsl}(${texArg}, null, null, ${scaleArg}, ${posArg}, ${normalArg})`;
        } else if (inputKeys.length === 0) {
            code = `${def.tsl}()`;
        } else {
            const args = inputKeys.filter(k => !inputs[k].propertyOnly).map(key =>
                getInputValue(node, key, scopeEdges, localCompiled, inputs[key])
            );
            code = `${def.tsl}(${args.join(', ')})`;
        }

        outLines.push(`${lineIndent}const ${displayName} = ${code};`);
        return {
            id: node.id,
            varName: displayName,
            code,
        };
    };

    const compileScope = (
        scopeParentId: string | null,
        scopeCompiled: Map<string, CompiledNode>,
        outLines: string[],
        lineIndent: string,
        excludeIds: Set<string> = new Set()
    ) => {
        const { scopeNodes, scopeEdges } = buildScopeGraph(scopeParentId);
        const scopedNodes = scopeNodes.filter(n => {
            if (excludeIds.has(n.id)) return false;
            if ((MATERIAL_NODE_TYPES as readonly string[]).includes(n.data.type)) return false;
            if (n.data.type === 'subgraph/input' || n.data.type === 'subgraph/output') return false;
            if (n.type === 'loop/input') return false;
            return true;
        });

        const sorted = topologicalSort(scopedNodes, scopeEdges);

        for (const nodeId of sorted) {
            const node = nodeMap.get(nodeId);
            if (!node) continue;

            if (isLoopGroup(node)) {
                const loopId = node.id;
                const childNodes = nodes.filter(n => n.parentId === loopId);
                const outputPorts = childNodes.filter(n => n.type === 'loop/output');
                const indexNode = childNodes.find(n => n.type === 'loop/index' || n.id === node.data?.loop?.indexNodeId);
                const accNodeId = node.data?.loop?.accNodeId;
                const accNode = accNodeId ? nodeMap.get(accNodeId) : childNodes.find(n => n.type === 'advanced/var');
                const inputNodes = childNodes.filter(n => n.type === 'loop/input');
                const countInput = inputNodes.find(p => p.id === node.data?.loop?.countPortId || p.data?.loopPort?.role === 'count');
                const initInput = inputNodes.find(p => p.id === node.data?.loop?.initPortId || p.data?.loopPort?.role === 'init');

                const getLegacyInputExpr = (portNode: Node<TSLNodeData> | undefined, type: string, fallback: unknown) => {
                    if (!portNode) return getTSLDefaultForType(type, fallback);
                    const edge = edges.find(e => e.target === portNode.id);
                    if (edge) {
                        const upstream = scopeCompiled.get(edge.source);
                        if (upstream) {
                            const swizzle = getSwizzleSuffix(edge.sourceHandle, upstream.singleOutput);
                            return `${upstream.varName}${swizzle}`;
                        }
                    }
                    return getTSLDefaultForType(type, fallback);
                };

                const countExpr = getLegacyInputExpr(countInput, 'int', node.data?.values?.count ?? 1);
                const initExpr = getLegacyInputExpr(initInput, 'float', node.data?.values?.init ?? 0);

                const localName = node.data.localName || (node.data.values?.localName as string | undefined);
                const baseName = localName
                    ? String(localName).replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&')
                    : `_loop${nodeIndex.value++}`;

                const loopFnName = makeUniqueName(`${baseName}_fn`, usedNames);
                const loopOutName = makeUniqueName(baseName, usedNames);
                const accVarName = makeUniqueName(`${baseName}_acc`, usedNames);

                const initVar = initExpr;
                const countVar = countExpr;

                outLines.push(`${lineIndent}const ${loopFnName} = Fn(() => {`);
                const innerIndent = `${lineIndent}  `;
                outLines.push(`${innerIndent}const ${accVarName} = Var(${initVar});`);
                const indexName = indexNode ? 'i' : 'i';
                outLines.push(`${innerIndent}Loop(${countVar}, ({ ${indexName} }) => {`);

                const bodyLines: string[] = [];
                const loopCompiled = new Map<string, CompiledNode>(scopeCompiled);

                if (indexNode) {
                    loopCompiled.set(indexNode.id, {
                        id: indexNode.id,
                        varName: indexName,
                        code: indexName,
                        singleOutput: true,
                    });
                }

                if (accNode) {
                    loopCompiled.set(accNode.id, {
                        id: accNode.id,
                        varName: accVarName,
                        code: accVarName,
                        singleOutput: true,
                    });
                }

                const excludeIds = new Set<string>([
                    ...outputPorts.map(p => p.id),
                ]);
                if (indexNode) excludeIds.add(indexNode.id);
                if (accNode) excludeIds.add(accNode.id);

                compileScope(loopId, loopCompiled, bodyLines, `${innerIndent}  `, excludeIds);
                for (const line of bodyLines) {
                    outLines.push(line);
                }

                const { scopeEdges: loopScopeEdges } = buildScopeGraph(loopId);
                const outputPortId = outputPorts[0]?.id;
                const outputEdge = outputPortId
                    ? loopScopeEdges.find(e => e.target === outputPortId)
                    : undefined;
                const outputSource = outputEdge ? loopCompiled.get(outputEdge.source) : undefined;
                const outputExpr = outputSource
                    ? `${outputSource.varName}${getSwizzleSuffix(outputEdge?.sourceHandle, outputSource.singleOutput)}`
                    : 'float(0)';

                outLines.push(`${innerIndent}});`);
                outLines.push(`${innerIndent}return ${outputExpr};`);
                outLines.push(`${lineIndent}});`);
                outLines.push(`${lineIndent}const ${loopOutName} = ${loopFnName}();`);

                scopeCompiled.set(node.id, {
                    id: node.id,
                    varName: loopOutName,
                    code: loopOutName,
                    singleOutput: true,
                });

                continue;
            }

            const compiled = compileNodeInstance(node, scopeEdges, scopeCompiled, lineIndent, outLines);
            if (compiled) {
                scopeCompiled.set(node.id, compiled);
            }
        }
    };

    const { scopeEdges: mainEdges } = buildScopeGraph(null);
    compileScope(null, compiledNodes, lines, '');

    // Generate material code
    const materialNode = nodes.find(n => (MATERIAL_NODE_TYPES as readonly string[]).includes(n.data.type));
    if (materialNode) {
        const materialDef = registry.get(materialNode.data.type);
        if (materialDef) {
            lines.push('');
            lines.push('// Material');
            lines.push(`const material = new ${materialDef.tsl}();`);

            const inputKeys = Object.keys(materialDef.inputs ?? {});
            for (const key of inputKeys) {
                const inputDef = materialDef.inputs![key];

                // 1. Check for connection
                const varName = getMaterialInputVar(materialNode, key, mainEdges, compiledNodes, loopOutputToGroup);
                if (varName) {
                    lines.push(`material.${key} = ${varName};`);
                    continue;
                }

                // 2. Use local value (properties panel)
                // Skip connection-only inputs that aren't connected
                if (inputDef.connectionOnly) continue;

                // 3. Handle raw material properties (depthWrite, blending, etc)
                if (inputDef.isMaterialProp) {
                    // Use local value (properties panel)
                    const val = materialNode.data.values?.[key] ?? inputDef.default;

                    // Assign direclty
                    lines.push(`material.${key} = ${val};`);
                    continue;
                }

                const valExpression = getInputValue(materialNode, key, mainEdges, compiledNodes, inputDef);

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
    subgraphs?: Record<string, SubgraphDefinition>
): string[] {
    const imports = new Set<string>();
    let hasLoops = false;

    // Check for material node and add its import
    const materialNode = nodes.find(n => (MATERIAL_NODE_TYPES as readonly string[]).includes(n.data.type));
    if (materialNode) {
        const def = registry.get(materialNode.data.type);
        if (def) {
            imports.add(def.tsl);
        }
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
            // If internal node is subgraph instance (nested), recurse
            if (node.data.type.startsWith('custom/') && subgraphs) {
                const nested = subgraphs[node.data.type];
                if (nested) collectSubgraphImports(nested, seenSubgraphs);
            } else if (node.data.type === 'math/multiOp') {
                const ops = getMultiOpOperations(node);
                addMultiOpImports(ops);
            } else {
                const def = registry.get(node.data.type);
                if (def) imports.add(def.tsl);
            }

            // Collect vec imports from values
            if (node.data.values) {
                for (const value of Object.values(node.data.values)) {
                    if (Array.isArray(value)) {
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
        if (node.type === 'group' && node.data?.loop?.kind === 'loop') {
            hasLoops = true;
        }

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

        // Handle Code Nodes - they use Fn
        if (node.data.type.startsWith('code/')) {
            hasSubgraphs = true;
            continue;
        }

        if (ASSIGN_NODE_TYPES.has(node.data.type)) {
            continue;
        }

        const def = registry.get(node.data.type);
        if (def) {
            imports.add(def.tsl);
        }

        // Check node values for arrays (vectors) to add vec imports
        if (node.data.values) {
            for (const value of Object.values(node.data.values)) {
                if (Array.isArray(value)) {
                    if (value.length === 2) imports.add('vec2');
                    else if (value.length === 3) imports.add('vec3');
                    else if (value.length === 4) imports.add('vec4');
                }
            }
        }
    }

    if (hasSubgraphs) {
        imports.add('Fn');
    }

    if (hasLoops) {
        imports.add('Loop');
        imports.add('Var');
        imports.add('Fn');
        imports.add('float');
        imports.add('int');
    }

    return Array.from(imports).sort();
}
