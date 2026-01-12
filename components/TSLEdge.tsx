"use client";
import { BaseEdge, EdgeProps, getBezierPath, useReactFlow } from "@xyflow/react";
import { TYPE_COLORS, DEFAULT_HANDLE_COLOR } from "./TSLHandle";
import { AppNode } from "@/lib/types";
import { registry } from "@/lib/registry";

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

    const sourceDataType = sourceDefination && sourceDefination.outputs && type && sourceHandleId ? sourceDefination.outputs[sourceHandleId].type : null


    // target data type 

    const targetNode = getNode(target);

    const targetType = targetNode?.data.type;

    const targetDefination = targetType ? registry.get(targetType) : null;

    const targetDataType = targetDefination && targetDefination.inputs && targetType && targetHandleId ? targetDefination.inputs[targetHandleId].type : null


    const sourceColor = sourceDataType ? TYPE_COLORS[sourceDataType] : DEFAULT_HANDLE_COLOR
    const targetColor = targetDataType ? TYPE_COLORS[targetDataType] : DEFAULT_HANDLE_COLOR


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