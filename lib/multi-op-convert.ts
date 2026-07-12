import type { Node, Edge } from '@xyflow/react';
import type { TSLNodeData } from './types';
import { registry } from './registry';
import {
    isValidMultiOp,
    getMultiOpChainKey,
    getMultiOpHandleId,
    getMultiOpParams,
    getMultiOpNodeType,
    type MultiOp,
} from './multi-op';

export interface ChainDetectionResult {
    valid: boolean;
    /** Node IDs in chain order (head → tail) */
    orderedNodeIds: string[];
    reason?: string;
}

export interface MultiOpConversionResult {
    operations: MultiOp[];
    /** Values keyed by multiOp handle IDs (e.g., `op_<opId>_<paramKey>`) */
    values: Record<string, unknown>;
    /**
     * External edges to reconnect.
     * - incomingEdges: edges from outside the chain into the multiOp node
     * - outgoingEdges: edges from the multiOp node to outside the chain
     */
    incomingEdges: { originalEdge: Edge; newTargetHandle: string }[];
    outgoingEdges: { originalEdge: Edge; newSourceHandle: string }[];
}

/**
 * Get the `tsl` value for a node type from the registry.
 * Returns null if not found.
 */
function getNodeTsl(nodeType: string): string | null {
    const def = registry.get(nodeType);
    return def?.tsl ?? null;
}

/**
 * Detect whether the selected nodes form a valid linear chain
 * that can be converted to a single MultiOp node.
 */
export function detectConvertibleChain(
    selectedNodeIds: string[],
    nodes: Node<TSLNodeData>[],
    edges: Edge[]
): ChainDetectionResult {
    const fail = (reason: string): ChainDetectionResult => ({
        valid: false,
        orderedNodeIds: [],
        reason,
    });

    if (selectedNodeIds.length < 2) {
        return fail('Need at least 2 nodes to convert to Multi-op');
    }

    const selectedSet = new Set(selectedNodeIds);
    const nodesById = new Map(nodes.map((n) => [n.id, n]));

    // 1. Validate all selected nodes are valid multiOp operations
    for (const nodeId of selectedNodeIds) {
        const node = nodesById.get(nodeId);
        if (!node) return fail(`Node "${nodeId}" not found`);

        const tsl = getNodeTsl(node.data.type);
        if (!tsl || !isValidMultiOp(tsl)) {
            return fail(`Node "${node.data.type}" is not a valid Multi-op operation`);
        }
    }

    // 2. Build internal chain edges (edges connecting selected nodes via chainKey)
    // An edge is a "chain edge" if:
    //   - source and target are both in the selection
    //   - sourceHandle is 'out'
    //   - targetHandle is the chainKey of the target node's operation
    const internalChainEdges: Edge[] = [];
    const internalNonChainEdges: Edge[] = [];

    for (const edge of edges) {
        const srcInSelection = selectedSet.has(edge.source);
        const tgtInSelection = selectedSet.has(edge.target);

        if (!srcInSelection || !tgtInSelection) continue;

        const targetNode = nodesById.get(edge.target);
        if (!targetNode) continue;

        const targetTsl = getNodeTsl(targetNode.data.type);
        if (!targetTsl) continue;

        const chainKey = getMultiOpChainKey(targetTsl);

        if (edge.sourceHandle === 'out' && edge.targetHandle === chainKey) {
            internalChainEdges.push(edge);
        } else {
            internalNonChainEdges.push(edge);
        }
    }

    // 3. Build adjacency: for chain edges, each node can have at most 1 predecessor and 1 successor
    const predecessorMap = new Map<string, string>(); // nodeId → predecessor nodeId
    const successorMap = new Map<string, string>(); // nodeId → successor nodeId

    for (const edge of internalChainEdges) {
        // Check no node has multiple predecessors via chain
        if (predecessorMap.has(edge.target)) {
            return fail('Chain has a node with multiple chain inputs (branching)');
        }
        predecessorMap.set(edge.target, edge.source);

        // Check no node has multiple successors via chain within selection
        if (successorMap.has(edge.source)) {
            return fail('Chain has a node with multiple chain outputs (branching)');
        }
        successorMap.set(edge.source, edge.target);
    }

    // 4. Find the head node (no predecessor in the chain)
    const heads = selectedNodeIds.filter((id) => !predecessorMap.has(id));
    if (heads.length !== 1) {
        return fail(
            heads.length === 0
                ? 'Chain has a cycle'
                : 'Selected nodes do not form a single chain (multiple starting points)'
        );
    }

    // 5. Walk from head to tail
    const orderedNodeIds: string[] = [];
    let current: string | undefined = heads[0];
    const visited = new Set<string>();

    while (current) {
        if (visited.has(current)) {
            return fail('Chain has a cycle');
        }
        visited.add(current);
        orderedNodeIds.push(current);
        current = successorMap.get(current);
    }

    // 6. Verify all selected nodes are in the chain
    if (orderedNodeIds.length !== selectedNodeIds.length) {
        return fail(
            'Not all selected nodes are connected in a single chain'
        );
    }

    // 7. Disallow internal non-chain edges (a selected node feeding a non-chain
    //    input of another selected node). This would create ambiguity.
    if (internalNonChainEdges.length > 0) {
        return fail(
            'Selected nodes have non-chain connections between them (e.g., a node feeds a non-chain input of another selected node)'
        );
    }

    return { valid: true, orderedNodeIds };
}

/**
 * Build the MultiOp node data from an ordered chain of nodes.
 */
export function buildMultiOpFromChain(
    orderedNodeIds: string[],
    nodes: Node<TSLNodeData>[],
    edges: Edge[]
): MultiOpConversionResult {
    const nodesById = new Map(nodes.map((n) => [n.id, n]));
    const selectedSet = new Set(orderedNodeIds);

    const operations: MultiOp[] = [];
    const values: Record<string, unknown> = {};
    const incomingEdges: MultiOpConversionResult['incomingEdges'] = [];
    const outgoingEdges: MultiOpConversionResult['outgoingEdges'] = [];

    // Create operations for each node in chain order
    for (let i = 0; i < orderedNodeIds.length; i++) {
        const nodeId = orderedNodeIds[i];
        const node = nodesById.get(nodeId)!;
        const tsl = getNodeTsl(node.data.type)!;
        const chainKey = getMultiOpChainKey(tsl);

        const opId = `op_${Date.now()}_${i}_${Math.floor(Math.random() * 10000)}`;
        operations.push({ id: opId, op: tsl });

        // Get the params for this operation
        const isFirst = i === 0;
        const params = getMultiOpParams(tsl, isFirst);

        // For each param, transfer the value or edge
        for (const param of params) {
            const handleId = getMultiOpHandleId(opId, param.key);

            // Check if there's an external edge connecting to this input
            const inputEdge = edges.find(
                (e) =>
                    e.target === nodeId &&
                    e.targetHandle === param.key &&
                    !selectedSet.has(e.source)
            );

            if (inputEdge) {
                incomingEdges.push({
                    originalEdge: inputEdge,
                    newTargetHandle: handleId,
                });
            } else {
                // Transfer the literal value from the node's values
                const nodeValue = node.data.values[param.key];
                if (nodeValue !== undefined) {
                    values[handleId] = nodeValue;
                }
            }
        }

        // If this is the first node and it has a chainKey input with an external edge,
        // that edge needs to be rewired to the first op's chainKey param
        if (isFirst && chainKey) {
            const chainInputEdge = edges.find(
                (e) =>
                    e.target === nodeId &&
                    e.targetHandle === chainKey &&
                    !selectedSet.has(e.source)
            );
            if (chainInputEdge) {
                const chainHandleId = getMultiOpHandleId(opId, chainKey);
                // Only add if not already added in the params loop
                if (!incomingEdges.some((ie) => ie.originalEdge.id === chainInputEdge.id)) {
                    incomingEdges.push({
                        originalEdge: chainInputEdge,
                        newTargetHandle: chainHandleId,
                    });
                }
            }
            // Also transfer literal value for chainKey if present and no edge
            if (!edges.some((e) => e.target === nodeId && e.targetHandle === chainKey)) {
                const chainValue = node.data.values[chainKey];
                if (chainValue !== undefined) {
                    const chainHandleId = getMultiOpHandleId(opId, chainKey);
                    if (!(chainHandleId in values)) {
                        values[chainHandleId] = chainValue;
                    }
                }
            }
        }
    }

    // Collect outgoing edges from the last node in the chain
    const lastNodeId = orderedNodeIds[orderedNodeIds.length - 1];
    for (const edge of edges) {
        if (edge.source === lastNodeId && edge.sourceHandle === 'out' && !selectedSet.has(edge.target)) {
            outgoingEdges.push({
                originalEdge: edge,
                newSourceHandle: 'out', // MultiOp has a single 'out' handle
            });
        }
    }

    // Also collect outgoing edges from non-last nodes (these shouldn't exist in a valid
    // chain, but handle gracefully for edges to nodes outside the selection)
    for (let i = 0; i < orderedNodeIds.length - 1; i++) {
        const nodeId = orderedNodeIds[i];
        for (const edge of edges) {
            if (
                edge.source === nodeId &&
                edge.sourceHandle === 'out' &&
                !selectedSet.has(edge.target)
            ) {
                // This node's output also feeds an external node — this is valid
                // but it means the external node was using an intermediate result.
                // We can't perfectly represent this in multiOp, so we skip it.
                // The detection should have caught this if strict, but for safety:
                outgoingEdges.push({
                    originalEdge: edge,
                    newSourceHandle: 'out',
                });
            }
        }
    }

    return { operations, values, incomingEdges, outgoingEdges };
}

/** A single reconstructed node in a MultiOp expansion, in chain order (head → tail). */
export interface ExpandedOpNode {
    op: MultiOp['op'];
    /** Registry node type (e.g. `math/add`) resolved from the operation's tsl. */
    nodeType: string;
    /** Chain input handle for this operation (the input fed by the previous node). */
    chainKey: string | null;
    /** Literal values for the reconstructed node, keyed by input param key. */
    values: Record<string, unknown>;
}

export interface MultiOpExpansionResult {
    valid: boolean;
    reason?: string;
    /** One node per operation, in chain order (head → tail). */
    ops: ExpandedOpNode[];
    /**
     * External edges reconnected from the MultiOp node's inputs to the
     * reconstructed nodes. `opIndex` indexes into `ops`; `targetHandle` is the
     * param key on that node.
     */
    incomingEdges: { originalEdge: Edge; opIndex: number; targetHandle: string }[];
    /** External edges from the MultiOp node's `out` handle to reconnect to the tail node. */
    outgoingEdges: { originalEdge: Edge }[];
}

/**
 * Expand a MultiOp node back into a chain of individual operation nodes.
 * Inverse of {@link buildMultiOpFromChain}.
 */
export function buildChainFromMultiOp(
    multiOpNode: Node<TSLNodeData>,
    edges: Edge[]
): MultiOpExpansionResult {
    const fail = (reason: string): MultiOpExpansionResult => ({
        valid: false,
        reason,
        ops: [],
        incomingEdges: [],
        outgoingEdges: [],
    });

    const operations = multiOpNode.data.operations ?? [];
    if (operations.length === 0) {
        return fail('Multi-op node has no operations to expand');
    }

    const values = multiOpNode.data.values ?? {};
    const ops: ExpandedOpNode[] = [];

    // Map each external input handle id → the op/param it belongs to, so external
    // edges into the MultiOp node can be routed to the reconstructed nodes.
    const handleToOp = new Map<string, { opIndex: number; paramKey: string }>();

    for (let i = 0; i < operations.length; i++) {
        const { id: opId, op } = operations[i];

        const nodeType = getMultiOpNodeType(op);
        if (!nodeType) {
            return fail(`Operation "${op}" cannot be expanded to a node`);
        }

        const chainKey = getMultiOpChainKey(op);
        const isFirst = i === 0;
        const params = getMultiOpParams(op, isFirst);

        const nodeValues: Record<string, unknown> = {};
        for (const param of params) {
            const handleId = getMultiOpHandleId(opId, param.key);
            handleToOp.set(handleId, { opIndex: i, paramKey: param.key });

            const stored = values[handleId];
            nodeValues[param.key] = stored !== undefined ? stored : param.default;
        }

        ops.push({ op, nodeType, chainKey, values: nodeValues });
    }

    const incomingEdges: MultiOpExpansionResult['incomingEdges'] = [];
    const outgoingEdges: MultiOpExpansionResult['outgoingEdges'] = [];

    for (const edge of edges) {
        if (edge.target === multiOpNode.id) {
            const mapping = edge.targetHandle ? handleToOp.get(edge.targetHandle) : undefined;
            if (mapping) {
                incomingEdges.push({
                    originalEdge: edge,
                    opIndex: mapping.opIndex,
                    targetHandle: mapping.paramKey,
                });
            }
        }
        if (edge.source === multiOpNode.id && edge.sourceHandle === 'out') {
            outgoingEdges.push({ originalEdge: edge });
        }
    }

    return { valid: true, ops, incomingEdges, outgoingEdges };
}
