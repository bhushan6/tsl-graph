import type { Edge } from '@xyflow/react';
import type { AppNode, CodeNodeDefinition, NodeType, SubgraphDefinition } from './types';
import { getAbsolutePosition, getNodeDimensions } from './utils';
import {
    LOCAL_SET_INPUT_HANDLE,
    getLocalName,
    getLoopAncestorIds,
    isLocalGetType,
    isLocalSetType,
    makeUniqueLocalName,
} from './local-utils';
import { getNodeDisplayName } from './node-display-name';

export type EdgePortalBlockReason =
    | 'edge-not-found'
    | 'synthetic-edge'
    | 'already-portal'
    | 'missing-endpoint'
    | 'cross-loop';

export interface EdgePortalPlan {
    setNode: AppNode;
    getNode: AppNode;
    addedEdges: Edge[];
    removedEdgeId: string;
}

export interface EdgePortalParams {
    edgeId: string;
    nodes: AppNode[];
    edges: Edge[];
    subgraphs: Record<string, SubgraphDefinition>;
    codeNodes: Record<string, CodeNodeDefinition>;
    /** Injectable timestamp for deterministic tests. */
    now?: number;
}

const GAP = 48;
const PORTAL_NODE_WIDTH = 160;
const SOURCE_WIDTH_FALLBACK = 200;

// Keeps ids unique when several conversions land in the same millisecond.
let portalIdCounter = 0;

export function isEdgePortalBlocked(
    result: EdgePortalPlan | { blocked: EdgePortalBlockReason }
): result is { blocked: EdgePortalBlockReason } {
    return 'blocked' in result;
}

/**
 * Plan replacing an edge with a local set/get portal pair: a set node next to
 * the source, a get node next to the target, and the two connecting edges.
 * Pure — the store action applies the plan atomically.
 */
export function planEdgeToLocalPortal(
    params: EdgePortalParams
): EdgePortalPlan | { blocked: EdgePortalBlockReason } {
    const { edgeId, nodes, edges, subgraphs, codeNodes, now } = params;

    const edge = edges.find((entry) => entry.id === edgeId);
    if (!edge) return { blocked: 'edge-not-found' };
    if (
        edge.id.startsWith('__local_dep__') ||
        edge.id.startsWith('__local_set_dep__') ||
        edge.targetHandle === '__local_dep__'
    ) {
        return { blocked: 'synthetic-edge' };
    }

    const nodesById = new Map<string, AppNode>(nodes.map((node) => [node.id, node]));
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (!source || !target) return { blocked: 'missing-endpoint' };
    const isPortalType = (node: AppNode) =>
        isLocalSetType(node.data.type) || isLocalGetType(node.data.type);
    if (isPortalType(source) || isPortalType(target)) {
        return { blocked: 'already-portal' };
    }

    const sourceLoopId = getLoopAncestorIds(source, nodesById)[0] ?? null;
    const targetLoopId = getLoopAncestorIds(target, nodesById)[0] ?? null;
    if (sourceLoopId && targetLoopId && sourceLoopId !== targetLoopId) {
        return { blocked: 'cross-loop' };
    }

    const baseName = getLocalName(source).trim() || getNodeDisplayName(source, subgraphs, codeNodes);
    const handleSuffix = edge.sourceHandle && edge.sourceHandle !== 'out' ? `.${edge.sourceHandle}` : '';
    const localName = makeUniqueLocalName(`${baseName}${handleSuffix}`, nodes);

    const toParentRelative = (abs: { x: number; y: number }, parentId: string | undefined) => {
        if (!parentId) return abs;
        const parent = nodesById.get(parentId);
        if (!parent) return abs;
        const parentAbs = getAbsolutePosition(parent, nodes);
        return { x: abs.x - parentAbs.x, y: abs.y - parentAbs.y };
    };

    const sourceAbs = getAbsolutePosition(source, nodes);
    const targetAbs = getAbsolutePosition(target, nodes);
    const sourceWidth = getNodeDimensions(source).width || SOURCE_WIDTH_FALLBACK;

    // A set inside a loop is unreadable outside it. When the edge escapes a
    // loop (legal only from loop/output), park the set just outside the loop
    // so the outside get stays in scope.
    let setParentId = source.parentId;
    let setAbs = { x: sourceAbs.x + sourceWidth + GAP, y: sourceAbs.y };
    if (sourceLoopId && !targetLoopId) {
        const loopNode = nodesById.get(sourceLoopId);
        if (loopNode) {
            setParentId = loopNode.parentId;
            const loopAbs = getAbsolutePosition(loopNode, nodes);
            const loopWidth = getNodeDimensions(loopNode).width || SOURCE_WIDTH_FALLBACK;
            setAbs = { x: loopAbs.x + loopWidth + GAP, y: sourceAbs.y };
        }
    }

    const getParentId = target.parentId;
    const getAbs = { x: targetAbs.x - PORTAL_NODE_WIDTH - GAP, y: targetAbs.y };

    const stamp = now ?? Date.now();
    portalIdCounter += 1;
    const setId = `local/set-${stamp}-${portalIdCounter}`;
    portalIdCounter += 1;
    const getId = `local/get-${stamp}-${portalIdCounter}`;

    const setNode: AppNode = {
        id: setId,
        type: 'local/set',
        position: toParentRelative(setAbs, setParentId),
        ...(setParentId ? { parentId: setParentId, extent: 'parent' as const } : {}),
        data: {
            type: 'local/set' as NodeType,
            values: { localName },
            connected: {},
        },
    };

    const getNode: AppNode = {
        id: getId,
        type: 'local/get',
        position: toParentRelative(getAbs, getParentId),
        ...(getParentId ? { parentId: getParentId, extent: 'parent' as const } : {}),
        data: {
            type: 'local/get' as NodeType,
            values: { localSourceId: setId },
            connected: {},
        },
    };

    const addedEdges: Edge[] = [
        {
            id: `edge-${edge.source}-${edge.sourceHandle ?? 'out'}-${setId}-${LOCAL_SET_INPUT_HANDLE}`,
            source: edge.source,
            sourceHandle: edge.sourceHandle ?? null,
            target: setId,
            targetHandle: LOCAL_SET_INPUT_HANDLE,
        },
        {
            id: `edge-${getId}-out-${edge.target}-${edge.targetHandle ?? ''}`,
            source: getId,
            sourceHandle: 'out',
            target: edge.target,
            targetHandle: edge.targetHandle ?? null,
        },
    ];

    return { setNode, getNode, addedEdges, removedEdgeId: edge.id };
}
