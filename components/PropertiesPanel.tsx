'use client';

import { memo, useState, useCallback, useEffect } from 'react';
import { useEditorStore } from '@/store/editor';
import { registry } from '@/lib/registry';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { HexColorPicker } from 'react-colorful';
import { useEdges } from '@xyflow/react';
import { VectorInput } from './inputs/VectorInput';
import { BooleanInput } from './inputs/BooleanInput';
import { AnyInput } from './inputs/AnyInput';
import { useDebouncedCallback } from '@/utils/useDebouncedCallback';
import { SubgraphPort, TSLType } from '@/lib/types';
import { Layers, Plus, Trash2, Upload } from 'lucide-react';
import { NodePreview } from './NodePreview';
import {
    SidebarGroup,
    SidebarGroupContent,
    SidebarInput,
} from '@/components/ui/sidebar';

// Type options for port type selector
const PORT_TYPES: { value: TSLType; label: string }[] = [
    { value: 'any', label: 'Any' },
    { value: 'float', label: 'Float' },
    { value: 'vec2', label: 'Vec2' },
    { value: 'vec3', label: 'Vec3' },
    { value: 'vec4', label: 'Vec4' },
    { value: 'color', label: 'Color' },
    { value: 'int', label: 'Int' },
    { value: 'bool', label: 'Bool' },
];

interface AnchorNodePortEditorProps {
    nodeId: string;
    dynamicPorts: SubgraphPort[];
    isInputAnchor: boolean;
    onAddPort: (port: SubgraphPort) => void;
    onRemovePort: (portId: string) => void;
    onUpdatePort: (portId: string, updates: Partial<SubgraphPort>) => void;
}

function AnchorNodePortEditor({
    dynamicPorts,
    isInputAnchor,
    onAddPort,
    onRemovePort,
    onUpdatePort,
}: AnchorNodePortEditorProps) {
    const handleAddPort = useCallback(() => {
        const newId = `${isInputAnchor ? 'in' : 'out'}_${Date.now()}`;
        const portNumber = dynamicPorts.length + 1;
        onAddPort({
            id: newId,
            label: `${isInputAnchor ? 'Input' : 'Output'} ${portNumber}`,
            type: 'any',
        });
    }, [isInputAnchor, dynamicPorts.length, onAddPort]);

    return (
        <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
            {/* Header */}
            <div className="px-4 py-3 border-b border-sidebar-border">
                <h3 className="font-semibold text-sm">
                    {isInputAnchor ? 'Subgraph Inputs' : 'Subgraph Outputs'}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    {isInputAnchor
                        ? 'Define inputs for your custom node'
                        : 'Define outputs for your custom node'}
                </p>
            </div>

            {/* Port List */}
            <div className="flex-1 overflow-y-auto p-4">
                {dynamicPorts.length === 0 ? (
                    <p className="text-sm text-muted-foreground mb-4">
                        No ports defined. Add ports to create the subgraph interface.
                    </p>
                ) : (
                    <SidebarGroup className="p-0">
                        <SidebarGroupContent className="gap-2">
                            {dynamicPorts.map((port, index) => (
                                <div
                                    key={port.id}
                                    className="flex flex-col gap-2 p-3 rounded-lg border border-sidebar-border bg-sidebar-accent/50"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground w-4 font-mono">
                                            #{index + 1}
                                        </span>
                                        <SidebarInput
                                            type="text"
                                            value={port.label}
                                            onChange={(e) =>
                                                onUpdatePort(port.id, { label: e.target.value })
                                            }
                                            placeholder="Port name"
                                            className="h-7 text-xs"
                                        />
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => onRemovePort(port.id)}
                                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                    <select
                                        value={port.type}
                                        onChange={(e) =>
                                            onUpdatePort(port.id, { type: e.target.value as TSLType })
                                        }
                                        className="h-7 px-2 text-xs bg-sidebar-accent border border-sidebar-border rounded-md text-sidebar-foreground w-full outline-none focus:ring-2 focus:ring-sidebar-ring"
                                    >
                                        {PORT_TYPES.map((type) => (
                                            <option key={type.value} value={type.value}>
                                                {type.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            ))}
                        </SidebarGroupContent>
                    </SidebarGroup>
                )}

                {/* For outputs, limit to 1 port (single output restriction) */}
                {(isInputAnchor || dynamicPorts.length === 0) && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAddPort}
                        className="w-full gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Add {isInputAnchor ? 'Input' : 'Output'}
                    </Button>
                )}
                {!isInputAnchor && dynamicPorts.length >= 1 && (
                    <p className="text-xs text-muted-foreground text-center">
                        Subgraphs are limited to a single output
                    </p>
                )}
            </div>
        </div>
    );
}

/**
 * Hook to reactively get a node's input value from the store.
 */
function useNodeInputValue(nodeId: string, inputKey: string, defaultValue: unknown) {
    return useEditorStore((s) => {
        const node = s.nodes.find((n) => n.id === nodeId);
        return node?.data.values?.[inputKey] ?? defaultValue;
    });
}

function PropertiesPanelContent() {
    const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
    // Subscribe to the selected node reactively
    const node = useEditorStore((s) =>
        s.nodes.find((n) => n.id === s.selectedNodeId)
    );
    const updateNodeValue = useEditorStore((s) => s.updateNodeValue);
    const addDynamicPort = useEditorStore((s) => s.addDynamicPort);
    const removeDynamicPort = useEditorStore((s) => s.removeDynamicPort);
    const updateDynamicPort = useEditorStore((s) => s.updateDynamicPort);
    const enterSubgraphEditor = useEditorStore((s) => s.enterSubgraphEditor);
    const subgraphs = useEditorStore((s) => s.subgraphs);
    const edges = useEdges();

    // Handle no node selected
    if (!node) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Select a node to edit properties
            </div>
        );
    }

    // Check if this is an anchor node
    const isAnchorNode = node.data.type === 'subgraph/input' || node.data.type === 'subgraph/output';
    const isInputAnchor = node.data.type === 'subgraph/input';

    // Check if this is a subgraph instance (custom node)
    const isSubgraphInstance = node.data.type.startsWith('custom/');
    const subgraph = isSubgraphInstance ? subgraphs[node.data.type] : null;

    // For subgraph instances, show edit button (they don't have registry definitions)
    if (isSubgraphInstance && subgraph) {
        return (
            <div className="flex flex-col h-full">
                {/* Header */}
                <div className="px-4 py-3 border-b border-sidebar-border">
                    <h3 className="font-semibold text-sm">{subgraph.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Custom Subgraph
                    </p>
                </div>

                {/* Edit Button */}
                <div className="flex-1 p-4">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => enterSubgraphEditor(node.data.type)}
                        className="w-full gap-2"
                    >
                        <Layers className="w-4 h-4" />
                        Edit Subgraph
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                        Edit the internal graph of this custom node
                    </p>
                </div>
            </div>
        );
    }

    const def = registry.get(node.data.type);

    if (!def) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Select a node to edit properties
            </div>
        );
    }

    // For anchor nodes, show port management UI
    if (isAnchorNode) {
        return (
            <AnchorNodePortEditor
                nodeId={node.id}
                dynamicPorts={node.data.dynamicPorts || []}
                isInputAnchor={isInputAnchor}
                onAddPort={(port) => addDynamicPort(node.id, port)}
                onRemovePort={(portId) => removeDynamicPort(node.id, portId)}
                onUpdatePort={(portId, updates) => updateDynamicPort(node.id, portId, updates)}
            />
        );
    }

    const connectedInputs = new Set(
        edges.filter((e) => e.target === selectedNodeId).map((e) => e.targetHandle)
    );

    const inputs = def.inputs ?? {};
    const inputKeys = Object.keys(inputs);
    const editableInputs = inputKeys.filter((key) =>
        !connectedInputs.has(key) && !inputs[key].connectionOnly
    );

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-4 py-3 border-b border-sidebar-border">
                <h3 className="font-semibold text-sm">{def.label}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    {node.data.localName || node.id}
                </p>
            </div>

            {/* Properties */}
            <div className="flex-1 overflow-y-auto p-4">
                {/* Node Preview */}
                <NodePreview />

                {editableInputs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        {inputKeys.length === 0
                            ? 'This node has no editable properties'
                            : 'All inputs are connected'}
                    </p>
                ) : (
                    <div className="flex flex-col gap-4">
                        {editableInputs.map((key) => {
                            const input = inputs[key];

                            return (
                                <PropertyInputWrapper
                                    key={key}
                                    nodeId={node.id}
                                    inputKey={key}
                                    inputType={input.type}
                                    inputLabel={input.label}
                                    inputDefault={input.default}
                                    inputOptions={input.options}
                                    onChange={(v) => updateNodeValue(node.id, key, v)}
                                />
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

interface PropertyInputWrapperProps {
    nodeId: string;
    inputKey: string;
    inputType: string;
    inputLabel: string;
    inputDefault: unknown;
    inputOptions?: readonly { label: string; value: string }[];
    onChange: (value: unknown) => void;
}

/**
 * Wrapper that subscribes to the store for this specific input's value.
 */
function PropertyInputWrapper({
    nodeId,
    inputKey,
    inputType,
    inputLabel,
    inputDefault,
    inputOptions,
    onChange
}: PropertyInputWrapperProps) {
    // Subscribe reactively to this specific value
    const value = useNodeInputValue(nodeId, inputKey, inputDefault);

    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-medium text-sidebar-foreground/70 uppercase tracking-wider">
                {inputLabel}
            </label>
            <PropertyInput
                type={inputType}
                value={value}
                options={inputOptions}
                onChange={onChange}
            />
        </div>
    );
}

interface PropertyInputProps {
    type: string;
    value: unknown;
    options?: readonly { label: string; value: string }[];
    onChange: (value: unknown) => void;
}

function PropertyInput({ type, value, options, onChange }: PropertyInputProps) {
    if (options && options.length > 0) {
        return (
            <select
                value={String(value ?? options[0].value)}
                onChange={(e) => {
                    // Try to preserve type if original values were numbers
                    const val = e.target.value;
                    const originalOption = options.find(o => String(o.value) === val);
                    onChange(originalOption ? originalOption.value : val);
                }}
                className="h-8 px-2 text-xs bg-sidebar-accent border border-sidebar-border rounded-md text-sidebar-foreground w-full outline-none focus:ring-2 focus:ring-sidebar-ring"
            >
                {options.map((opt) => (
                    <option key={String(opt.value)} value={String(opt.value)}>
                        {opt.label}
                    </option>
                ))}
            </select>
        );
    }

    if (type === 'any') {
        return <AnyInput value={value} onChange={onChange} />;
    }
    if (type === 'string') {
        return <StringInput value={String(value ?? '')} onChange={onChange} />;
    }
    if (type === 'color') {
        return <ColorInput value={String(value ?? '#ffffff')} onChange={onChange} />;
    }
    if (type === 'bool') {
        return <BooleanInput value={value} onChange={onChange} />;
    }
    if (type === 'vec2') {
        return <VectorInput size={2} value={value} onChange={onChange} labels={['X', 'Y']} />;
    }
    if (type === 'vec3') {
        return <VectorInput size={3} value={value} onChange={onChange} labels={['X', 'Y', 'Z']} />;
    }
    if (type === 'vec4') {
        return <VectorInput size={4} value={value} onChange={onChange} labels={['X', 'Y', 'Z', 'W']} />;
    }

    return (
        <NumberInput
            value={Number(value ?? 0)}
            onChange={onChange}
            step={type === 'int' || type === 'uint' ? 1 : 0.1}
        />
    );
}

function StringInput({ value, onChange }: { value: string; onChange: (value: unknown) => void }) {
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const url = URL.createObjectURL(file);
            onChange(url);
        }
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex gap-2">
                <SidebarInput
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="h-8 text-xs flex-1"
                    placeholder="Image URL..."
                />
                <div className="relative">
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        title="Upload image"
                    />
                    <Button variant="outline" size="icon" className="h-8 w-8 shrink-0">
                        <Upload className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {value && (
                <div className="relative w-full aspect-square rounded-md overflow-hidden border border-sidebar-border bg-checkered">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={value}
                        alt="Preview"
                        className="w-full h-full object-contain"
                        onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                        }}
                    />
                </div>
            )}
        </div>
    );
}

function ColorInput({ value, onChange }: { value: string; onChange: (value: unknown) => void }) {
    const [localColor, setLocalColor] = useState(value);
    const debouncedOnChange = useDebouncedCallback(onChange, 100);

    useEffect(() => {
        setLocalColor(value);
    }, [value]);

    const handleColorChange = useCallback((newColor: string) => {
        setLocalColor(newColor);
        debouncedOnChange(newColor);
    }, [debouncedOnChange]);

    return (
        <div className="flex flex-col gap-3">
            <div className="relative">
                <HexColorPicker
                    color={localColor}
                    onChange={handleColorChange}
                    style={{ width: '100%', height: '140px' }}
                />
            </div>
            <div className="flex items-center gap-2">
                <div
                    className="w-8 h-8 rounded-md border border-sidebar-border shadow-sm shrink-0"
                    style={{ backgroundColor: localColor }}
                />
                <SidebarInput
                    type="text"
                    value={localColor}
                    onChange={(e) => handleColorChange(e.target.value)}
                    className="h-8 font-mono uppercase text-xs"
                    maxLength={7}
                />
            </div>
        </div>
    );
}

function NumberInput({ value, onChange, step }: { value: number; onChange: (value: unknown) => void; step: number }) {
    const [localValue, setLocalValue] = useState(value);
    const debouncedOnChange = useDebouncedCallback(onChange, 100);

    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    const handleValueChange = useCallback((newValue: number) => {
        setLocalValue(newValue);
        debouncedOnChange(newValue);
    }, [debouncedOnChange]);

    return (
        <SidebarInput
            type="number"
            value={localValue}
            onChange={(e) => handleValueChange(parseFloat(e.target.value) || 0)}
            step={step}
            className="h-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-xs"
        />
    );
}

function PropertiesPanelComponent() {
    const selectedNodeId = useEditorStore((s) => s.selectedNodeId);

    // Hide panel when no node is selected
    if (!selectedNodeId) {
        return null;
    }

    return (
        <div
            className={cn(
                'pointer-events-auto w-72 shrink flex-1 min-h-0',
                'bg-sidebar text-sidebar-foreground border border-sidebar-border rounded-xl shadow-lg',
                'flex flex-col overflow-hidden'
            )}
        >
            <PropertiesPanelContent />
        </div>
    );
}

export const PropertiesPanel = memo(PropertiesPanelComponent);
