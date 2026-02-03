'use client';

import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

interface FakeNodeProps {
    title: string;
    category?: 'Math' | 'Constants' | 'Geometry' | 'Material' | 'Subgraph' | 'Texture' | 'Model' | 'Advanced' | 'Noise' | 'Utils' | 'Default';
    inputs: {
        label: string;
        value: number;
        min: number;
        max: number;
        step?: number;
        onChange: (val: number) => void;
    }[];
    className?: string;
    style?: React.CSSProperties;
    children?: React.ReactNode;
}

const categoryColors: Record<string, string> = {
    'Math': 'border-red-200 bg-red-100 dark:bg-red-900/20',
    'Constants': 'border-violet-500 bg-violet-100 dark:bg-violet-900/20',
    'Geometry': 'border-emerald-500 bg-emerald-100 dark:bg-emerald-900/20',
    'Material': 'border-orange-500 bg-orange-100 dark:bg-orange-900/20',
    'Subgraph': 'border-blue-500 bg-blue-100 dark:bg-blue-900/20',
    'Texture': 'border-pink-500 bg-pink-100 dark:bg-pink-900/20',
    'Model': 'border-cyan-500 bg-cyan-100 dark:bg-cyan-900/20',
    'Advanced': 'border-slate-500 bg-slate-100 dark:bg-slate-900/20',
    'Noise': 'border-fuchsia-500 bg-fuchsia-100 dark:bg-fuchsia-900/20',
    'Utils': 'border-yellow-500 bg-yellow-100 dark:bg-yellow-900/20',
    'Default': 'border-gray-500 bg-gray-100 dark:bg-gray-900/20',
};

// Simulated Handle Component
function FakeHandle({ position }: { position: 'left' | 'right' }) {
    return (
        <div
            className={cn(
                "w-2 h-2 rounded-full border bg-background border-muted-foreground/40",
                position === 'left' ? "-ml-1" : "-mr-1"
            )}
        />
    );
}

export function FakeNode({ title, category = 'Default', inputs, className, style, children }: FakeNodeProps) {
    const colorClass = categoryColors[category] || categoryColors['Default'];

    return (
        <div
            className={cn(
                'min-w-[240px] flex flex-col rounded-xl shadow-lg overflow-hidden select-none',
                'bg-white/95 shadow-gray-300/50',
                'dark:bg-card/95 dark:shadow-black/30',
                'backdrop-blur-sm transition-shadow duration-150',
                'border border-transparent', // Placeholder for selection border
                className
            )}
            style={style}
        >
            {/* Header */}
            <div
                className={cn(
                    'flex flex-col gap-0.5 px-3 pt-2 pb-1 rounded-t-xl',
                    'border-b transition-colors duration-150 border-gray-200 dark:border-white/10',
                    colorClass
                )}
            >
                <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-800 dark:text-white/90 truncate">
                    {title}
                </span>
                <span className="text-[9px] text-gray-400 dark:text-white/40 tracking-wider transition-colors truncate block">
                    {category} Node
                </span>
            </div>

            {/* Content Body */}
            <div className="flex flex-col gap-3 py-3 px-3 rounded-b-xl">
                {inputs.map((input, idx) => (
                    <div key={idx} className="flex flex-col gap-1.5 min-h-[22px]">

                        {/* Label Row with Simulated Input Handle */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                {/* <FakeHandle position="left" /> */}
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">
                                    {input.label}
                                </span>
                            </div>
                            <span className="text-[10px] font-mono tabular-nums text-foreground/70">
                                {input.value.toFixed(2)}
                            </span>
                        </div>

                        {/* Interactive Slider */}
                        <div className="px-1 nodrag">
                            <Slider
                                value={[input.value]}
                                min={input.min}
                                max={input.max}
                                step={input.step || 0.01}
                                onValueChange={(vals) => input.onChange(vals[0])}
                                className="[&>.bg-primary]:bg-primary/80"
                            />
                        </div>

                        {/* Simulated Output Handle (placed logicially if needed, but for inputs we show left, maybe outputs on right if we had them) */}
                    </div>
                ))}

                {children}
            </div>
        </div>
    );
}

