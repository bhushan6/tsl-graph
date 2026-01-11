'use client';

import { ThemeToggle } from '@/components/ThemeToggle';
import { Sparkles } from 'lucide-react';

export function Navbar() {
    return (
        <div className="w-full flex items-center justify-between px-3 h-10 bg-card border-b border-border pointer-events-auto rounded-md">
            <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 font-medium text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors cursor-default select-none">
                    <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center text-primary">
                        <Sparkles className="w-3 h-3" />
                    </div>
                    <span>TSL Editor</span>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <ThemeToggle />
            </div>
        </div>
    );
}
