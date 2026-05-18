'use client';

import { memo, useEffect, useCallback, useRef } from 'react';
import { useDebouncedCallback } from '@/utils/useDebouncedCallback';
import { NumericScrubber, type NumericScrubberChangeMeta } from '../ui/number-scrubber';

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
                    <div className="text-[10px] font-bold text-muted-foreground pointer-events-none select-none group-focus-within:text-primary transition-colors">
                        {currentLabels[i]}
                    </div>
                    <NumberInput
                        value={safeValue[i]}
                        onChange={(v) => handleChange(i, v)}
                        immediate={immediate}
                        className="pl-5 pr-2"

                    />
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
    const debouncedOnChange = useDebouncedCallback(onChange, 100);

    const handleChange = useCallback((nextValue: number, meta?: NumericScrubberChangeMeta) => {
        if (immediate || meta?.mode === 'blur' || meta?.mode === 'enter') {
            onChange(nextValue);
        } else {
            debouncedOnChange(nextValue);
        }
    }, [debouncedOnChange, immediate, onChange]);

    return (
        <>
            <NumericScrubber
                value={value}
                onChange={handleChange}
                step={0.1}
                min={-Infinity}
                max={Infinity}
                className={className ? `h-7 text-xs font-mono w-full ${className}` : 'h-7 text-xs font-mono w-full'}
            />
        </>
    );
}

export const VectorInput = memo(VectorInputComponent);
