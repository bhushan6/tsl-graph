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
import { registry } from './registry';
import { resolveNodeOutputTypeById } from './type-inference';

export type NodePreviewDisplayMode = 'color' | 'raw';

interface BuildNodePreviewMaterialOptions {
    displayMode?: NodePreviewDisplayMode;
}

const DEBUG_VALUE_HUD_WGSL = `
fn debugValueHud(value: vec4<f32>, channels: f32, uv: vec2<f32>) -> vec4<f32> {
    let rowHeight = 0.22;
    let totalHeight = rowHeight * channels;
    let blockTop = 0.5 + totalHeight * 0.5;
    let row = i32(floor((blockTop - uv.y) / rowHeight));
    if (row < 0 || row >= i32(channels)) {
        return vec4<f32>(0.015, 0.018, 0.025, 1.0);
    }

    let glyphSize = vec2<f32>(0.045, 0.19);
    let advance = 0.052;
    let textWidth = advance * 6.0 + glyphSize.x;
    let rowTop = blockTop - f32(row) * rowHeight;
    let origin = vec2<f32>(
        0.5 - textWidth * 0.5,
        rowTop - (rowHeight + glyphSize.y) * 0.5
    );
    let channelValue = select(select(select(value.w, value.z, row == 2), value.y, row == 1), value.x, row == 0);
    let ink = debugDrawNumberWithSize(uv, origin, channelValue, glyphSize, advance);
    let channelColor = select(
        select(
            select(vec3<f32>(0.85, 0.85, 0.92), vec3<f32>(0.35, 0.55, 1.0), row == 2),
            vec3<f32>(0.35, 0.95, 0.55),
            row == 1
        ),
        vec3<f32>(1.0, 0.35, 0.35),
        row == 0
    );
    let marker = step(0.04, uv.x) * step(uv.x, 0.13) * step(origin.y + 0.045, uv.y) * step(uv.y, origin.y + 0.125);
    let baseColor = vec3<f32>(0.015, 0.018, 0.025);
    let markedColor = mix(baseColor, channelColor * 0.7, marker);
    let textColor = mix(markedColor, vec3<f32>(0.95, 0.98, 1.0), ink);
    return vec4<f32>(textColor, 1.0);
}

fn debugGlyphBits(charCode: i32) -> u32 {
    switch charCode {
        case 0: { return 31599u; }
        case 1: { return 9362u; }
        case 2: { return 29671u; }
        case 3: { return 29391u; }
        case 4: { return 23497u; }
        case 5: { return 31183u; }
        case 6: { return 31215u; }
        case 7: { return 29257u; }
        case 8: { return 31727u; }
        case 9: { return 31695u; }
        case 10: { return 448u; }
        case 11: { return 2u; }
        default: { return 0u; }
    }
}

fn debugDrawGlyph(uv: vec2<f32>, origin: vec2<f32>, size: vec2<f32>, charCode: i32) -> f32 {
    let q = (uv - origin) / size;
    if (q.x < 0.0 || q.x >= 1.0 || q.y < 0.0 || q.y >= 1.0) {
        return 0.0;
    }

    let col = i32(floor(q.x * 3.0));
    let row = i32(floor((1.0 - q.y) * 5.0));
    if (col < 0 || col > 2 || row < 0 || row > 4) {
        return 0.0;
    }

    let bitIndex = u32((4 - row) * 3 + (2 - col));
    let bit = (debugGlyphBits(charCode) >> bitIndex) & 1u;
    let pixel = vec2<f32>(fract(q.x * 3.0), fract(q.y * 5.0));
    let inset = step(0.10, pixel.x) * step(pixel.x, 0.90) * step(0.10, pixel.y) * step(pixel.y, 0.90);
    return select(0.0, inset, bit == 1u);
}

fn debugDrawNumberWithSize(uv: vec2<f32>, origin: vec2<f32>, value: f32, glyphSize: vec2<f32>, advanceX: f32) -> f32 {
    let advance = vec2<f32>(advanceX, 0.0);
    let clampedValue = clamp(value, -999.99, 999.99);
    let absValue = abs(clampedValue);
    let scaled = i32(floor(absValue * 100.0 + 0.5));
    let whole = scaled / 100;
    let frac = scaled - whole * 100;
    let hundreds = whole / 100;
    let tens = (whole / 10) - hundreds * 10;
    let ones = whole - (whole / 10) * 10;
    let dec1 = frac / 10;
    let dec2 = frac - dec1 * 10;

    var ink = 0.0;
    let signChar = select(-1, 10, clampedValue < 0.0);
    let hundredsChar = select(-1, hundreds, whole >= 100);
    let tensChar = select(-1, tens, whole >= 10);

    ink = max(ink, debugDrawGlyph(uv, origin + advance * 0.0, glyphSize, signChar));
    ink = max(ink, debugDrawGlyph(uv, origin + advance * 1.0, glyphSize, hundredsChar));
    ink = max(ink, debugDrawGlyph(uv, origin + advance * 2.0, glyphSize, tensChar));
    ink = max(ink, debugDrawGlyph(uv, origin + advance * 3.0, glyphSize, ones));
    ink = max(ink, debugDrawGlyph(uv, origin + advance * 4.0, glyphSize, 11));
    ink = max(ink, debugDrawGlyph(uv, origin + advance * 5.0, glyphSize, dec1));
    ink = max(ink, debugDrawGlyph(uv, origin + advance * 6.0, glyphSize, dec2));
    return ink;
}

fn debugDrawNumber(uv: vec2<f32>, origin: vec2<f32>, value: f32) -> f32 {
    return debugDrawNumberWithSize(uv, origin, value, vec2<f32>(0.045, 0.19), 0.052);
}
`;

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
        __uniform: ensureUniform,
    };
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
    const scopeKeys = Object.keys(scope);
    const scopeValues = Object.values(scope);
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

function getPreviewValueDisplayType(
    targetNodeId: string,
    outputHandle: string | null,
    nodes: Node<TSLNodeData>[],
    edges: Edge[],
    subgraphs?: Record<string, SubgraphDefinition>,
    globals?: GlobalContextEntry[]
) {
    return resolveNodeOutputTypeById(
        targetNodeId,
        outputHandle,
        new Map(nodes.map((node) => [node.id, node])),
        edges,
        globals ?? [],
        subgraphs
    );
}

function getRawPreviewExpression(targetVarName: string, type: string): { valueExpression: string; channels: number } {
    switch (type) {
        case 'vec4':
            return { valueExpression: `vec4(${targetVarName})`, channels: 4 };
        case 'vec3':
        case 'color':
            return { valueExpression: `vec4(${targetVarName}, 1.0)`, channels: 3 };
        case 'vec2':
            return { valueExpression: `vec4(${targetVarName}, 0.0, 1.0)`, channels: 2 };
        case 'int':
        case 'uint':
        case 'float':
        case 'bool':
        case 'any':
        default:
            return { valueExpression: `vec4(float(${targetVarName}), 0.0, 0.0, 1.0)`, channels: 1 };
    }
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
    globals?: GlobalContextEntry[],
    options: BuildNodePreviewMaterialOptions = {}
): THREE.Material {
    const targetNode = nodes.find((node) => node.id === targetNodeId);
    if (!targetNode) {
        throw new Error(`Preview target node "${targetNodeId}" was not found.`);
    }

    const dependencyEdges = withLocalDependencyEdges(nodes, edges);
    const previewOutputHandle = getPreviewOutputHandle(targetNode);
    const previewOutputType = getPreviewValueDisplayType(
        targetNodeId,
        previewOutputHandle,
        nodes,
        dependencyEdges,
        subgraphs,
        globals
    );

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
            outputHandle: previewOutputHandle,
            varName: '__preview_target__',
        },
    });

    // Ensure uniform factory is wired to TSL runtime
    setTSLUniformFactory();

    // Build execution scope
    const scope = createTSLRuntimeScope();

    const scopeKeys = Object.keys(scope);
    const scopeValues = Object.values(scope);

    // Create code that evaluates the partial graph and creates a preview material
    const { valueExpression, channels } = getRawPreviewExpression('__preview_target__', previewOutputType);
    const useDebugHud = options.displayMode === 'raw';
    const fragmentNodeExpression = useDebugHud
        ? `__debugValueHud({ value: ${valueExpression}, channels: float(${channels}), uv: uv() })`
        : '__preview_target__';

    const functionBody = `
        ${code}
        
        const material = new NodeMaterial();
        
        // Map the target node output to fragment
        ${useDebugHud ? `const __debugValueHud = wgslFn(${JSON.stringify(DEBUG_VALUE_HUD_WGSL)});` : ''}
        material.fragmentNode = ${fragmentNodeExpression};
        
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
