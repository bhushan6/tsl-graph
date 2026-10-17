'use client';

import { memo, useEffect, useRef } from 'react';
import { createPreviewBridge, registerOverlayPreview } from '@/lib/preview-sandbox/bridge';
import type { PreviewSlot } from '@/lib/preview-sandbox/protocol';
import { useEditorStore } from '@/store/editor';

const DEBUG_PREVIEW_SELECTOR = '[data-debug-preview-node-id]';

/**
 * Node debug previews render in a sandboxed iframe stretched over the canvas.
 * This measures the preview slots in the editor DOM and forwards them.
 */
export const NodeDebugPreviewOverlay = memo(function NodeDebugPreviewOverlay() {
    const container = useRef<HTMLDivElement>(null);
    const hasPreviews = useEditorStore((state) => state.activeDebugPreviewNodeIds.length > 0);
    useEffect(() => {
        if (!container.current || !hasPreviews) return;
        const element = container.current;
        const bridge = createPreviewBridge(element, { mode: 'overlay' });
        const unregister = registerOverlayPreview(bridge);
        let animationFrame = 0;
        let previous = '';
        const update = () => {
            const bounds = element.getBoundingClientRect();
            const slots: PreviewSlot[] = [];
            for (const slot of document.querySelectorAll<HTMLElement>(DEBUG_PREVIEW_SELECTOR)) {
                const id = slot.dataset.debugPreviewNodeId;
                if (!id) continue;
                const rect = slot.getBoundingClientRect();
                slots.push({ id, x: rect.left - bounds.left, y: rect.top - bounds.top, width: rect.width, height: rect.height });
            }
            const serialized = JSON.stringify(slots);
            if (serialized !== previous) { previous = serialized; bridge.setSlots(slots); }
            animationFrame = requestAnimationFrame(update);
        };
        update();
        return () => { cancelAnimationFrame(animationFrame); unregister(); bridge.dispose(); };
    }, [hasPreviews]);
    return <div ref={container} className="absolute inset-0 z-10 pointer-events-none" aria-hidden="true" />;
});
