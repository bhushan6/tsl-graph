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
