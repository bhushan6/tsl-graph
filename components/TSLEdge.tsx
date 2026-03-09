"use client";
import { BaseEdge, EdgeProps, getBezierPath } from "@xyflow/react";
import { TYPE_COLORS, DEFAULT_HANDLE_COLOR } from "./TSLHandle";
import type { TSLType } from "@/lib/types";
import { useTypeInferenceResolver } from "@/lib/type-inference-context";

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
    const typeInferenceResolver = useTypeInferenceResolver();
    const [edgePath] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });
    const sourceDataType: TSLType = typeInferenceResolver.resolveOutputType(source, sourceHandleId ?? 'out');
    const targetDataType: TSLType = typeInferenceResolver.resolveInputType(target, targetHandleId ?? '');


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
