'use client';

import { memo } from 'react';
import { Position, type Node } from '@xyflow/react';
import { registry } from '@/lib/registry';
import { useEditorStore } from '@/store/editor';
import { cn } from '@/lib/utils';
import { TSLHandle } from './TSLHandle';

// Node data structure
export interface TSLNodeData extends Record<string, unknown> {
    type: string;
    values: Record<string, unknown>;
    connected: Record<string, boolean>;
}

// Props that React Flow passes to custom nodes
interface TSLNodeProps {
    id: string;
    data: TSLNodeData;
    selected?: boolean;
}

function TSLNodeComponent({ id, data, selected }: TSLNodeProps) {
    const def = registry.get(data.type);
    const updateNodeValue = useEditorStore((s) => s.updateNodeValue);

    if (!def) {
        return (
            <div className="bg-destructive text-destructive-foreground p-2 rounded">
                Unknown node: {data.type}
            </div>
        );
    }

    const inputEntries = Object.entries(def.inputs ?? {});
    const outputEntries = Object.entries(def.outputs ?? {});

    // Calculate max rows needed
    const maxRows = Math.max(inputEntries.length, outputEntries.length);

    // Create paired rows for inputs and outputs
    const rows = [];
    for (let i = 0; i < maxRows; i++) {
        rows.push({
            input: inputEntries[i] || null,
            output: outputEntries[i] || null,
        });
    }

    return (
        <div
            className={cn(
                'bg-card border rounded-lg shadow-md min-w-[180px]',
                selected ? 'border-primary ring-2 ring-primary/20' : 'border-border'
            )}
        >
            {/* Header */}
            <div className="px-3 py-1.5 bg-muted rounded-t-lg border-b border-border">
                <span className="text-xs font-medium text-foreground">{def.label}</span>
            </div>

            {/* Combined Inputs & Outputs in rows */}
            <div className="py-1">
                {rows.map((row, index) => (
                    <div
                        key={index}
                        className="relative flex items-center justify-between min-h-[28px]"
                    >
                        {/* Left side - Input */}
                        {row.input ? (
                            <div className="flex items-center py-1 pl-0 pr-2">
                                <TSLHandle
                                    type="target"
                                    position={Position.Left}
                                    id={row.input[0]}
                                    dataType={row.input[1].type}
                                    connectionLimit={1}
                                />
                                <span className="text-xs text-muted-foreground ml-3 mr-1.5">
                                    {row.input[1].label}
                                </span>
                                {/* Inline input for unconnected ports */}
                                {!data.connected?.[row.input[0]] && (
                                    <InlineInput
                                        type={row.input[1].type}
                                        value={data.values?.[row.input[0]] ?? row.input[1].default}
                                        onChange={(v) => updateNodeValue(id, row.input![0], v)}
                                    />
                                )}
                            </div>
                        ) : (
                            <div /> // Empty placeholder to maintain flex spacing
                        )}

                        {/* Right side - Output */}
                        {row.output && (
                            <div className="flex items-center py-1 pr-0 pl-2">
                                <span className="text-xs text-muted-foreground mr-3">
                                    {row.output[1].label}
                                </span>
                                <TSLHandle
                                    type="source"
                                    position={Position.Right}
                                    id={row.output[0]}
                                    dataType={row.output[1].type}
                                    connectionLimit={Infinity}
                                />
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

// Inline input for different types
interface InlineInputProps {
    type: string;
    value: unknown;
    onChange: (value: unknown) => void;
}

function InlineInput({ type, value, onChange }: InlineInputProps) {
    if (type === 'color') {
        return (
            <input
                type="color"
                value={String(value ?? '#ffffff')}
                onChange={(e) => onChange(e.target.value)}
                className="w-6 h-4 cursor-pointer border-0 p-0 rounded"
            />
        );
    }

    // Number input for float, int, etc.
    return (
        <input
            type="number"
            value={Number(value ?? 0)}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            step={type === 'int' || type === 'uint' ? 1 : 0.1}
            className="w-12 h-5 text-xs bg-background border border-border rounded px-1 text-right"
        />
    );
}

export const TSLNode = memo(TSLNodeComponent);
