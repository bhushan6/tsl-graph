'use client';

import { memo, useState, useCallback } from 'react';
import { Position, useEdges } from '@xyflow/react';
import { registry } from '@/lib/registry';
import { useEditorStore } from '@/store/editor';
import { cn } from '@/lib/utils';
import { TSLHandle } from './TSLHandle';
import { useTheme } from 'next-themes';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import {
    Combobox,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
} from '@/components/ui/combobox';

import type { AppNode, Port, TSLType, TSLValueType } from '@/lib/types';
import { NodeProps } from '@xyflow/react';
import { MULTI_OP_OPTIONS, getMultiOpHandleId, getMultiOpLabel, getMultiOpParams, type MultiOp, type MultiOpType } from '@/lib/multi-op';
import { Separator } from './ui/separator';
import { getUniformKindFromNode, getUniformOutputs } from '@/lib/uniform-utils';

type TSLNodeProps = NodeProps<AppNode>;

const categoryColors: Record<string, string> = {
    'Math': 'border-red-200 bg-red-100 dark:bg-red-900/20',
    'Constants': 'border-violet-500 bg-violet-100 dark:bg-violet-900/20',
    'Geometry': 'border-emerald-500 bg-emerald-100 dark:bg-emerald-900/20',
    'Material': 'border-orange-500 bg-orange-100 dark:bg-orange-900/20',
    'Subgraph': 'border-blue-500 bg-blue-100 dark:bg-blue-900/20',
    'Texture': 'border-pink-500 bg-pink-100 dark:bg-pink-900/20',
    'Model': 'border-cyan-500 bg-cyan-100 dark:bg-cyan-900/20',
    'Advanced': 'border-slate-500 bg-slate-100 dark:bg-slate-900/20',
    'Noise': 'border-fuchsia-500 bg-fuchsia-100 dark:bg-fuchsia-900/20',
    'Utils': 'border-yellow-500 bg-yellow-100 dark:bg-yellow-900/20',
    'Loop': 'border-indigo-500 bg-indigo-100 dark:bg-indigo-900/20',
    'Default': 'border-gray-500 bg-gray-100 dark:bg-gray-900/20',
};

function TSLNodeComponent({ id, data, selected }: TSLNodeProps) {
    const def = registry.get(data.type);
    const updateNodeValue = useEditorStore((s) => s.updateNodeValue);
    const addMultiOp = useEditorStore((s) => s.addMultiOp);
    const updateMultiOp = useEditorStore((s) => s.updateMultiOp);
    const removeMultiOp = useEditorStore((s) => s.removeMultiOp);
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

    const storedNameValue = data.values?.localName;
    const storedName = typeof storedNameValue === 'string' ? storedNameValue : '';
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
    const isMultiOpNode = data.type === 'math/multiOp';
    const isUniformNode = data.type === 'const/uniform';
    const operations = Array.isArray(data.operations) ? (data.operations as MultiOp[]) : [];

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

    // Get ports - for anchor nodes and subgraph instances, use dynamic ports from data
    let inputs: Record<string, Port> = {};
    let outputs: Record<string, Port> = {};
    let nodeLabel = def?.label || 'Custom Node';

    if (isSubgraphInstance && data.dynamicPorts) {
        // Subgraph instance: dynamicPorts contains both inputs and outputs
        // Inputs have ids starting with 'in_', outputs with 'out_'
        for (const port of data.dynamicPorts) {
            if (port.id.startsWith('in_')) {
                inputs[port.id] = { label: port.label, type: port.type as TSLType, connectionOnly: true };
            } else if (port.id.startsWith('out_') || port.id === 'out') {
                outputs[port.id] = { label: port.label, type: port.type as TSLType };
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
                // Code node inputs are editable (no connectionOnly) to allow fallback values
                inputs[port.id] = { label: port.label, type: port.type as TSLType };
            } else if (port.id === 'out') {
                outputs[port.id] = { label: port.label, type: port.type as TSLType };
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
                outputs[port.id] = { label: port.label, type: port.type as TSLType };
            } else {
                inputs[port.id] = { label: port.label, type: port.type as TSLType, connectionOnly: true };
            }
        }
    } else if (def) {
        inputs = def.inputs ?? {};
        outputs = def.outputs ?? {};
        nodeLabel = def.label;
        if (isUniformNode) {
            const kind = getUniformKindFromNode({ data } as AppNode);
            inputs = {};
            outputs = getUniformOutputs(kind);
        }
    }

    let category = 'Default';
    if (def) {
        category = def.category;
    } else if (isSubgraphInstance || isSubgraphInput || isSubgraphOutput) {
        category = 'Subgraph';
    } else if (isCodeNodeInstance) {
        category = 'Advanced';
    }

    const colorClass = categoryColors[category] || categoryColors['Default'];

    const header = (
        <div
            className={cn(
                'flex flex-col gap-0.5 px-3 pt-2 pb-1  rounded-t-xl',
                'border-b transition-colors duration-150',
                colorClass,
                selected ? 'border-blue-500' : 'border-gray-200 dark:border-white/10'
            )}
        >
            <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-800 dark:text-white/90 truncate">
                {nodeLabel}
            </span>
            {isEditingName ? (
                <input
                    type="text"
                    className="bg-transparent border-0 border-b border-gray-300 dark:border-white/30 outline-none text-[9px] text-gray-500 dark:text-white/50 tracking-wider py-0 focus:border-blue-500 max-w-[50px]"
                    value={localName}
                    onChange={(e) => setLocalName(e.target.value)}
                    onKeyDown={handleNameKeyDown}
                    onBlur={handleNameSubmit}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                />
            ) : (
                <div className="w-0 min-w-full overflow-hidden">
                    <Tooltip delayDuration={500}>
                        <TooltipTrigger asChild>
                            <span
                                className="text-[9px] text-gray-400 dark:text-white/40 tracking-wider cursor-pointer hover:text-gray-600 dark:hover:text-white/60 transition-colors truncate block"
                                onDoubleClick={() => {
                                    setLocalName(storedName);
                                    setIsEditingName(true);
                                }}
                            >
                                {storedName || '(variable name)'}
                            </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-[10px]">
                            Double click to set variable name
                        </TooltipContent>
                    </Tooltip>
                </div>
            )}
        </div>
    );

    if (isMultiOpNode) {
        return (
            <div
                className={cn(
                    'min-w-[50px] flex flex-col rounded-xl shadow-lg overflow-hidden',
                    'bg-white/95 shadow-gray-300/50',
                    'dark:bg-card/95 dark:shadow-black/30',
                    'backdrop-blur-sm transition-shadow duration-150',
                    selected && 'shadow-xl dark:shadow-black/50 shadow-gray-400/50'
                )}
            >
                {header}
                <div className="flex flex-col gap-1 pt-1 pb-1.5">
                    {operations.length === 0 ? (
                        <div className="px-3 py-2 text-[10px] text-muted-foreground">
                            No operations yet
                        </div>
                    ) : (
                        operations.map((op, index) => {
                            const params = getMultiOpParams(op.op, index === 0);
                            return (
                                <div key={op.id} className="flex flex-col gap-1">
                                    <div className="flex items-start justify-between min-h-[24px]">
                                        <div className="flex flex-col gap-0.5 min-w-0">
                                            {params.length === 0 ? (
                                                <></>
                                                // <span className="text-[9px] text-muted-foreground ml-2">
                                                //     No inputs
                                                // </span>
                                            ) : (
                                                params.map((param) => {
                                                    const handleId = getMultiOpHandleId(op.id, param.key);
                                                    return (
                                                        <div key={handleId} className="flex items-center gap-2">
                                                            <TSLHandle
                                                                id={handleId}
                                                                type="target"
                                                                position={Position.Left}
                                                                dataType={param.type as TSLType}
                                                                label={param.label}
                                                                isConnected={connectedInputs.has(handleId)}
                                                                isDark={isDark}
                                                            />
                                                            {!connectedInputs.has(handleId) && (
                                                                <div className="flex-1 min-w-0">
                                                                    <ValuePreview
                                                                        type={param.type}
                                                                        value={data.values?.[handleId] ?? param.default}
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1 pr-2">
                                            {/* <span className="text-[9px] text-gray-400 font-mono tabular-nums">
                                                {index + 1}
                                            </span> */}
                                            <div className="nodrag nopan ml-2 max-w-[100px]">
                                                <Combobox
                                                    items={MULTI_OP_OPTIONS.map((option) => option.value)}
                                                    value={op.op}
                                                    onValueChange={(value) => {
                                                        if (!value) return;
                                                        updateMultiOp(id, op.id, value as MultiOpType);
                                                    }}
                                                    itemToStringLabel={(value) => getMultiOpLabel(String(value))}
                                                    itemToStringValue={(value) => String(value)}
                                                >
                                                    <ComboboxInput
                                                        placeholder="Select op"
                                                        className="h-6 min-w-[50px] max-w-[100px] bg-transparent border border-gray-200 dark:border-white/10 rounded-md text-gray-700 dark:text-white/80 [&_[data-slot=input-group-control]]:h-6 [&_[data-slot=input-group-control]]:text-[9px] [&_[data-slot=input-group-control]]:px-2 [&_[data-slot=input-group-control]]:py-0"
                                                        showClear={false}
                                                    />
                                                    <ComboboxContent align="start" sideOffset={4}>
                                                        <ComboboxEmpty>No items found.</ComboboxEmpty>
                                                        <ComboboxList>
                                                            {(item) => (
                                                                <ComboboxItem
                                                                    key={String(item)}
                                                                    value={item}
                                                                    className="text-[11px]"
                                                                >
                                                                    {getMultiOpLabel(String(item))}
                                                                </ComboboxItem>
                                                            )}
                                                        </ComboboxList>
                                                    </ComboboxContent>
                                                </Combobox>
                                            </div>
                                            <button
                                                type="button"
                                                className="h-6 w-6 text-[10px] rounded-md border border-transparent text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/10 transition-colors"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeMultiOp(id, op.id);
                                                }}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                aria-label={`Remove ${getMultiOpLabel(op.op)}`}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    </div>
                                    {index < operations.length - 1 && (
                                        <Separator className='my-1 max-w-[90%] mx-auto' />
                                    )}
                                </div>
                            );
                        })
                    )}

                    <div className="px-2 pt-1">
                        <button
                            type="button"
                            className="w-full h-7 text-[10px] uppercase tracking-wider border border-dashed border-gray-300 dark:border-white/20 rounded-md text-gray-500 dark:text-white/50 hover:text-gray-700 dark:hover:text-white/80 hover:border-gray-400 dark:hover:border-white/40 transition-colors"
                            onClick={(e) => {
                                e.stopPropagation();
                                addMultiOp(id, 'add');
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            + Add Operation
                        </button>
                    </div>

                    <div className="flex items-center justify-end pr-2">
                        <TSLHandle
                            id="out"
                            type="source"
                            position={Position.Right}
                            dataType={'any'}
                            label="Out"
                            isConnected={connectedOutputs.has('out')}
                            isDark={isDark}
                        />
                    </div>
                </div>
            </div>
        );
    }

    const inputKeys = Object.keys(inputs);
    const outputKeys = Object.keys(outputs);

    // Filter out hidden inputs/outputs if necessary, currently inputs support hidden
    const visibleInputKeys = inputKeys.filter(k => !inputs[k].hidden);
    // Include 'out' in the main list of outputs.
    // We strictly align by index now for compactness
    const maxRows = Math.max(visibleInputKeys.length, outputKeys.length);

    const rows: Array<{
        key: string;
        input: [string, typeof inputs[string]] | null;
        output: [string, typeof outputs[string]] | null;
    }> = [];

    for (let i = 0; i < maxRows; i++) {
        const inputKey = visibleInputKeys[i];
        const outputKey = outputKeys[i];

        rows.push({
            key: `row-${i}`,
            input: inputKey ? [inputKey, inputs[inputKey]] : null,
            output: outputKey ? [outputKey, outputs[outputKey]] : null,
        });
    }

    return (
        <div
            className={cn(
                'min-w-[50px] flex flex-col rounded-xl shadow-lg overflow-hidden', // Reduced min-w
                'bg-white/95 shadow-gray-300/50',
                'dark:bg-card/95 dark:shadow-black/30',
                'backdrop-blur-sm transition-shadow duration-150',
                selected && 'shadow-xl dark:shadow-black/50 shadow-gray-400/50'
            )}
        >
            {header}

            {/* Content - Removed px-2 to allow handles to touch edges pattern. Added pb-3 for safe area near rounded corners */}
            <div className="flex flex-col gap-0 pt-1 pb-1.5 rounded-b-xl">
                {rows.map((row) => (
                    <div key={row.key} className="flex items-center justify-between min-h-[22px]">
                        {/* Input Side */}
                        <div className="flex items-center flex-1 min-w-0 mr-2">
                            {/* Added mr-2 to separate from output side */}
                            {row.input ? (
                                <>
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
                                        <span className="text-[9px] text-gray-500 dark:text-gray-400 mr-2 font-mono uppercase tracking-wider ml-2">
                                            {row.input[1].label}
                                        </span>
                                    )}

                                    {/* Value Preview / Control - only if not connected */}
                                    {!connectedInputs.has(row.input[0]) && !row.input[1].connectionOnly && (
                                        <div className={cn("flex-1 flex items-center min-w-0", row.input[1].propertyOnly && "justify-end")}>
                                            <ValuePreview
                                                type={row.input[1].type}
                                                value={data.values?.[row.input[0]] ?? row.input[1].default}
                                            />
                                        </div>
                                    )}
                                </>
                            ) : <div className="flex-1" />}
                        </div>

                        {/* Output Side */}
                        <div className="flex items-center shrink-0">
                            {row.output && (
                                <TSLHandle
                                    id={row.output[0]}
                                    type="source"
                                    position={Position.Right}
                                    dataType={row.output[1].type as TSLType}
                                    label={row.output[1].label}
                                    isConnected={connectedOutputs.has(row.output[0])}
                                    isDark={isDark}
                                />
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// Value Preview Components - Read-only previews for node values
interface ValuePreviewProps {
    type: string;
    value: TSLValueType;
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
        // Handle AssetValue objects (e.g., {url: "...", assetId: "..."})
        let stringValue = '';
        if (value && typeof value === 'object' && 'url' in value) {
            stringValue = (value as { url: string }).url || '';
        } else {
            stringValue = String(value ?? '');
        }
        return <StringPreview value={stringValue} />;
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
            className="h-3 w-3 rounded-[3px] shadow-sm border border-gray-200 dark:border-white/10"
            style={{ backgroundColor: value }}
            title={value}
        />
    );
}



function NumberPreview({ value }: { value: number }) {
    return (
        //vertically center the text
        <span className="text-[9px] text-gray-500 font-mono tabular-nums flex items-center">
            ({Number.isInteger(value) ? value : value.toFixed(2)})
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
