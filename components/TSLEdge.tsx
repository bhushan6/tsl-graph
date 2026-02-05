"use client";
import { BaseEdge, EdgeProps, getBezierPath, useReactFlow } from "@xyflow/react";
import { TYPE_COLORS, DEFAULT_HANDLE_COLOR } from "./TSLHandle";
import type { AppNode, TSLType } from "@/lib/types";
import { registry } from "@/lib/registry";
import { getMultiOpInputs, type MultiOp } from "@/lib/multi-op";

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
    const { getNode } = useReactFlow<AppNode>();

    // source date type

    const sourceNode = getNode(source);

    const type = sourceNode?.data.type;

    const sourceDefination = type ? registry.get(type) : null;

    let sourceDataType: TSLType | null = null;
    if (sourceNode?.data.type === 'math/multiOp') {
        sourceDataType = 'any';
    } else {
        sourceDataType = sourceDefination && sourceDefination.outputs && type && sourceHandleId
            ? sourceDefination.outputs[sourceHandleId]?.type ?? null
            : null;
    }


    // target data type 

    const targetNode = getNode(target);

    const targetType = targetNode?.data.type;

    const targetDefination = targetType ? registry.get(targetType) : null;

    let targetDataType: TSLType | null = null;
    if (targetNode?.data.type === 'math/multiOp' && targetHandleId) {
        const ops = Array.isArray(targetNode.data.operations) ? (targetNode.data.operations as MultiOp[]) : [];
        const input = getMultiOpInputs(ops).find((entry) => entry.handleId === targetHandleId);
        targetDataType = input?.param.type ?? 'any';
    } else {
        targetDataType = targetDefination && targetDefination.inputs && targetType && targetHandleId
            ? targetDefination.inputs[targetHandleId]?.type ?? null
            : null;
    }


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
