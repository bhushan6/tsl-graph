"use client";
import { useCallback, useMemo } from "react";
import { BaseEdge, EdgeProps, getBezierPath, useConnection } from "@xyflow/react";
import type { ConnectionState } from "@xyflow/react";
import { TYPE_COLORS, DEFAULT_HANDLE_COLOR } from "./TSLHandle";
import type { TSLType } from "@/lib/types";
import { registry } from "@/lib/registry";
import { useEditorStore } from "@/store/editor";
import { getMultiOpInputs, type MultiOp } from "@/lib/multi-op";
import { resolveNodeOutputTypeById } from "@/lib/type-inference";
import {
    computeChannelOccupancy,
    decidePacking,
    getConstructorComponentCount,
    getPackingSourceWidth,
    isPackingEnabled,
} from "@/lib/vector-packing";

const TSLEdge = ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    sourceHandleId,
    source,
    target,
    targetHandleId,
    style = {},
    markerEnd,
    selected,
}: EdgeProps) => {
    const [edgePath] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });
    const graphStructureVersion = useEditorStore((s) => s.graphStructureVersion);

    const graphSnapshot = useMemo(() => {
        void graphStructureVersion;
        const { nodes, edges, globals, subgraphs } = useEditorStore.getState();
        const nodesById = new Map(nodes.map((node) => [node.id, node]));
        return { nodesById, edges, globals, subgraphs };
    }, [graphStructureVersion]);

    const sourceNode = graphSnapshot.nodesById.get(source);
    const targetNode = graphSnapshot.nodesById.get(target);

    const sourceDataType: TSLType | null = useMemo(() => {
        if (!sourceNode) return null;
        return resolveNodeOutputTypeById(
            source,
            sourceHandleId ?? 'out',
            graphSnapshot.nodesById,
            graphSnapshot.edges,
            graphSnapshot.globals,
            graphSnapshot.subgraphs
        );
    }, [graphSnapshot, source, sourceHandleId, sourceNode]);

    const targetDataType: TSLType | null = useMemo(() => {
        if (!targetNode) return null;

        const targetType = targetNode.data.type;
        const targetDefinition = registry.get(targetType);

        if (targetNode.data.type === 'math/multiOp' && targetHandleId) {
            const ops = Array.isArray(targetNode.data.operations) ? (targetNode.data.operations as MultiOp[]) : [];
            const input = getMultiOpInputs(ops).find((entry) => entry.handleId === targetHandleId);
            return input?.param.type ?? 'any';
        }

        let resolvedType = targetDefinition?.inputs && targetHandleId
            ? targetDefinition.inputs[targetHandleId]?.type ?? null
            : null;

        if (!resolvedType && targetHandleId) {
            if (targetNode.data.type.startsWith('custom/')) {
                const sg = graphSnapshot.subgraphs[targetNode.data.type];
                const port = sg?.inputs.find((p) => p.id === targetHandleId) ?? sg?.outputs.find((p) => p.id === targetHandleId);
                resolvedType = (port?.type as TSLType) ?? null;
            }
            if (!resolvedType && targetNode.data.dynamicPorts) {
                const dynamicPort = targetNode.data.dynamicPorts.find((port) => port.id === targetHandleId);
                resolvedType = (dynamicPort?.type as TSLType) ?? null;
            }
        }

        return resolvedType;
    }, [graphSnapshot, targetHandleId, targetNode]);


    const packedTargetType: TSLType | null = useMemo(() => {
        if (!targetNode || !targetHandleId || !sourceDataType) return null;
        const targetNodeType = targetNode.data.type;
        if (!isPackingEnabled(targetNodeType)) return null;

        const incoming = graphSnapshot.edges
            .filter((edge) => edge.target === target)
            .map((edge) => ({
                edgeId: edge.id,
                targetHandle: edge.targetHandle,
                width: getPackingSourceWidth(
                    resolveNodeOutputTypeById(
                        edge.source,
                        edge.sourceHandle,
                        graphSnapshot.nodesById,
                        graphSnapshot.edges,
                        graphSnapshot.globals,
                        graphSnapshot.subgraphs
                    )
                ),
            }));

        const occupancy = computeChannelOccupancy(
            getConstructorComponentCount(targetNodeType),
            incoming
        );
        if (occupancy.overlapEdgeIds.size > 0) return null;

        const decision = decidePacking({
            nodeType: targetNodeType,
            anchorHandle: targetHandleId,
            sourceWidth: getPackingSourceWidth(sourceDataType),
            occupancy,
        });

        return decision.kind === 'pack' ? (decision.sourceType ?? sourceDataType) : null;
    }, [graphSnapshot, sourceDataType, target, targetHandleId, targetNode]);


    const sourceColor = sourceDataType ? (TYPE_COLORS[sourceDataType] ?? DEFAULT_HANDLE_COLOR) : DEFAULT_HANDLE_COLOR
    const targetColor = (packedTargetType ?? targetDataType)
        ? (TYPE_COLORS[(packedTargetType ?? targetDataType) as TSLType] ?? DEFAULT_HANDLE_COLOR)
        : DEFAULT_HANDLE_COLOR

    const packingConflictKey = useConnection(
        useCallback(
            (connection: ConnectionState) => {
                if (!connection.inProgress || !connection.toHandle) return "";
                if (connection.toHandle.nodeId !== target) return "";
                return [
                    connection.toHandle.id ?? "",
                    connection.fromNode?.id ?? "",
                    connection.fromHandle?.id ?? "",
                ].join("|");
            },
            [target],
        ),
    );

    const isPackingConflict = useMemo(() => {
        if (!packingConflictKey) return false;
        const [anchorHandle, sourceNodeId, sourceHandle] = packingConflictKey.split("|");
        const targetNodeType = targetNode?.data.type;
        if (!anchorHandle || !sourceNodeId || !targetNodeType || !isPackingEnabled(targetNodeType)) {
            return false;
        }

        const state = useEditorStore.getState();
        const nodesById = new Map(state.nodes.map((node) => [node.id, node]));
        const incoming = state.edges
            .filter((edge) => edge.target === target)
            .map((edge) => ({
                edgeId: edge.id,
                targetHandle: edge.targetHandle,
                width: getPackingSourceWidth(
                    resolveNodeOutputTypeById(
                        edge.source,
                        edge.sourceHandle,
                        nodesById,
                        state.edges,
                        state.globals,
                        state.subgraphs,
                    ),
                ),
            }));
        const sourceWidth = getPackingSourceWidth(
            resolveNodeOutputTypeById(
                sourceNodeId,
                sourceHandle || "out",
                nodesById,
                state.edges,
                state.globals,
                state.subgraphs,
            ),
        );
        const decision = decidePacking({
            nodeType: targetNodeType,
            anchorHandle,
            sourceWidth,
            occupancy: computeChannelOccupancy(
                getConstructorComponentCount(targetNodeType),
                incoming,
            ),
        });

        return decision.kind === "pack" && decision.conflictEdgeIds.includes(id);
    }, [id, packingConflictKey, target, targetNode]);

    const gradientId = `${source}-${target}`;

    return (
        <>
            <defs>
                {/*
                  userSpaceOnUse with the actual endpoints: the default
                  objectBoundingBox units make the stroke invisible for
                  perfectly horizontal/vertical edges (zero-area bbox), and
                  this also orients the gradient along the real edge
                  direction instead of always left-to-right.
                */}
                <linearGradient
                    id={gradientId}
                    gradientUnits="userSpaceOnUse"
                    x1={sourceX}
                    y1={sourceY}
                    x2={targetX}
                    y2={targetY}
                >
                    <stop offset="0%" stopColor={sourceColor} />
                    <stop offset="80%" stopColor={targetColor} />
                </linearGradient>
            </defs>
            <BaseEdge
                id={id}
                path={edgePath}
                markerEnd={markerEnd}
                style={{
                    ...style,
                    strokeWidth: selected ? 4 : 2,
                    stroke: isPackingConflict ? "#f59e0b" : `url(#${gradientId})`,
                    strokeDasharray: isPackingConflict ? "6 4" : undefined,
                    opacity: isPackingConflict ? 0.85 : 1,
                }}
                type="smoothstep"
            />
        </>
    );
};

export default TSLEdge;
