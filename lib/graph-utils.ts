
import { Node, Edge } from '@xyflow/react';
import { TSLNodeData } from '@/lib/types';
import { getAbsolutePosition } from '@/lib/utils';

/**
 * Topologically sort nodes so dependencies come first.
 */
export function topologicalSort(nodes: Node<TSLNodeData>[], edges: Edge[]): string[] {
    const nodeIds = new Set(nodes.map(n => n.id));
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const id of nodeIds) {
        inDegree.set(id, 0);
        adjacency.set(id, []);
    }

    for (const edge of edges) {
        if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
            adjacency.get(edge.source)!.push(edge.target);
            inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
        }
    }

    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
        if (degree === 0) queue.push(id);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
        const current = queue.shift()!;
        sorted.push(current);

        for (const neighbor of adjacency.get(current) || []) {
            const newDegree = (inDegree.get(neighbor) || 1) - 1;
            inDegree.set(neighbor, newDegree);
            if (newDegree === 0) queue.push(neighbor);
        }
    }

    return sorted;
}

export function getOutgoers(node: Node, nodes: Node[], edges: Edge[]): Node[] {
    if (!node) {
        return [];
    }

    const outgoerIds = edges
        .filter((e) => e.source === node.id)
        .map((e) => e.target);

    return nodes.filter((n) => outgoerIds.includes(n.id));
}

export function hasCycle(target: Node, source: Node, nodes: Node[], edges: Edge[]): boolean {
    const visited = new Set<string>();

    const visit = (currentNode: Node): boolean => {
        if (visited.has(currentNode.id)) return false;
        visited.add(currentNode.id);

        const outgoers = getOutgoers(currentNode, nodes, edges);
        for (const outgoer of outgoers) {
            if (outgoer.id === source.id) return true;
            if (visit(outgoer)) return true;
        }

        return false;
    };

    if (target.id === source.id) return true;
    return visit(target);
}

export function getParentedPositionForNewNode(
    nodes: Node<TSLNodeData>[],
    sourceNodeId: string | null,
    flowPosition: { x: number; y: number }
): { parentId: string; extent: 'parent'; position: { x: number; y: number } } | null {
    if (!sourceNodeId) return null;
    const sourceNode = nodes.find(n => n.id === sourceNodeId);
    if (!sourceNode?.parentId) return null;
    const parentNode = nodes.find(n => n.id === sourceNode.parentId);
    if (!parentNode) return null;
    const parentAbs = getAbsolutePosition(parentNode, nodes);
    return {
        parentId: sourceNode.parentId,
        extent: 'parent',
        position: {
            x: flowPosition.x - parentAbs.x,
            y: flowPosition.y - parentAbs.y,
        },
    };
}
