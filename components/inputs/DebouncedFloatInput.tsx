'use client';

import { useCallback, useEffect, useState } from 'react';
import { useDebouncedCallback } from '@/utils/useDebouncedCallback';
import { NumericScrubber } from '../ui/number-scrubber';
import type { TSLValueType } from '@/lib/types';

export function DebouncedFloatInput({
    value,
    onChange,
    immediate = false,
    step = 0.1,
    className,
}: {
    value: number;
    onChange: (v: TSLValueType) => void;
    immediate?: boolean;
    step?: number;
    className?: string;
}) {
    const [localValue, setLocalValue] = useState<string>(String(value));
    const debouncedOnChange = useDebouncedCallback(onChange, 100);

    useEffect(() => {
        setLocalValue(String(value));
    }, [value]);

    const handleChange = useCallback((v: number) => {
        const inputValue = String(v);
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
                if (immediate) {
                    onChange(parsed);
                } else {
                    debouncedOnChange(parsed);
                }
            }
        }
    }, [debouncedOnChange, immediate, onChange]);

    const handleBlur = useCallback(() => {
        // On blur, normalize the value
        const parsed = parseFloat(localValue);
        const normalized = isNaN(parsed) ? 0 : parsed;
        setLocalValue(String(normalized));
        onChange(normalized);
    }, [localValue, onChange]);

    return (
        <NumericScrubber
            value={Number(localValue)}
            onChange={(v) => {
                handleChange(v);
            }}
            step={step}
            min={-Infinity}
            max={Infinity}
            onBlur={handleBlur}
            className={className ?? 'h-7 text-xs font-mono w-full'}
        />
    );
}
