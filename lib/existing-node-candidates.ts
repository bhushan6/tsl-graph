import type { Edge } from '@xyflow/react';
import type {
    AppNode,
    CodeNodeDefinition,
    GlobalContextEntry,
    SubgraphDefinition,
    TSLType,
} from './types';
import {
    getConnectableInputHandles,
    getConnectableOutputHandles,
    type GraphHandleContext,
} from './graph-handles';
import { isConnectionAllowed } from './connection-rules';
import { getHandleDisplayLabel, getTypeMatchRank, isTypeMatch } from './node-picker-utils';
import { getNodeDisplayName } from './node-display-name';
import { getNodeSearchFields } from './note-search';
import {
    getChannelIndex,
    getChannelRangeLabel,
    getPackingSourceWidth,
    getPackingVectorType,
    isPackingAnchorCompatible,
} from './vector-packing';

export interface ExistingNodeCandidate {
    key: string;
    nodeId: string;
    handleId: string;
    nodeLabel: string;
    handleLabel: string;
    displayLabel: string;
    type: TSLType;
    matchRank: number;
    searchText: string;
}

export interface ExistingNodeCandidateParams {
    nodes: AppNode[];
    edges: Edge[];
    globals: GlobalContextEntry[];
    subgraphs: Record<string, SubgraphDefinition>;
    codeNodes: Record<string, CodeNodeDefinition>;
    sourceNodeId: string;
    sourceHandleId: string;
    /** Direction of the DRAGGED handle: 'output' = wire needs a target input. */
    handleDirection: 'input' | 'output';
    sourceDataType: TSLType | '';
}

/**
 * Existing graph nodes (and their compatible handles) a dangling connection
 * can be attached to. Excludes the drag source itself and anything the
 * connection rules reject (cycles, loop scope, unbound local gets).
 *
 * Walks the whole graph with type resolution, so call once per picker open,
 * not per keystroke.
 */
export function getExistingNodeCandidates(params: ExistingNodeCandidateParams): ExistingNodeCandidate[] {
    const {
        nodes,
        edges,
        globals,
        subgraphs,
        codeNodes,
        sourceNodeId,
        sourceHandleId,
        handleDirection,
        sourceDataType,
    } = params;

    const ctx: GraphHandleContext = {
        nodesById: new Map(nodes.map((node) => [node.id, node])),
        edges,
        globals,
        subgraphs,
        codeNodes,
    };

    const candidates: ExistingNodeCandidate[] = [];

    for (const node of nodes) {
        if (node.id === sourceNodeId) continue;

        const handles =
            handleDirection === 'output'
                ? getConnectableInputHandles(node, ctx)
                : getConnectableOutputHandles(node, ctx);
        if (handles.length === 0) continue;

        const displayName = getNodeDisplayName(node, subgraphs, codeNodes);
        const localName =
            typeof node.data.values?.localName === 'string' ? node.data.values.localName : '';
        const nodeLabel = localName ? `${displayName} (${localName})` : displayName;
        const searchBase = getNodeSearchFields(node, displayName).join(' ');

        for (const handle of handles) {
            const packingWidth = getPackingSourceWidth(
                (sourceDataType || null) as TSLType | null
            );
            const packingIndex = getChannelIndex(handle.id);
            const isPackingAnchor =
                handleDirection === 'output'
                && isPackingAnchorCompatible(node.data.type, handle.id, sourceDataType);

            const connection =
                handleDirection === 'output'
                    ? {
                        source: sourceNodeId,
                        sourceHandle: sourceHandleId,
                        target: node.id,
                        targetHandle: handle.id,
                    }
                    : {
                        source: node.id,
                        sourceHandle: handle.id,
                        target: sourceNodeId,
                        targetHandle: sourceHandleId,
                    };

            // Candidate handles must be type-compatible. A dragged output can
            // only land on an unoccupied input handle; a dragged input can
            // connect to any compatible output, including one that already
            // fans out to other inputs.
            if (!isTypeMatch(handle.type, sourceDataType) && !isPackingAnchor) continue;
            if (
                handleDirection === 'output'
                && edges.some(
                    (edge) => edge.target === node.id
                        && (edge.targetHandle ?? null) === handle.id
                )
            ) continue;
            if (!isConnectionAllowed(connection, nodes, edges)) continue;

            const handleLabel = isPackingAnchor
                ? getChannelRangeLabel(packingIndex, packingWidth)
                : handle.label;

            candidates.push({
                key: `existing:${node.id}:${handle.id}`,
                nodeId: node.id,
                handleId: handle.id,
                nodeLabel,
                handleLabel,
                displayLabel: getHandleDisplayLabel(nodeLabel, handleLabel, handles.length),
                type: isPackingAnchor
                    ? (getPackingVectorType(packingWidth) ?? handle.type)
                    : handle.type,
                matchRank: isPackingAnchor ? 0 : getTypeMatchRank(handle.type, sourceDataType),
                searchText: `${searchBase} ${handleLabel}`,
            });
        }
    }

    candidates.sort(
        (a, b) => a.matchRank - b.matchRank || a.displayLabel.localeCompare(b.displayLabel)
    );

    return candidates;
}
