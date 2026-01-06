// TSL Type System

export type TSLScalar = 'float' | 'int' | 'uint' | 'bool';
export type TSLVector =
    | 'vec2' | 'vec3' | 'vec4'
    | 'ivec2' | 'ivec3' | 'ivec4'
    | 'uvec2' | 'uvec3' | 'uvec4'
    | 'bvec2' | 'bvec3' | 'bvec4';
export type TSLMatrix = 'mat2' | 'mat3' | 'mat4';
export type TSLOther = 'color' | 'sampler2D';
export type TSLType = TSLScalar | TSLVector | TSLMatrix | TSLOther;

// Port definitions
export interface Port {
    label: string;
    type: TSLType;
    default?: number | number[] | string;
}

// Node definition
export interface NodeDef {
    type: string;          // Unique ID: "math/add"
    label: string;         // Display name: "Add"
    category: string;      // For grouping: "Math"
    inputs?: Record<string, Port>;
    outputs?: Record<string, Port>;
    tsl: string;           // TSL function name
    pure?: boolean;        // No inputs = source node
}

// Component count for type compatibility
export const COMPONENT_COUNT: Record<TSLType, number> = {
    float: 1, int: 1, uint: 1, bool: 1,
    vec2: 2, ivec2: 2, uvec2: 2, bvec2: 2,
    vec3: 3, ivec3: 3, uvec3: 3, bvec3: 3, color: 3,
    vec4: 4, ivec4: 4, uvec4: 4, bvec4: 4,
    mat2: 4, mat3: 9, mat4: 16,
    sampler2D: 0,
};

export type CompatResult = 'valid' | 'warning' | 'invalid';

/**
 * Check if two TSL types are compatible for connection
 * Follows TSL rules:
 * - float → vec: scalar broadcasts to all components
 * - vec → float: first component extracted
 * - vec4 → vec3: truncates
 * - vec2 → vec4: pads with zeros (warning)
 */
export function checkTypeCompatibility(from: TSLType, to: TSLType): CompatResult {
    if (from === to) return 'valid';

    const fromCount = COMPONENT_COUNT[from];
    const toCount = COMPONENT_COUNT[to];

    // Matrices only compatible with same type
    if (from.startsWith('mat') || to.startsWith('mat')) {
        return from === to ? 'valid' : 'invalid';
    }

    // Sampler2D only compatible with sampler2D
    if (from === 'sampler2D' || to === 'sampler2D') {
        return from === to ? 'valid' : 'invalid';
    }

    // Scalar → Vector: broadcasts
    if (fromCount === 1 && toCount > 1) return 'valid';

    // Vector → Scalar: extracts first component
    if (fromCount > 1 && toCount === 1) return 'valid';

    // Color is equivalent to vec3
    if ((from === 'color' && to === 'vec3') || (from === 'vec3' && to === 'color')) {
        return 'valid';
    }

    // Vector → Vector (different sizes)
    if (fromCount > toCount) return 'valid';  // truncate
    if (fromCount < toCount) return 'warning';  // pad with zeros

    return 'valid';
}
