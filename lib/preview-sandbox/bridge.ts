import { useEditorStore } from '@/store/editor';
import { subscribeUniformEvents } from '@/lib/uniform-store';
import { PREVIEW_SANDBOX, previewDocument } from './security';
import { collectLocalBlobUrls } from './assets';
import {
    PREVIEW_CHANNEL,
    type CaptureRequest,
    type PreviewAsset,
    type PreviewCameraState,
    type PreviewCommand,
    type PreviewFrame,
    type PreviewImage,
    type PreviewMode,
    type PreviewSlot,
    type PreviewSnapshot,
} from './protocol';

const BOOT_TIMEOUT_MS = 20_000;
const CAPTURE_TIMEOUT_MS = 15_000;
const MAX_CAPTURE_BYTES = 32 * 1024 * 1024;
const MAX_CAPTURE_DIMENSION = 8192;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_PREVIEW_FRAMES = 64;

let bundlePromise: Promise<string> | undefined;
function loadBundle() {
    if (!bundlePromise) {
        bundlePromise = fetch('/preview-sandbox.js').then(async (response) => {
            if (!response.ok) throw new Error('Preview runtime could not be loaded.');
            return response.text();
        }).catch((error) => { bundlePromise = undefined; throw error; });
    }
    return bundlePromise;
}

// Main and overlay frames share one serialized copy of the same editor state.
let snapshotCache: { key: unknown[]; snapshot: PreviewSnapshot } | null = null;
export function createSnapshot(): PreviewSnapshot {
    const state = useEditorStore.getState();
    const key = [
        state.nodes, state.edges, state.materialRootGraph, state.postRootGraph, state.subgraphs, state.codeNodes,
        state.globals, state.previewSettings, state.graphStructureVersion, state.activeRootGraph,
        state.editorMode, state.editingSubgraphId,
    ];
    if (snapshotCache && snapshotCache.key.every((value, index) => value === key[index])) return snapshotCache.snapshot;
    // JSON drops functions and other values postMessage cannot clone.
    const snapshot = JSON.parse(JSON.stringify({
        nodes: state.nodes, edges: state.edges,
        material: state.getRootGraph('material'), post: state.getRootGraph('post'),
        subgraphs: state.subgraphs, codeNodes: state.codeNodes, globals: state.globals,
        previewSettings: state.previewSettings, graphStructureVersion: state.graphStructureVersion,
        activeRootGraph: state.activeRootGraph, editorMode: state.editorMode,
        editingSubgraphId: state.editingSubgraphId,
    })) as PreviewSnapshot;
    snapshotCache = { key, snapshot };
    return snapshot;
}

const blobCache = new Map<string, Promise<Blob | null>>();
async function resolveAssets(snapshot: PreviewSnapshot): Promise<PreviewAsset[]> {
    const urls = collectLocalBlobUrls(snapshot, window.location.origin);
    for (const url of blobCache.keys()) if (!urls.has(url)) blobCache.delete(url);
    const assets: PreviewAsset[] = [];
    for (const url of urls) {
        let blob = blobCache.get(url);
        if (!blob) {
            blob = fetch(url).then((response) => response.ok ? response.blob() : null).catch(() => null);
            blobCache.set(url, blob);
        }
        const resolved = await blob;
        if (resolved) assets.push({ url, blob: resolved });
    }
    return assets;
}

// The main frame reports its orbit camera; overlay frames mirror it.
let latestCamera: PreviewCameraState | null = null;
const cameraSubscribers = new Set<(camera: PreviewCameraState) => void>();
const isFiniteTuple = (value: unknown, length: number): value is number[] =>
    Array.isArray(value) && value.length === length && value.every((item) => typeof item === 'number' && Number.isFinite(item));

export function readCameraState(value: unknown): PreviewCameraState | null {
    if (!value || typeof value !== 'object') return null;
    const { position, quaternion, zoom } = value as Record<string, unknown>;
    if (!isFiniteTuple(position, 3) || !isFiniteTuple(quaternion, 4)) return null;
    if (typeof zoom !== 'number' || !Number.isFinite(zoom) || zoom <= 0) return null;
    return { position: [...position], quaternion: [...quaternion], zoom };
}

/** Frame output is untrusted: accept only a bounded PNG/JPEG blob of sane size. */
export function readCaptureImage(message: Record<string, unknown>): PreviewImage | null {
    const { blob, width, height } = message;
    if (!(blob instanceof Blob) || !['image/png', 'image/jpeg'].includes(blob.type) || blob.size > MAX_CAPTURE_BYTES) return null;
    if (!Number.isInteger(width) || !Number.isInteger(height)) return null;
    const w = width as number;
    const h = height as number;
    if (w < 1 || h < 1 || w > MAX_CAPTURE_DIMENSION || h > MAX_CAPTURE_DIMENSION) return null;
    return { blob, width: w, height: h, mimeType: blob.type };
}

const readMessageText = (value: unknown) => typeof value === 'string' ? value.slice(0, MAX_MESSAGE_LENGTH) : null;

const isImageBitmap = (value: unknown): value is ImageBitmap =>
    typeof ImageBitmap !== 'undefined' && value instanceof ImageBitmap;

/** Overlay output is untrusted: accept only bounded images that sit inside their slot. */
export function readPreviewFrames(value: unknown): PreviewFrame[] | null {
    if (!Array.isArray(value) || value.length > MAX_PREVIEW_FRAMES) return null;
    const previews: PreviewFrame[] = [];
    for (const item of value) {
        if (!item || typeof item !== 'object') return null;
        const { id, bitmap, x, y, width, height, slotWidth, slotHeight } = item as Record<string, unknown>;
        if (typeof id !== 'string' || !isImageBitmap(bitmap)) return null;
        if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width > MAX_CAPTURE_DIMENSION || bitmap.height > MAX_CAPTURE_DIMENSION) return null;
        const numbers = [x, y, width, height, slotWidth, slotHeight];
        if (!numbers.every((number) => typeof number === 'number' && Number.isFinite(number))) return null;
        const [left, top, w, h, sw, sh] = numbers as number[];
        if (sw <= 0 || sh <= 0 || sw > MAX_CAPTURE_DIMENSION || sh > MAX_CAPTURE_DIMENSION) return null;
        // One pixel of slack for rounding.
        if (left < 0 || top < 0 || w <= 0 || h <= 0 || left + w > sw + 1 || top + h > sh + 1) return null;
        previews.push({ id, bitmap, x: left, y: top, width: w, height: h, slotWidth: sw, slotHeight: sh });
    }
    return previews;
}

/** Frees the images in a batch that was rejected or arrived too late. */
export function closePreviewBitmaps(value: unknown) {
    if (!Array.isArray(value)) return;
    for (const item of value) {
        const bitmap = item && typeof item === 'object' ? (item as { bitmap?: unknown }).bitmap : undefined;
        if (isImageBitmap(bitmap)) bitmap.close();
    }
}

/**
 * Where a preview image goes in its node's canvas, in canvas pixels. The canvas
 * matches the slot's on-screen size, so the image stays sharp at any zoom.
 */
export function placePreviewFrame(preview: Omit<PreviewFrame, 'id' | 'bitmap'>, pixelRatio: number) {
    const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
    return {
        canvasWidth: Math.max(1, Math.round(preview.slotWidth * ratio)),
        canvasHeight: Math.max(1, Math.round(preview.slotHeight * ratio)),
        x: preview.x * ratio,
        y: preview.y * ratio,
        width: preview.width * ratio,
        height: preview.height * ratio,
    };
}

export interface PreviewBridge {
    capture: (options?: CaptureRequest) => Promise<PreviewImage>;
    setPostEnabled: (enabled: boolean) => void;
    /** Overlay frames: render node previews for these slots once; results arrive via `onPreviews`. */
    renderSlots: (slots: PreviewSlot[]) => void;
    dispose: () => void;
}

interface BridgeOptions {
    mode: PreviewMode;
    postGraphEnabled?: boolean;
    onReady?: (ready: boolean) => void;
    onError?: (kind: 'material' | 'post' | 'geometry', error: string | null) => void;
    /** Overlay frames: rendered node previews. The receiver must close each bitmap. */
    onPreviews?: (previews: PreviewFrame[]) => void;
}

/** This bridge exposes rendering only. No persistence, auth or upload RPC. */
export function createPreviewBridge(container: HTMLElement, options: BridgeOptions): PreviewBridge {
    const frame = document.createElement('iframe');
    frame.title = options.mode === 'main' ? 'Shader preview' : 'Node previews';
    frame.setAttribute('sandbox', PREVIEW_SANDBOX);
    frame.referrerPolicy = 'no-referrer';
    frame.style.cssText = 'border:0;display:block;width:100%;height:100%;background:transparent;color-scheme:light';
    // The overlay frame still renders at full size (screen-space nodes depend on it),
    // but its output is shown inside the nodes, so the frame itself stays invisible.
    if (options.mode === 'overlay') frame.style.opacity = '0';
    let disposed = false;
    let initialized = false;
    let postGraphEnabled = options.postGraphEnabled ?? true;
    let slots: PreviewSlot[] = [];
    let scheduled: number | null = null;
    let stateSequence = 0;
    let sending: Promise<void> = Promise.resolve();
    let bootTimer: ReturnType<typeof setTimeout> | null = null;
    const pending = new Map<string, { resolve: (image: PreviewImage) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

    const post = (command: PreviewCommand) => {
        // The frame's origin is opaque, so '*' is the only usable target; delivery is pinned by contentWindow.
        if (!disposed) frame.contentWindow?.postMessage({ channel: PREVIEW_CHANNEL, ...command }, '*');
    };
    const sendState = () => {
        scheduled = null;
        if (!initialized || disposed) return sending;
        const sequence = ++stateSequence;
        const snapshot = createSnapshot();
        sending = resolveAssets(snapshot).then((assets) => {
            // A newer snapshot supersedes this one; never deliver graph state out of order.
            if (disposed || sequence !== stateSequence) return;
            post({ type: 'state', snapshot, postGraphEnabled, assets });
        });
        return sending;
    };
    const scheduleState = () => {
        if (scheduled === null) scheduled = requestAnimationFrame(() => { void sendState(); });
    };
    const flushState = () => {
        if (scheduled !== null) {
            cancelAnimationFrame(scheduled);
            void sendState();
        }
        return sending;
    };
    const sendCamera = (camera: PreviewCameraState) => {
        if (initialized) post({ type: 'camera', camera });
    };

    const receive = (event: MessageEvent) => {
        if (disposed || event.source !== frame.contentWindow || event.origin !== 'null') return;
        const message = event.data as Record<string, unknown> | null;
        if (!message || typeof message !== 'object' || message.channel !== PREVIEW_CHANNEL) return;
        if (message.type === 'boot') {
            // Also after the frame reloads itself; it only ever receives what it already had.
            initialized = true;
            if (bootTimer) clearTimeout(bootTimer);
            post({ type: 'init', mode: options.mode });
            void sendState();
            post({ type: 'slots', slots });
            if (options.mode === 'overlay' && latestCamera) post({ type: 'camera', camera: latestCamera });
        } else if (message.type === 'ready' && typeof message.ready === 'boolean') {
            options.onReady?.(message.ready);
        } else if (message.type === 'error' && (message.kind === 'material' || message.kind === 'post' || message.kind === 'geometry')) {
            options.onError?.(message.kind, readMessageText(message.error));
        } else if (message.type === 'debug-error' && typeof message.nodeId === 'string') {
            const state = useEditorStore.getState();
            const error = readMessageText(message.error);
            if (state.activeDebugPreviewNodeIds.includes(message.nodeId) && (state.debugPreviewErrors[message.nodeId] ?? null) !== error) {
                state.setDebugPreviewError(message.nodeId, error);
            }
        } else if (message.type === 'camera' && options.mode === 'main') {
            const camera = readCameraState(message.camera);
            if (!camera) return;
            latestCamera = camera;
            for (const subscriber of cameraSubscribers) subscriber(camera);
        } else if (message.type === 'capture' && typeof message.requestId === 'string') {
            const request = pending.get(message.requestId);
            if (!request) return;
            pending.delete(message.requestId);
            clearTimeout(request.timer);
            if (message.error !== undefined) {
                request.reject(new Error(readMessageText(message.error) ?? 'Preview capture failed.'));
                return;
            }
            const image = readCaptureImage(message);
            if (image) request.resolve(image);
            else request.reject(new Error('Invalid preview capture.'));
        } else if (message.type === 'previews' && options.mode === 'overlay') {
            const previews = readPreviewFrames(message.previews);
            if (!previews || !options.onPreviews) {
                closePreviewBitmaps(message.previews);
                return;
            }
            options.onPreviews(previews);
        } else if (message.type === 'previews-failed' && options.mode === 'overlay') {
            // The frame can't hand back images, so show it directly, as an overlay.
            frame.style.opacity = '1';
        }
    };
    window.addEventListener('message', receive);

    // Clicking the preview focuses the frame; hand focus back so editor shortcuts keep working.
    // Orbiting uses pointer events, which do not need focus.
    const reclaimFocus = () => {
        if (document.activeElement !== frame) return;
        requestAnimationFrame(() => {
            if (!disposed && document.activeElement === frame) frame.blur();
        });
    };
    if (options.mode === 'main') window.addEventListener('blur', reclaimFocus);

    const unsubscribe = useEditorStore.subscribe((state, previous) => {
        if (state.graphStructureVersion !== previous.graphStructureVersion
            || state.previewSettings !== previous.previewSettings
            || state.globals !== previous.globals
            || state.editorMode !== previous.editorMode
            || state.editingSubgraphId !== previous.editingSubgraphId
            || state.activeRootGraph !== previous.activeRootGraph) scheduleState();
    });
    const unsubscribeUniforms = subscribeUniformEvents((event) => {
        if (initialized) post({ type: 'uniform', event });
    });
    if (options.mode === 'overlay') cameraSubscribers.add(sendCamera);

    void loadBundle().then((bundle) => {
        if (disposed) return;
        frame.srcdoc = previewDocument(bundle, window.location.href);
        container.appendChild(frame);
        bootTimer = setTimeout(() => {
            if (!initialized && !disposed) options.onError?.('material', 'Preview renderer failed to start.');
        }, BOOT_TIMEOUT_MS);
    }).catch((error) => options.onError?.('material', error instanceof Error ? error.message : 'Preview unavailable.'));

    return {
        capture: async (captureOptions = {}) => {
            if (disposed || !initialized) throw new Error('Preview renderer not ready.');
            // Captures must reflect the latest graph, not the one before a pending frame.
            await flushState();
            if (disposed) throw new Error('Preview closed.');
            return new Promise<PreviewImage>((resolve, reject) => {
                const requestId = crypto.randomUUID();
                const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('Preview capture timed out.')); }, CAPTURE_TIMEOUT_MS);
                pending.set(requestId, { resolve, reject, timer });
                post({ type: 'capture', requestId, options: captureOptions });
            });
        },
        setPostEnabled: (enabled) => {
            if (enabled === postGraphEnabled) return;
            postGraphEnabled = enabled;
            scheduleState();
        },
        renderSlots: (next) => { slots = next; if (initialized) post({ type: 'slots', slots }); },
        dispose: () => {
            if (disposed) return;
            disposed = true;
            unsubscribe(); unsubscribeUniforms(); cameraSubscribers.delete(sendCamera);
            window.removeEventListener('message', receive);
            window.removeEventListener('blur', reclaimFocus);
            if (scheduled !== null) cancelAnimationFrame(scheduled);
            if (bootTimer) clearTimeout(bootTimer);
            for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Preview closed.')); }
            pending.clear(); frame.remove(); options.onReady?.(false);
        },
    };
}

let mainPreview: PreviewBridge | null = null;
export function registerMainPreview(bridge: PreviewBridge) {
    mainPreview = bridge;
    return () => { if (mainPreview === bridge) mainPreview = null; };
}

let overlayPreview: PreviewBridge | null = null;
export function registerOverlayPreview(bridge: PreviewBridge) {
    overlayPreview = bridge;
    return () => { if (overlayPreview === bridge) overlayPreview = null; };
}

/** The main 3D preview, or null when it is not mounted (e.g. subgraph editing). */
export async function captureIsolatedPreview(options: Omit<CaptureRequest, 'nodeId'> = {}): Promise<PreviewImage | null> {
    return mainPreview ? mainPreview.capture(options) : null;
}

export async function captureIsolatedNodePreview(nodeId: string, options: Omit<CaptureRequest, 'nodeId'> = {}): Promise<PreviewImage> {
    if (!overlayPreview) throw new Error('Node previews are not active.');
    return overlayPreview.capture({ ...options, nodeId });
}
