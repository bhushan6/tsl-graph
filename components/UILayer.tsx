'use client';

import { ReactNode, memo } from 'react';

type UILayerProps = {
    children: ReactNode;
};

type SlotProps = {
    children: ReactNode;
    className?: string;
};

/**
 * Fixed full-screen container with CSS Grid for 4-region layout.
 * Container has pointer-events: none, content regions have pointer-events: auto.
 * 
 * Layout:
 * ┌─────────────────────────────────────┐
 * │            TopBar (navbar)          │
 * ├──────────┬───────────────┬──────────┤
 * │          │               │          │
 * │  Left    │    (canvas)   │  Right   │
 * │  Panel   │               │  Panel   │
 * │          │               │          │
 * ├──────────┴───────────────┴──────────┤
 * │           BottomBar (footer)        │
 * └─────────────────────────────────────┘
 */
const UILayerRoot = memo(({ children }: UILayerProps) => {
    return (
        <div
            className="fixed inset-0 z-[10000] pointer-events-none"
            style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto',
                gridTemplateRows: 'auto 1fr auto',
                gridTemplateAreas: `
                    "topbar topbar topbar"
                    "left center right"
                    "bottombar bottombar bottombar"
                `,
                padding: '1rem',
                gap: '0.5rem',
            }}
        >
            {children}
        </div>
    );
});
UILayerRoot.displayName = 'UILayerRoot';

const TopBar = memo(({ children, className = '' }: SlotProps) => (
    <div
        style={{ gridArea: 'topbar' }}
        className={`pointer-events-none flex items-center justify-between ${className}`}
    >
        {children}
    </div>
));
TopBar.displayName = 'TopBar';

const LeftPanel = memo(({ children, className = '' }: SlotProps) => (
    <div
        style={{ gridArea: 'left' }}
        className={`pointer-events-none flex flex-col items-start justify-start ${className}`}
    >
        {children}
    </div>
));
LeftPanel.displayName = 'LeftPanel';

const RightPanel = memo(({ children, className = '' }: SlotProps) => (
    <div
        style={{ gridArea: 'right' }}
        className={`pointer-events-none flex flex-col items-end justify-start gap-2 ${className}`}
    >
        {children}
    </div>
));
RightPanel.displayName = 'RightPanel';

const BottomBar = memo(({ children, className = '' }: SlotProps) => (
    <div
        style={{ gridArea: 'bottombar' }}
        className={`pointer-events-none flex items-center justify-center ${className}`}
    >
        {children}
    </div>
));
BottomBar.displayName = 'BottomBar';

// Compound component pattern
export const UILayer = Object.assign(UILayerRoot, {
    TopBar,
    LeftPanel,
    RightPanel,
    BottomBar,
});
