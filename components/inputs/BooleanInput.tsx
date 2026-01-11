'use client';

import { memo, useId } from 'react';
import { Label } from '@/components/ui/label';

interface BooleanInputProps {
    value: unknown;
    onChange: (value: boolean) => void;
    label?: string;
}

function BooleanInputComponent({ value, onChange, label }: BooleanInputProps) {
    const boolValue = Boolean(value);
    const id = useId();

    return (
        <div className="flex items-center space-x-2 h-8">
            <input
                type="checkbox"
                id={id}
                checked={boolValue}
                onChange={(e) => onChange(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <Label htmlFor={id} className="text-xs text-muted-foreground font-normal cursor-pointer select-none">
                {boolValue ? 'True' : 'False'}
            </Label>
        </div>
    );
}

export const BooleanInput = memo(BooleanInputComponent);
