import React from 'react';
import { X } from 'lucide-react';
import {
    MIN_GRADIENT_STOPS,
    type GradientStopWithId,
    normalizeHexColor,
} from '@/lib/gradient-utils';

interface StopListProps {
    stops: GradientStopWithId[];
    selectedId: string;
    onSelect: (id: string) => void;
    onChange: (stops: GradientStopWithId[]) => void;
}

export function StopList({ stops, selectedId, onSelect, onChange }: StopListProps) {
    const updateStop = (id: string, updates: Partial<GradientStopWithId>) => {
        onChange(stops.map((stop) => (stop.id === id ? { ...stop, ...updates } : stop)));
    };

    const removeStop = (event: React.MouseEvent, id: string) => {
        event.stopPropagation();
        if (stops.length <= MIN_GRADIENT_STOPS) return;

        const nextStops = stops.filter((stop) => stop.id !== id);
        onChange(nextStops);

        if (selectedId === id && nextStops.length > 0) {
            onSelect(nextStops[0].id);
        }
    };

    return (
        <div className="space-y-2 mt-3">
            <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Stop Details
            </h3>
            <div className="grid gap-1.5">
                {stops.map((stop) => {
                    const isSelected = stop.id === selectedId;
                    return (
                        <div
                            key={stop.id}
                            onClick={() => onSelect(stop.id)}
                            className={`
                                flex items-center gap-2 p-1.5 rounded-lg transition-all duration-200 cursor-pointer
                                border ${isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'border-transparent hover:bg-secondary'}
                            `}
                        >
                            <div className="bg-checkered rounded-md overflow-hidden shrink-0 border border-sidebar-border shadow-sm">
                                <div
                                    className="w-8 h-8"
                                    style={{ backgroundColor: stop.color }}
                                />
                            </div>

                            <div className="flex-1">
                                <input
                                    key={`${stop.id}-${stop.color}`}
                                    type="text"
                                    defaultValue={stop.color}
                                    onBlur={(event) => updateStop(stop.id, { color: normalizeHexColor(event.target.value, stop.color) })}
                                    className="w-full min-w-[92px] bg-transparent border-none text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary rounded-md px-1.5 py-1"
                                    placeholder="#000000"
                                />
                            </div>

                            <div className="w-16 shrink-0 relative">
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={Math.round(stop.pos * 100)}
                                    onChange={(event) => {
                                        const next = Number(event.target.value);
                                        const clamped = Number.isFinite(next) ? Math.max(0, Math.min(100, next)) : 0;
                                        updateStop(stop.id, { pos: clamped / 100 });
                                    }}
                                    className="w-full bg-background border border-sidebar-border text-xs font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary rounded-md pl-1.5 pr-5 py-1"
                                />
                                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">
                                    %
                                </span>
                            </div>

                            <button
                                onClick={(event) => removeStop(event, stop.id)}
                                disabled={stops.length <= MIN_GRADIENT_STOPS}
                                className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                                title={stops.length <= MIN_GRADIENT_STOPS ? 'Minimum 2 stops required' : 'Remove stop'}
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
