import { Node, Edge } from '@xyflow/react';
import { TSLNodeData } from '@/components/TSLNode';
import { registry } from './registry';
import { MATERIAL_NODE_TYPES } from './nodes';

interface CompiledNode {
    id: string;
    varName: string;
    code: string;
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
 * Topologically sort nodes so dependencies come first.
 */
function topologicalSort(nodes: Node<TSLNodeData>[], edges: Edge[]): string[] {
    const nodeIds = new Set(nodes.map(n => n.id));
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const id of nodeIds) {
        inDegree.set(id, 0);
        adjacency.set(id, []);
    }

    for (const edge of edges) {
        if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
            adjacency.get(edge.source)!.push(edge.target);
            inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
        }
    }

    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
        if (degree === 0) queue.push(id);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
        const current = queue.shift()!;
        sorted.push(current);

        for (const neighbor of adjacency.get(current) || []) {
            const newDegree = (inDegree.get(neighbor) || 1) - 1;
            inDegree.set(neighbor, newDegree);
            if (newDegree === 0) queue.push(neighbor);
        }
    }

    return sorted;
}

/**
 * Get swizzle suffix for a source handle.
 */
function getSwizzleSuffix(sourceHandle: string | null | undefined): string {
    if (!sourceHandle || sourceHandle === 'out') {
        return '';
    }
    const swizzle = COMPONENT_SWIZZLES[sourceHandle];
    return swizzle ? `.${swizzle}` : '';
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
    inputDef: { type: string; default?: number | number[] | string }
): string {
    const edge = edges.find(e => e.target === node.id && e.targetHandle === inputKey);

    if (edge) {
        const upstream = compiledNodes.get(edge.source);
        if (upstream) {
            const swizzle = getSwizzleSuffix(edge.sourceHandle);
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

    const num = Number(value ?? 0);
    if (inputDef.type === 'int' || inputDef.type === 'uint') {
        return String(Math.round(num));
    }

    return String(num);
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
            const swizzle = getSwizzleSuffix(edge.sourceHandle);
            return `${upstream.varName}${swizzle}`;
        }
    }
    return null;
}

/**
 * Compile a graph of nodes and edges into TSL code.
 */
export function compileGraph(nodes: Node<TSLNodeData>[], edges: Edge[]): string {
    if (nodes.length === 0) {
        return '// No nodes in graph';
    }

    // Find material node
    const materialNode = nodes.find(n => MATERIAL_NODE_TYPES.includes(n.data.type));

    // Filter out material nodes for initial compilation
    const otherNodes = nodes.filter(n => !MATERIAL_NODE_TYPES.includes(n.data.type));
    const sorted = topologicalSort(otherNodes, edges);
    const compiledNodes = new Map<string, CompiledNode>();
    const lines: string[] = [];

    lines.push('// Generated TSL Code');
    lines.push('');

    let nodeIndex = 0;
    for (const nodeId of sorted) {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) continue;

        const def = registry.get(node.data.type);
        if (!def) {
            lines.push(`// Unknown node type: ${node.data.type}`);
            continue;
        }

        const varName = `_node${nodeIndex++}`;
        const inputs = def.inputs ?? {};
        const inputKeys = Object.keys(inputs);

        let code: string;

        if (def.pure && inputKeys.length === 0) {
            code = def.tsl;
        } else if (inputKeys.length === 0) {
            code = `${def.tsl}()`;
        } else {
            const args = inputKeys.map(key =>
                getInputValue(node, key, edges, compiledNodes, inputs[key])
            );
            code = `${def.tsl}(${args.join(', ')})`;
        }

        lines.push(`const ${varName} = ${code};`);

        compiledNodes.set(nodeId, {
            id: nodeId,
            varName,
            code,
        });
    }

    // Generate material code
    if (materialNode) {
        const materialDef = registry.get(materialNode.data.type);
        if (materialDef) {
            lines.push('');
            lines.push('// Material');
            lines.push(`const material = new ${materialDef.tsl}();`);

            const inputKeys = Object.keys(materialDef.inputs ?? {});
            for (const key of inputKeys) {
                const varName = getMaterialInputVar(materialNode, key, edges, compiledNodes);
                if (varName) {
                    lines.push(`material.${key} = ${varName};`);
                }
            }
        }
    }

    return lines.join('\n');
}

/**
 * Get a list of TSL imports needed for the compiled code.
 */
export function getRequiredImports(nodes: Node<TSLNodeData>[]): string[] {
    const imports = new Set<string>();

    // Check for material node and add its import
    const materialNode = nodes.find(n => MATERIAL_NODE_TYPES.includes(n.data.type));
    if (materialNode) {
        const def = registry.get(materialNode.data.type);
        if (def) {
            imports.add(def.tsl);
        }
    }

    for (const node of nodes) {
        if (MATERIAL_NODE_TYPES.includes(node.data.type)) continue;

        const def = registry.get(node.data.type);
        if (def) {
            imports.add(def.tsl);
        }
    }

    return Array.from(imports).sort();
}
