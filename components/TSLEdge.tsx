"use client";
import { BaseEdge, EdgeProps, getBezierPath } from "@xyflow/react";
import { TSLType } from "@/lib/types";
import { TYPE_COLORS, DEFAULT_HANDLE_COLOR } from "./TSLHandle";

// Extract data type from source handle ID (supports multiple formats)
// Format 1: "output-{dataType}" (auto-generated)
// Format 2: "{id}-{dataType}" (explicit with data type)
// Format 3: "{id}" (legacy - fall back to DEFAULT_HANDLE_COLOR)
const getDataTypeFromHandle = (handleId: string | null | undefined): TSLType | null => {
    if (!handleId) return null;
    
    // Check for auto-generated format: "output-{dataType}"
    const autoParts = handleId.split('-');
    if (autoParts.length >= 2 && autoParts[0] === 'output') {
        return autoParts[1] as TSLType;
    }
    
    // Check for explicit format: "{id}-{dataType}" (last part is data type)
    const explicitParts = handleId.split('-');
    if (explicitParts.length >= 2) {
        const potentialType = explicitParts[explicitParts.length - 1];
        // Check if the last part is a valid TSLType
        const allTypes: TSLType[] = [
            'float', 'int', 'uint', 'bool',
            'vec2', 'vec3', 'vec4',
            'ivec2', 'ivec3', 'ivec4',
            'uvec2', 'uvec3', 'uvec4',
            'bvec2', 'bvec3', 'bvec4',
            'mat2', 'mat3', 'mat4',
            'color', 'sampler2D', 'any'
        ];
        if (allTypes.includes(potentialType as TSLType)) {
            return potentialType as TSLType;
        }
    }
    
    return null;
};

// Get edge color based on source handle data type
const getEdgeColor = (sourceHandleId: string | null | undefined): string => {
    const dataType = getDataTypeFromHandle(sourceHandleId);
    if (!dataType) return DEFAULT_HANDLE_COLOR;
    return TYPE_COLORS[dataType] ?? DEFAULT_HANDLE_COLOR;
};

const TSLEdge = ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    sourceHandleId,
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

    const edgeColor = getEdgeColor(sourceHandleId);

    return (
        <BaseEdge
            id={id}
            path={edgePath}
            markerEnd={markerEnd}
            style={{
                stroke: edgeColor,
                strokeWidth: selected ? 4 : 2,
                ...style,
            }}
        />
    );
};

export default TSLEdge;