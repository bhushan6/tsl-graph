'use client';

import { memo, useEffect, useState, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { SidebarInput } from '@/components/ui/sidebar';
import { useDebouncedCallback } from '@/utils/useDebouncedCallback';

interface VectorInputProps {
    value: number | readonly number[]; // Expecting number[] or number
    onChange: (value: number[]) => void;
    size: 2 | 3 | 4;
    labels?: string[]; // Defaults to ['X', 'Y', 'Z', 'W']
    immediate?: boolean;
}

const defaultLabels = ['X', 'Y', 'Z', 'W'];

function VectorInputComponent({ value, onChange, size, labels, immediate = false }: VectorInputProps) {
    // Ensure value is an array of correct size

    const getSafeValue = (): number[] => {
        if (Array.isArray(value)) {
            // Pad or truncate
            const arr = [...value];
            while (arr.length < size) arr.push(0);
            return arr.slice(0, size);
        }
        // If single number or undefined/null
        const num = Number(value ?? 0);
        return Array(size).fill(num);
    };

    const safeValue = getSafeValue();

    // Keep a ref to track the latest value for use in handleChange
    const valueRef = useRef(safeValue);

    useEffect(() => {
        valueRef.current = safeValue;
    });

    const currentLabels = labels || defaultLabels.slice(0, size);

    const handleChange = useCallback((index: number, newVal: number) => {
        const newArr = [...valueRef.current];
        newArr[index] = newVal;
        onChange(newArr);
    }, [onChange]);

    return (
        <div className="flex gap-2 w-full">
            {Array.from({ length: size }).map((_, i) => (
                <div key={i} className="flex-1 min-w-0 relative group">
                    <NumberInput
                        value={safeValue[i]}
                        onChange={(v) => handleChange(i, v)}
                        immediate={immediate}
                        className="pl-5 pr-2"
                    />
                    <div className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground pointer-events-none select-none group-focus-within:text-primary transition-colors">
                        {currentLabels[i]}
                    </div>
                </div>
            ))}
        </div>
    );
}

function NumberInput({
    value,
    onChange,
    className,
    immediate = false,
}: {
    value: number;
    onChange: (val: number) => void;
    className?: string;
    immediate?: boolean;
}) {
    const [localValue, setLocalValue] = useState<string>(String(value));
    const debouncedOnChange = useDebouncedCallback(onChange, 100);

    useEffect(() => {
        setLocalValue(String(value));
    }, [value]);

    return (
        <SidebarInput
            type="text"
            inputMode="decimal"
            value={localValue}
            onChange={(e) => {
                const inputValue = e.target.value;
                // Allow empty, minus sign, or valid number patterns (including negative)
                if (inputValue === '' || inputValue === '-' || inputValue === '.' || inputValue === '-.') {
                    setLocalValue(inputValue);
                    return;
                }
                // Check if it's a valid number pattern
                if (/^-?\d*\.?\d*$/.test(inputValue)) {
                    setLocalValue(inputValue);
                    const f = parseFloat(inputValue);
                    if (!isNaN(f)) {
                        if (immediate) {
                            onChange(f);
                        } else {
                            debouncedOnChange(f);
                        }
                    }
                }
            }}
            onBlur={() => {
                // On blur, normalize the value
                const f = parseFloat(localValue);
                const normalized = isNaN(f) ? 0 : f;
                setLocalValue(String(normalized));
                onChange(normalized);
            }}
            className={cn(
                "h-7 text-xs px-2 font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                className
            )}
        />
    );
}

export const VectorInput = memo(VectorInputComponent);
