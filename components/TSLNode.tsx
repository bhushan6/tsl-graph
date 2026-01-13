'use client';

import { memo, useState, useCallback } from 'react';
import { Position, useEdges } from '@xyflow/react';
import { registry } from '@/lib/registry';
import { useEditorStore } from '@/store/editor';
import { cn } from '@/lib/utils';
import { TSLHandle } from './TSLHandle';
import { useTheme } from 'next-themes';

import { AppNode, TSLType } from '@/lib/types';
import { NodeProps } from '@xyflow/react';

type TSLNodeProps = NodeProps<AppNode>;

function TSLNodeComponent({ id, data, selected }: TSLNodeProps) {
    const def = registry.get(data.type);
    const updateNodeValue = useEditorStore((s) => s.updateNodeValue);
    const subgraphs = useEditorStore((s) => s.subgraphs);
    const codeNodes = useEditorStore((s) => s.codeNodes);
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

    // Check if this is a subgraph instance (custom node) or code node instance
    const isSubgraphInstance = data.type.startsWith('custom/');
    const isCodeNodeInstance = data.type.startsWith('code/');
    const isCustomInstance = isSubgraphInstance || isCodeNodeInstance;

    // For subgraph and code node instances, we don't need a registry definition
    // We'll use the dynamicPorts from node data
    if (!def && !isCustomInstance) {
        return (
            <div className="min-w-[200px] bg-red-100 dark:bg-red-900/80 text-red-800 dark:text-red-200 p-3 rounded-xl">
                Unknown node: {data.type}
            </div>
        );
    }

    // Check if this is a subgraph anchor node with dynamic ports
    const isSubgraphInput = data.type === 'subgraph/input';
    const isSubgraphOutput = data.type === 'subgraph/output';
    const isAnchorNode = isSubgraphInput || isSubgraphOutput;

    // Port type that matches what we need
    type PortDef = { label: string; type: string; default?: unknown; connectionOnly?: boolean; propertyOnly?: boolean };

    // Get ports - for anchor nodes and subgraph instances, use dynamic ports from data
    let inputs: Record<string, PortDef> = {};
    let outputs: Record<string, PortDef> = {};
    let nodeLabel = def?.label || 'Custom Node';

    if (isSubgraphInstance && data.dynamicPorts) {
        // Subgraph instance: dynamicPorts contains both inputs and outputs
        // Inputs have ids starting with 'in_', outputs with 'out_'
        for (const port of data.dynamicPorts) {
            if (port.id.startsWith('in_')) {
                inputs[port.id] = { label: port.label, type: port.type, connectionOnly: true };
            } else if (port.id.startsWith('out_') || port.id === 'out') {
                outputs[port.id] = { label: port.label, type: port.type };
            }
        }
        // Extract name from type (custom/name-timestamp)
        const namePart = data.type.replace('custom/', '').split('-')[0];
        // Try to get dynamic name from store, fallback to parsed name from type
        nodeLabel = subgraphs[data.type]?.name || namePart.charAt(0).toUpperCase() + namePart.slice(1).replace(/-/g, ' ');
    } else if (isCodeNodeInstance && data.dynamicPorts) {
        // Code node instance: dynamicPorts contains inputs (in_*) and output (out)
        for (const port of data.dynamicPorts) {
            if (port.id.startsWith('in_')) {
                inputs[port.id] = { label: port.label, type: port.type, connectionOnly: true };
            } else if (port.id === 'out') {
                outputs[port.id] = { label: port.label, type: port.type };
            }
        }
        // Get name from codeNodes store
        const codeNode = codeNodes[data.type];
        if (codeNode) {
            nodeLabel = codeNode.name;
        } else {
            // Fallback: parse from type
            const namePart = data.type.replace('code/', '').split('-')[0];
            nodeLabel = namePart.charAt(0).toUpperCase() + namePart.slice(1).replace(/-/g, ' ');
        }
    } else if (isAnchorNode && data.dynamicPorts) {
        // Subgraph Input: dynamic ports become outputs (to connect to internal nodes)
        // Subgraph Output: dynamic ports become inputs (to receive from internal nodes)
        for (const port of data.dynamicPorts) {
            if (isSubgraphInput) {
                outputs[port.id] = { label: port.label, type: port.type };
            } else {
                inputs[port.id] = { label: port.label, type: port.type, connectionOnly: true };
            }
        }
    } else if (def) {
        inputs = (def.inputs ?? {}) as Record<string, PortDef>;
        outputs = (def.outputs ?? {}) as Record<string, PortDef>;
        nodeLabel = def.label;
    }

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
                    {nodeLabel}
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
                                {!row.input[1].propertyOnly && (
                                    <TSLHandle
                                        id={row.input[0]}
                                        type="target"
                                        position={Position.Left}
                                        dataType={row.input[1].type as TSLType}
                                        label={row.input[1].label}
                                        isConnected={connectedInputs.has(row.input[0])}
                                        isDark={isDark}
                                        isMaterialNode={data.type.startsWith('material')}
                                    />
                                )}

                                {row.input[1].propertyOnly && (
                                    <span className="text-[9px] text-gray-500 dark:text-gray-400 mr-2 font-mono uppercase tracking-wider ml-1">
                                        {row.input[1].label}
                                    </span>
                                )}

                                {!connectedInputs.has(row.input[0]) && !row.input[1].connectionOnly && (
                                    <div className={cn("flex-1 mx-2 flex items-center", row.input[1].propertyOnly && "justify-end")} style={{
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
                                    dataType={row.output[1].type as TSLType}
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
                            dataType={outputs['out'].type as TSLType}
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
    // If type is explicitly one of these, use it.
    // If 'any', try to infer from value.
    const isVector = type.startsWith('vec') || (type === 'any' && Array.isArray(value));
    const isBool = type === 'bool' || (type === 'any' && typeof value === 'boolean');
    const isColor = type === 'color'; // Value inference for color is harder (hex string vs string), assume any defaults to float/vec unless explicit hex?

    // Check if value looks like a color string if type is any?
    const looksLikeColor = type === 'any' && typeof value === 'string' && value.startsWith('#');

    if (type === 'string') {
        return <StringPreview value={String(value ?? '')} />;
    }
    if (isColor || looksLikeColor) {
        return <ColorInputPreview value={String(value ?? '#ffffff')} />;
    }
    if (isBool) {
        return <span className="text-[10px] text-gray-500 font-mono">{value ? 'true' : 'false'}</span>;
    }
    if (isVector) {
        const arr = Array.isArray(value) ? value : [Number(value ?? 0)];
        return (
            <span className="text-[9px] text-gray-500 font-mono">
                ({arr.map(n => typeof n === 'number' ? n.toFixed(1) : n).join(',')})
            </span>
        );
    }
    return <NumberPreview value={Number(value ?? 0)} />;
}

function ColorInputPreview({ value }: { value: string }) {
    return (
        <div
            className="h-4 w-4 rounded-sm shadow-sm border border-gray-200 dark:border-white/10"
            style={{ backgroundColor: value }}
            title={value}
        />
    );
}



function NumberPreview({ value }: { value: number }) {
    return (
        //vertically center the text
        <span className="text-[9px] text-gray-500 font-mono tabular-nums flex items-center">
            {Number.isInteger(value) ? value : value.toFixed(2)}
        </span>
    );
}

function StringPreview({ value }: { value: string }) {
    if (!value) return <span className="text-[9px] text-muted-foreground italic">Empty</span>;

    return (
        <div className="w-16 h-16 rounded overflow-hidden border border-gray-200 dark:border-white/10 bg-checkered">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={value}
                alt="tex"
                className="w-full h-full object-cover"
                onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).parentElement!.innerText = 'Img Err';
                    (e.target as HTMLImageElement).parentElement!.className = "w-16 h-16 text-[8px] flex items-center justify-center text-red-500 border border-red-200 bg-red-50";
                }}
            />
        </div>
    );
}

export const TSLNode = memo(TSLNodeComponent);

