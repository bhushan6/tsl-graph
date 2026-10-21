// Built into public/preview-sandbox.js and only ever run inside the sandboxed
// preview frame (opaque origin). Never import this from application UI.
import { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import * as THREE from 'three/webgpu';
import { PreviewCanvas3D, type CameraSource } from './UnsafePreviewCanvas3D';
import { NodeDebugPreviewOverlay, type OverlayDriver } from './UnsafeNodeDebugPreviewOverlay';
import { useEditorStore } from '@/store/editor';
import { applyUniformEvent } from '@/lib/uniform-store';
import { initializeNodes } from '@/lib/nodes';
import { buildNodePreviewMaterial } from '@/lib/tsl-builder';
import {
    PREVIEW_CHANNEL,
    type CaptureRequest,
    type PreviewAsset,
    type PreviewCameraState,
    type PreviewCommand,
    type PreviewMode,
    type PreviewSlot,
    type PreviewSnapshot,
} from './protocol';
import { assertIsolatedPreview } from './security';
import { createFrameAssetUrls } from './assets';

assertIsolatedPreview();
initializeNodes();

const MAX_CAPTURE_SIZE = 4096;
const send = (message: Record<string, unknown>, transfer: Transferable[] = []) =>
    window.parent.postMessage({ channel: PREVIEW_CHANNEL, ...message }, '*', transfer);
const noop = () => {};

// Frame-level settings from the parent, read by React through useSyncExternalStore.
let frameSettings: { mode: PreviewMode | null; postEnabled: boolean } = { mode: null, postEnabled: true };
const frameSettingsListeners = new Set<() => void>();
const subscribeFrameSettings = (listener: () => void) => {
    frameSettingsListeners.add(listener);
    return () => { frameSettingsListeners.delete(listener); };
};
const getFrameSettings = () => frameSettings;
function updateFrameSettings(update: Partial<typeof frameSettings>) {
    frameSettings = { ...frameSettings, ...update };
    for (const listener of frameSettingsListeners) listener();
}
let hasState = false;
let mainReady = false;

const reportReady = (ready: boolean) => { mainReady = ready; send({ type: 'ready', ready }); };
const reportMaterialError = (error: string | null) => send({ type: 'error', kind: 'material', error });
const reportPostError = (error: string | null) => send({ type: 'error', kind: 'post', error });
const reportGeometryError = (error: string | null) => send({ type: 'error', kind: 'geometry', error });
const reportCamera = (camera: PreviewCameraState) => send({ type: 'camera', camera });

// Overlay frames: the parent sends slot rectangles every animation frame. Each set
// is rendered once and goes back as images the parent paints into the nodes.
let slots: PreviewSlot[] = [];
const renderRequestListeners = new Set<() => void>();
const overlayDriver: OverlayDriver = {
    // Nothing to render until the graph has arrived (the parent sends slots first on boot).
    getSlots: () => (hasState ? slots : []),
    onRequest: (listener) => {
        renderRequestListeners.add(listener);
        return () => { renderRequestListeners.delete(listener); };
    },
    publish: (previews) => send({ type: 'previews', previews }, previews.map((preview) => preview.bitmap)),
    fail: () => send({ type: 'previews-failed' }),
};

// Overlay frames mirror the main preview camera for post-graph node previews.
let mirroredCamera: PreviewCameraState | null = null;
const cameraListeners = new Set<() => void>();
const cameraSource: CameraSource = {
    get: () => mirroredCamera,
    subscribe: (listener) => {
        cameraListeners.add(listener);
        return () => { cameraListeners.delete(listener); };
    },
};

// Every debug-preview result goes to the parent, including cleared errors.
const setDebugPreviewError = useEditorStore.getState().setDebugPreviewError;
useEditorStore.setState({
    setDebugPreviewError: (nodeId, error) => {
        setDebugPreviewError(nodeId, error);
        send({ type: 'debug-error', nodeId, error });
    },
    trackEvent: noop,
});

function Runtime() {
    const { mode, postEnabled } = useSyncExternalStore(subscribeFrameSettings, getFrameSettings);
    const isPostDebug = useEditorStore((state) => state.editorMode === 'main' && state.activeRootGraph === 'post');

    if (mode === 'main') {
        return <PreviewCanvas3D layoutMode="inline" postGraphEnabled={postEnabled}
            onReadyChange={reportReady} onMaterialErrorChange={reportMaterialError}
            onPostErrorChange={reportPostError} onGeometryScriptErrorChange={reportGeometryError}
            onCameraChange={reportCamera} />;
    }
    if (mode === 'overlay') {
        return <>
            {/* Post-graph node previews render this frame's own copy of the main scene. */}
            {isPostDebug && <PreviewCanvas3D headless layoutMode="inline" postGraphEnabled={false}
                onReadyChange={noop} onMaterialErrorChange={noop} onPostErrorChange={noop}
                onGeometryScriptErrorChange={noop} cameraSource={cameraSource} />}
            <NodeDebugPreviewOverlay driver={overlayDriver} />
        </>;
    }
    return null;
}

// Parent `blob:` URLs belong to the app origin; this frame gets the bytes instead.
const assetUrls = createFrameAssetUrls();

function applySnapshot(snapshot: PreviewSnapshot, assets: PreviewAsset[]) {
    assetUrls.apply(snapshot, assets);
    const state = useEditorStore.getState();
    useEditorStore.setState({
        nodes: snapshot.nodes, edges: snapshot.edges,
        materialRootGraph: { ...state.materialRootGraph, ...snapshot.material },
        postRootGraph: { ...state.postRootGraph, ...snapshot.post },
        subgraphs: snapshot.subgraphs, codeNodes: snapshot.codeNodes, globals: snapshot.globals,
        previewSettings: snapshot.previewSettings, graphStructureVersion: snapshot.graphStructureVersion,
        activeRootGraph: snapshot.activeRootGraph, editorMode: snapshot.editorMode,
        editingSubgraphId: snapshot.editingSubgraphId,
    });
    hasState = true;
}

const clampSize = (value: number | undefined, fallback: number) =>
    Math.min(MAX_CAPTURE_SIZE, Math.max(1, Math.round(Number.isFinite(value) ? value! : fallback)));

function canvasBlob(canvas: HTMLCanvasElement, options: CaptureRequest) {
    const mimeType = options.format === 'jpeg' ? 'image/jpeg' : 'image/png';
    // Called in the same task as the render so WebGPU canvas contents are still current.
    return new Promise<{ blob: Blob; width: number; height: number }>((resolve, reject) => canvas.toBlob(
        (blob) => blob ? resolve({ blob, width: canvas.width, height: canvas.height }) : reject(new Error('Preview capture failed.')),
        mimeType,
        options.format === 'jpeg' ? options.quality ?? 0.85 : undefined,
    ));
}

interface CaptureRenderer {
    renderer: THREE.WebGPURenderer;
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
    mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.Material>;
    fallbackMaterial: THREE.Material;
}

// One offscreen renderer for node captures, kept for the frame's lifetime.
let captureRendererPromise: Promise<CaptureRenderer> | null = null;
function getCaptureRenderer() {
    if (!captureRendererPromise) {
        captureRendererPromise = (async () => {
            const renderer = new THREE.WebGPURenderer({ antialias: true, alpha: true });
            await renderer.init();
            const scene = new THREE.Scene();
            const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
            camera.position.set(0, 0, 1);
            camera.lookAt(0, 0, 0);
            const fallbackMaterial = new THREE.MeshBasicMaterial({ color: 0x333333 });
            const mesh = new THREE.Mesh<THREE.PlaneGeometry, THREE.Material>(new THREE.PlaneGeometry(2, 2, 1, 1), fallbackMaterial);
            scene.add(mesh);
            return { renderer, scene, camera, mesh, fallbackMaterial };
        })();
        captureRendererPromise.catch(() => { captureRendererPromise = null; });
    }
    return captureRendererPromise;
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function captureMain(options: CaptureRequest) {
    if (!mainReady) throw new Error('Preview renderer not ready.');
    // Let a just-applied graph re-render before reading the canvas.
    await nextFrame();
    await nextFrame();
    const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-shader-preview-canvas]');
    if (!canvas || canvas.width <= 0 || canvas.height <= 0) throw new Error('Preview canvas unavailable.');
    return canvasBlob(canvas, options);
}

async function captureNode(nodeId: string, options: CaptureRequest) {
    if (!hasState) throw new Error('Preview renderer not ready.');
    const { renderer, scene, camera, mesh, fallbackMaterial } = await getCaptureRenderer();
    const state = useEditorStore.getState();
    const width = clampSize(options.width, 256);
    const height = clampSize(options.height, 256);
    const pixelRatio = Math.min(4, Math.max(0.5, Number.isFinite(options.pixelRatio) ? options.pixelRatio! : 2));
    renderer.setPixelRatio(pixelRatio);
    renderer.setScissorTest(false);

    if (state.editorMode === 'main' && state.activeRootGraph === 'post') {
        const builder = state.postDebugPreviewOutputBuilder;
        if (!builder) throw new Error('Post preview is not ready.');
        renderer.setSize(width, height, false);
        renderer.setViewport(0, 0, width, height);
        const preview = builder(nodeId);
        const pipeline = new THREE.RenderPipeline(renderer, preview.outputNode as THREE.Node);
        try {
            preview.update(width / height);
            pipeline.render();
            return await canvasBlob(renderer.domElement, options);
        } finally {
            preview.dispose?.();
            pipeline.dispose();
        }
    }

    const material = buildNodePreviewMaterial(nodeId, state.nodes, state.edges, state.subgraphs, state.codeNodes, state.globals);
    try {
        mesh.material = material;
        const viewport = options.viewport;
        if (!viewport) {
            renderer.setSize(width, height, false);
            renderer.setViewport(0, 0, width, height);
            await renderer.compileAsync(scene, camera);
            renderer.render(scene, camera);
            return await canvasBlob(renderer.domElement, options);
        }

        // Screen-space nodes depend on where the slot sits in the overlay's render target.
        const canvasWidth = clampSize(viewport.canvasWidth, width);
        const canvasHeight = clampSize(viewport.canvasHeight, height);
        renderer.setSize(canvasWidth, canvasHeight, false);
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        renderer.setViewport(viewport.x, viewport.y, viewport.width, viewport.height);
        renderer.setScissor(viewport.x, viewport.y, viewport.width, viewport.height);
        renderer.setScissorTest(true);
        await renderer.compileAsync(scene, camera);
        renderer.render(scene, camera);
        renderer.setScissorTest(false);

        const crop = document.createElement('canvas');
        crop.width = clampSize(viewport.width * pixelRatio, 1);
        crop.height = clampSize(viewport.height * pixelRatio, 1);
        const context = crop.getContext('2d');
        if (!context) throw new Error('Preview capture failed.');
        context.drawImage(
            renderer.domElement,
            viewport.x * pixelRatio, viewport.y * pixelRatio, viewport.width * pixelRatio, viewport.height * pixelRatio,
            0, 0, crop.width, crop.height,
        );
        return await canvasBlob(crop, options);
    } finally {
        mesh.material = fallbackMaterial;
        material.dispose();
    }
}

flushSync(() => createRoot(document.getElementById('root')!).render(<Runtime />));

window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window.parent || event.data?.channel !== PREVIEW_CHANNEL) return;
    const message = event.data as PreviewCommand;
    switch (message.type) {
        case 'init':
            if (frameSettings.mode) return;
            updateFrameSettings({ mode: message.mode === 'overlay' ? 'overlay' : 'main' });
            return;
        case 'state':
            applySnapshot(message.snapshot, Array.isArray(message.assets) ? message.assets : []);
            if (frameSettings.postEnabled !== Boolean(message.postGraphEnabled)) {
                updateFrameSettings({ postEnabled: Boolean(message.postGraphEnabled) });
            }
            return;
        case 'slots':
            slots = Array.isArray(message.slots) ? message.slots : [];
            for (const listener of renderRequestListeners) listener();
            return;
        case 'uniform':
            applyUniformEvent(message.event);
            return;
        case 'camera':
            mirroredCamera = message.camera;
            for (const listener of cameraListeners) listener();
            return;
        case 'capture': {
            const options = message.options ?? {};
            const capture = options.nodeId ? captureNode(options.nodeId, options) : captureMain(options);
            void capture
                .then((image) => send({ type: 'capture', requestId: message.requestId, ...image }))
                .catch((error) => send({ type: 'capture', requestId: message.requestId, error: error instanceof Error ? error.message : 'Capture failed.' }));
        }
    }
});
send({ type: 'boot' });
