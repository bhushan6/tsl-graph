import type { Node } from '@xyflow/react';
import { BaseNodeDef, Port, TSLValueType } from './nodes/definitions';
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

// Node data structure
export interface TSLNodeData extends Record<string, unknown> {
    type: NodeType;
    values: Record<string, TSLValueType>;
    connected: Record<string, boolean>;
    localName?: string;
}

export type AppNode = Node<TSLNodeData>;
