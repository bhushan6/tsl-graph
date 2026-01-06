'use client';

import { Handle, HandleProps, useNodeConnections } from '@xyflow/react';
import { TSLType } from '@/lib/types';
import { cn } from '@/lib/utils';

// Color mapping for TSL types
const TYPE_COLORS: Partial<Record<TSLType, string>> = {
    float: '#8b5cf6',   // violet
    int: '#3b82f6',     // blue
    uint: '#06b6d4',    // cyan
    bool: '#f97316',    // orange
    vec2: '#22c55e',    // green
    vec3: '#22c55e',
    vec4: '#22c55e',
    ivec2: '#3b82f6',
    ivec3: '#3b82f6',
    ivec4: '#3b82f6',
    uvec2: '#06b6d4',
    uvec3: '#06b6d4',
    uvec4: '#06b6d4',
    bvec2: '#f97316',
    bvec3: '#f97316',
    bvec4: '#f97316',
    mat2: '#ec4899',    // pink
    mat3: '#ec4899',
    mat4: '#ec4899',
    color: '#f59e0b',   // amber
    sampler2D: '#a855f7', // purple
};

const DEFAULT_COLOR = '#71717a'; // zinc-500

interface TSLHandleProps extends Omit<HandleProps, 'isConnectable'> {
    dataType: TSLType;
    connectionLimit?: number;
}

export function TSLHandle({ dataType, connectionLimit = 1, ...props }: TSLHandleProps) {
    const connections = useNodeConnections({
        handleType: props.type,
    });

    // Filter connections for this specific handle
    const handleConnections = connections.filter(conn =>
        props.type === 'target'
            ? conn.targetHandle === props.id
            : conn.sourceHandle === props.id
    );

    const isConnectable = handleConnections.length < connectionLimit;
    const handleColor = TYPE_COLORS[dataType] ?? DEFAULT_COLOR;

    return (
        <Handle
            {...props}
            isConnectable={isConnectable}
            className={cn(
                '!w-2.5 !h-2.5 !border-2 !border-border/50 !rounded-sm transition-opacity',
                !isConnectable && 'opacity-50'
            )}
            style={{
                backgroundColor: handleColor,
            }}
        />
    );
}
