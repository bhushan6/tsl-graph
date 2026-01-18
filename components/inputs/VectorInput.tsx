'use client';

import { memo, useEffect, useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { SidebarInput } from '@/components/ui/sidebar';
import { useDebouncedCallback } from '@/utils/useDebouncedCallback';

interface VectorInputProps {
    value: number | readonly number[]; // Expecting number[] or number
    onChange: (value: number[]) => void;
    size: 2 | 3 | 4;
    labels?: string[]; // Defaults to ['X', 'Y', 'Z', 'W']
}

const defaultLabels = ['X', 'Y', 'Z', 'W'];

function VectorInputComponent({ value, onChange, size, labels }: VectorInputProps) {
    // Ensure value is an array of correct size

    const safeValue = useMemo(() => {
        if (Array.isArray(value)) {
            // Pad or truncate
            const arr = [...value];
            while (arr.length < size) arr.push(0);
            return arr.slice(0, size);
        }
        // If single number or undefined/null
        const num = Number(value ?? 0);
        return Array(size).fill(num);
    }, [value, size]);

    const currentLabels = labels || defaultLabels.slice(0, size);

    const handleChange = useCallback((index: number, newVal: number) => {
        const newArr = [...safeValue];
        newArr[index] = newVal;
        onChange(newArr);
    }, [onChange, safeValue]);

    return (
        <div className="flex gap-2 w-full">
            {Array.from({ length: size }).map((_, i) => (
                <div key={i} className="flex-1 min-w-0 relative group">
                    <NumberInput
                        value={safeValue[i]}
                        onChange={(v) => handleChange(i, v)}
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

function NumberInput({ value, onChange, className }: { value: number; onChange: (val: number) => void; className?: string }) {
    const [localValue, setLocalValue] = useState(value);
    const debouncedOnChange = useDebouncedCallback(onChange, 100);

    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    return (
        <SidebarInput
            type="number"
            value={localValue}
            onChange={(e) => {
                const f = parseFloat(e.target.value);
                setLocalValue(isNaN(f) ? 0 : f);
                debouncedOnChange(isNaN(f) ? 0 : f);
            }}
            step={0.1}
            className={cn(
                "h-7 text-xs px-2 font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                className
            )}
        />
    );
}

export const VectorInput = memo(VectorInputComponent);
