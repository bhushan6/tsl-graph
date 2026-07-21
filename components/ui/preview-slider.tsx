'use client';

import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// Track-style scrubber slider adapted from react-bits' PreviewSlider
// (https://github.com/DavidHDev/react-bits), ported to TS + Tailwind with
// theme tokens and gesture-end commits for undo coalescing.

const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max);

const stepDecimals = (step: number) => {
    const s = step.toString();
    const dot = s.indexOf('.');
    return dot === -1 ? 0 : s.length - dot - 1;
};

const roundToStep = (val: number, step: number, min: number) => {
    const raw = Math.round((val - min) / step) * step + min;
    const decimals = Math.max(stepDecimals(step), stepDecimals(min));
    return Number(raw.toFixed(decimals));
};

export interface PreviewSliderProps {
    value: number;
    min: number;
    max: number;
    step?: number;
    label?: string;
    /** Show the value readout inside the track (right-aligned). */
    showValue?: boolean;
    formatValue?: (value: number) => string;
    disabled?: boolean;
    /** md: panel-height track; sm: compact for in-node use */
    size?: 'md' | 'sm';
    /** Continuous updates while dragging or on keyboard steps */
    onChange: (value: number) => void;
    /** Gesture end (pointer release, keyboard step) */
    onCommit?: (value: number) => void;
    className?: string;
}

const TICK_COUNT = 9;

export function PreviewSlider({
    value,
    min,
    max,
    step = 1,
    label,
    showValue = true,
    formatValue,
    disabled = false,
    size = 'md',
    onChange,
    onCommit,
    className,
}: PreviewSliderProps) {
    const trackRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const range = max - min;
    const safeValue = Number.isFinite(value) ? value : min;
    const percentage = range > 0 ? clamp(((safeValue - min) / range) * 100, 0, 100) : 0;
    const isSm = size === 'sm';

    const computeValue = useCallback(
        (clientX: number) => {
            const track = trackRef.current;
            if (!track) return safeValue;
            const rect = track.getBoundingClientRect();
            const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
            return clamp(roundToStep(min + ratio * range, step, min), min, max);
        },
        [min, max, step, range, safeValue]
    );

    const handlePointerDown = useCallback(
        (e: React.PointerEvent) => {
            if (disabled) return;
            e.preventDefault();
            trackRef.current?.setPointerCapture(e.pointerId);
            setIsDragging(true);
            onChange(computeValue(e.clientX));
        },
        [computeValue, onChange, disabled]
    );

    const handlePointerMove = useCallback(
        (e: React.PointerEvent) => {
            if (!isDragging) return;
            onChange(computeValue(e.clientX));
        },
        [isDragging, computeValue, onChange]
    );

    const handlePointerUp = useCallback(
        (e: React.PointerEvent) => {
            if (!isDragging) return;
            setIsDragging(false);
            onCommit?.(computeValue(e.clientX));
        },
        [isDragging, computeValue, onCommit]
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (disabled) return;
            let next: number;
            switch (e.key) {
                case 'ArrowRight':
                case 'ArrowUp':
                    next = safeValue + step;
                    break;
                case 'ArrowLeft':
                case 'ArrowDown':
                    next = safeValue - step;
                    break;
                case 'Home':
                    next = min;
                    break;
                case 'End':
                    next = max;
                    break;
                default:
                    return;
            }
            e.preventDefault();
            const rounded = clamp(roundToStep(next, step, min), min, max);
            onChange(rounded);
            onCommit?.(rounded);
        },
        [safeValue, step, min, max, onChange, onCommit, disabled]
    );

    const decimals = stepDecimals(step);
    const formattedValue = formatValue
        ? formatValue(safeValue)
        : String(Number(safeValue.toFixed(decimals)));

    return (
        <div
            ref={trackRef}
            role="slider"
            aria-label={label}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={safeValue}
            aria-disabled={disabled}
            tabIndex={disabled ? -1 : 0}
            data-dragging={isDragging}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onKeyDown={handleKeyDown}
            className={cn(
                'group relative w-full min-w-0 select-none touch-none overflow-hidden cursor-pointer outline-none',
                'border border-sidebar-border bg-muted/40',
                'focus-visible:ring-2 focus-visible:ring-ring/40',
                isSm ? 'h-5 rounded' : 'h-9 rounded-md',
                disabled && 'opacity-40 pointer-events-none',
                className
            )}
        >
            {/* Fill */}
            <div
                className="absolute inset-y-0 left-0 pointer-events-none bg-foreground/[0.07] transition-[width] duration-150 ease-out group-data-[dragging=true]:transition-none"
                style={{ width: `${percentage}%` }}
            />

            {/* Ticks */}
            <div className="absolute inset-0 pointer-events-none">
                {Array.from({ length: TICK_COUNT }, (_, i) => (
                    <div
                        key={i}
                        className={cn(
                            'absolute top-1/2 w-px -translate-x-1/2 -translate-y-1/2 rounded-full bg-border',
                            isSm ? 'h-1' : 'h-2'
                        )}
                        style={{ left: `${((i + 1) / (TICK_COUNT + 1)) * 100}%` }}
                    />
                ))}
            </div>

            {/* Capsule thumb */}
            <div
                className="absolute top-1/2 z-[3] -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-[left] duration-150 ease-out group-data-[dragging=true]:transition-none"
                style={{ left: `${percentage}%` }}
            >
                <div
                    className={cn(
                        'rounded-full bg-foreground/90 opacity-20 scale-75 transition-[opacity,transform] duration-200',
                        'group-hover:opacity-90 group-hover:scale-100 group-data-[dragging=true]:opacity-90 group-data-[dragging=true]:scale-100',
                        isSm ? 'w-[3px] h-3' : 'w-[5px] h-[22px]'
                    )}
                />
            </div>

            {label ? (
                <div
                    className={cn(
                        'absolute top-1/2 -translate-y-1/2 z-[4] pointer-events-none whitespace-nowrap text-muted-foreground',
                        isSm ? 'left-1.5 text-[9px]' : 'left-3 text-xs'
                    )}
                >
                    {label}
                </div>
            ) : null}

            {showValue ? (
                <div
                    className={cn(
                        'absolute top-1/2 -translate-y-1/2 z-[4] pointer-events-none font-mono tabular-nums font-medium text-foreground',
                        isSm ? 'right-1.5 text-[9px]' : 'right-2.5 text-xs'
                    )}
                >
                    {formattedValue}
                </div>
            ) : null}
        </div>
    );
}
