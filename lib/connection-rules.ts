import type { Edge } from '@xyflow/react';
import type { AppNode } from './types';
import { hasCycle } from './graph-utils';
import {
    getLocalSourceId,
    isLocalGetNode,
    isLocalScopeAccessible,
    isLocalSetNode,
} from './local-utils';

export interface ConnectionLike {
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
}

/**
 * Structural validity of a connection: endpoint existence, loop-scope rules,
 * local get binding scope, and acyclicity. Shared by React Flow's
 * isValidConnection and the connect-to-existing-node picker.
 */
export function isConnectionAllowed(
    connection: ConnectionLike,
    nodes: AppNode[],
    edges: Edge[]
): boolean {
    const target = nodes.find((node) => node.id === connection.target);
    const source = nodes.find((node) => node.id === connection.source);
    const nodesById = new Map(nodes.map((node) => [node.id, node]));

    if (!target || !source) {
        return false;
    }

    const getLoopParentId = (node: AppNode): string | null => {
        if (node.type === 'loop' || node.data.type === 'loop') return node.id;
        let parentId = node.parentId;
        while (parentId) {
            const parent = nodesById.get(parentId);
            if (!parent) break;
            if (parent.type === 'loop' || parent.data.type === 'loop') return parent.id;
            parentId = parent.parentId;
        }
        return null;
    };

    const sourceLoopId = getLoopParentId(source);
    const targetLoopId = getLoopParentId(target);

    // Disallow connections across different loops
    if (sourceLoopId && targetLoopId && sourceLoopId !== targetLoopId) {
        return false;
    }

    // Inside -> outside only allowed from loop/output
    if (sourceLoopId && !targetLoopId) {
        if (source.data.type !== 'loop/output') return false;
    }

    // Outside -> inside allowed, except into loop/output (must be internal)
    if (!sourceLoopId && targetLoopId) {
        if (target.data.type === 'loop/output') return false;
    }

    if (isLocalGetNode(source)) {
        const sourceSetId = getLocalSourceId(source);
        if (!sourceSetId) return false;
        const sourceSetNode = nodesById.get(sourceSetId);
        if (!isLocalSetNode(sourceSetNode)) return false;
        if (!isLocalScopeAccessible(sourceSetNode, source, nodesById)) return false;
    }

    return !hasCycle(target, source, nodes, edges);
}
