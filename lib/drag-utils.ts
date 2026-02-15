import type { AppNode } from '@/lib/types';

/**
 * Get a node's width or height, checking direct properties and style.
 */
export function getNodeDimension(n: AppNode, key: 'width' | 'height'): number | null {
    const direct = (n as AppNode & { [k: string]: unknown })[key];
    if (typeof direct === 'number') return direct;
    const styleValue = n.style?.[key];
    if (typeof styleValue === 'number') return styleValue;
    if (typeof styleValue === 'string') {
        const parsed = Number(styleValue.replace('px', ''));
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

/**
 * Get the nesting depth of a node inside group/loop parents.
 */
export function getGroupDepth(
    n: AppNode,
    nodesById: Map<string, AppNode>,
): number {
    let depth = 0;
    let parentId = n.parentId;
    while (parentId) {
        depth += 1;
        parentId = nodesById.get(parentId)?.parentId;
    }
    return depth;
}

/**
 * Walk up the parent chain and return the nearest group/loop ancestor id.
 */
export function getGroupAncestorId(
    n: AppNode,
    nodesById: Map<string, AppNode>,
): string | null {
    let parentId = n.parentId;
    while (parentId) {
        const parent = nodesById.get(parentId);
        if (!parent) break;
        if (parent.type === 'group' || parent.data.type === 'loop') return parent.id;
        parentId = parent.parentId;
    }
    return null;
}

/**
 * Check whether a node is a group (visual container) or a loop node.
 */
export function isGroupNode(n: AppNode): boolean {
    return n.type === 'group' || n.data.type === 'loop';
}
