
// TSL Type System
export type TSLScalar = 'float' | 'int' | 'uint' | 'bool';
export type TSLVector =
    | 'vec2' | 'vec3' | 'vec4'
    | 'ivec2' | 'ivec3' | 'ivec4'
    | 'uvec2' | 'uvec3' | 'uvec4'
    | 'bvec2' | 'bvec3' | 'bvec4';
export type TSLMatrix = 'mat2' | 'mat3' | 'mat4';
export type TSLOther = 'color' | 'sampler2D' | 'any' | 'string';
export type TSLType = TSLScalar | TSLVector | TSLMatrix | TSLOther;

// Asset values for texture/file uploads
export interface AssetValue {
    url: string;
    assetId?: string;
}

// Port/value definitions
export type TSLValueType = number | number[] | readonly number[] | string | boolean | AssetValue;

export interface Port {
    readonly label: string;
    readonly type: TSLType;
    readonly default?: TSLValueType;
    readonly connectionOnly?: boolean; // If true, input must be connected (no inline value)
    readonly propertyOnly?: boolean; // If true, input is hidden on node (property panel only)
    readonly hidden?: boolean; // If true, input is completely hidden from node UI (values/labels)
    readonly isMaterialProp?: boolean; // If true, treated as raw property assignment on material, not TSL node input
    readonly options?: readonly { label: string; value: string | number }[]; // Dropdown options
}

// Base Node definition (loose types for definition files)
export interface BaseNodeDef {
    readonly type: string;          // Unique ID: "math/add"
    readonly label: string;         // Display name: "Add"
    readonly category: string;      // For grouping: "Math"
    readonly description?: string; // Optional doc description
    readonly inputs?: Record<string, Port>;
    readonly outputs?: Record<string, Port>;
    readonly tsl: string;           // TSL function name
    readonly importFrom?: string;   // Override import source module (default: "three/tsl")
    readonly pure?: boolean;        // No inputs = source node
    readonly callable?: boolean;    // If true, pure node needs to be called as function (e.g., uv())
    readonly defaultActiveInputs?: readonly string[]; // If set, inputs that are active by default (material nodes)
}
