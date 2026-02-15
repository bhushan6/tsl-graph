'use client';

import { useState, useCallback } from 'react';
import { NodePicker } from './NodePicker';
import { Button } from '@/components/ui/button';
import { PanelLeft } from 'lucide-react';

/**
 * Self-contained wrapper for the NodePicker + open/close toggle button.
 * Manages `isNodePickerOpen` locally.
 */
export function NodePickerPanel() {
    const [isOpen, setIsOpen] = useState(true);
    const handleClose = useCallback(() => setIsOpen(false), []);

    if (isOpen) {
        return <NodePicker onClose={handleClose} />;
    }

    return (
        <Button
            variant="outline"
            size="icon"
            onClick={() => setIsOpen(true)}
            className="bg-background/95 backdrop-blur shadow-sm border-sidebar-border h-10 w-10 pointer-events-auto"
            title="Open Node Picker"
        >
            <PanelLeft className="h-4 w-4" />
        </Button>
    );
}
