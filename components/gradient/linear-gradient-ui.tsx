'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { HexColorPicker } from 'react-colorful';
import { SidebarInput } from '@/components/ui/sidebar';
import { useDebouncedCallback } from '@/utils/useDebouncedCallback';
import type { GradientStopValue } from '@/lib/nodes/definitions';
import {
    ensureGradientStopIds,
    normalizeGradientStops,
    normalizeHexColor,
    type GradientStopWithId,
} from '@/lib/gradient-utils';
import { GradientSlider } from './gradient-slider';
import { StopList } from './stop-list';

export interface LinearGradientUIChange {
    mode: number;
    stops: GradientStopWithId[];
}

export interface LinearGradientUIProps {
    initialMode?: number;
    initialStops?: GradientStopValue[];
    onChange?: (value: LinearGradientUIChange) => void;
    debounceMs?: number;
}

export function LinearGradientUI({
    initialMode = 0.0,
    initialStops = [],
    onChange,
    debounceMs = 100,
}: LinearGradientUIProps) {
    const [mode, setMode] = useState<number>(() => (Number(initialMode ?? 0) === 1 ? 1.0 : 0.0));
    const [stops, setStops] = useState<GradientStopWithId[]>(() => (
        ensureGradientStopIds(normalizeGradientStops(initialStops))
    ));
    const [selectedId, setSelectedId] = useState<string>('');

    const modeRef = useRef(mode);
    const stopsRef = useRef(stops);

    useEffect(() => {
        modeRef.current = mode;
    }, [mode]);

    useEffect(() => {
        stopsRef.current = stops;
    }, [stops]);

    const debouncedEmitChange = useDebouncedCallback(
        useCallback((nextMode: number, nextStops: GradientStopWithId[]) => {
            if (!onChange) return;
            onChange({ mode: nextMode, stops: nextStops });
        }, [onChange]),
        debounceMs
    );

    const emitDebouncedChange = useCallback((nextMode: number, nextStops: GradientStopWithId[]) => {
        modeRef.current = nextMode;
        stopsRef.current = nextStops;
        debouncedEmitChange(nextMode, nextStops);
    }, [debouncedEmitChange]);

    const updateStops = useCallback((nextStops: GradientStopWithId[]) => {
        const normalized = ensureGradientStopIds(normalizeGradientStops(nextStops));
        setStops(normalized);
        emitDebouncedChange(modeRef.current, normalized);
    }, [emitDebouncedChange]);

    const handleModeChange = useCallback((nextMode: number) => {
        const normalized = nextMode === 1 ? 1.0 : 0.0;
        setMode(normalized);
        emitDebouncedChange(normalized, stopsRef.current);
    }, [emitDebouncedChange]);

    const activeSelectedId = stops.some((stop) => stop.id === selectedId)
        ? selectedId
        : (stops[0]?.id ?? '');
    const selectedStop = stops.find((stop) => stop.id === activeSelectedId) ?? stops[0];

    const handleSelectedColor = useCallback((nextColor: string) => {
        if (!selectedStop) return;
        const normalized = normalizeHexColor(nextColor, selectedStop.color);
        updateStops(
            stops.map((stop) => (stop.id === activeSelectedId ? { ...stop, color: normalized } : stop))
        );
    }, [selectedStop, stops, activeSelectedId, updateStops]);

    return (
        <div className="space-y-3">
            <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium text-sidebar-foreground/70 uppercase tracking-wider">
                    Mode
                </label>
                <select
                    value={String(mode)}
                    onChange={(event) => handleModeChange(Number(event.target.value))}
                    className="h-7 px-2 text-[11px] bg-sidebar-accent border border-sidebar-border rounded-md text-sidebar-foreground w-full outline-none focus:ring-2 focus:ring-sidebar-ring"
                >
                    <option value="0">Blend</option>
                    <option value="1">Flat</option>
                </select>
            </div>

            <GradientSlider
                stops={stops}
                mode={mode}
                selectedId={activeSelectedId}
                onChange={updateStops}
                onSelect={setSelectedId}
            />

            {selectedStop && (
                <div className="border-t border-sidebar-border pt-3">
                    <div className="flex flex-col items-center gap-2">
                        <HexColorPicker
                            color={selectedStop.color}
                            onChange={handleSelectedColor}
                            style={{ width: '100%', height: '116px' }}
                        />
                        <SidebarInput
                            key={`${selectedStop.id}-${selectedStop.color}`}
                            type="text"
                            defaultValue={selectedStop.color}
                            onBlur={(event) => handleSelectedColor(event.target.value)}
                            className="h-7 font-mono uppercase text-xs text-center"
                        />
                    </div>
                </div>
            )}

            <div className="border-t border-sidebar-border pt-2">
                <StopList
                    stops={stops}
                    selectedId={activeSelectedId}
                    onSelect={setSelectedId}
                    onChange={updateStops}
                />
            </div>
        </div>
    );
}

export const LinerGradientUI = LinearGradientUI;
