'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Repeat2, Trash2 } from 'lucide-react';
import { useEdgeContextMenuStore } from '@/store/edge-context-menu';
import { useEditorStore } from '@/store/editor';
import {
    isEdgePortalBlocked,
    planEdgeToLocalPortal,
    type EdgePortalBlockReason,
} from '@/lib/edge-portal';

const BLOCK_REASON_LABELS: Record<EdgePortalBlockReason, string> = {
    'edge-not-found': 'Edge missing',
    'synthetic-edge': 'Not convertible',
    'already-portal': 'Already a portal',
    'missing-endpoint': 'Endpoint missing',
    'cross-loop': 'Crosses loops',
};

export function EdgeContextMenu() {
    const isOpen = useEdgeContextMenuStore((s) => s.isOpen);
    const edgeId = useEdgeContextMenuStore((s) => s.edgeId);
    const screenPosition = useEdgeContextMenuStore((s) => s.screenPosition);
    const close = useEdgeContextMenuStore((s) => s.close);

    const containerRef = useRef<HTMLDivElement>(null);
    const [adjustedPosition, setAdjustedPosition] = useState(screenPosition);

    // Same dismissal pattern as EdgeDropNodePicker: delayed capture-phase
    // outside pointerdown, plus Escape.
    useEffect(() => {
        if (!isOpen) return;

        const handlePointerDown = (event: PointerEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                close();
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') close();
        };

        const timeout = setTimeout(() => {
            document.addEventListener('pointerdown', handlePointerDown, true);
        }, 100);
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            clearTimeout(timeout);
            document.removeEventListener('pointerdown', handlePointerDown, true);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, close]);

    // Clamp to the viewport
    useEffect(() => {
        if (!isOpen) return;
        const adjustPosition = () => {
            if (!containerRef.current) return;
            const { innerWidth, innerHeight } = window;
            const { offsetWidth, offsetHeight } = containerRef.current;
            let x = screenPosition.x;
            let y = screenPosition.y;
            if (x + offsetWidth > innerWidth) x = innerWidth - offsetWidth - 10;
            if (x < 10) x = 10;
            if (y + offsetHeight > innerHeight) y = innerHeight - offsetHeight - 10;
            if (y < 10) y = 10;
            setAdjustedPosition({ x, y });
        };
        adjustPosition();
        window.addEventListener('resize', adjustPosition);
        return () => window.removeEventListener('resize', adjustPosition);
    }, [isOpen, screenPosition]);

    const blockReason = useMemo((): EdgePortalBlockReason | null => {
        if (!isOpen || !edgeId) return null;
        const { nodes, edges, subgraphs, codeNodes } = useEditorStore.getState();
        const plan = planEdgeToLocalPortal({ edgeId, nodes, edges, subgraphs, codeNodes });
        return isEdgePortalBlocked(plan) ? plan.blocked : null;
    }, [isOpen, edgeId]);

    if (!isOpen || !edgeId) return null;

    const handleConvert = () => {
        useEditorStore.getState().convertEdgeToLocalPortal(edgeId);
        close();
    };

    const handleDelete = () => {
        useEditorStore.getState().deleteEdge(edgeId);
        close();
    };

    return (
        <div
            ref={containerRef}
            className="fixed z-50 w-52 overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-2xl"
            style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
        >
            <button
                type="button"
                disabled={blockReason !== null}
                onClick={handleConvert}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
            >
                <Repeat2 className="h-3.5 w-3.5 text-primary" />
                <span className="min-w-0 flex-1">Convert to portal</span>
                {blockReason !== null && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                        {BLOCK_REASON_LABELS[blockReason]}
                    </span>
                )}
            </button>
            <button
                type="button"
                onClick={handleDelete}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                <span>Delete edge</span>
            </button>
        </div>
    );
}
