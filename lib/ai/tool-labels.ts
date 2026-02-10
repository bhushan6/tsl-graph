import type { ToolName } from '@/lib/ai/types';

const TOOL_LABELS: Record<ToolName, string> = {
  getGraphSnapshot: 'Reading graph',
  getAvailableNodes: 'Listing node types',
  getNodeDefinition: 'Reading node definition',
  compileGraph: 'Generating code',
  validateGraph: 'Validating graph',
  addNode: 'Adding node',
  connectNodes: 'Connecting nodes',
  setNodeValue: 'Editing node',
  deleteNode: 'Deleting node',
  autoLayout: 'Auto layout',
  capturePreviewImage: 'Capturing preview',
};

export function getToolLabel(toolName: ToolName | string): string {
  return TOOL_LABELS[toolName as ToolName] ?? 'Working on graph';
}
