'use client';

import { memo, useCallback, useEffect, useState } from 'react';
import { HexColorPicker } from 'react-colorful';
import { Slider } from '@/components/ui/slider';
import { NumericScrubber, type NumericScrubberChangeMeta } from '@/components/ui/number-scrubber';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { BooleanInput } from '@/components/inputs/BooleanInput';
import { SidebarInput } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import {
    coerceUniformValue,
    getEffectiveStep,
    hasSliderRange,
    type UniformKind,
    type UniformRange,
} from '@/lib/uniform-utils';
import type { TSLValueType } from '@/lib/types';

export interface UniformControlProps {
    kind: UniformKind;
    value: TSLValueType | undefined;
    range?: UniformRange;
    /** node: compact, nodrag-wrapped for use inside a flow node; panel: sidebar sizing */
    variant: 'node' | 'panel';
    /** Continuous updates (slider drag, scrub, color-picker drag) */
    onLiveChange: (value: TSLValueType) => void;
    /** Gesture end (slider release, scrubber blur/enter, toggle, hex commit) */
    onCommit: (value: TSLValueType) => void;
    /** When set for a vector kind, renders only that component's control */
    componentIndex?: number;
    className?: string;
}

const COMPONENT_LABELS = ['X', 'Y', 'Z', 'W'];
const VECTOR_SIZES: Partial<Record<UniformKind, number>> = { vec2: 2, vec3: 3, vec4: 4 };

const EMPTY_RANGE: UniformRange = {};

function ScalarControl({
    kind,
    value,
    range,
    variant,
    onLiveChange,
    onCommit,
}: {
    kind: UniformKind;
    value: number;
    range: UniformRange;
    variant: 'node' | 'panel';
    onLiveChange: (value: number) => void;
    onCommit: (value: number) => void;
}) {
    const step = getEffectiveStep(kind, range);
    const showSlider = hasSliderRange(range);
    const isNode = variant === 'node';

    const handleScrubberChange = useCallback(
        (next: number, meta?: NumericScrubberChangeMeta) => {
            if (meta?.mode === 'blur' || meta?.mode === 'enter') {
                onCommit(next);
            } else {
                onLiveChange(next);
            }
        },
        [onCommit, onLiveChange]
    );

    if (!showSlider) {
        return (
            <NumericScrubber
                value={value}
                onChange={handleScrubberChange}
                min={range.min ?? -Infinity}
                max={range.max ?? Infinity}
                step={step}
                quantizeInput={kind === 'int' ? true : undefined}
                className={cn(isNode ? 'h-5 w-16 text-[10px] pl-4 pr-1 py-0' : 'h-7 text-xs')}
            />
        );
    }

    const slider = (
        <Slider
            value={[value]}
            min={range.min}
            max={range.max}
            step={step}
            onValueChange={([next]) => onLiveChange(next)}
            onValueCommit={([next]) => onCommit(next)}
            className={cn(
                'flex-1 min-w-0',
                isNode && '[&_[data-slot=slider-thumb]]:size-2.5 [&_[data-slot=slider-track]]:h-1'
            )}
        />
    );

    if (isNode) {
        // In the node, the slider replaces the scrubber; a compact read-only
        // readout keeps the current value visible.
        return (
            <div className="flex items-center gap-1.5 w-full min-w-0">
                {slider}
                <span className="text-[9px] font-mono tabular-nums text-gray-500 dark:text-white/50 shrink-0 min-w-7 text-right">
                    {formatReadout(value)}
                </span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2 w-full min-w-0">
            {slider}
            <NumericScrubber
                value={value}
                onChange={handleScrubberChange}
                min={range.min}
                max={range.max}
                step={step}
                quantizeInput={kind === 'int' ? true : undefined}
                className="h-7 w-16 shrink-0 text-xs"
            />
        </div>
    );
}

/** Compact value readout: strips float noise, keeps up to 3 decimals. */
function formatReadout(value: number): string {
    if (!Number.isFinite(value)) return '0';
    return String(parseFloat(value.toFixed(3)));
}

function ColorControl({
    value,
    variant,
    onLiveChange,
    onCommit,
}: {
    value: string;
    variant: 'node' | 'panel';
    onLiveChange: (value: string) => void;
    onCommit: (value: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [hexDraft, setHexDraft] = useState(value);

    useEffect(() => {
        setHexDraft(value);
    }, [value]);

    const handleOpenChange = useCallback(
        (nextOpen: boolean) => {
            setOpen(nextOpen);
            if (!nextOpen) onCommit(value);
        },
        [onCommit, value]
    );

    const commitHex = useCallback(() => {
        const normalized = /^#?[0-9a-fA-F]{6}$/.test(hexDraft.trim())
            ? (hexDraft.trim().startsWith('#') ? hexDraft.trim() : `#${hexDraft.trim()}`)
            : value;
        setHexDraft(normalized);
        onCommit(normalized);
    }, [hexDraft, onCommit, value]);

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label="Edit color"
                    className={cn(
                        'rounded border border-sidebar-border cursor-pointer',
                        variant === 'node' ? 'h-4 w-full min-w-8' : 'h-7 w-full'
                    )}
                    style={{ backgroundColor: value }}
                />
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" side="top">
                <div className="flex flex-col gap-2">
                    <HexColorPicker
                        color={value}
                        onChange={onLiveChange}
                        style={{ width: '100%', height: '100px' }}
                    />
                    <div className="flex gap-2 items-center">
                        <div
                            className="w-6 h-6 rounded border shrink-0"
                            style={{ backgroundColor: value }}
                        />
                        <SidebarInput
                            value={hexDraft}
                            onChange={(e) => setHexDraft(e.target.value)}
                            onBlur={commitHex}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') commitHex();
                            }}
                            className="h-6 text-xs font-mono uppercase"
                        />
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}

function UniformControlComponent({
    kind,
    value,
    range = EMPTY_RANGE,
    variant,
    onLiveChange,
    onCommit,
    componentIndex,
    className,
}: UniformControlProps) {
    const coerced = coerceUniformValue(kind, value);
    const isNode = variant === 'node';
    const vectorSize = VECTOR_SIZES[kind];

    const makeVectorHandler = useCallback(
        (index: number, emit: (value: TSLValueType) => void) => (next: number) => {
            const current = coerceUniformValue(kind, value);
            const components = Array.isArray(current) ? [...(current as number[])] : [];
            components[index] = next;
            emit(components);
        },
        [kind, value]
    );

    let control: React.ReactNode;

    if (kind === 'bool') {
        control = isNode ? (
            <input
                type="checkbox"
                checked={Boolean(coerced)}
                onChange={(e) => onCommit(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-sidebar-border accent-primary cursor-pointer"
            />
        ) : (
            <BooleanInput value={coerced} onChange={(next) => onCommit(next)} />
        );
    } else if (kind === 'color') {
        control = (
            <ColorControl
                value={typeof coerced === 'string' ? coerced : '#ffffff'}
                variant={variant}
                onLiveChange={onLiveChange}
                onCommit={onCommit}
            />
        );
    } else if (vectorSize !== undefined) {
        const components = Array.isArray(coerced) ? (coerced as number[]) : [];
        if (componentIndex !== undefined) {
            control = (
                <ScalarControl
                    kind={kind}
                    value={components[componentIndex] ?? 0}
                    range={range}
                    variant={variant}
                    onLiveChange={makeVectorHandler(componentIndex, onLiveChange)}
                    onCommit={makeVectorHandler(componentIndex, onCommit)}
                />
            );
        } else {
            control = (
                <div className="flex flex-col gap-1 w-full">
                    {Array.from({ length: vectorSize }, (_, index) => (
                        <div key={index} className="flex items-center gap-1.5">
                            <span className="text-[9px] font-mono uppercase text-muted-foreground w-3 shrink-0">
                                {COMPONENT_LABELS[index]}
                            </span>
                            <div className="flex-1 min-w-0">
                                <ScalarControl
                                    kind={kind}
                                    value={components[index] ?? 0}
                                    range={range}
                                    variant={variant}
                                    onLiveChange={makeVectorHandler(index, onLiveChange)}
                                    onCommit={makeVectorHandler(index, onCommit)}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            );
        }
    } else {
        control = (
            <ScalarControl
                kind={kind}
                value={typeof coerced === 'number' ? coerced : 0}
                range={range}
                variant={variant}
                onLiveChange={(next) => onLiveChange(next)}
                onCommit={(next) => onCommit(next)}
            />
        );
    }

    if (isNode) {
        return (
            <div
                className={cn('nodrag nopan flex items-center w-full min-w-0', className)}
                onPointerDown={(e) => e.stopPropagation()}
            >
                {control}
            </div>
        );
    }

    return <div className={cn('w-full min-w-0', className)}>{control}</div>;
}

export const UniformControl = memo(UniformControlComponent);
