import { registry } from '@/lib/registry';
import { MATERIAL_NODE_TYPES } from '@/lib/nodes';
import { useEditorStore } from '@/store/editor';
import type { SubgraphDefinition, CodeNodeDefinition, TSLNodeData } from '@/lib/types';
import type { Node } from '@xyflow/react';
import { getMultiOpInputHandleIds } from '@/lib/multi-op';
import type { AvailableNode, GraphSnapshot, NodeDefinition, NodeSummary, ValidationIssue, ValidationReport } from './types';

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
  const { nodes, edges, selectedNodeIds, globals, activeRootGraph } = useEditorStore.getState();
  const materialNode = nodes.find((node) => (MATERIAL_NODE_TYPES as readonly string[]).includes(node.data.type));

  const summarizedNodes: NodeSummary[] = nodes.map((node) => ({
    id: node.id,
    type: node.data.type as NodeSummary['type'],
    values: node.data.values ?? {},
    dynamicPorts: node.data.dynamicPorts,
  }));

  const summarizedEdges = edges.map((edge) => ({
    source: edge.source,
    sourcePort: edge.sourceHandle ?? null,
    target: edge.target,
    targetPort: edge.targetHandle ?? null,
  }));

  return {
    nodes: summarizedNodes,
    edges: summarizedEdges,
    activeRootGraph,
    materialNodeId: materialNode?.id ?? null,
    selectedNodeIds,
    globals,
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

  const { subgraphs, codeNodes } = useEditorStore.getState();

  if (Object.keys(subgraphs).length) {
    result.Subgraph = [
      ...(result.Subgraph ?? []),
      ...Object.values(subgraphs).map((sg) => ({
        type: sg.id as AvailableNode['type'],
        label: sg.name,
        category: 'Subgraph',
      })),
    ];
  }

  if (Object.keys(codeNodes).length) {
    result.Advanced = [
      ...(result.Advanced ?? []),
      ...Object.values(codeNodes).map((cn) => ({
        type: cn.id as AvailableNode['type'],
        label: cn.name,
        category: 'Advanced',
      })),
    ];
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

type PortSets = {
  inputs: Set<string>;
  outputs: Set<string>;
  isKnown: boolean;
};

function getPortSets(node: Node<TSLNodeData>, def: NodeDefinition | null): PortSets {
  const inputs = new Set<string>();
  const outputs = new Set<string>();
  const type = node.data.type;
  const dynamicPorts = node.data.dynamicPorts ?? [];

  if (type === 'math/multiOp') {
    const handles = getMultiOpInputHandleIds(Array.isArray(node.data.operations) ? node.data.operations : []);
    handles.forEach((handle) => inputs.add(handle));
    outputs.add('out');
    return { inputs, outputs, isKnown: true };
  }

  if (type.startsWith('custom/')) {
    for (const port of dynamicPorts) {
      if (port.id.startsWith('in_')) inputs.add(port.id);
      if (port.id.startsWith('out_') || port.id === 'out') outputs.add(port.id);
    }
    return { inputs, outputs, isKnown: dynamicPorts.length > 0 };
  }

  if (type.startsWith('code/')) {
    for (const port of dynamicPorts) {
      if (port.id.startsWith('in_')) inputs.add(port.id);
      if (port.id === 'out') outputs.add(port.id);
    }
    return { inputs, outputs, isKnown: dynamicPorts.length > 0 };
  }

  if (type === 'subgraph/input') {
    for (const port of dynamicPorts) outputs.add(port.id);
    return { inputs, outputs, isKnown: dynamicPorts.length > 0 };
  }

  if (type === 'subgraph/output') {
    for (const port of dynamicPorts) inputs.add(port.id);
    return { inputs, outputs, isKnown: dynamicPorts.length > 0 };
  }

  if (def) {
    Object.keys(def.inputs ?? {}).forEach((key) => inputs.add(key));
    Object.keys(def.outputs ?? {}).forEach((key) => outputs.add(key));
    return { inputs, outputs, isKnown: true };
  }

  return { inputs, outputs, isKnown: false };
}

export function validateGraph(): ValidationReport {
  const { nodes, edges, globals, activeRootGraph } = useEditorStore.getState();
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const globalIdSet = new Set(globals.map((g) => g.id));
  const definitionCache = new Map<string, NodeDefinition | null>();
  const incomingCount = new Map<string, number>();
  const outgoingCount = new Map<string, number>();

  const resolveDefinition = (type: string) => {
    if (definitionCache.has(type)) return definitionCache.get(type) ?? null;
    const def = getNodeDefinition(type);
    definitionCache.set(type, def);
    return def;
  };

  for (const node of nodes) {
    const def = resolveDefinition(node.data.type);
    const isCustom = node.data.type.startsWith('custom/') || node.data.type.startsWith('code/');
    const isAnchor = node.data.type === 'subgraph/input' || node.data.type === 'subgraph/output';
    if (!def && !isCustom && !isAnchor && node.data.type !== GROUP_NODE_TYPE && node.data.type !== 'math/multiOp') {
      warnings.push({
        type: 'unknown-node',
        nodeId: node.id,
        message: `Unknown node type "${node.data.type}" (${node.id}).`,
      });
    }

    if (node.data.type === 'global/ref') {
      const globalId = typeof node.data.values?.globalId === 'string' ? node.data.values.globalId : null;
      if (!globalId || !globalIdSet.has(globalId)) {
        errors.push({
          type: 'missing-node',
          nodeId: node.id,
          message: `Global reference "${node.id}" is missing a valid global binding.`,
        });
      }
    }
  }

  let danglingEdges = 0;
  for (const edge of edges) {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);

    if (!sourceNode || !targetNode) {
      danglingEdges += 1;
      errors.push({
        type: 'missing-node',
        edgeId: edge.id,
        message: `Edge "${edge.id}" references missing node(s).`,
      });
      continue;
    }

    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
    outgoingCount.set(edge.source, (outgoingCount.get(edge.source) ?? 0) + 1);

    const sourceDef = resolveDefinition(sourceNode.data.type);
    const targetDef = resolveDefinition(targetNode.data.type);
    const sourcePorts = getPortSets(sourceNode, sourceDef);
    const targetPorts = getPortSets(targetNode, targetDef);

    const sourceHandle = edge.sourceHandle ?? 'out';
    if (sourcePorts.isKnown && sourceHandle && sourceHandle !== 'out' && !sourcePorts.outputs.has(sourceHandle)) {
      errors.push({
        type: 'missing-handle',
        edgeId: edge.id,
        nodeId: sourceNode.id,
        handle: sourceHandle,
        message: `Edge "${edge.id}" uses missing source handle "${sourceHandle}" on ${sourceNode.id}.`,
      });
    }

    const targetHandle = edge.targetHandle ?? null;
    if (targetPorts.isKnown && targetHandle && !targetPorts.inputs.has(targetHandle)) {
      errors.push({
        type: 'missing-handle',
        edgeId: edge.id,
        nodeId: targetNode.id,
        handle: targetHandle,
        message: `Edge "${edge.id}" uses missing target handle "${targetHandle}" on ${targetNode.id}.`,
      });
    }
  }

  const materialNodes = nodes.filter((node) =>
    (MATERIAL_NODE_TYPES as readonly string[]).includes(node.data.type)
  );

  if (activeRootGraph === 'material') {
    if (materialNodes.length === 0) {
      warnings.push({
        type: 'material-count',
        message: 'No material node found. The preview may be empty.',
      });
    } else if (materialNodes.length > 1) {
      errors.push({
        type: 'material-count',
        message: `Multiple material nodes found (${materialNodes.length}). Keep exactly one.`,
      });
    } else {
      const materialNode = materialNodes[0];
      const hasMaterialInput = edges.some((edge) => edge.target === materialNode.id);
      if (!hasMaterialInput) {
        warnings.push({
          type: 'material-unconnected',
          nodeId: materialNode.id,
          message: 'Material node has no incoming connections.',
        });
      }
    }
  } else {
    const postOutputNode = nodes.find((node) => node.id === 'post-output' || node.data.type === 'post/output');
    const hasConnectedPostOutput = !!postOutputNode && edges.some(
      (edge) => edge.target === postOutputNode.id
    );
    if (!hasConnectedPostOutput) {
      errors.push({
        type: 'post-output-unconnected',
        nodeId: postOutputNode?.id,
        message: 'Post graph output must be connected to post/output.color.',
      });
    }
  }

  for (const node of nodes) {
    if (node.data.type === GROUP_NODE_TYPE) continue;
    const hasIncoming = (incomingCount.get(node.id) ?? 0) > 0;
    const hasOutgoing = (outgoingCount.get(node.id) ?? 0) > 0;
    if (!hasIncoming && !hasOutgoing) {
      warnings.push({
        type: 'unused-node',
        nodeId: node.id,
        message: `Node "${node.id}" is not connected to anything.`,
      });
    }
  }

  return {
    errors,
    warnings,
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      materialCount: materialNodes.length,
      danglingEdges,
    },
  };
}
