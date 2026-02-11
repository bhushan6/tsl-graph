import { Input } from '@/components/ui/input';
import { NumericScrubber } from '@/components/ui/number-scrubber';
import React, { useEffect, useState, useRef } from 'react';

interface DebouncedInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
    value: string | number;
    onChange: (value: string | number) => void;
    debounce?: number;
}

export function DebouncedInput({
    value: initialValue,
    onChange,
    debounce = 500,
    ...props
}: DebouncedInputProps) {
    const [value, setValue] = useState(initialValue);
    const timeoutRef = useRef<NodeJS.Timeout>(null);

    useEffect(() => {
        setValue(initialValue);
    }, [initialValue]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        };
    }, []);

    const { type, min, max, step, ...rest } = props;

    if (type === 'number') {
        const numericValue = typeof value === 'number' ? value : Number(value);
        const parsedMin = typeof min === 'string' ? Number(min) : min;
        const parsedMax = typeof max === 'string' ? Number(max) : max;
        const parsedStep = typeof step === 'string' ? Number(step) : step;

        const handleScrubChange = (next: number) => {
            setValue(next);

            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }

            timeoutRef.current = setTimeout(() => {
                onChange(next);
            }, debounce);
        };

        return (
            <NumericScrubber
                value={Number.isFinite(numericValue) ? numericValue : 0}
                onChange={handleScrubChange}
                min={Number.isFinite(parsedMin as number) ? (parsedMin as number) : undefined}
                max={Number.isFinite(parsedMax as number) ? (parsedMax as number) : undefined}
                step={Number.isFinite(parsedStep as number) ? (parsedStep as number) : undefined}
                {...rest}
            />
        );
    }

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setValue(newValue);

        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
            onChange(newValue);
        }, debounce);
    };

    return (
        <Input
            {...rest}
            value={value}
            onChange={handleInputChange}
        />
    );
}
