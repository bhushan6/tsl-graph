import { Node, Edge } from '@xyflow/react';
import * as THREE from 'three/webgpu'; // For Material classes
import * as TSL from 'three/tsl'; // For TSL functions
import { TSLNodeData, SubgraphDefinition, CodeNodeDefinition, GlobalContextEntry } from '@/lib/types';
import { compileGraph, compilePostGraph } from './compiler';
import * as customTSLUtils from './tsl-utils';
import { afterImage } from 'three/addons/tsl/display/AfterImageNode.js';
import { anamorphic } from 'three/addons/tsl/display/AnamorphicNode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { boxBlur } from 'three/addons/tsl/display/boxBlur.js';
import { chromaticAberration } from 'three/addons/tsl/display/ChromaticAberrationNode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { dotScreen } from 'three/addons/tsl/display/DotScreenNode.js';
import { film } from 'three/addons/tsl/display/FilmNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
import { hashBlur } from 'three/addons/tsl/display/hashBlur.js';
import { rgbShift } from 'three/addons/tsl/display/RGBShiftNode.js';
import { sepia } from 'three/addons/tsl/display/Sepia.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { sobel } from 'three/addons/tsl/display/SobelOperatorNode.js';
import { transition } from 'three/addons/tsl/display/TransitionNode.js';
import { ensureUniform, setUniformFactory } from './uniform-store';
import { withLocalDependencyEdges } from './local-utils';
import * as tslEasings from './tsl-easings';
// Explicit imports (not `import *`): tsl-textures also re-exports helpers such
// as noise/hsl/voronoi that would shadow other scope entries.
import {
    marble, polkaDots, caustics, roughClay, clouds,
    brain, camouflage, caveArt, circleDecor, circles, concrete, cork, crumpledFabric,
    dalmatianSpots, darthMaul, dysonSphere, entangled, fordite, gasGiant, grid, halftone,
    isolayers, isolines, karstRock, neonLights, perlinNoise, photosphere, planet,
    processedWood, protozoa, reticularVeins, romanPaving, runnyEggs, rust, satin,
    scepterHead, scream, stars, staticNoise, tigerFur, turbulentSmoke, voronoiCells,
    waterDrops, watermelon, waves, wood, zebraLines, bricks,
} from 'tsl-textures';
import { registry } from './registry';

const setTSLUniformFactory = () => {
    setUniformFactory(TSL.uniform as unknown as Parameters<typeof setUniformFactory>[0]);
};

function createTSLRuntimeScope() {
    return {
        ...TSL,
        ...customTSLUtils,
        ...tslEasings,
        wgslFn: TSL.wgslFn,
        MeshStandardNodeMaterial: THREE.MeshStandardNodeMaterial,
        MeshBasicNodeMaterial: THREE.MeshBasicNodeMaterial,
        MeshPhysicalNodeMaterial: THREE.MeshPhysicalNodeMaterial,
        MeshPhongNodeMaterial: THREE.MeshPhongNodeMaterial,
        SpriteNodeMaterial: THREE.SpriteNodeMaterial,
        NodeMaterial: THREE.NodeMaterial,
        THREE: THREE,
        afterImage,
        anamorphic,
        bloom,
        boxBlur,
        chromaticAberration,
        dof,
        dotScreen,
        film,
        fxaa,
        gaussianBlur,
        node_normalize: TSL.normalize,
        hashBlur,
        rgbShift,
        sepia,
        smaa,
        sobel,
        transition,
        marble,
        polkaDots,
        caustics,
        roughClay,
        clouds,
        brain,
        camouflage,
        caveArt,
        circleDecor,
        circles,
        concrete,
        cork,
        crumpledFabric,
        dalmatianSpots,
        darthMaul,
        dysonSphere,
        entangled,
        fordite,
        gasGiant,
        grid,
        halftone,
        isolayers,
        isolines,
        karstRock,
        neonLights,
        perlinNoise,
        photosphere,
        planet,
        processedWood,
        protozoa,
        reticularVeins,
        romanPaving,
        runnyEggs,
        rust,
        satin,
        scepterHead,
        scream,
        stars,
        staticNoise,
        tigerFur,
        turbulentSmoke,
        voronoiCells,
        waterDrops,
        watermelon,
        waves,
        wood,
        zebraLines,
        bricks,
        __uniform: ensureUniform,
    };
}

/**
 * Build the ordered (keys, values) to inject into the `new Function(...)` used to
 * evaluate generated code.
 *
 * The runtime scope exposes every TSL identifier (float, vec3, thickness, …) as a
 * function parameter. Generated code may declare a top-level `const` — e.g. a user
 * global named `thickness`, which is also a three/tsl export — that would collide
 * with the same-named parameter ("Identifier 'thickness' has already been
 * declared"). We drop any scope key that the code redeclares at the top level so
 * the `const` shadows the builtin, matching how the standalone export behaves (it
 * simply doesn't import the shadowed name).
 */
function getRuntimeScopeEntries(
    scope: Record<string, unknown>,
    code: string
): { keys: string[]; values: unknown[] } {
    // Top-level declarations start at column 0; nested (indented) consts inside
    // Fn bodies are intentionally ignored.
    const declared = new Set<string>();
    const declRegex = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm;
    let match: RegExpExecArray | null;
    while ((match = declRegex.exec(code)) !== null) {
        declared.add(match[1]);
    }

    const keys: string[] = [];
    const values: unknown[] = [];
    for (const key of Object.keys(scope)) {
        if (declared.has(key)) continue;
        keys.push(key);
        values.push(scope[key]);
    }
    return { keys, values };
}

/**
 * Build a Three.js material from the node graph by compiling to TSL and evaluating it.
 * This ensures the preview matches the generated code exactly.
 */
export function buildTSLMaterial(
    nodes: Node<TSLNodeData>[],
    edges: Edge[],
    subgraphs?: Record<string, SubgraphDefinition>,
    codeNodes?: Record<string, CodeNodeDefinition>,
    globals?: GlobalContextEntry[]
): THREE.Material {
    // 1. Compile the graph to TSL code
    const code = compileGraph(nodes, edges, subgraphs, codeNodes, { uniformMode: 'runtime', globals });

    // Ensure uniform factory is wired to TSL runtime
    setTSLUniformFactory();

    // 2. Prepare the execution scope
    // We need all TSL functions (float, vec3, Fn, etc.) and Material classes available
    const scope = createTSLRuntimeScope();

    const { keys: scopeKeys, values: scopeValues } = getRuntimeScopeEntries(scope, code);

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
        // console.error('TSL Evaluation Failed:', err);
        // console.log('Generated Code:', functionBody);
        throw err;
    }
}

export function buildTSLPostOutputNode(
    sceneColorNode: unknown,
    sceneTextureNode: unknown,
    sceneDepthNode: unknown,
    sceneDepthTextureNode: unknown,
    sceneNormalTextureNode: unknown,
    sceneCamera: unknown,
    postNodes: Node<TSLNodeData>[],
    postEdges: Edge[],
    subgraphs?: Record<string, SubgraphDefinition>,
    codeNodes?: Record<string, CodeNodeDefinition>,
    globals?: GlobalContextEntry[]
): THREE.Node | null {
    const compiled = compilePostGraph(postNodes, postEdges, subgraphs, codeNodes, { uniformMode: 'runtime', globals });

    // Ensure uniform factory is wired to TSL runtime
    setTSLUniformFactory();

    const scope = createTSLRuntimeScope();
    const { keys: scopeKeys, values: scopeValues } = getRuntimeScopeEntries(scope, compiled.code);
    const functionBody = `
        ${compiled.code}
        const camera = sceneCamera;
        const sceneNormalNode = texture(sceneNormalTextureNode, screenUV).xyz;
        return ${compiled.functionName}(sceneColorNode, sceneDepthNode, sceneNormalNode, sceneTextureNode, sceneDepthTextureNode, sceneNormalTextureNode);
    `;

    const fn = new Function(
        ...scopeKeys,
        'sceneColorNode',
        'sceneTextureNode',
        'sceneDepthNode',
        'sceneDepthTextureNode',
        'sceneNormalTextureNode',
        'sceneCamera',
        functionBody
    );
    return fn(
        ...scopeValues,
        sceneColorNode,
        sceneTextureNode,
        sceneDepthNode,
        sceneDepthTextureNode,
        sceneNormalTextureNode,
        sceneCamera
    ) as THREE.Node;
}

export function buildTSLPostDebugOutputNode(
    targetNodeId: string,
    sceneColorNode: unknown,
    sceneTextureNode: unknown,
    sceneDepthNode: unknown,
    sceneDepthTextureNode: unknown,
    sceneNormalTextureNode: unknown,
    sceneCamera: unknown,
    postNodes: Node<TSLNodeData>[],
    postEdges: Edge[],
    subgraphs?: Record<string, SubgraphDefinition>,
    codeNodes?: Record<string, CodeNodeDefinition>,
    globals?: GlobalContextEntry[]
): THREE.Node | null {
    const targetNode = postNodes.find((node) => node.id === targetNodeId);
    if (!targetNode) {
        throw new Error(`Preview target node "${targetNodeId}" was not found.`);
    }

    const outputHandle = getPreviewOutputHandle(targetNode);
    if (!outputHandle) {
        throw new Error(`Preview target node "${targetNodeId}" has no renderable output.`);
    }

    const dependencyEdges = withLocalDependencyEdges(postNodes, postEdges);
    const ancestorIds = getAncestorNodeIds(targetNodeId, dependencyEdges);
    ancestorIds.add('post-input');
    ancestorIds.add('post-output');

    const partialNodes = postNodes.filter((node) => ancestorIds.has(node.id));
    const partialEdges = dependencyEdges.filter((edge) => (
        ancestorIds.has(edge.source) &&
        ancestorIds.has(edge.target) &&
        edge.target !== 'post-output'
    ));

    partialEdges.push({
        id: `debug-preview-${targetNodeId}`,
        source: targetNodeId,
        sourceHandle: outputHandle,
        target: 'post-output',
        targetHandle: 'color',
    });

    return buildTSLPostOutputNode(
        sceneColorNode,
        sceneTextureNode,
        sceneDepthNode,
        sceneDepthTextureNode,
        sceneNormalTextureNode,
        sceneCamera,
        partialNodes,
        partialEdges,
        subgraphs,
        codeNodes,
        globals
    );
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

export function getPreviewOutputHandle(node: Node<TSLNodeData>): string | null {
    const dynamicOutput = (node.data.dynamicPorts ?? []).find((port) => (
        port.id === 'out' || port.id.startsWith('out_')
    ));
    if (dynamicOutput) return dynamicOutput.id;

    const def = registry.get(node.data.type);
    const outputHandles = Object.keys(def?.outputs ?? {});
    return outputHandles.find((handle) => handle === 'out')
        ?? outputHandles.find((handle) => handle === 'out_0')
        ?? outputHandles[0]
        ?? null;
}

/**
 * Build a preview material for a specific node.
 * This compiles only the portion of the graph feeding into the target node
 * and maps its output to fragmentNode on a NodeMaterial.
 */
export function buildNodePreviewMaterial(
    targetNodeId: string,
    nodes: Node<TSLNodeData>[],
    edges: Edge[],
    subgraphs?: Record<string, SubgraphDefinition>,
    codeNodes?: Record<string, CodeNodeDefinition>,
    globals?: GlobalContextEntry[]
): THREE.Material {
    const targetNode = nodes.find((node) => node.id === targetNodeId);
    if (!targetNode) {
        throw new Error(`Preview target node "${targetNodeId}" was not found.`);
    }

    const dependencyEdges = withLocalDependencyEdges(nodes, edges);

    // 1. Find all ancestor nodes (including target)
    const ancestorIds = getAncestorNodeIds(targetNodeId, dependencyEdges);

    // 2. Filter nodes and edges to only include ancestors
    const partialNodes = nodes.filter(n => ancestorIds.has(n.id));
    const partialEdges = dependencyEdges.filter(e => ancestorIds.has(e.source) && ancestorIds.has(e.target));

    // 3. Compile the partial graph (without material node)
    const code = compileGraph(partialNodes, partialEdges, subgraphs, codeNodes, {
        uniformMode: 'runtime',
        globals,
        previewSubgraphInputs: true,
        previewTarget: {
            nodeId: targetNodeId,
            outputHandle: getPreviewOutputHandle(targetNode),
            varName: '__preview_target__',
        },
    });

    // Ensure uniform factory is wired to TSL runtime
    setTSLUniformFactory();

    // Build execution scope
    const scope = createTSLRuntimeScope();

    const { keys: scopeKeys, values: scopeValues } = getRuntimeScopeEntries(scope, code);

    // Create code that evaluates the partial graph and creates a preview material
    const functionBody = `
        ${code}
        
        const material = new NodeMaterial();
        
        // Map the target node output to fragment
        material.fragmentNode = __preview_target__;
        
        return material;
    `;

    try {
        const func = new Function(...scopeKeys, functionBody);

        const material = func(...scopeValues);
        return material;
    } catch (err) {
        console.error('Node Preview Build Failed:', err);
        // Return a fallback magenta material to indicate error
        const fallback = new THREE.MeshBasicNodeMaterial();
        fallback.color = new THREE.Color(0xff00ff);
        return fallback;
    }
}
