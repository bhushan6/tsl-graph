'use client';

import { memo, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

function useDebouncedCallback<T extends (...args: any[]) => void>(
    callback: T,
    delay: number
): T {
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    return useMemo(
        () =>
            ((...args: any[]) => {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                timeoutRef.current = setTimeout(() => {
                    callbackRef.current(...args);
                }, delay);
            }) as T,
        [delay]
    );
}

interface VectorInputProps {
    value: unknown; // Expecting number[] or number
    onChange: (value: number[]) => void;
    size: 2 | 3 | 4;
    labels?: string[]; // Defaults to ['X', 'Y', 'Z', 'W']
}

const defaultLabels = ['X', 'Y', 'Z', 'W'];

function VectorInputComponent({ value, onChange, size, labels }: VectorInputProps) {
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
    valueRef.current = safeValue;

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
        <Input
            type="number"
            value={localValue}
            onChange={(e) => {
                const f = parseFloat(e.target.value);
                setLocalValue(isNaN(f) ? 0 : f);
                debouncedOnChange(isNaN(f) ? 0 : f);
            }}
            step={0.1}
            className={cn(
                "h-8 text-xs px-2 font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                className
            )}
        />
    );
}

export const VectorInput = memo(VectorInputComponent);
