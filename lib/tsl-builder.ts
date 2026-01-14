import { Node, Edge } from '@xyflow/react';
import * as THREE from 'three/webgpu'; // For Material classes
import * as TSL from 'three/tsl'; // For TSL functions
import { TSLNodeData, SubgraphDefinition, CodeNodeDefinition } from '@/lib/types';
import { compileGraph } from './compiler';

/**
 * Build a Three.js material from the node graph by compiling to TSL and evaluating it.
 * This ensures the preview matches the generated code exactly.
 */
export function buildTSLMaterial(
    nodes: Node<TSLNodeData>[],
    edges: Edge[],
    subgraphs?: Record<string, SubgraphDefinition>,
    codeNodes?: Record<string, CodeNodeDefinition>
): THREE.Material {
    // 1. Compile the graph to TSL code
    const code = compileGraph(nodes, edges, subgraphs, codeNodes);

    // 2. Prepare the execution scope
    // We need all TSL functions (float, vec3, Fn, etc.) and Material classes available
    const scope = {
        ...TSL,
        // Ensure Material classes are available if not in TSL
        MeshStandardNodeMaterial: THREE.MeshStandardNodeMaterial,
        MeshBasicNodeMaterial: THREE.MeshBasicNodeMaterial,
        MeshPhysicalNodeMaterial: THREE.MeshPhysicalNodeMaterial,
        MeshPhongNodeMaterial: THREE.MeshPhongNodeMaterial,
        THREE: THREE, // Expose THREE namespace for TextureLoader
    };

    const scopeKeys = Object.keys(scope);
    const scopeValues = Object.values(scope);

    // 3. Wrap code in a function that returns the material
    // The generated code ends with 'const material = ...;'
    // We append 'return material;' to get the result.
    const functionBody = `
        ${code}
        return material;
    `;

    try {
        // 4. Create and execute the function
        // We pass the scope keys as argument names
        const func = new Function(...scopeKeys, functionBody);

        // Call with scope values
        const material = func(...scopeValues);

        return material;
    } catch (err) {
        console.error('TSL Evaluation Failed:', err);
        console.log('Generated Code:', functionBody);
        throw err;
    }
}

/**
 * Get all ancestor node IDs that feed into the target node (including the target).
 */
function getAncestorNodeIds(targetNodeId: string, edges: Edge[]): Set<string> {
    const ancestors = new Set<string>();
    const queue = [targetNodeId];

    while (queue.length > 0) {
        const current = queue.shift()!;
        if (ancestors.has(current)) continue;
        ancestors.add(current);

        // Find all edges that feed INTO the current node
        for (const edge of edges) {
            if (edge.target === current && !ancestors.has(edge.source)) {
                queue.push(edge.source);
            }
        }
    }

    return ancestors;
}

/**
 * Build a preview material for a specific node.
 * This compiles only the portion of the graph feeding into the target node
 * and maps its output to colorNode on a MeshBasicNodeMaterial.
 */
export function buildNodePreviewMaterial(
    targetNodeId: string,
    nodes: Node<TSLNodeData>[],
    edges: Edge[],
    subgraphs?: Record<string, SubgraphDefinition>,
    codeNodes?: Record<string, CodeNodeDefinition>
): THREE.Material {
    // 1. Find all ancestor nodes (including target)
    const ancestorIds = getAncestorNodeIds(targetNodeId, edges);

    // 2. Filter nodes and edges to only include ancestors
    const partialNodes = nodes.filter(n => ancestorIds.has(n.id));
    const partialEdges = edges.filter(e => ancestorIds.has(e.source) && ancestorIds.has(e.target));

    // 3. Compile the partial graph (without material node)
    const code = compileGraph(partialNodes, partialEdges, subgraphs, codeNodes);

    // 4. Extract the variable names from compiled code
    // The code produces lines like "const _node0 = ...;" or "const myVarName = ...;"
    // We need to find all defined variables and identify the target node's variable
    const varMatches = code.matchAll(/const\s+(\w+)\s*=/g);
    const definedVars: string[] = [];
    for (const match of varMatches) {
        // Skip material, texture vars, and comment-only lines
        if (!match[1].includes('material') && !match[1].endsWith('_tex')) {
            definedVars.push(match[1]);
        }
    }

    // If no vars found, just return a fallback
    if (definedVars.length === 0) {
        const fallback = new THREE.MeshBasicNodeMaterial();
        fallback.color = new THREE.Color(0x888888);
        return fallback;
    }

    // The target node should be the last variable defined (since it's the "sink" of the partial graph)
    const targetVarName = definedVars[definedVars.length - 1];

    // Build execution scope
    const scope = {
        ...TSL,
        MeshBasicNodeMaterial: THREE.MeshBasicNodeMaterial,
        THREE: THREE,
    };

    const scopeKeys = Object.keys(scope);
    const scopeValues = Object.values(scope);

    // Create code that evaluates the partial graph and creates a preview material
    const functionBody = `
        ${code}
        
        const material = new MeshBasicNodeMaterial();
        
        // Map the target node output to color
        // Use unique variable name to avoid collision with compiled code
        const __preview_target__ = ${targetVarName};
        material.colorNode = __preview_target__;
        
        return material;
    `;

    try {
        const func = new Function(...scopeKeys, functionBody);
        console.log({ functionBody });

        const material = func(...scopeValues);
        return material;
    } catch (err) {
        console.error('Node Preview Build Failed:', err);
        console.log('Generated Code:', functionBody);
        // Return a fallback magenta material to indicate error
        const fallback = new THREE.MeshBasicNodeMaterial();
        fallback.color = new THREE.Color(0xff00ff);
        return fallback;
    }
}
