"use client";
import { useMemo } from "react";
import { BaseEdge, EdgeProps, getBezierPath } from "@xyflow/react";
import { TYPE_COLORS, DEFAULT_HANDLE_COLOR } from "./TSLHandle";
import type { AppNode, TSLType } from "@/lib/types";
import { registry } from "@/lib/registry";
import { useEditorStore } from "@/store/editor";
import { getMultiOpInputs, type MultiOp } from "@/lib/multi-op";
import { resolveNodeOutputTypeById } from "@/lib/local-utils";

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


    const sourceColor = sourceDataType ? (TYPE_COLORS[sourceDataType] ?? DEFAULT_HANDLE_COLOR) : DEFAULT_HANDLE_COLOR
    const targetColor = targetDataType ? (TYPE_COLORS[targetDataType] ?? DEFAULT_HANDLE_COLOR) : DEFAULT_HANDLE_COLOR


    const gradientId = `${source}-${target}`;

    return (
        <>
            <defs>
                <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
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
                    stroke: `url(#${gradientId})`,
                }}
                type="smoothstep"
            />
        </>
    );
};

export default TSLEdge;
