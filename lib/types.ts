import type { Node, Edge } from '@xyflow/react';
import { BaseNodeDef, Port, TSLValueType, TSLType } from './nodes/definitions';
import type { MultiOp } from './multi-op';
import { NodeType, NodeCategory, TSLFunction } from './nodes/inferred-types';

export * from './nodes/definitions';
export * from './nodes/inferred-types';

// Strict Node Definition
// We extend the base but narrow the string types
export interface NodeDef extends BaseNodeDef {
    readonly type: NodeType;
    readonly category: NodeCategory;
    readonly tsl: TSLFunction;
    readonly inputs?: Record<string, Port>;
    readonly outputs?: Record<string, Port>;
}

// Dynamic port for subgraph anchor nodes
export interface SubgraphPort {
    id: string;
    label: string;
    type: TSLType;
}

// Node data structure
export interface TSLNodeData extends Record<string, unknown> {
    type: NodeType;
    values: Record<string, TSLValueType> & {
        localName?: string;
        localSourceId?: string;
        title?: string;
        markdown?: string;
    };
    connected: Record<string, boolean>;
    activeInputs?: string[];
    localName?: string;
    operations?: MultiOp[];
    // Dynamic ports for subgraph anchor nodes
    dynamicPorts?: SubgraphPort[];
}

export type AppNode = Node<TSLNodeData>;

export type GlobalContextKind = 'uniform' | 'varying' | 'const';

export interface GlobalContextEntry {
    id: string;
    name: string;
    kind: GlobalContextKind;
    type: TSLType;
    defaultValue: TSLValueType;
    description?: string;
}

// Subgraph definition - stored in project and used to create custom nodes
export interface SubgraphDefinition {
    // Unique ID for this subgraph (e.g., 'custom/my-blur')
    id: string;
    // Display name (e.g., 'My Blur Effect')
    name: string;
    // Scope: project-only or available across user's projects
    scope?: 'project' | 'library';
    // Template reference (if saved from/as a template)
    templateId?: string;
    templateVersion?: number;
    // Input ports that become inputs on the custom node
    inputs: SubgraphPort[];
    // Output ports that become outputs on the custom node
    outputs: SubgraphPort[];
    // The internal graph: nodes and edges
    nodes: Node<TSLNodeData>[];
    edges: Edge[];
    // Anchor node positions (calculated from bounding box on create)
    inputNodePosition?: { x: number; y: number };
    outputNodePosition?: { x: number; y: number };
    // Timestamp for tracking updates
    createdAt: number;
    updatedAt: number;
}

// Code-based custom node definition - created from TSL Fn code
export type CodeNodeLanguage = 'tsl' | 'wgsl';

export interface CodeNodeDefinition {
    // Unique ID for this code node (e.g., 'code/my-effect')
    id: string;
    // Display name (e.g., 'My Effect')
    name: string;
    // Template reference (if saved from/as a template)
    templateId?: string;
    templateVersion?: number;
    // Code language (default: 'tsl' when missing)
    language?: CodeNodeLanguage;
    // The raw code (TSL Fn definition or WGSL fn)
    code: string;
    // Parsed input arguments that become input handles
    inputs: SubgraphPort[];
    // Single output (code nodes always have exactly one output)
    output: SubgraphPort;
    // Timestamp for tracking
    createdAt: number;
    updatedAt: number;
}
