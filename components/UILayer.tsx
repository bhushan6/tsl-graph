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
            className="fixed inset-0 z-40 pointer-events-none"
            style={{
                display: 'grid',
                gridTemplateColumns: 'auto minmax(0, 1fr) auto',
                gridTemplateRows: 'auto 1fr',
                gridTemplateAreas: `
                    "left topbar right"
                    "left center right"
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
        className={`pointer-events-none flex min-w-0 items-center justify-between min-h-[40px] ${className}`}
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
        className={`pointer-events-none flex flex-col items-end justify-start gap-2 h-full min-h-0 ${className}`}
    >
        {children}
    </div>
));
RightPanel.displayName = 'RightPanel';

const BottomBar = memo(({ children, className = '' }: SlotProps) => (
    <div
        style={{
            position: 'absolute',
            bottom: '1.5rem',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 50
        }}
        className={`pointer-events-none flex items-center justify-center ${className}`}
    >
        {children}
    </div>
));
BottomBar.displayName = 'BottomBar';

const CenterPanel = memo(({ children, className = '' }: SlotProps) => (
    <div
        style={{ gridArea: 'center' }}
        className={`pointer-events-none flex flex-col items-start justify-start h-full min-h-0 relative ${className}`}
    >
        {children}
    </div>
));
CenterPanel.displayName = 'CenterPanel';

// Compound component pattern
export const UILayer = Object.assign(UILayerRoot, {
    TopBar,
    LeftPanel,
    RightPanel,
    BottomBar,
    CenterPanel,
});
