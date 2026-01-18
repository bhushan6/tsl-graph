import { Node, Edge } from '@xyflow/react';
import { TSLNodeData, SubgraphDefinition, CodeNodeDefinition, type Port } from '@/lib/types';
import { registry } from './registry';
import { MATERIAL_NODE_TYPES } from './nodes';
import { topologicalSort } from './graph-utils';

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
        // Return just the quoted hex string - the TSL function wrapper is added by the caller
        const hex = String(value ?? '#ffffff');
        return `"${hex}"`;
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
    const lines: string[] = [];
    const internalNodes = subgraph.nodes;
    // We saved edges including those to anchor nodes in store/editor.ts
    const internalEdges = subgraph.edges;

    // Map inputs to argument names
    // input.id maps to the sourceHandle of edges coming from 'subgraph-input'
    const argsMap: Record<string, string> = {};
    const argNames = subgraph.inputs.map((input) => {
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

    // Filter out material nodes and subgraph anchor nodes for initial compilation
    const otherNodes = nodes.filter(n =>
        !(MATERIAL_NODE_TYPES as readonly string[]).includes(n.data.type) &&
        n.data.type !== 'subgraph/input' &&
        n.data.type !== 'subgraph/output'
    );

    const sorted = topologicalSort(otherNodes, edges);
    const compiledNodes = new Map<string, CompiledNode>();
    const usedNames = new Set<string>();
    let nodeIndex = 0;

    for (const nodeId of sorted) {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) continue;

        // Handle Subgraph Instance
        if (node.data.type.startsWith('custom/')) {
            const funcName = usedSubgraphs.get(node.data.type);
            const subgraph = subgraphs?.[node.data.type];

            if (funcName && subgraph) {
                // Generate unique name for this instance output
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

                // Collect arguments
                const args: string[] = [];
                for (const inputPort of subgraph.inputs) {
                    const edge = edges.find(e => e.target === node.id && e.targetHandle === inputPort.id);
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

                lines.push(`const ${displayName} = ${funcName}(${args.join(', ')});`);

                const isSingleOutput = subgraph.outputs.length === 1;

                compiledNodes.set(nodeId, {
                    id: nodeId,
                    varName: displayName,
                    code: `/* ${funcName} call */`,
                    singleOutput: isSingleOutput
                });
                continue;
            }
        }

        // Handle Code Node Instance
        if (node.data.type.startsWith('code/')) {
            const funcName = usedCodeNodes.get(node.data.type);
            const codeNode = codeNodes?.[node.data.type];

            if (funcName && codeNode) {
                // Generate unique name for this instance output
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

                // Collect arguments based on code node inputs
                const args: string[] = [];
                for (const inputPort of codeNode.inputs) {
                    const edge = edges.find(e => e.target === node.id && e.targetHandle === inputPort.id);
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

                lines.push(`const ${displayName} = ${funcName}(${args.join(', ')});`);

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

        const def = registry.get(node.data.type);
        if (!def) {
            lines.push(`// Unknown node type: ${node.data.type}`);
            continue;
        }

        // Use user-defined name if available, otherwise use auto-generated name
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
            // Special handling for UV node with index
            const index = Number(node.data.values?.['index'] ?? 0);
            code = `uv(${index})`;
        } else if (def.type === 'geo/instanceCount') {
            const count = Number(node.data.values?.['value'] ?? 0); // Default to 0 if not set
            code = `uint(${count})`;
        } else if (def.type === 'math/split') {
            // Special handling for Split node - pass through the input value
            // The compiler's swizzling logic will handle the output access (e.g. .x, .y)
            code = getInputValue(node, 'in', edges, compiledNodes, inputs['in']);
        } else if (def.type === 'texture/sample') {
            // Special handling for texture node
            const url = getStringValue(node, 'url', inputs['url']);

            // 1. Create Texture
            const texVarName = `${baseName}_tex`;
            lines.push(`const ${texVarName} = new THREE.TextureLoader().load("${url}");`);
            lines.push(`${texVarName}.colorSpace = THREE.SRGBColorSpace;`);

            // 2. Get UV input
            const uvInput = inputs['uv'];
            const uvEdge = edges.find(e => e.target === node.id && e.targetHandle === 'uv');

            let uvCode = '';
            if (uvEdge) {
                const uvVar = getInputValue(node, 'uv', edges, compiledNodes, uvInput);
                uvCode = `, ${uvVar}`;
            }

            code = `texture(${texVarName}${uvCode})`;
        } else if (inputKeys.length === 0) {
            code = `${def.tsl}()`;
        } else {
            const args = inputKeys.filter(k => !inputs[k].propertyOnly).map(key =>
                getInputValue(node, key, edges, compiledNodes, inputs[key])
            );
            code = `${def.tsl}(${args.join(', ')})`;
        }

        lines.push(`const ${displayName} = ${code};`);

        compiledNodes.set(nodeId, {
            id: nodeId,
            varName: displayName,
            code,
        });
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

                if (inputDef.type === 'color') {
                    // getInputValue returns quoted string for color, wrap in color()
                    wrappedVal = `color(${valExpression})`;
                } else if (inputDef.type === 'float') {
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

        // Handle subgraph instances
        if (node.data.type.startsWith('custom/') && subgraphs) {
            const subgraph = subgraphs[node.data.type];
            if (subgraph) {
                collectSubgraphImports(subgraph, seenSubgraphs);
            }
            continue;
        }

        // Handle Code Nodes - they use Fn
        if (node.data.type.startsWith('code/')) {
            hasSubgraphs = true;
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

    return Array.from(imports).sort();
}
