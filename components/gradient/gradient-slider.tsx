import React, { useEffect, useRef } from 'react';
import { Plus } from 'lucide-react';
import {
    MAX_GRADIENT_STOPS,
    type GradientStopWithId,
    generateGradientStopId,
    generateGradientString,
} from '@/lib/gradient-utils';

interface GradientSliderProps {
    stops: GradientStopWithId[];
    mode?: number;
    selectedId: string;
    onChange: (stops: GradientStopWithId[]) => void;
    onSelect: (id: string) => void;
}

export function GradientSlider({ stops, mode = 0, selectedId, onChange, onSelect }: GradientSliderProps) {
    const trackRef = useRef<HTMLDivElement>(null);
    const latestStopsRef = useRef<GradientStopWithId[]>(stops);

    useEffect(() => {
        latestStopsRef.current = stops;
    }, [stops]);

    const handleTrackClick = (event: React.MouseEvent<HTMLDivElement>) => {
        if (stops.length >= MAX_GRADIENT_STOPS) return;
        if (!trackRef.current) return;

        const rect = trackRef.current.getBoundingClientRect();
        const rawPercent = ((event.clientX - rect.left) / rect.width) * 100;
        const clampedPercent = Math.max(0, Math.min(100, Math.round(rawPercent)));
        const newStop: GradientStopWithId = {
            id: generateGradientStopId(),
            color: '#ffffff',
            pos: clampedPercent / 100,
        };

        const nextStops = [...stops, newStop].sort((a, b) => a.pos - b.pos);
        onChange(nextStops);
        onSelect(newStop.id);
    };

    const handleThumbPointerDown = (event: React.PointerEvent<HTMLDivElement>, id: string) => {
        event.stopPropagation();
        onSelect(id);

        const handlePointerMove = (moveEvent: PointerEvent) => {
            if (!trackRef.current) return;
            const rect = trackRef.current.getBoundingClientRect();
            const rawPercent = ((moveEvent.clientX - rect.left) / rect.width) * 100;
            const clampedPercent = Math.max(0, Math.min(100, Math.round(rawPercent)));
            const position = clampedPercent / 100;

            const nextStops = latestStopsRef.current
                .map((stop) => (stop.id === id ? { ...stop, pos: position } : stop))
                .sort((a, b) => a.pos - b.pos);
            onChange(nextStops);
        };

        const handlePointerUp = () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
    };

    const trackBackground = generateGradientString('linear', 90, stops, mode);

    return (
        <div className="relative pt-2 pb-6 select-none">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    Color Stops
                </h3>
                <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-md font-medium">
                    {stops.length} / {MAX_GRADIENT_STOPS}
                </span>
            </div>

            <div className="relative group">
                <div
                    ref={trackRef}
                    className="h-8 w-full rounded-md border border-sidebar-border shadow-inner cursor-crosshair relative bg-checkered overflow-hidden"
                    onClick={handleTrackClick}
                >
                    <div
                        className="absolute inset-0 w-full h-full pointer-events-none"
                        style={{ background: trackBackground }}
                    />
                    {stops.length < MAX_GRADIENT_STOPS && (
                        <div className="absolute inset-0 w-full h-full opacity-0 group-hover:opacity-100 pointer-events-none flex items-center justify-center bg-black/5 transition-opacity">
                            <span className="bg-background/80 backdrop-blur-sm text-[10px] font-medium px-2 py-0.5 rounded-full text-foreground shadow-sm flex items-center gap-1">
                                <Plus className="w-2.5 h-2.5" />
                                Click to add
                            </span>
                        </div>
                    )}
                </div>

                {stops.map((stop) => {
                    const isSelected = stop.id === selectedId;
                    return (
                        <div
                            key={stop.id}
                            onPointerDown={(event) => handleThumbPointerDown(event, stop.id)}
                            className={`
                                absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-9 rounded-[6px] cursor-grab active:cursor-grabbing touch-none
                                border-2 outline outline-2 z-10
                                hover:scale-105
                                ${isSelected
                                    ? 'border-white outline-primary shadow-lg scale-105 z-20'
                                    : 'border-white outline-sidebar-border shadow-md'}
                            `}
                            style={{
                                left: `${Math.round(stop.pos * 100)}%`,
                                backgroundColor: stop.color,
                            }}
                        >
                            <div className={`
                                absolute -bottom-6 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground
                                text-[9px] font-mono px-1.5 py-0.5 rounded shadow-sm border border-sidebar-border
                                opacity-0 transition-opacity duration-200 pointer-events-none
                                ${isSelected ? 'opacity-100' : 'group-hover:opacity-100'}
                            `}>
                                {Math.round(stop.pos * 100)}%
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
