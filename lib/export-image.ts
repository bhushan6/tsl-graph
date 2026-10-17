import type { Rect } from '@xyflow/react';
import { toCanvas } from 'html-to-image';
import { getCanvasRelativeDebugPreviewRect } from '@/lib/debug-preview';
import { captureIsolatedNodePreview, captureIsolatedPreview } from '@/lib/preview-sandbox/bridge';
import { useEditorStore } from '@/store/editor';

const MAX_EXPORT_SCALE = 2;
// Browsers cap canvas dimensions (and huge exports OOM); clamp the zoom instead of failing.
const MAX_IMAGE_DIMENSION = 4096;
const CAPTURE_CLASS = 'tsl-export-capture';

// Must match the <Background variant="dots" gap size> props in Editor.tsx.
const BACKGROUND_GAP = 16;
const BACKGROUND_DOT_SIZE = 1;
// React Flow's default dot pattern color (--xy-background-pattern-dots-color-default).
const FALLBACK_DOT_COLOR = '#91919a';
// Don't bother drawing dots on absurdly large exports; they'd be sub-pixel noise.
const MAX_DOT_COUNT = 500_000;

const PREVIEW_SNAPSHOT_PIXEL_RATIO = 2;

// Layout for the stitched-in shader preview, in px at scale 1.
const SHADER_PREVIEW_GAP = 24;
const SHADER_PREVIEW_MARGIN = 32;
const SHADER_PREVIEW_MIN_HEIGHT = 256;
const SHADER_PREVIEW_MAX_HEIGHT = 512;
const SHADER_PREVIEW_CORNER_RADIUS = 12;

// backdrop-filter cannot be reproduced inside html-to-image's SVG clone and
// renders as opaque gray boxes around nodes, so it is suppressed during
// capture. Node/group backgrounds are ~95% opaque, so the difference is
// imperceptible.
const CAPTURE_STYLE = `
.${CAPTURE_CLASS}, .${CAPTURE_CLASS} * {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
}
`;

export interface ExportGraphImageOptions {
    /** Flow-space rect to capture (already padded by the caller). */
    bounds: Rect;
    /** Stitch the main 3D shader preview render next to the graph. */
    includeShaderPreview: boolean;
}

interface PixelArea {
    width: number;
    height: number;
    /** Pixel position of the graph capture's top-left corner. */
    offsetX: number;
    offsetY: number;
}

/**
 * Render the React Flow viewport to a PNG blob framed to `bounds`.
 *
 * The dotted canvas background lives outside `.react-flow__viewport`, so the
 * DOM capture is rendered transparent and composited over a manually drawn
 * background + dot grid that matches the editor's.
 *
 * Node debug previews are drawn by a separate sandboxed overlay frame
 * (NodeDebugPreviewOverlay), not by the node DOM, so a plain DOM capture shows
 * them as empty slots. Each active preview is re-rendered offscreen inside that
 * frame and temporarily injected into its slot element as an <img> so the DOM
 * capture picks it up.
 *
 * With `includeShaderPreview`, a capture of the main 3D preview is stitched to
 * the right of the graph, vertically centered on the same dotted background.
 */
export async function exportGraphImage({ bounds, includeShaderPreview }: ExportGraphImageOptions): Promise<Blob> {
    const viewportEl = document.querySelector<HTMLElement>('.react-flow__viewport');
    const flowEl = document.querySelector<HTMLElement>('.react-flow');
    if (!viewportEl || !flowEl || bounds.width <= 0 || bounds.height <= 0) {
        throw new Error('Canvas is not ready to export.');
    }

    const scale = Math.min(
        MAX_EXPORT_SCALE,
        MAX_IMAGE_DIMENSION / bounds.width,
        MAX_IMAGE_DIMENSION / bounds.height
    );
    const width = Math.max(1, Math.round(bounds.width * scale));
    const height = Math.max(1, Math.round(bounds.height * scale));

    const removeSnapshots = await injectPreviewSnapshots(viewportEl);
    const captureStyleEl = document.createElement('style');
    captureStyleEl.textContent = CAPTURE_STYLE;
    document.head.appendChild(captureStyleEl);
    viewportEl.classList.add(CAPTURE_CLASS);
    let rendered: HTMLCanvasElement;
    try {
        rendered = await toCanvas(viewportEl, {
            width,
            height,
            pixelRatio: 1,
            style: {
                width: `${width}px`,
                height: `${height}px`,
                transform: `translate(${-bounds.x * scale}px, ${-bounds.y * scale}px) scale(${scale})`,
            },
        });
    } finally {
        viewportEl.classList.remove(CAPTURE_CLASS);
        captureStyleEl.remove();
        removeSnapshots();
    }

    // The shader preview only exists in main editor mode; silently fall back
    // to a graph-only image when it isn't available.
    const stitchPreview = includeShaderPreview ? await captureShaderPreview() : null;

    let area: PixelArea = { width, height, offsetX: 0, offsetY: 0 };
    let previewRect: { x: number; y: number; width: number; height: number } | null = null;
    if (stitchPreview) {
        const gap = SHADER_PREVIEW_GAP * scale;
        const margin = SHADER_PREVIEW_MARGIN * scale;
        const previewHeight = Math.min(
            Math.max(height, SHADER_PREVIEW_MIN_HEIGHT * scale),
            SHADER_PREVIEW_MAX_HEIGHT * scale
        );
        const previewWidth = previewHeight * (stitchPreview.width / stitchPreview.height);
        const totalWidth = Math.round(width + gap + previewWidth + margin);
        const totalHeight = Math.round(Math.max(height, previewHeight + margin * 2));
        area = {
            width: totalWidth,
            height: totalHeight,
            offsetX: 0,
            offsetY: Math.round((totalHeight - height) / 2),
        };
        previewRect = {
            x: width + gap,
            y: Math.round((totalHeight - previewHeight) / 2),
            width: previewWidth,
            height: previewHeight,
        };
    }

    const output = document.createElement('canvas');
    output.width = area.width;
    output.height = area.height;
    const ctx = output.getContext('2d');
    if (!ctx) throw new Error('Failed to render image.');

    ctx.fillStyle = getComputedStyle(flowEl).backgroundColor;
    ctx.fillRect(0, 0, area.width, area.height);
    drawBackgroundDots(ctx, bounds, scale, area);
    ctx.drawImage(rendered, area.offsetX, area.offsetY);

    if (stitchPreview && previewRect) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(
            previewRect.x,
            previewRect.y,
            previewRect.width,
            previewRect.height,
            SHADER_PREVIEW_CORNER_RADIUS * scale
        );
        ctx.clip();
        ctx.drawImage(stitchPreview, previewRect.x, previewRect.y, previewRect.width, previewRect.height);
        ctx.restore();
    }
    stitchPreview?.close();

    const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Failed to render image.');
    return blob;
}

/**
 * Draw the editor's dot grid across the whole output. Dots sit at flow-space
 * multiples of BACKGROUND_GAP, mirroring React Flow's dot pattern, with the
 * grid anchored so it lines up under the graph capture.
 */
function drawBackgroundDots(
    ctx: CanvasRenderingContext2D,
    bounds: Rect,
    scale: number,
    area: PixelArea
) {
    // Flow-space range covering the full output canvas.
    const flowLeft = bounds.x - area.offsetX / scale;
    const flowTop = bounds.y - area.offsetY / scale;
    const flowRight = flowLeft + area.width / scale;
    const flowBottom = flowTop + area.height / scale;

    const startX = Math.floor(flowLeft / BACKGROUND_GAP) * BACKGROUND_GAP;
    const startY = Math.floor(flowTop / BACKGROUND_GAP) * BACKGROUND_GAP;

    const cols = Math.ceil((flowRight - startX) / BACKGROUND_GAP) + 1;
    const rows = Math.ceil((flowBottom - startY) / BACKGROUND_GAP) + 1;
    if (cols * rows > MAX_DOT_COUNT) return;

    const patternCircle = document.querySelector('.react-flow__background circle');
    ctx.fillStyle = patternCircle
        ? getComputedStyle(patternCircle).fill
        : FALLBACK_DOT_COLOR;

    const radius = (BACKGROUND_DOT_SIZE * scale) / 2;
    const path = new Path2D();
    for (let fx = startX; fx <= flowRight; fx += BACKGROUND_GAP) {
        for (let fy = startY; fy <= flowBottom; fy += BACKGROUND_GAP) {
            const px = (fx - bounds.x) * scale + area.offsetX;
            const py = (fy - bounds.y) * scale + area.offsetY;
            path.moveTo(px + radius, py);
            path.arc(px, py, radius, 0, Math.PI * 2);
        }
    }
    ctx.fill(path);
}

async function captureShaderPreview(): Promise<ImageBitmap | null> {
    try {
        const image = await captureIsolatedPreview({ format: 'png' });
        return image ? await createImageBitmap(image.blob) : null;
    } catch (error) {
        console.error('Failed to capture shader preview for export:', error);
        return null;
    }
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error ?? new Error('Failed to read preview image.'));
        reader.readAsDataURL(blob);
    });
}

/**
 * Snapshot every visible debug preview slot inside the sandboxed overlay frame
 * and overlay the result as an <img> inside the slot. Returns a cleanup
 * function that removes the injected images. Failures degrade to the empty
 * slot rather than aborting the export.
 */
async function injectPreviewSnapshots(viewportEl: HTMLElement): Promise<() => void> {
    const injected: HTMLImageElement[] = [];
    const removeInjected = () => {
        for (const img of injected) img.remove();
    };

    const slots = Array.from(
        viewportEl.querySelectorAll<HTMLElement>('[data-debug-preview-node-id]')
    );
    if (slots.length === 0) return removeInjected;

    const state = useEditorStore.getState();
    const isPostMode = state.editorMode === 'main' && state.activeRootGraph === 'post';
    const canvasRect = document.querySelector('.react-flow')?.getBoundingClientRect() ?? null;

    for (const slot of slots) {
        const nodeId = slot.dataset.debugPreviewNodeId;
        if (!nodeId) continue;

        // offsetWidth/Height are layout px, unaffected by the canvas zoom transform.
        const slotWidth = slot.offsetWidth;
        const slotHeight = slot.offsetHeight;
        if (slotWidth <= 0 || slotHeight <= 0) continue;

        // Screen-space nodes (screenUV etc.) look different depending on
        // where the pixels land on the render target. The overlay draws
        // previews into a canvas-sized target with the slot as viewport,
        // so replicate that exactly for slots fully on screen; slots
        // scrolled out of view (which the overlay never draws) fall back
        // to a self-contained slot-sized render.
        let overlayRect: ReturnType<typeof getCanvasRelativeDebugPreviewRect> = null;
        if (!isPostMode && canvasRect) {
            const slotScreenRect = slot.getBoundingClientRect();
            const fullyVisible =
                slotScreenRect.left >= canvasRect.left &&
                slotScreenRect.top >= canvasRect.top &&
                slotScreenRect.right <= canvasRect.right &&
                slotScreenRect.bottom <= canvasRect.bottom;
            overlayRect = fullyVisible
                ? getCanvasRelativeDebugPreviewRect(slotScreenRect, canvasRect)
                : null;
        }

        let snapshotUrl: string;
        try {
            const image = await captureIsolatedNodePreview(nodeId, overlayRect && canvasRect
                ? {
                    pixelRatio: window.devicePixelRatio || 1,
                    viewport: { canvasWidth: canvasRect.width, canvasHeight: canvasRect.height, ...overlayRect },
                    format: 'png',
                }
                : { width: slotWidth, height: slotHeight, pixelRatio: PREVIEW_SNAPSHOT_PIXEL_RATIO, format: 'png' });
            snapshotUrl = await blobToDataUrl(image.blob);
        } catch (error) {
            console.error(`Failed to snapshot preview for node "${nodeId}":`, error);
            continue;
        }

        const img = document.createElement('img');
        img.src = snapshotUrl;
        img.style.position = 'absolute';
        img.style.inset = '0';
        img.style.width = '100%';
        img.style.height = '100%';
        try {
            await img.decode();
        } catch {
            // decode() failing doesn't prevent the capture from embedding the data URL.
        }
        slot.appendChild(img);
        injected.push(img);
    }

    return removeInjected;
}
