import { jsonSchema, tool } from 'ai';

const emptySchema = jsonSchema({
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const);

export const TOOL_SET = {
  getGraphSnapshot: tool({
    description: 'Get a compact snapshot of the current graph (nodes, edges, selection, material node).',
    inputSchema: emptySchema,
  }),
  getAvailableNodes: tool({
    description: 'List all available node types grouped by category.',
    inputSchema: emptySchema,
  }),
  getNodeDefinition: tool({
    description: 'Get the schema for a node type (inputs, outputs, types).',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        type: { type: 'string' },
      },
      required: ['type'],
      additionalProperties: false,
    }),
  }),
  addNode: tool({
    description: 'Add a node at a position with optional initial values.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        type: { type: 'string' },
        position: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
          },
          required: ['x', 'y'],
          additionalProperties: false,
        },
        values: { type: 'object' },
      },
      required: ['type', 'position'],
      additionalProperties: false,
    }),
  }),
  deleteNode: tool({
    description: 'Delete a node and its edges.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        nodeId: { type: 'string' },
      },
      required: ['nodeId'],
      additionalProperties: false,
    }),
  }),
  connectNodes: tool({
    description: 'Connect two node handles.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        source: { type: 'string' },
        sourcePort: { type: ['string', 'null'] },
        target: { type: 'string' },
        targetPort: { type: ['string', 'null'] },
      },
      required: ['source', 'target'],
      additionalProperties: false,
    }),
  }),
  disconnectNodes: tool({
    description: 'Disconnect two node handles.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        source: { type: 'string' },
        sourcePort: { type: ['string', 'null'] },
        target: { type: 'string' },
        targetPort: { type: ['string', 'null'] },
      },
      required: ['source', 'target'],
      additionalProperties: false,
    }),
  }),
  setNodeValue: tool({
    description: 'Set a node input value.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        nodeId: { type: 'string' },
        input: { type: 'string' },
        value: {},
      },
      required: ['nodeId', 'input', 'value'],
      additionalProperties: false,
    }),
  }),
  moveNode: tool({
    description: 'Move a node to a new position.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        nodeId: { type: 'string' },
        position: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
          },
          required: ['x', 'y'],
          additionalProperties: false,
        },
      },
      required: ['nodeId', 'position'],
      additionalProperties: false,
    }),
  }),
  bulkOperation: tool({
    description: 'Apply multiple graph operations atomically with tempId resolution.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        operations: {
          type: 'array',
          items: { type: 'object' },
        },
      },
      required: ['operations'],
      additionalProperties: false,
    }),
  }),
  validateGraph: tool({
    description: 'Validate the current graph for errors and warnings.',
    inputSchema: emptySchema,
  }),
  compileAndValidate: tool({
    description: 'Compile the graph and return any errors.',
    inputSchema: emptySchema,
  }),
  getPreviewStatus: tool({
    description: 'Get preview renderer status and last error.',
    inputSchema: emptySchema,
  }),
  capturePreview: tool({
    description: 'Capture a preview snapshot, upload to storage, and return a URL plus metadata.',
    inputSchema: emptySchema,
  }),
} as const;

export type ToolSet = typeof TOOL_SET;
