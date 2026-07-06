
import { Node, Edge } from '@xyflow/react';
import { AppNode, TSLNodeData } from '@/lib/types';
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

export function replaceEdgeOnTargetHandle(
    edges: Edge[],
    target: string,
    targetHandle: string | null | undefined
): Edge[] {
    const normalizedTargetHandle = targetHandle ?? null;
    return edges.filter((edge) => {
        const sameTarget = edge.target === target;
        const sameHandle = (edge.targetHandle ?? null) === normalizedTargetHandle;
        return !(sameTarget && sameHandle);
    });
}

export interface DropParentGroup {
    id: string;
    absolutePosition: { x: number; y: number };
}

/**
 * Resolve the group a node dropped at flowPosition should be nested inside:
 * the dragged source's enclosing group when extending an edge, otherwise the
 * deepest group whose bounds contain the drop point. Loop boundary handles
 * (count/start/end/seed/cond and loop output) block nesting because their
 * connections must cross the group boundary.
 */
export function resolveDropParentGroup(
    nodes: AppNode[],
    options: {
        sourceNode?: AppNode;
        sourceHandleId?: string | null;
        handleDirection?: 'input' | 'output' | null;
        flowPosition: { x: number; y: number };
    }
): DropParentGroup | null {
    const { sourceNode, sourceHandleId, handleDirection, flowPosition } = options;
    const nodesById = new Map(nodes.map((node) => [node.id, node]));

    const isGroupNode = (node: AppNode) => node.type === 'group' || node.data.type === 'loop';
    const isLoopBoundaryHandle = (node: AppNode, direction: 'input' | 'output', handleId?: string | null) => {
        if (node.data.type === 'loop/count' && direction === 'input' && handleId === 'count') return true;
        if (node.data.type === 'loop/start' && direction === 'input' && handleId === 'start') return true;
        if (node.data.type === 'loop/end' && direction === 'input' && handleId === 'end') return true;
        if (node.data.type === 'loop/count2' && direction === 'input' && handleId === 'count') return true;
        if (node.data.type === 'loop/accumulator' && direction === 'input' && handleId === 'seed') return true;
        if (node.data.type === 'loop/condition' && direction === 'input' && handleId === 'cond') return true;
        if (node.data.type === 'loop/output' && direction === 'output' && (!handleId || handleId === 'out')) return true;
        return false;
    };

    const getGroupAncestorId = (node: AppNode | undefined): string | null => {
        if (!node) return null;
        let parentId = node.parentId;
        while (parentId) {
            const parent = nodesById.get(parentId);
            if (!parent) break;
            if (isGroupNode(parent)) return parent.id;
            parentId = parent.parentId;
        }
        return null;
    };

    const getGroupDepth = (node: AppNode): number => {
        let depth = 0;
        let parentId = node.parentId;
        while (parentId) {
            depth += 1;
            parentId = nodesById.get(parentId)?.parentId;
        }
        return depth;
    };

    const getNodeDimension = (node: AppNode, key: 'width' | 'height'): number | null => {
        const direct = (node as AppNode & { [k: string]: unknown })[key];
        if (typeof direct === 'number') return direct;
        const styleValue = node.style?.[key];
        if (typeof styleValue === 'number') return styleValue;
        if (typeof styleValue === 'string') {
            const parsed = Number(styleValue.replace('px', ''));
            return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
    };

    const blockGroupNesting = !!sourceNode
        && !!handleDirection
        && isLoopBoundaryHandle(sourceNode, handleDirection, sourceHandleId);
    let parentGroupId: string | null = blockGroupNesting || !sourceNode
        ? null
        : getGroupAncestorId(sourceNode);

    if (!parentGroupId && !blockGroupNesting) {
        const groupCandidates = nodes.filter(isGroupNode).flatMap((node) => {
            const width = getNodeDimension(node, 'width');
            const height = getNodeDimension(node, 'height');
            if (!width || !height) return [];
            const abs = getAbsolutePosition(node, nodes);
            const inside = flowPosition.x >= abs.x
                && flowPosition.x <= abs.x + width
                && flowPosition.y >= abs.y
                && flowPosition.y <= abs.y + height;
            if (!inside) return [];
            return [{ node, depth: getGroupDepth(node) }];
        });

        if (groupCandidates.length > 0) {
            groupCandidates.sort((a, b) => b.depth - a.depth);
            parentGroupId = groupCandidates[0].node.id;
        }
    }

    if (!parentGroupId) return null;
    const parent = nodesById.get(parentGroupId);
    if (!parent) return null;

    return {
        id: parent.id,
        absolutePosition: getAbsolutePosition(parent, nodes),
    };
}
