import type { Node, Edge } from '@xyflow/react';
import type { TSLNodeData } from '@/lib/types';

const DEFAULT_X_GAP = 280;
const DEFAULT_Y_GAP = 160;

function computeLayers(nodeIds: string[], edges: Edge[]): Map<string, number> {
  const layers = new Map<string, number>();
  nodeIds.forEach((id) => layers.set(id, 0));

  for (let i = 0; i < nodeIds.length; i += 1) {
    let changed = false;
    for (const edge of edges) {
      const sourceLevel = layers.get(edge.source) ?? 0;
      const targetLevel = layers.get(edge.target) ?? 0;
      if (targetLevel < sourceLevel + 1) {
        layers.set(edge.target, sourceLevel + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }

  return layers;
}

export function autoLayoutNodes(nodes: Node<TSLNodeData>[], edges: Edge[]): Node<TSLNodeData>[] {
  if (!nodes.length) return nodes;

  const nodeIds = nodes.map((node) => node.id);
  const layers = computeLayers(nodeIds, edges);
  const grouped = new Map<number, Node<TSLNodeData>[]>();

  for (const node of nodes) {
    const layer = layers.get(node.id) ?? 0;
    const list = grouped.get(layer) ?? [];
    list.push(node);
    grouped.set(layer, list);
  }

  const sortedLayers = Array.from(grouped.keys()).sort((a, b) => a - b);
  const nextPositions = new Map<string, { x: number; y: number }>();

  for (const layer of sortedLayers) {
    const column = grouped.get(layer) ?? [];
    column.sort((a, b) => a.id.localeCompare(b.id));
    column.forEach((node, index) => {
      nextPositions.set(node.id, {
        x: layer * DEFAULT_X_GAP,
        y: index * DEFAULT_Y_GAP,
      });
    });
  }

  return nodes.map((node) => ({
    ...node,
    position: nextPositions.get(node.id) ?? node.position,
  }));
}
