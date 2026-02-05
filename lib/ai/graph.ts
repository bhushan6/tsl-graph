import type { Node, Edge } from '@xyflow/react';
import { registry } from '@/lib/registry';
import { MATERIAL_NODE_TYPES } from '@/lib/nodes';
import { compileGraph } from '@/lib/compiler';
import { useEditorStore } from '@/store/editor';
import type { AppNode, TSLNodeData, SubgraphDefinition, CodeNodeDefinition } from '@/lib/types';
import type { AvailableNode, CompileResult, EdgeSummary, GraphSnapshot, NodeDefinition, NodeSummary, ValidationResult } from './types';

const GROUP_NODE_TYPE = 'group';

function getCustomNodeDefinition(
  type: string,
  subgraphs: Record<string, SubgraphDefinition>,
  codeNodes: Record<string, CodeNodeDefinition>
): NodeDefinition | null {
  if (subgraphs[type]) {
    const subgraph = subgraphs[type];
    const inputs = Object.fromEntries(
      subgraph.inputs.map((port) => [port.id, { label: port.label, type: port.type, connectionOnly: true }])
    );
    const outputs = Object.fromEntries(
      subgraph.outputs.map((port) => [port.id, { label: port.label, type: port.type }])
    );
    return {
      type,
      label: subgraph.name,
      category: 'Subgraph',
      inputs,
      outputs,
    };
  }

  if (codeNodes[type]) {
    const codeNode = codeNodes[type];
    const inputs = Object.fromEntries(
      codeNode.inputs.map((port) => [port.id, { label: port.label, type: port.type }])
    );
    const outputs = {
      [codeNode.output.id]: { label: codeNode.output.label, type: codeNode.output.type },
    };
    return {
      type,
      label: codeNode.name,
      category: 'Advanced',
      inputs,
      outputs,
    };
  }

  return null;
}

export function getGraphSnapshot(): GraphSnapshot {
  const { nodes, edges, selectedNodeIds, graphStructureVersion } = useEditorStore.getState();
  const materialNode = nodes.find((node) => (MATERIAL_NODE_TYPES as readonly string[]).includes(node.data.type));

  const summarizedNodes: NodeSummary[] = nodes.map((node) => ({
    id: node.id,
    type: node.data.type as NodeSummary['type'],
    position: node.position,
    values: node.data.values ?? {},
    localName: node.data.localName,
    dynamicPorts: node.data.dynamicPorts,
  }));

  const summarizedEdges: EdgeSummary[] = edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourceHandle ?? null,
    target: edge.target,
    targetHandle: edge.targetHandle ?? null,
  }));

  return {
    graphVersion: graphStructureVersion,
    selectedNodeIds,
    materialNodeId: materialNode?.id ?? null,
    nodes: summarizedNodes,
    edges: summarizedEdges,
  };
}

export function getAvailableNodes(): Record<string, AvailableNode[]> {
  const grouped = registry.byCategory();
  const result: Record<string, AvailableNode[]> = {};

  for (const [category, defs] of Object.entries(grouped)) {
    result[category] = defs.map((def) => ({
      type: def.type,
      label: def.label,
      category: def.category,
      inputs: def.inputs
        ? Object.fromEntries(
            Object.entries(def.inputs).map(([key, port]) => [key, { label: port.label, type: port.type }])
          )
        : undefined,
      outputs: def.outputs
        ? Object.fromEntries(
            Object.entries(def.outputs).map(([key, port]) => [key, { label: port.label, type: port.type }])
          )
        : undefined,
    }));
  }

  return result;
}

export function getNodeDefinition(type: string): NodeDefinition | null {
  if (type === GROUP_NODE_TYPE) {
    return { type, label: 'Group', category: 'Group' };
  }

  const def = registry.get(type);
  if (def) {
    return {
      type: def.type,
      label: def.label,
      category: def.category,
      inputs: def.inputs,
      outputs: def.outputs,
    };
  }

  const { subgraphs, codeNodes } = useEditorStore.getState();
  return getCustomNodeDefinition(type, subgraphs, codeNodes);
}

function getNodePorts(node: AppNode, subgraphs: Record<string, SubgraphDefinition>, codeNodes: Record<string, CodeNodeDefinition>) {
  if (node.data.type === GROUP_NODE_TYPE) {
    return { inputs: {}, outputs: {} };
  }

  const registryDef = registry.get(node.data.type);
  if (registryDef) {
    return { inputs: registryDef.inputs ?? {}, outputs: registryDef.outputs ?? {} };
  }

  const customDef = getCustomNodeDefinition(node.data.type, subgraphs, codeNodes);
  if (customDef) {
    return { inputs: customDef.inputs ?? {}, outputs: customDef.outputs ?? {} };
  }

  if (node.data.dynamicPorts) {
    const inputs: Record<string, { label: string; type: string }> = {};
    const outputs: Record<string, { label: string; type: string }> = {};
    node.data.dynamicPorts.forEach((port) => {
      if (port.id.startsWith('in_')) {
        inputs[port.id] = { label: port.label, type: port.type };
      } else {
        outputs[port.id] = { label: port.label, type: port.type };
      }
    });
    return { inputs, outputs };
  }

  return { inputs: {}, outputs: {} };
}

export function validateGraph(): ValidationResult {
  const { nodes, edges, subgraphs, codeNodes } = useEditorStore.getState();
  const errors: string[] = [];
  const warnings: string[] = [];

  const allowedTypes = new Set([
    ...registry.types(),
    ...Object.keys(subgraphs),
    ...Object.keys(codeNodes),
    GROUP_NODE_TYPE,
  ]);

  for (const node of nodes) {
    if (!allowedTypes.has(node.data.type)) {
      errors.push(`Unknown node type: ${node.data.type}`);
    }
  }

  const materialNode = nodes.find((node) => (MATERIAL_NODE_TYPES as readonly string[]).includes(node.data.type));
  if (!materialNode) {
    errors.push('No material node found. Add a material node (e.g., MeshStandardMaterial).');
  }

  for (const edge of edges) {
    const source = nodes.find((node) => node.id === edge.source);
    const target = nodes.find((node) => node.id === edge.target);

    if (!source) {
      errors.push(`Edge source node not found: ${edge.source}`);
      continue;
    }
    if (!target) {
      errors.push(`Edge target node not found: ${edge.target}`);
      continue;
    }

    const sourcePorts = getNodePorts(source, subgraphs, codeNodes).outputs;
    const targetPorts = getNodePorts(target, subgraphs, codeNodes).inputs;
    const sourceHandle = edge.sourceHandle ?? 'out';
    const targetHandle = edge.targetHandle ?? 'in';

    if (edge.sourceHandle && !sourcePorts[edge.sourceHandle]) {
      errors.push(`Unknown output handle "${edge.sourceHandle}" on node ${source.id}`);
    }

    if (edge.targetHandle && !targetPorts[edge.targetHandle]) {
      errors.push(`Unknown input handle "${edge.targetHandle}" on node ${target.id}`);
    }

    if (!edge.sourceHandle && !sourcePorts[sourceHandle]) {
      warnings.push(`Edge ${edge.id} is missing a source handle.`);
    }

    if (!edge.targetHandle && !targetPorts[targetHandle]) {
      warnings.push(`Edge ${edge.id} is missing a target handle.`);
    }
  }

  return { errors, warnings };
}

export function compileAndValidate(): CompileResult {
  const { nodes, edges, subgraphs, codeNodes } = useEditorStore.getState();
  try {
    compileGraph(nodes as Node<TSLNodeData>[], edges as Edge[], subgraphs, codeNodes);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
