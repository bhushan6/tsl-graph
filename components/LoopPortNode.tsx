import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { AppNode } from '@/lib/types';
import { TYPE_COLORS, DEFAULT_HANDLE_COLOR } from './TSLHandle';
import { cn } from '@/lib/utils';

function LoopPortNode({ data, selected }: NodeProps<AppNode>) {
    const port = data.loopPort;
    const typeColor = port?.type ? (TYPE_COLORS[port.type] ?? DEFAULT_HANDLE_COLOR) : DEFAULT_HANDLE_COLOR;
    const label = port?.label ?? (port?.kind === 'output' ? 'Output' : 'Input');

    return (
        <div
            className={cn(
                'relative flex items-center gap-2 rounded-md border px-2 py-1 text-[10px] font-medium',
                'bg-background/90 backdrop-blur-sm',
                selected ? 'border-primary' : 'border-border'
            )}
        >
            <Handle
                type="target"
                position={Position.Left}
                id="in"
                className="!w-2 !h-2 !rounded-sm !border-0"
                style={{ backgroundColor: typeColor }}
            />
            <span className="whitespace-nowrap text-muted-foreground">{label}</span>
            <Handle
                type="source"
                position={Position.Right}
                id="out"
                className="!w-2 !h-2 !rounded-sm !border-0"
                style={{ backgroundColor: typeColor }}
            />
        </div>
    );
}

export default memo(LoopPortNode);
