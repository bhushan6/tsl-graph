import type { NodeType, TSLValueType, TSLType } from '@/lib/types';

export type ToolName =
  | 'getGraphSnapshot'
  | 'getAvailableNodes'
  | 'getNodeDefinition'
  | 'addNode'
  | 'deleteNode'
  | 'connectNodes'
  | 'disconnectNodes'
  | 'setNodeValue'
  | 'moveNode'
  | 'bulkOperation'
  | 'validateGraph'
  | 'compileAndValidate'
  | 'getPreviewStatus'
  | 'capturePreview';

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

export type ToolResultOutput =
  | { type: 'json'; value: unknown }
  | { type: 'text'; value: string }
  | { type: 'error-json'; value: unknown }
  | { type: 'error-text'; value: string };

export type ToolResultPart = {
  type: 'tool-result';
  toolCallId: string;
  toolName: ToolName;
  output: ToolResultOutput;
};

export type AIChatMessage =
  | { role: 'user' | 'assistant' | 'system'; content: string }
  | { role: 'tool'; content: ToolResultPart[] };

export interface NodeSummary {
  id: string;
  type: NodeType | 'group';
  position: { x: number; y: number };
  values: Record<string, TSLValueType>;
  localName?: string;
  dynamicPorts?: Array<{ id: string; label: string; type: TSLType }>;
}

export interface EdgeSummary {
  id: string;
  source: string;
  sourceHandle: string | null;
  target: string;
  targetHandle: string | null;
}

export interface GraphSnapshot {
  graphVersion: number;
  selectedNodeIds: string[];
  materialNodeId: string | null;
  nodes: NodeSummary[];
  edges: EdgeSummary[];
}

export type BulkOperation = {
  operations: BulkOperationOp[];
};

export type BulkOperationOp =
  | {
      op: 'addNode';
      tempId: string;
      type: NodeType;
      position: { x: number; y: number };
      values?: Record<string, TSLValueType>;
    }
  | {
      op: 'deleteNode';
      nodeId: string;
    }
  | {
      op: 'connect';
      source: string;
      sourcePort: string | null;
      target: string;
      targetPort: string | null;
    }
  | {
      op: 'disconnect';
      source: string;
      sourcePort: string | null;
      target: string;
      targetPort: string | null;
    }
  | {
      op: 'removeEdge';
      edgeId: string;
    }
  | {
      op: 'setValue';
      nodeId: string;
      input: string;
      value: TSLValueType;
    }
  | {
      op: 'move';
      nodeId: string;
      position: { x: number; y: number };
    };

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

export type ValidationResult = {
  errors: string[];
  warnings: string[];
};

export type CompileResult = {
  ok: boolean;
  error?: string;
};

export type PreviewStatus = {
  hasRenderer: boolean;
  lastError: string | null;
};
