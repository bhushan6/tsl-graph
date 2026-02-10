import { Node, Edge } from '@xyflow/react';
import { TSLNodeData, SubgraphDefinition, CodeNodeDefinition, type Port } from '@/lib/types';
import { registry } from './registry';
import { MATERIAL_NODE_TYPES } from './nodes';
import { topologicalSort } from './graph-utils';
import { getMultiOpHandleId, getMultiOpParams, type MultiOp } from './multi-op';
import { formatUniformValueExpression, getUniformKindFromNode } from './uniform-utils';

interface CompiledNode {
    id: string;
    varName: string;
    code: string;
    singleOutput?: boolean;
}

export interface CompileOptions {
    uniformMode?: 'inline' | 'runtime';
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

const LOOP_INTERNAL_NODE_TYPES = new Set([
    'loop/count',
    'loop/index',
    'loop/accumulator',
    'loop/output',
]);

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

function getAssignTargetExpression(
    node: Node<TSLNodeData>,
    edges: Edge[],
    compiledNodes: Map<string, CompiledNode>,
    argsMap?: Record<string, string>
): string | null {
    const edge = edges.find(e => e.target === node.id && e.targetHandle === 'target');
    if (!edge) return null;

    if (edge.source === 'subgraph-input' && argsMap && edge.sourceHandle) {
        return argsMap[edge.sourceHandle] || null;
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
    codeNodesMap?: Record<string, CodeNodeDefinition>
): string[] {
    if (subgraph.nodes.some((n) => n.data.type === 'const/uniform')) {
        throw new Error('Uniform nodes are not supported inside subgraphs yet.');
    }

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

        const assignMethod = ASSIGN_NODE_METHODS[node.data.type];
        if (assignMethod) {
            const targetExpr = getAssignTargetExpression(node, internalEdges, compiledNodes, argsMap);
            const valueExpr = getInputValue(node, 'value', internalEdges, compiledNodes, { type: 'any', default: 0 }, argsMap);

            if (targetExpr) {
                lines.push(`    ${targetExpr}.${assignMethod}(${valueExpr});`);
                compiledNodes.set(nodeId, {
                    id: nodeId,
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

                lines.push(`    const ${displayName} = ${valueExpr};`);
                compiledNodes.set(nodeId, {
                    id: nodeId,
                    varName: displayName,
                    code: valueExpr,
                    singleOutput: true,
                });
            }
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
    codeNodes?: Record<string, CodeNodeDefinition>,
    options: CompileOptions = {}
): string {
    if (nodes.length === 0) {
        return '// No nodes in graph';
    }

    const uniformMode = options.uniformMode ?? 'inline';

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

    const nodesById = new Map(nodes.map(n => [n.id, n]));

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
    for (const edge of edges) {
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
        !isLoopInternalNode(n)
    );

    const sorted = topologicalSort(otherNodes, loopAwareEdges);
    const compiledNodes = new Map<string, CompiledNode>();
    const usedNames = new Set<string>();
    let nodeIndex = 0;

    const compileSingleNode = (node: Node<TSLNodeData>, targetLines: string[], edgesForInputs: Edge[]) => {
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
                for (const inputPort of codeNode.inputs) {
                    const edge = edgesForInputs.find(e => e.target === node.id && e.targetHandle === inputPort.id);
                    if (edge) {
                        const upstream = compiledNodes.get(edge.source);
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

                targetLines.push(`const ${displayName} = ${funcName}(${args.join(', ')});`);

                compiledNodes.set(node.id, {
                    id: node.id,
                    varName: displayName,
                    code: `/* ${funcName} call */`,
                    singleOutput: true
                });
                return;
            }
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
            targetLines.push(`const ${displayName} = ${code};`);

            compiledNodes.set(node.id, {
                id: node.id,
                varName: displayName,
                code,
                singleOutput: true,
            });
            return;
        }

        const assignMethod = ASSIGN_NODE_METHODS[node.data.type];
        if (assignMethod) {
            const targetExpr = getAssignTargetExpression(node, edgesForInputs, compiledNodes);
            const valueExpr = getInputValue(node, 'value', edgesForInputs, compiledNodes, { type: 'any', default: 0 });

            if (targetExpr) {
                targetLines.push(`${targetExpr}.${assignMethod}(${valueExpr});`);
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

        if (def.pure && inputKeys.length === 0) {
            code = def.callable ? `${def.tsl}()` : def.tsl;
        } else if (def.type === 'geo/uv') {
            const index = Number(node.data.values?.['index'] ?? 0);
            code = `uv(${index})`;
        } else if (def.type === 'geo/instanceCount') {
            const count = Number(node.data.values?.['value'] ?? 0);
            code = `int(${count})`;
        } else if (def.type === 'math/split') {
            code = getInputValue(node, 'in', edgesForInputs, compiledNodes, inputs['in']);
        } else if (def.type === 'texture/sample') {
            const url = getStringValue(node, 'url', inputs['url']);

            const texVarName = `${baseName}_tex`;
            targetLines.push(`const ${texVarName} = new THREE.TextureLoader().load("${url}");`);
            targetLines.push(`${texVarName}.colorSpace = THREE.SRGBColorSpace;`);

            const wrapS = node.data.values?.['wrapS'] ?? inputs['wrapS']?.default ?? 'RepeatWrapping';
            const wrapT = node.data.values?.['wrapT'] ?? inputs['wrapT']?.default ?? 'RepeatWrapping';
            const minFilter = node.data.values?.['minFilter'] ?? inputs['minFilter']?.default ?? 'LinearMipmapLinearFilter';
            const magFilter = node.data.values?.['magFilter'] ?? inputs['magFilter']?.default ?? 'LinearFilter';

            targetLines.push(`${texVarName}.wrapS = THREE.${wrapS};`);
            targetLines.push(`${texVarName}.wrapT = THREE.${wrapT};`);
            targetLines.push(`${texVarName}.minFilter = THREE.${minFilter};`);
            targetLines.push(`${texVarName}.magFilter = THREE.${magFilter};`);

            const uvInput = inputs['uv'];
            const uvEdge = edgesForInputs.find(e => e.target === node.id && e.targetHandle === 'uv');

            let uvCode = '';
            if (uvEdge) {
                const uvVar = getInputValue(node, 'uv', edgesForInputs, compiledNodes, uvInput);
                uvCode = `, ${uvVar}`;
            }
            code = `texture(${texVarName}${uvCode})`;
        } else if (def.type === 'texture/viewportShared') {
            const uvEdge = edgesForInputs.find(e => e.target === node.id && e.targetHandle === 'uv');

            if (uvEdge) {
                const uvArg = getInputValue(node, 'uv', edgesForInputs, compiledNodes, inputs['uv']);
                code = `${def.tsl}(${uvArg})`;
            } else {
                code = `${def.tsl}()`;
            }
        } else if (def.type === 'texture/triplanar') {
            const texEdge = edgesForInputs.find(e => e.target === node.id && e.targetHandle === 'texture');
            let texArg = 'color(1.0, 0.0, 1.0)';

            if (texEdge) {
                texArg = getInputValue(node, 'texture', edgesForInputs, compiledNodes, inputs['texture']);
            }

            const scaleArg = getInputValue(node, 'scale', edgesForInputs, compiledNodes, inputs['scale']);

            const posEdge = edgesForInputs.find(e => e.target === node.id && e.targetHandle === 'position');
            const posArg = posEdge ? getInputValue(node, 'position', edgesForInputs, compiledNodes, inputs['position']) : 'undefined';

            const normalEdge = edgesForInputs.find(e => e.target === node.id && e.targetHandle === 'normal');
            const normalArg = normalEdge ? getInputValue(node, 'normal', edgesForInputs, compiledNodes, inputs['normal']) : 'undefined';

            code = `${def.tsl}(${texArg}, null, null, ${scaleArg}, ${posArg}, ${normalArg})`;
        } else if (inputKeys.length === 0) {
            code = `${def.tsl}()`;
        } else {
            const args = inputKeys.filter(k => !inputs[k].propertyOnly).map(key =>
                getInputValue(node, key, edgesForInputs, compiledNodes, inputs[key])
            );
            code = `${def.tsl}(${args.join(', ')})`;
        }

        targetLines.push(`const ${displayName} = ${code};`);

        compiledNodes.set(node.id, {
            id: node.id,
            varName: displayName,
            code,
        });
    };

    const compileLoopGroup = (loopNode: Node<TSLNodeData>, targetLines: string[]) => {
        const loopId = loopNode.id;
        const internalNodes = nodes.filter(n => n.parentId === loopId);

        const countNode = internalNodes.find(n => n.data.type === 'loop/count');
        const indexNode = internalNodes.find(n => n.data.type === 'loop/index');
        const accNode = internalNodes.find(n => n.data.type === 'loop/accumulator');
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
        const loopFnName = reserveName(`${loopVarName}_fn`);
        const accVarName = reserveName(`${loopVarName}_acc`);

        const countExpr = countNode
            ? getInputValue(countNode, 'count', edges, compiledNodes, { type: 'int', default: 1 })
            : '1';

        targetLines.push(`const ${countVarName} = max(int(${countExpr}), 0);`);

        let seedExpr = getTSLDefaultForType('any');
        if (accNode) {
            const seedEdge = edges.find(e => e.target === accNode.id && e.targetHandle === 'seed');
            const seedValue = accNode.data.values?.['seed'];
            if (seedEdge || seedValue !== undefined) {
                seedExpr = getInputValue(accNode, 'seed', edges, compiledNodes, { type: 'any', default: 0 });
            }
        }
        targetLines.push(`const ${loopFnName} = Fn(() => {`);
        targetLines.push(`    const ${accVarName} = Var(${seedExpr});`);
        targetLines.push(`    Loop(${countVarName}, ({ i }) => {`);

        if (countNode) {
            compiledNodes.set(countNode.id, { id: countNode.id, varName: countVarName, code: countVarName, singleOutput: true });
        }
        if (indexNode) {
            compiledNodes.set(indexNode.id, { id: indexNode.id, varName: 'i', code: 'i', singleOutput: true });
        }
        if (accNode) {
            compiledNodes.set(accNode.id, { id: accNode.id, varName: accVarName, code: accVarName, singleOutput: true });
        }
        if (outputNode) {
            compiledNodes.set(outputNode.id, { id: outputNode.id, varName: loopVarName, code: loopVarName, singleOutput: true });
        }

        const bodyNodes = internalNodes.filter(n => !LOOP_INTERNAL_NODE_TYPES.has(n.data.type));
        const bodySorted = topologicalSort(bodyNodes, edges);
        const innerLines: string[] = [];

        for (const nodeId of bodySorted) {
            const node = nodesById.get(nodeId);
            if (!node) continue;
            compileSingleNode(node, innerLines, edges);
        }

        if (outputNode) {
            const outputEdge = edges.find(e => e.target === outputNode.id && e.targetHandle === 'next');
            if (outputEdge) {
                const nextExpr = getInputValue(outputNode, 'next', edges, compiledNodes, { type: 'any', default: 0 });
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

        compileSingleNode(node, lines, edges);
    }

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
                const varName = getMaterialInputVar(materialNode, key, edges, compiledNodes);
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
    subgraphs?: Record<string, SubgraphDefinition>
): string[] {
    const imports = new Set<string>();

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
                if (def && !def.tsl.startsWith('__')) imports.add(def.tsl);
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

        const def = registry.get(node.data.type);
        if (def && !def.tsl.startsWith('__')) {
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
