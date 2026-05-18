'use client';

import { useCallback } from 'react';
import { useDebouncedCallback } from '@/utils/useDebouncedCallback';
import { NumericScrubber, type NumericScrubberChangeMeta } from '../ui/number-scrubber';
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
    const debouncedOnChange = useDebouncedCallback(onChange, 100);

    const handleChange = useCallback((nextValue: number, meta?: NumericScrubberChangeMeta) => {
        if (immediate || meta?.mode === 'blur' || meta?.mode === 'enter') {
            onChange(nextValue);
        } else {
            debouncedOnChange(nextValue);
        }
    }, [debouncedOnChange, immediate, onChange]);

    return (
        <NumericScrubber
            value={value}
            onChange={handleChange}
            step={step}
            min={-Infinity}
            max={Infinity}
            className={className ?? 'h-7 text-xs font-mono w-full'}
        />
    );
}
