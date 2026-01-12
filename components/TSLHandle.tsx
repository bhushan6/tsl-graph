'use client';

import { Handle, HandleProps } from '@xyflow/react';
import { TSLType } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';

// Color mapping for TSL types
export const TYPE_COLORS: Partial<Record<TSLType, string>> = {
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
    mat3: '#ec4899',
    mat4: '#ec4899',
    color: '#f59e0b',   // amber
    sampler2D: '#a855f7', // purple
    any: '#a1a1aa',     // zinc-400 (gray)
};

export const DEFAULT_HANDLE_COLOR = '#71717a';

interface TSLHandleProps extends Omit<HandleProps, 'isConnectable'> {
    dataType: TSLType;
    label: string;
    isConnected?: boolean;
    isDark?: boolean;
    isMaterialNode?: boolean;
}

export function TSLHandle({
    dataType,
    label,
    isConnected = false,
    isDark = true,
    isMaterialNode = false,
    ...props
}: TSLHandleProps) {
    const handleColor = TYPE_COLORS[dataType] ?? DEFAULT_HANDLE_COLOR;
    const isOutput = props.type === 'source';

    // Background color based on state
    const defaultBg = isConnected
        ? handleColor
        : (isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)');

    return (
        <div
            className={cn(
                'relative flex items-center py-1 group',
                isOutput ? 'flex-row-reverse' : 'flex-row'
            )}
        >
            {/* Handle styled as indicator */}
            <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                    <div className={cn('relative', isOutput ? 'ml-2' : 'mr-2')}>
                        <Handle
                            {...props}
                            isConnectable={true}
                            className="!relative !transform-none !inset-auto !w-4 !h-4 !rounded !border-0 transition-colors duration-150"
                            style={{
                                '--handle-bg': defaultBg,
                                '--handle-hover-bg': handleColor,
                                backgroundColor: 'var(--handle-bg)',
                            } as React.CSSProperties}
                        />
                    </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs rounded-sm">
                    <p>{dataType}</p>
                </TooltipContent>
            </Tooltip>

            {/* Label */}
            <span className={cn(
                'text-[11px] uppercase tracking-wider font-medium whitespace-nowrap transition-colors duration-150 ',
                isConnected
                    ? 'text-gray-700 dark:text-white/90'
                    : 'text-gray-500 dark:text-white/50 group-hover:text-gray-700 dark:group-hover:text-white/90',
                isMaterialNode ? isOutput ? '' : 'min-w-[100px] max-w-[100px] whitespace-normal' : ''
            )}>
                {label}
            </span>
        </div>
    );
}
