'use client';

import { memo, useState, useRef, useCallback } from 'react';
import { Position, useEdges } from '@xyflow/react';
import { registry } from '@/lib/registry';
import { useEditorStore } from '@/store/editor';
import { cn } from '@/lib/utils';
import { TSLHandle } from './TSLHandle';
import { Input } from '@/components/ui/input';
import { useTheme } from 'next-themes';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';

// Node data structure
export interface TSLNodeData extends Record<string, unknown> {
    type: string;
    values: Record<string, unknown>;
    connected: Record<string, boolean>;
    localName?: string;
}

interface TSLNodeProps {
    id: string;
    data: TSLNodeData;
    selected?: boolean;
}

function TSLNodeComponent({ id, data, selected }: TSLNodeProps) {
    const def = registry.get(data.type);
    const updateNodeValue = useEditorStore((s) => s.updateNodeValue);
    const edges = useEdges();
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';

    const connectedInputs = new Set(
        edges.filter((e) => e.target === id).map((e) => e.targetHandle)
    );
    const connectedOutputs = new Set(
        edges.filter((e) => e.source === id).map((e) => e.sourceHandle)
    );

    const [isEditingName, setIsEditingName] = useState(false);
    const [localName, setLocalName] = useState(data.localName || '');
    // const [hoveredPort, setHoveredPort] = useState<string | null>(null);

    const handleNameSubmit = useCallback(() => {
        const trimmedName = localName.trim();
        if (trimmedName) {
            updateNodeValue(id, 'localName', trimmedName);
        }
        setIsEditingName(false);
    }, [id, localName, updateNodeValue]);

    const handleNameKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter') handleNameSubmit();
            else if (e.key === 'Escape') {
                setLocalName(data.localName || '');
                setIsEditingName(false);
            }
        },
        [handleNameSubmit, data.localName]
    );

    if (!def) {
        return (
            <div className="min-w-[200px] bg-red-100 dark:bg-red-900/80 text-red-800 dark:text-red-200 p-3 rounded-xl">
                Unknown node: {data.type}
            </div>
        );
    }

    const inputs = def.inputs ?? {};
    const outputs = def.outputs ?? {};
    const inputKeys = Object.keys(inputs);
    const outputKeys = Object.keys(outputs);
    const pairedOutputKeys = new Set<string>();

    const rows: Array<{
        key: string;
        input: [string, typeof inputs[string]] | null;
        output: [string, typeof outputs[string]] | null;
    }> = [];

    for (const inputKey of inputKeys) {
        const hasMatchingOutput = outputKeys.includes(inputKey) && inputKey !== 'out';
        rows.push({
            key: inputKey,
            input: [inputKey, inputs[inputKey]],
            output: hasMatchingOutput ? [inputKey, outputs[inputKey]] : null,
        });
        if (hasMatchingOutput) pairedOutputKeys.add(inputKey);
    }

    for (const outputKey of outputKeys) {
        if (outputKey !== 'out' && !pairedOutputKeys.has(outputKey) && !inputKeys.includes(outputKey)) {
            rows.push({ key: outputKey, input: null, output: [outputKey, outputs[outputKey]] });
        }
    }

    const hasMainOutput = 'out' in outputs;

    return (
        <div
            className={cn(
                'min-w-[220px] flex flex-col rounded-xl shadow-lg',
                'bg-white/95 shadow-gray-300/50',
                'dark:bg-[rgba(30,32,44,0.95)] dark:shadow-black/30',
                'backdrop-blur-sm transition-shadow duration-150',
                selected && 'shadow-xl dark:shadow-black/50 shadow-gray-400/50'
            )}
        >
            {/* Header */}
            <div
                className={cn(
                    'flex flex-col gap-0.5 px-3 py-3 rounded-t-xl',
                    'border-b-2 transition-colors duration-150',
                    selected ? 'border-blue-500' : 'border-gray-200 dark:border-white/10'
                )}
            >
                <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-800 dark:text-white/90">
                    {def.label}
                </span>
                {isEditingName ? (
                    <input
                        type="text"
                        className="bg-transparent border-0 border-b border-gray-300 dark:border-white/30 outline-none text-[10px] text-gray-500 dark:text-white/50 tracking-wider py-0.5 focus:border-blue-500"
                        value={localName}
                        onChange={(e) => setLocalName(e.target.value)}
                        onKeyDown={handleNameKeyDown}
                        onBlur={handleNameSubmit}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                    />
                ) : (
                    <span
                        className="text-[10px] text-gray-400 dark:text-white/40 tracking-wider cursor-pointer hover:text-gray-600 dark:hover:text-white/60 transition-colors truncate max-w-[180px]"
                        onDoubleClick={() => {
                            setLocalName(data.localName || '');
                            setIsEditingName(true);
                        }}
                    >
                        ({data.localName || 'Db Click to set name'})
                    </span>
                )}
            </div>

            {/* Content */}
            <div className="flex flex-col gap-0 py-2 px-2 rounded-b-xl">
                {rows.map((row) => (
                    <div key={row.key} className="flex items-center justify-between min-h-[28px]">
                        {/* Input */}
                        {row.input ? (
                            <div className="flex items-center flex-1 min-w-0">
                                <TSLHandle
                                    id={row.input[0]}
                                    type="target"
                                    position={Position.Left}
                                    dataType={row.input[1].type}
                                    label={row.input[1].label}
                                    isConnected={connectedInputs.has(row.input[0])}
                                    // isHovered={hoveredPort === row.input[0]}
                                    // onHover={setHoveredPort}
                                    isDark={isDark}
                                />
                                {!connectedInputs.has(row.input[0]) && (
                                    <div className="flex-1 mx-2">
                                        <NodeInput
                                            type={row.input[1].type}
                                            value={data.values?.[row.input[0]] ?? row.input[1].default}
                                            onChange={(v) => updateNodeValue(id, row.input![0], v)}
                                        />
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex-1" />
                        )}

                        {/* Output */}
                        {row.output && (
                            <div className="flex items-center ml-auto">
                                <TSLHandle
                                    id={row.output[0]}
                                    type="source"
                                    position={Position.Right}
                                    dataType={row.output[1].type}
                                    label={row.output[1].label}
                                    isConnected={connectedOutputs.has(row.output[0])}
                                    // isHovered={hoveredPort === row.output[0]}
                                    // onHover={setHoveredPort}
                                    isDark={isDark}
                                />
                            </div>
                        )}
                    </div>
                ))}

                {/* Main output */}
                {hasMainOutput && (
                    <div className="flex items-center justify-end min-h-[28px] border-t border-gray-100 dark:border-white/5 pt-2 mt-1">
                        <TSLHandle
                            id="out"
                            type="source"
                            position={Position.Right}
                            dataType={outputs['out'].type}
                            label={outputs['out'].label}
                            isConnected={connectedOutputs.has('out')}
                            // isHovered={hoveredPort === 'out'}
                            // onHover={setHoveredPort}
                            isDark={isDark}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

// Node Input Components
interface NodeInputProps {
    type: string;
    value: unknown;
    onChange: (value: unknown) => void;
}

function NodeInput({ type, value, onChange }: NodeInputProps) {
    if (type === 'color') {
        return <ColorInput value={String(value ?? '#ffffff')} onChange={onChange} />;
    }
    return (
        <NumberInput
            value={Number(value ?? 0)}
            onChange={onChange}
            step={type === 'int' || type === 'uint' ? 1 : 0.1}
        />
    );
}

function ColorInput({ value, onChange }: { value: string; onChange: (value: unknown) => void }) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    className="w-6 h-5 rounded border border-gray-300 dark:border-white/20 cursor-pointer shadow-sm hover:shadow transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    style={{ backgroundColor: value }}
                />
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3" align="start" side="bottom">
                <div className="flex flex-col gap-2">
                    <input
                        type="color"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        className="w-32 h-24 cursor-pointer border-0 p-0 rounded-md"
                    />
                    <Input
                        type="text"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        className="h-7 text-xs font-mono uppercase"
                        maxLength={7}
                    />
                </div>
            </PopoverContent>
        </Popover>
    );
}

function NumberInput({ value, onChange, step }: { value: number; onChange: (value: unknown) => void; step: number }) {
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef({ x: 0, value: 0 });
    const inputRef = useRef<HTMLInputElement>(null);

    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            if (e.target === inputRef.current) return;
            setIsDragging(true);
            dragStartRef.current = { x: e.clientX, value };

            const handleMouseMove = (moveEvent: MouseEvent) => {
                const delta = moveEvent.clientX - dragStartRef.current.x;
                const sensitivity = moveEvent.shiftKey ? 0.01 : 0.1;
                const newValue = dragStartRef.current.value + delta * sensitivity * step;
                onChange(Math.round(newValue / step) * step);
            };

            const handleMouseUp = () => {
                setIsDragging(false);
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        },
        [value, onChange, step]
    );

    return (
        <div
            className={cn(
                'flex items-center px-2 py-0.5 rounded cursor-ew-resize transition-all duration-150',
                'bg-gray-100 border border-gray-200 hover:border-gray-300',
                'dark:bg-white/5 dark:border-white/10 dark:hover:border-white/20',
                isDragging && 'border-blue-500 ring-1 ring-blue-500/30'
            )}
            onMouseDown={handleMouseDown}
            onDoubleClick={() => inputRef.current?.select()}
        >
            <input
                ref={inputRef}
                type="number"
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
                step={step}
                className="h-5 w-12 px-0 py-0 text-[11px] text-right text-gray-700 dark:text-white/80 bg-transparent border-0 outline-none focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
        </div>
    );
}

export const TSLNode = memo(TSLNodeComponent);
