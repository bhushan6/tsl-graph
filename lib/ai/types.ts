import type { NodeType, TSLType, TSLValueType, GlobalContextEntry } from '@/lib/types';

export type ToolName =
  | 'getGraphSnapshot'
  | 'getAvailableNodes'
  | 'getNodeDefinition'
  | 'compileGraph'
  | 'validateGraph'
  | 'addNode'
  | 'connectNodes'
  | 'setNodeValue'
  | 'deleteNode'
  | 'autoLayout'
  | 'capturePreviewImage';

export interface ToolCall<T = unknown> {
  toolCallId: string;
  toolName: ToolName;
  input: T;
}

export interface ToolResult<T = unknown> {
  toolCallId: string;
  toolName: ToolName;
  output: T;
  isError?: boolean;
}

export interface NodeSummary {
  id: string;
  type: NodeType | 'group';
  values: Record<string, TSLValueType>;
  dynamicPorts?: Array<{ id: string; label: string; type: TSLType }>;
}

export interface EdgeSummary {
  source: string;
  sourcePort: string | null;
  target: string;
  targetPort: string | null;
}

export interface GraphSnapshot {
  nodes: NodeSummary[];
  edges: EdgeSummary[];
  materialNodeId: string | null;
  selectedNodeIds: string[];
  globals?: GlobalContextEntry[];
}

export type AvailableNode = {
  type: NodeType;
  label: string;
  category: string;
  inputs?: Record<string, { label: string; type: TSLType }>;
  outputs?: Record<string, { label: string; type: TSLType }>;
};

export type NodeDefinition = {
  type: string;
  label: string;
  category: string;
  inputs?: Record<string, { label: string; type: TSLType; connectionOnly?: boolean }>;
  outputs?: Record<string, { label: string; type: TSLType }>;
};

export type AddNodeInput = {
  type: string;
  position?: { x: number; y: number };
  values?: Record<string, TSLValueType>;
};

export type CompileGraphInput = {
  includeImports?: boolean;
  maxChars?: number;
};

export type ValidationIssue = {
  type:
    | 'missing-node'
    | 'missing-handle'
    | 'unknown-node'
    | 'material-count'
    | 'material-unconnected'
    | 'unused-node';
  message: string;
  nodeId?: string;
  edgeId?: string;
  handle?: string;
};

export type ValidationReport = {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    materialCount: number;
    danglingEdges: number;
  };
};

export type ConnectNodesInput = {
  source: string;
  sourcePort?: string | null;
  target: string;
  targetPort?: string | null;
};

export type SetNodeValueInput = {
  nodeId: string;
  input: string;
  value: TSLValueType;
};

export type DeleteNodeInput = {
  nodeId: string;
};

export type CapturePreviewImageInput = {
  format?: 'png' | 'jpeg';
  quality?: number;
};

export type CapturePreviewImageOutput = {
  imageUrl: string;
  storageId: string;
  width: number;
  height: number;
  format: string;
};
