'use client';

import { memo, useId } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface BooleanInputProps {
    value: unknown;
    onChange: (value: boolean) => void;
    label?: string;
}

function BooleanInputComponent({ value, onChange, label }: BooleanInputProps) {
    const boolValue = Boolean(value);
    const id = useId();

    return (
        <div className={cn(
            "flex items-center space-x-2 h-7 w-full rounded px-2 transition-colors border border-sidebar-border/50",
            boolValue ? "bg-sidebar-accent/70" : "bg-sidebar-accent/30 hover:bg-sidebar-accent/50"
        )}>
            <input
                type="checkbox"
                id={id}
                checked={boolValue}
                onChange={(e) => onChange(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-sidebar-border text-primary focus:ring-sidebar-ring accent-primary"
            />
            <Label htmlFor={id} className="text-xs text-sidebar-foreground cursor-pointer select-none flex-1">
                {boolValue ? 'True' : 'False'}
            </Label>
        </div>
    );
}

export const BooleanInput = memo(BooleanInputComponent);
