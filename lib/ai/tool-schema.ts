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
  compileGraph: tool({
    description: 'Compile the current graph into TSL code (read-only).',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        includeImports: { type: 'boolean' },
        maxChars: { type: 'number' },
      },
      additionalProperties: false,
    }),
  }),
  validateGraph: tool({
    description: 'Validate the current graph for missing nodes/handles and material node issues.',
    inputSchema: emptySchema,
  }),
  addNode: tool({
    description: 'Add a node with optional position and initial values.',
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
      required: ['type'],
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
  autoLayout: tool({
    description: 'Automatically layout the current graph.',
    inputSchema: emptySchema,
  }),
  capturePreviewImage: tool({
    description: 'Capture the current shader preview image and return a URL for visual verification.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['png', 'jpeg'] },
        quality: { type: 'number' },
      },
      additionalProperties: false,
    }),
  }),
} as const;

export type ToolSet = typeof TOOL_SET;
