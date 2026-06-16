import { memo, useCallback } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { AppNode, TSLType } from '@/lib/types';
import { TYPE_COLORS, DEFAULT_HANDLE_COLOR } from './TSLHandle';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/store/editor';

const LOOP_INTERNAL_CONFIG: Record<string, {
    label: string;
    input?: { id: string; type: TSLType; };
    output?: { id: string; type: TSLType; };
    valueKey?: string;
}> = {
    'loop/count': {
        label: 'Count',
        input: { id: 'count', type: 'int' },
        output: { id: 'count', type: 'int' },
        valueKey: 'count',
    },
    'loop/start': {
        label: 'Start',
        input: { id: 'start', type: 'float' },
        output: { id: 'start', type: 'float' },
        valueKey: 'start',
    },
    'loop/end': {
        label: 'End',
        input: { id: 'end', type: 'float' },
        output: { id: 'end', type: 'float' },
        valueKey: 'end',
    },
    'loop/index': {
        label: 'Index',
        output: { id: 'index', type: 'any' },
    },
    'loop/count2': {
        label: 'Count 2',
        input: { id: 'count', type: 'int' },
        output: { id: 'count', type: 'int' },
        valueKey: 'count',
    },
    'loop/index2': {
        label: 'Index 2',
        output: { id: 'index', type: 'any' },
    },
    'loop/accumulator': {
        label: 'Acc',
        input: { id: 'seed', type: 'any' },
        output: { id: 'acc', type: 'any' },
        valueKey: 'seed',
    },
    'loop/condition': {
        label: 'Condition',
        input: { id: 'cond', type: 'bool' },
        output: { id: 'cond', type: 'bool' },
        valueKey: 'cond',
    },
    'loop/output': {
        label: 'Output',
        input: { id: 'next', type: 'any' },
        output: { id: 'out', type: 'any' },
    },
};

function LoopInternalNode({ id, data, selected }: NodeProps<AppNode>) {
    const config = LOOP_INTERNAL_CONFIG[data.type];
    const isConnected = useEditorStore(
        useCallback(
            (state) =>
                !!config?.valueKey &&
                state.edges.some((e) => e.target === id && e.targetHandle === config.valueKey),
            [config?.valueKey, id]
        )
    );
    if (!config) return null;

    const inputColor = config.input?.type ? (TYPE_COLORS[config.input.type] ?? DEFAULT_HANDLE_COLOR) : DEFAULT_HANDLE_COLOR;
    const outputColor = config.output?.type ? (TYPE_COLORS[config.output.type] ?? DEFAULT_HANDLE_COLOR) : DEFAULT_HANDLE_COLOR;
    const value = config.valueKey ? data.values?.[config.valueKey] : undefined;
    const valueText = value === undefined || isConnected ? '' : String(value);

    return (
        <div
            className={cn(
                'relative flex items-center gap-2 rounded-md border px-2 py-1 text-[10px] font-medium',
                'bg-background/90 backdrop-blur-sm',
                selected ? 'border-primary' : 'border-border'
            )}
        >
            {config.input && (
                <Handle
                    type="target"
                    position={Position.Left}
                    id={config.input.id}
                    className="!w-2 !h-2 !rounded-sm !border-0"
                    style={{ backgroundColor: inputColor }}
                />
            )}

            <span className="whitespace-nowrap text-muted-foreground">{config.label}</span>
            {valueText && (
                <span className="text-muted-foreground/70 tabular-nums">{valueText}</span>
            )}

            {config.output && (
                <Handle
                    type="source"
                    position={Position.Right}
                    id={config.output.id}
                    className="!w-2 !h-2 !rounded-sm !border-0"
                    style={{ backgroundColor: outputColor }}
                />
            )}
        </div>
    );
}

function areLoopInternalNodePropsEqual(prev: NodeProps<AppNode>, next: NodeProps<AppNode>) {
    return (
        prev.id === next.id &&
        prev.type === next.type &&
        prev.selected === next.selected &&
        prev.data === next.data
    );
}

export default memo(LoopInternalNode, areLoopInternalNodePropsEqual);
