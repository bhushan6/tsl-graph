'use client';

import { memo, useState, useEffect, useCallback } from 'react';
import { VectorInput } from './VectorInput';
import { BooleanInput } from './BooleanInput';
import { HexColorPicker } from 'react-colorful';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';

interface AnyInputProps {
    value: unknown;
    onChange: (value: unknown) => void;
}

type InputType = 'float' | 'vec2' | 'vec3' | 'vec4' | 'color' | 'bool';

function inferType(value: unknown): InputType {
    if (typeof value === 'boolean') return 'bool';
    if (typeof value === 'string' && value.startsWith('#')) return 'color';
    if (Array.isArray(value)) {
        if (value.length === 2) return 'vec2';
        if (value.length === 3) return 'vec3';
        if (value.length === 4) return 'vec4';
        return 'vec3'; // Fallback
    }
    return 'float';
}

function convertValue(oldValue: unknown, newType: InputType): unknown {
    const oldType = inferType(oldValue);

    // Extract a base number to work with
    let baseNum = 0;
    if (oldType === 'float') baseNum = Number(oldValue);
    else if (oldType === 'bool') baseNum = oldValue ? 1 : 0;
    else if (oldType === 'color') baseNum = 0; // Keeping it simple for color -> num
    else if (Array.isArray(oldValue)) baseNum = Number(oldValue[0] || 0);

    // Helper for vector creation
    const fillVec = (size: number) => Array(size).fill(baseNum);

    switch (newType) {
        case 'float': return baseNum;
        case 'bool': return Boolean(baseNum);
        case 'vec2': return fillVec(2);
        case 'vec3': return oldType === 'color' ? [1, 1, 1] : fillVec(3);
        case 'vec4': return oldType === 'color' ? [1, 1, 1, 1] : fillVec(4);
        case 'color': return '#ffffff';
    }
}

function AnyInputComponent({ value, onChange }: AnyInputProps) {
    // Current active type state, defaults to inferred
    const [currentType, setCurrentType] = useState<InputType>(inferType(value));

    // Sync state if value changes externally to something incompatible? 
    // Actually, we usually want the UI to drive the type.
    // But if we load a saved graph, we need to respect that.
    useEffect(() => {
        const inf = inferType(value);
        // Only override if strictly different structure (e.g. primitive type mismatch)
        // to verify we aren't overwriting user intent during typing.
        if (inf !== currentType) {
            // Check broadly? for now just sync.
            setCurrentType(inf);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);
    // ^ Dependency on value might cause loops if we aren't careful, 
    // but inferType is stable for same structure.

    const handleTypeChange = (newType: InputType) => {
        if (newType === currentType) return;
        const newValue = convertValue(value, newType);
        setCurrentType(newType);
        onChange(newValue);
    };

    const renderInput = () => {
        switch (currentType) {
            case 'bool':
                return <BooleanInput value={value} onChange={onChange} />;
            case 'vec2':
                // Cast to array safely
                return <VectorInput size={2} value={value} onChange={onChange as any} labels={['X', 'Y']} />;
            case 'vec3':
                return <VectorInput size={3} value={value} onChange={onChange as any} labels={['X', 'Y', 'Z']} />;
            case 'vec4':
                return <VectorInput size={4} value={value} onChange={onChange as any} labels={['X', 'Y', 'Z', 'W']} />;
            case 'color':
                // Inline simple color input re-implementation or reuse generic one?
                // Let's implement a simple inline one to avoid circular deps if any.
                return <SimpleColorInput value={String(value)} onChange={onChange} />;
            case 'float':
            default:
                return (
                    <Input
                        type="number"
                        value={Number(value ?? 0)}
                        onChange={e => onChange(parseFloat(e.target.value))}
                        step={0.1}
                        className="h-8 text-xs font-mono"
                    />
                );
        }
    };

    return (
        <div className="flex flex-col gap-2">
            {/* Type Selector Header */}
            <div className="flex justify-between items-center">
                <Label className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider">
                    Type
                </Label>
                <select
                    className="h-6 text-[10px] border rounded bg-background px-1 py-0"
                    value={currentType}
                    onChange={(e) => handleTypeChange(e.target.value as InputType)}
                >
                    <option value="float">Float</option>
                    <option value="vec2">Vec2</option>
                    <option value="vec3">Vec3</option>
                    <option value="vec4">Vec4</option>
                    <option value="color">Color</option>
                    <option value="bool">Bool</option>
                </select>
            </div>

            {/* Input Area */}
            {renderInput()}
        </div>
    );
}

// Simple color input for usage here
function SimpleColorInput({ value, onChange }: { value: string, onChange: (v: string) => void }) {
    return (
        <div className="flex flex-col gap-2">
            <HexColorPicker color={value} onChange={onChange} style={{ width: '100%', height: '100px' }} />
            <div className="flex gap-2 items-center">
                <div className="w-6 h-6 rounded border shrink-0" style={{ backgroundColor: value }} />
                <Input value={value} onChange={e => onChange(e.target.value)} className="h-6 text-xs font-mono uppercase" />
            </div>
        </div>
    );
}

export const AnyInput = memo(AnyInputComponent);
