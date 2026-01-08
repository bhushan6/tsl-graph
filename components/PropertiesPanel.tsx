'use client';

import { memo, useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useEditorStore } from '@/store/editor';
import { registry } from '@/lib/registry';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { HexColorPicker } from 'react-colorful';
import { useEdges } from '@xyflow/react';
import { VectorInput } from './inputs/VectorInput';
import { BooleanInput } from './inputs/BooleanInput';
import { AnyInput } from './inputs/AnyInput';
import { useDebouncedCallback } from '@/utils/useDebouncedCallback';

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
    const edges = useEdges();

    const def = node ? registry.get(node.data.type) : null;

    if (!node || !def) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Select a node to edit properties
            </div>
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
            <div className="px-4 py-3 border-b border-border">
                <h3 className="font-semibold text-sm">{def.label}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    {node.data.localName || node.id}
                </p>
            </div>

            {/* Properties */}
            <div className="flex-1 overflow-y-auto p-4">
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
    onChange
}: PropertyInputWrapperProps) {
    // Subscribe reactively to this specific value
    const value = useNodeInputValue(nodeId, inputKey, inputDefault);

    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {inputLabel}
            </label>
            <PropertyInput
                type={inputType}
                value={value}
                onChange={onChange}
            />
        </div>
    );
}

interface PropertyInputProps {
    type: string;
    value: unknown;
    onChange: (value: unknown) => void;
}

function PropertyInput({ type, value, onChange }: PropertyInputProps) {
    if (type === 'any') {
        return <AnyInput value={value} onChange={onChange} />;
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
                    className="w-8 h-8 rounded-md border border-border shadow-sm shrink-0"
                    style={{ backgroundColor: localColor }}
                />
                <Input
                    type="text"
                    value={localColor}
                    onChange={(e) => handleColorChange(e.target.value)}
                    className="h-8 font-mono uppercase text-sm"
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
        <Input
            type="number"
            value={localValue}
            onChange={(e) => handleValueChange(parseFloat(e.target.value) || 0)}
            step={step}
            className="h-9 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                'pointer-events-auto w-72 max-h-[calc(100vh-20rem)]',
                'bg-card/95 backdrop-blur-sm border border-border rounded-xl shadow-lg',
                'flex flex-col overflow-hidden'
            )}
        >
            <PropertiesPanelContent />
        </div>
    );
}

export const PropertiesPanel = memo(PropertiesPanelComponent);
