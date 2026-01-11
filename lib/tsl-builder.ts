import { Node as FlowNode, Edge } from '@xyflow/react';
import * as THREE from 'three/webgpu';
import { TSLNodeData } from '@/lib/types';
import { registry } from './registry';
import { MATERIAL_NODE_TYPES } from './nodes';

// Import TSL functions
import {
    float,
    vec2,
    vec3,
    vec4,
    color,
    add,
    sub,
    mul,
    div,
    sin,
    cos,
    mix,
    clamp,
    positionLocal,
    positionWorld,
    positionView,
    normalLocal,
    normalWorld,
    normalView,
    uv,
    time,
    // New math functions
    abs,
    pow,
    sqrt,
    fract,
    floor,
    ceil,
    mod,
    min,
    max,
    step,
    smoothstep,
    length,
    normalize,
    dot,
    cross,
    reflect,
} from 'three/tsl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TSLNode = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TSLFunction = (...args: any[]) => TSLNode;

// Map of TSL function names to actual functions
const TSL_FUNCTIONS: Record<string, TSLFunction> = {
    float,
    vec2,
    vec3,
    vec4,
    color,
    add,
    sub,
    mul,
    div,
    sin,
    cos,
    mix,
    clamp,
    int: float,
    uint: float,
    // New math functions
    abs,
    pow,
    sqrt,
    fract,
    floor,
    ceil,
    mod,
    min,
    max,
    step,
    smoothstep,
    length,
    normalize,
    dot,
    cross,
    reflect,
};

// Pure nodes (no function call needed)
const PURE_NODES: Record<string, TSLNode> = {
    positionLocal,
    positionWorld,
    positionView,
    normalLocal,
    normalWorld,
    normalView,
    uv,
    time,
};

// Material constructors
const MATERIAL_CONSTRUCTORS: Record<string, new () => THREE.Material> = {
    'material/standard': THREE.MeshStandardNodeMaterial,
    'material/basic': THREE.MeshBasicNodeMaterial,
    'material/physical': THREE.MeshPhysicalNodeMaterial,
    'material/phong': THREE.MeshPhongNodeMaterial,
};

// Component swizzle mapping
const COMPONENT_SWIZZLES: Record<string, string> = {
    'x': 'x',
    'y': 'y',
    'z': 'z',
    'w': 'w',
    'r': 'x',  // Color r maps to x
    'g': 'y',  // Color g maps to y
    'b': 'z',  // Color b maps to z
};

import { topologicalSort } from './graph-utils';

/**
 * Apply swizzle to a TSL node if needed.
 */
function applySwizzle(node: TSLNode, sourceHandle: string | null | undefined): TSLNode {
    if (!sourceHandle || sourceHandle === 'out') {
        return node;
    }

    const swizzle = COMPONENT_SWIZZLES[sourceHandle];
    if (swizzle && node && typeof node[swizzle] !== 'undefined') {
        return node[swizzle];
    }

    return node;
}

/**
 * Get input value for a node, either from connected upstream or from stored value.
 * Handles component swizzling when source handle is a component (x, y, z, w, r, g, b).
 */
function getInputValue(
    node: FlowNode<TSLNodeData>,
    inputKey: string,
    edges: Edge[],
    evaluatedNodes: Map<string, TSLNode>,
    inputDef: { type: string; default?: number | readonly number[] | string }
): TSLNode | number | null {
    // Check for connection
    const edge = edges.find(e => e.target === node.id && e.targetHandle === inputKey);
    if (edge) {
        const upstream = evaluatedNodes.get(edge.source);
        if (upstream !== undefined) {
            // Apply swizzle based on source handle
            return applySwizzle(upstream, edge.sourceHandle);
        }
    }

    // Use stored value or default
    const value = node.data.values?.[inputKey] ?? inputDef.default;

    // If no value and no default, return null
    if (value === undefined || value === null) {
        return null;
    }

    // Convert based on type
    if (inputDef.type === 'color') {
        // Return raw hex string - the TSL function will handle wrapping
        return String(value ?? '#ffffff');
    }

    // Handle array values (vectors)
    if (Array.isArray(value)) {
        const nums = value.map(v => Number(v ?? 0));
        if (nums.length === 2) return vec2(...nums);
        if (nums.length === 3) return vec3(...nums);
        if (nums.length === 4) return vec4(...nums);
        // Fallback for other sizes
        return vec3(...nums.slice(0, 3));
    }

    // For numeric types, return the number (TSL will handle conversion)
    return Number(value ?? 0);
}

/**
 * Get the value connected to a specific input of the material node.
 * Handles component swizzling.
 */
function getMaterialInput(
    materialNode: FlowNode<TSLNodeData>,
    inputKey: string,
    edges: Edge[],
    evaluatedNodes: Map<string, TSLNode>
): TSLNode | null {
    const edge = edges.find(e => e.target === materialNode.id && e.targetHandle === inputKey);
    if (edge) {
        const upstream = evaluatedNodes.get(edge.source);
        if (upstream !== undefined) {
            // Apply swizzle based on source handle
            return applySwizzle(upstream, edge.sourceHandle);
        }
    }

    // Check for stored value in the node
    const def = registry.get(materialNode.data.type);
    const inputDef = def?.inputs?.[inputKey];
    if (inputDef) {
        const value = materialNode.data.values?.[inputKey] ?? inputDef.default;
        if (value !== undefined && value !== null) {
            if (inputDef.type === 'color') {
                return color(String(value));
            }
            if (inputDef.type === 'float') {
                return float(Number(value));
            }
        }
    }

    return null;
}

/**
 * Build a TSL material from the node graph.
 * Looks for a Material node and builds the material from its inputs.
 */
export function buildTSLMaterial(
    nodes: FlowNode<TSLNodeData>[],
    edges: Edge[]
): THREE.Material {
    // Find the material node
    const materialNode = nodes.find(n => (MATERIAL_NODE_TYPES as readonly string[]).includes(n.data.type));

    if (!materialNode) {
        // No material node - use default material
        return new THREE.MeshStandardMaterial({ color: 0x888888 });
    }

    // Get material constructor
    const MaterialClass = MATERIAL_CONSTRUCTORS[materialNode.data.type];
    if (!MaterialClass) {
        return new THREE.MeshStandardMaterial({ color: 0x888888 });
    }

    // Sort and evaluate all non-material nodes
    const otherNodes = nodes.filter(n => !(MATERIAL_NODE_TYPES as readonly string[]).includes(n.data.type));
    const sorted = topologicalSort(otherNodes, edges);
    const evaluatedNodes = new Map<string, TSLNode>();

    for (const nodeId of sorted) {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) continue;

        const def = registry.get(node.data.type);
        if (!def) continue;

        const tslFn = TSL_FUNCTIONS[def.tsl];
        const pureValue = PURE_NODES[def.tsl];

        let result: TSLNode;

        if (pureValue !== undefined && def.pure) {
            // Pure nodes are direct references, unless marked as callable
            result = def.callable ? pureValue() : pureValue;
        } else if (tslFn) {
            const inputs = def.inputs ?? {};
            const inputKeys = Object.keys(inputs);

            if (inputKeys.length === 0) {
                result = tslFn();
            } else {
                const args = inputKeys.map(key => {
                    const val = getInputValue(node, key, edges, evaluatedNodes, inputs[key]);
                    return val ?? 0;
                });
                result = tslFn(...args);
            }
        }

        if (result !== undefined) {
            evaluatedNodes.set(nodeId, result);
        }
    }

    // Build the material
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const material = new MaterialClass() as any;

    // Get the material definition to know what inputs it has
    const materialDef = registry.get(materialNode.data.type);
    const inputKeys = Object.keys(materialDef?.inputs ?? {});

    // Apply each connected input
    for (const key of inputKeys) {
        const value = getMaterialInput(materialNode, key, edges, evaluatedNodes);
        if (value !== null) {
            material[key] = value;

            // Special case: if opacity is set, enable transparency
            if (key === 'opacityNode') {
                material.transparent = true;
            }
        }
    }

    return material;
}
