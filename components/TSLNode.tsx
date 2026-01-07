'use client';

import { memo, useState, useCallback } from 'react';
import { Position, useEdges } from '@xyflow/react';
import { registry } from '@/lib/registry';
import { useEditorStore } from '@/store/editor';
import { cn } from '@/lib/utils';
import { TSLHandle } from './TSLHandle';
import { useTheme } from 'next-themes';

import { AppNode } from '@/lib/types';
import { NodeProps } from '@xyflow/react';

type TSLNodeProps = NodeProps<AppNode>;

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

    const storedName = (data.values?.localName as string | undefined) || '';
    const [isEditingName, setIsEditingName] = useState(false);
    const [localName, setLocalName] = useState(storedName);
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
                setLocalName(storedName);
                setIsEditingName(false);
            }
        },
        [handleNameSubmit, storedName]
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
                'dark:bg-card/95 dark:shadow-black/30',
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
                            setLocalName(storedName);
                            setIsEditingName(true);
                        }}
                    >
                        ({storedName || 'Db Click to set name'})
                    </span>
                )}
            </div>

            {/* Content */}
            <div className="flex flex-col gap-0 py-2 px-2 rounded-b-xl">
                {rows.map((row) => (
                    <div key={row.key} className="flex items-center justify-between min-h-[28px]">
                        {/* Input */}
                        {row.input ? (
                            <div className="flex items-center flex-1 min-w-0" style={{
                                // border: '1px solid red'
                            }}>
                                <TSLHandle
                                    id={row.input[0]}
                                    type="target"
                                    position={Position.Left}
                                    dataType={row.input[1].type}
                                    label={row.input[1].label}
                                    isConnected={connectedInputs.has(row.input[0])}
                                    isDark={isDark}
                                    isMaterialNode={data.type.startsWith('material')}
                                />
                                {!connectedInputs.has(row.input[0]) && (
                                    <div className="flex-1 mx-2" style={{
                                        // border: '1px solid red'
                                    }}>
                                        <ValuePreview
                                            type={row.input[1].type}
                                            value={data.values?.[row.input[0]] ?? row.input[1].default}
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

// Value Preview Components - Read-only previews for node values
interface ValuePreviewProps {
    type: string;
    value: unknown;
}

function ValuePreview({ type, value }: ValuePreviewProps) {
    if (type === 'color') {
        return <ColorPreview value={String(value ?? '#ffffff')} />;
    }
    return <NumberPreview value={Number(value ?? 0)} />;
}

function ColorPreview({ value }: { value: string }) {
    return (
        <div
            className="h-4 flex-1 rounded-sm shadow-sm flex items-center justify-center text-[8px]"
            style={{ backgroundColor: value }}
            title={value}
        >
            <span className="!mix-blend-difference font-semibold">
                {value}
            </span>
        </div>
    );
}

function NumberPreview({ value }: { value: number }) {
    return (
        //vertically center the text
        <span className="text-[11px] text-gray-600 dark:text-white/70 font-mono tabular-nums flex items-center">
            {Number.isInteger(value) ? value : value.toFixed(2)}
        </span>
    );
}

export const TSLNode = memo(TSLNodeComponent);

