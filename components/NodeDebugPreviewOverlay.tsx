'use client';

import { memo, useEffect, useRef } from 'react';
import { createPreviewBridge, placePreviewFrame, registerOverlayPreview } from '@/lib/preview-sandbox/bridge';
import type { PreviewFrame, PreviewSlot } from '@/lib/preview-sandbox/protocol';
import { useEditorStore } from '@/store/editor';

const PREVIEW_CANVAS_SELECTOR = 'canvas[data-debug-preview-canvas]';

function paintPreview(canvas: HTMLCanvasElement, preview: PreviewFrame) {
    const place = placePreviewFrame(preview, window.devicePixelRatio || 1);
    if (canvas.width !== place.canvasWidth) canvas.width = place.canvasWidth;
    if (canvas.height !== place.canvasHeight) canvas.height = place.canvasHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(preview.bitmap, place.x, place.y, place.width, place.height);
}

/**
 * Node debug previews render in a sandboxed iframe stretched (invisibly) over the
 * canvas. Every frame this measures each node's preview canvas, has the iframe
 * render them, and paints the returned images into the nodes, so previews move
 * with their nodes while panning, zooming and dragging.
 */
export const NodeDebugPreviewOverlay = memo(function NodeDebugPreviewOverlay() {
    const container = useRef<HTMLDivElement>(null);
    const hasPreviews = useEditorStore((state) => state.activeDebugPreviewNodeIds.length > 0);
    useEffect(() => {
        if (!container.current || !hasPreviews) return;
        const element = container.current;
        let canvases = new Map<string, HTMLCanvasElement>();
        const bridge = createPreviewBridge(element, {
            mode: 'overlay',
            onPreviews: (previews) => {
                for (const preview of previews) {
                    const canvas = canvases.get(preview.id);
                    if (canvas?.isConnected) paintPreview(canvas, preview);
                    preview.bitmap.close();
                }
            },
        });
        const unregister = registerOverlayPreview(bridge);
        let animationFrame = 0;
        const update = () => {
            const bounds = element.getBoundingClientRect();
            const slots: PreviewSlot[] = [];
            const found = new Map<string, HTMLCanvasElement>();
            for (const canvas of document.querySelectorAll<HTMLCanvasElement>(PREVIEW_CANVAS_SELECTOR)) {
                const id = canvas.dataset.debugPreviewCanvas;
                if (!id) continue;
                const rect = canvas.getBoundingClientRect();
                found.set(id, canvas);
                slots.push({ id, x: rect.left - bounds.left, y: rect.top - bounds.top, width: rect.width, height: rect.height });
            }
            canvases = found;
            // Every frame, so animated shaders keep moving.
            bridge.renderSlots(slots);
            animationFrame = requestAnimationFrame(update);
        };
        update();
        return () => { cancelAnimationFrame(animationFrame); unregister(); bridge.dispose(); };
    }, [hasPreviews]);
    return <div ref={container} className="absolute inset-0 z-10 pointer-events-none" aria-hidden="true" />;
});
