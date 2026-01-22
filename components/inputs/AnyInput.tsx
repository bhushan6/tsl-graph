'use client';

import { memo, useState, useEffect, useCallback } from 'react';
import { VectorInput } from './VectorInput';
import { BooleanInput } from './BooleanInput';
import { HexColorPicker } from 'react-colorful';
import { SidebarInput } from '@/components/ui/sidebar';
import { Label } from '@/components/ui/label';
import { useDebouncedCallback } from '@/utils/useDebouncedCallback';
import { TSLValueType } from '@/lib/types';

interface AnyInputProps {
    value: TSLValueType;
    onChange: (value: TSLValueType) => void;
}

type InputType = 'float' | 'vec2' | 'vec3' | 'vec4' | 'color' | 'bool';

export function inferType(value: TSLValueType): InputType {
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

/**
 * Parse a hex color string to RGB array [0-1 normalized]
 */
export function hexToRgb(hex: string): [number, number, number] {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
        return [
            parseInt(result[1], 16) / 255,
            parseInt(result[2], 16) / 255,
            parseInt(result[3], 16) / 255
        ];
    }
    return [1, 1, 1]; // Default white
}

/**
 * Convert RGB array [0-1 normalized] to hex string
 */
export function rgbToHex(r: number, g: number, b: number): string {
    const toHex = (v: number) => {
        const clamped = Math.max(0, Math.min(1, v));
        const hex = Math.round(clamped * 255).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Convert value from one type to another with proper component preservation.
 *
 * Rules:
 * - Vector → larger vector: Extend with 0s, except alpha (w) = 1 for vec4
 * - Vector → smaller vector: Truncate (keep first N components)
 * - Scalar → vector: Put scalar in first position, fill rest with 0 (alpha 1)
 * - Vector → scalar: Take first component [x]
 * - Color ↔ vectors: Convert RGB hex to/from normalized [0-1] values
 */
export function convertValue(oldValue: TSLValueType, newType: InputType): TSLValueType {
    const oldType = inferType(oldValue);

    // Same type - no conversion needed
    if (oldType === newType) return oldValue;

    // Get components as array (for any source type)
    let components: number[] = [];

    if (oldType === 'float') {
        components = [Number(oldValue) || 0];
    } else if (oldType === 'bool') {
        components = [oldValue ? 1 : 0];
    } else if (oldType === 'color') {
        components = hexToRgb(String(oldValue));
    } else if (Array.isArray(oldValue)) {
        components = oldValue.map(v => Number(v) || 0);
    }

    // Convert to target type
    switch (newType) {
        case 'float':
            return components[0] ?? 0;

        case 'bool':
            return components.some(v => v !== 0);

        case 'vec2': {
            const [x = 0, y = 0] = components;
            return [x, y];
        }

        case 'vec3': {
            const [x = 0, y = 0, z = 0] = components;
            return [x, y, z];
        }

        case 'vec4': {
            const [x = 0, y = 0, z = 0, w] = components;
            // Default alpha to 1 if not present
            return [x, y, z, w ?? 1];
        }

        case 'color': {
            const [r = 1, g = 1, b = 1] = components;
            return rgbToHex(r, g, b);
        }
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
                return (
                    <VectorInput
                        size={2}
                        value={Array.isArray(value) ? value : Number(value ?? 0)}
                        onChange={onChange}
                        labels={['X', 'Y']}
                    />
                );
            case 'vec3':
                return (
                    <VectorInput
                        size={3}
                        value={Array.isArray(value) ? value : Number(value ?? 0)}
                        onChange={onChange}
                        labels={['X', 'Y', 'Z']}
                    />
                );
            case 'vec4':
                return (
                    <VectorInput
                        size={4}
                        value={Array.isArray(value) ? value : Number(value ?? 0)}
                        onChange={onChange}
                        labels={['X', 'Y', 'Z', 'W']}
                    />
                );
            case 'color':
                return <SimpleColorInput value={String(value)} onChange={onChange} />;
            case 'float':
            default:
                return (
                    <DebouncedFloatInput
                        value={Number(value ?? 0)}
                        onChange={onChange}
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
                    className="h-6 text-[10px] border border-sidebar-border rounded bg-sidebar-accent text-sidebar-foreground px-1 py-0 outline-none focus:ring-1 focus:ring-sidebar-ring cursor-pointer"
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

// Debounced float input with local state
function DebouncedFloatInput({ value, onChange }: { value: number; onChange: (v: TSLValueType) => void }) {
    const [localValue, setLocalValue] = useState<string>(String(value));
    const debouncedOnChange = useDebouncedCallback(onChange, 100);

    useEffect(() => {
        setLocalValue(String(value));
    }, [value]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const inputValue = e.target.value;
        // Allow empty, minus sign, or valid number patterns (including negative)
        if (inputValue === '' || inputValue === '-' || inputValue === '.' || inputValue === '-.') {
            setLocalValue(inputValue);
            return;
        }
        // Check if it's a valid number pattern
        if (/^-?\d*\.?\d*$/.test(inputValue)) {
            setLocalValue(inputValue);
            const parsed = parseFloat(inputValue);
            if (!isNaN(parsed)) {
                debouncedOnChange(parsed);
            }
        }
    }, [debouncedOnChange]);

    const handleBlur = useCallback(() => {
        // On blur, normalize the value
        const parsed = parseFloat(localValue);
        const normalized = isNaN(parsed) ? 0 : parsed;
        setLocalValue(String(normalized));
        onChange(normalized);
    }, [localValue, onChange]);

    return (
        <SidebarInput
            type="text"
            inputMode="decimal"
            value={localValue}
            onChange={handleChange}
            onBlur={handleBlur}
            className="h-7 text-xs font-mono"
        />
    );
}

// Simple color input for usage here with debouncing
function SimpleColorInput({ value, onChange }: { value: string, onChange: (v: string) => void }) {
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
        <div className="flex flex-col gap-2">
            <HexColorPicker color={localColor} onChange={handleColorChange} style={{ width: '100%', height: '100px' }} />
            <div className="flex gap-2 items-center">
                <div className="w-6 h-6 rounded border shrink-0" style={{ backgroundColor: localColor }} />
                <SidebarInput
                    value={localColor}
                    onChange={e => handleColorChange(e.target.value)}
                    className="h-6 text-xs font-mono uppercase"
                />
            </div>
        </div>
    );
}

export const AnyInput = memo(AnyInputComponent);
