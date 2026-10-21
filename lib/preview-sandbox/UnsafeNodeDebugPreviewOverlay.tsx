import { memo, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three/webgpu';
import { buildNodePreviewMaterial } from '@/lib/tsl-builder';
import { getCanvasRelativeDebugPreviewRect, type DebugPreviewRect } from '@/lib/debug-preview';
import { useEditorStore } from '@/store/editor';
import type { PostDebugPreviewOutput } from '@/store/editor';
import { DEFAULT_POST_OUTPUT_SETTINGS, getPostOutputSettings, type PostOutputSettings } from '@/lib/post-output-settings';
import type { PreviewFrame, PreviewSlot } from './protocol';

/** How the overlay frame works with the parent: render on request, hand back images. */
export interface OverlayDriver {
    getSlots: () => PreviewSlot[];
    /** Calls `listener` for each render request (new slots from the parent). */
    onRequest: (listener: () => void) => () => void;
    publish: (previews: PreviewFrame[]) => void;
    /** Images can't be read back here; the parent then shows this frame as an overlay. */
    fail: () => void;
}

interface RenderedRegion {
    slot: PreviewSlot;
    /** Part of the slot that was drawn, relative to the canvas (slots are clipped to it). */
    rect: DebugPreviewRect;
    /** Post previews resize the canvas to the slot, so the whole canvas is the preview. */
    wholeCanvas: boolean;
}

interface CachedMaterial {
    version: number;
    material: THREE.Material;
}

interface CachedPostOutput {
    version: number;
    preview: PostDebugPreviewOutput;
    pipeline: THREE.RenderPipeline;
}

const TONE_MAPPING_CONSTANTS = {
    NoToneMapping: THREE.NoToneMapping,
    LinearToneMapping: THREE.LinearToneMapping,
    ReinhardToneMapping: THREE.ReinhardToneMapping,
    CineonToneMapping: THREE.CineonToneMapping,
    ACESFilmicToneMapping: THREE.ACESFilmicToneMapping,
} as const;

const OUTPUT_COLOR_SPACE_CONSTANTS = {
    SRGBColorSpace: THREE.SRGBColorSpace,
    LinearSRGBColorSpace: THREE.LinearSRGBColorSpace,
} as const;

function applyRendererOutputSettings(
    renderer: THREE.WebGPURenderer,
    settings: PostOutputSettings
) {
    renderer.toneMapping = TONE_MAPPING_CONSTANTS[settings.toneMapping];
    renderer.toneMappingExposure = settings.exposure;
    renderer.outputColorSpace = OUTPUT_COLOR_SPACE_CONSTANTS[settings.outputColorSpace];
}

/**
 * Slots are measured by the parent editor, relative to this overlay's frame. Each
 * request renders all of them once; the parent paints the results into the nodes.
 */
export const NodeDebugPreviewOverlay = memo(function NodeDebugPreviewOverlay({ driver }: { driver: OverlayDriver }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGPURenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const meshRef = useRef<THREE.Mesh | null>(null);
    const orthographicCameraRef = useRef<THREE.OrthographicCamera | null>(null);
    const materialCacheRef = useRef<Map<string, CachedMaterial>>(new Map());
    const postOutputCacheRef = useRef<Map<string, CachedPostOutput>>(new Map());
    const graphStructureVersionRef = useRef(0);
    const isMountedRef = useRef(false);

    const graphStructureVersion = useEditorStore((state) => state.graphStructureVersion);
    const editorMode = useEditorStore((state) => state.editorMode);
    const editingSubgraphId = useEditorStore((state) => state.editingSubgraphId);
    const activeRootGraph = useEditorStore((state) => state.activeRootGraph);
    const previewMesh = useEditorStore((state) => state.previewSettings.mesh);
    const setDebugPreviewError = useEditorStore((state) => state.setDebugPreviewError);

    const geometry = useMemo(() => new THREE.PlaneGeometry(2, 2, 1, 1), []);

    useEffect(() => {
        return () => {
            geometry.dispose();
        };
    }, [geometry]);

    useEffect(() => {
        graphStructureVersionRef.current = graphStructureVersion;
        materialCacheRef.current.forEach((entry) => entry.material.dispose());
        materialCacheRef.current.clear();
        postOutputCacheRef.current.forEach((entry) => {
            entry.preview.dispose?.();
            entry.pipeline.dispose();
        });
        postOutputCacheRef.current.clear();
    }, [graphStructureVersion]);

    useEffect(() => {
        materialCacheRef.current.forEach((entry) => entry.material.dispose());
        materialCacheRef.current.clear();
        postOutputCacheRef.current.forEach((entry) => {
            entry.preview.dispose?.();
            entry.pipeline.dispose();
        });
        postOutputCacheRef.current.clear();
    }, [editorMode, editingSubgraphId, activeRootGraph, previewMesh]);

    useEffect(() => {
        if (!containerRef.current || isMountedRef.current) return;
        isMountedRef.current = true;
        let isDisposed = false;

        const container = containerRef.current;
        const materialCache = materialCacheRef.current;
        const postOutputCache = postOutputCacheRef.current;
        const scene = new THREE.Scene();
        sceneRef.current = scene;

        const orthographicCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
        orthographicCamera.position.set(0, 0, 1);
        orthographicCamera.lookAt(0, 0, 0);
        orthographicCameraRef.current = orthographicCamera;

        const fallbackMaterial = new THREE.MeshBasicMaterial({ color: 0x333333 });
        const mesh = new THREE.Mesh(geometry, fallbackMaterial);
        scene.add(mesh);
        meshRef.current = mesh;

        const renderer = new THREE.WebGPURenderer({ antialias: true, alpha: true });
        rendererRef.current = renderer;

        const resizeRendererToFullOverlay = () => {
            const width = container.clientWidth;
            const height = container.clientHeight;
            if (width <= 0 || height <= 0) return;
            renderer.setPixelRatio(window.devicePixelRatio);
            renderer.setSize(width, height, false);
            renderer.domElement.style.display = 'block';
            renderer.domElement.style.position = 'absolute';
            renderer.domElement.style.left = '0';
            renderer.domElement.style.top = '0';
            renderer.domElement.style.width = '100%';
            renderer.domElement.style.height = '100%';
        };

        const resizeRendererToSlot = (rect: { x: number; y: number; width: number; height: number }) => {
            if (rect.width <= 0 || rect.height <= 0) return;
            renderer.setPixelRatio(window.devicePixelRatio);
            renderer.setSize(rect.width, rect.height, false);
            renderer.domElement.style.display = 'block';
            renderer.domElement.style.position = 'absolute';
            renderer.domElement.style.left = `${rect.x}px`;
            renderer.domElement.style.top = `${rect.y}px`;
            renderer.domElement.style.width = `${rect.width}px`;
            renderer.domElement.style.height = `${rect.height}px`;
        };

        const hideRenderer = () => {
            renderer.domElement.style.display = 'none';
        };

        const getMaterial = (nodeId: string): THREE.Material | null => {
            const cached = materialCache.get(nodeId);
            const currentVersion = graphStructureVersionRef.current;
            if (cached && cached.version === currentVersion) return cached.material;

            cached?.material.dispose();
            materialCache.delete(nodeId);

            const { nodes, edges, subgraphs, codeNodes, globals } = useEditorStore.getState();

            try {
                const material = buildNodePreviewMaterial(nodeId, nodes, edges, subgraphs, codeNodes, globals);
                materialCache.set(nodeId, {
                    version: currentVersion,
                    material,
                });
                setDebugPreviewError(nodeId, null);
                return material;
            } catch (error) {
                setDebugPreviewError(
                    nodeId,
                    error instanceof Error ? error.message : 'Failed to build preview'
                );
                return null;
            }
        };

        const getPostOutput = (nodeId: string): CachedPostOutput | null => {
            const cached = postOutputCache.get(nodeId);
            const currentVersion = graphStructureVersionRef.current;
            if (cached && cached.version === currentVersion) return cached;

            cached?.preview.dispose?.();
            cached?.pipeline.dispose();
            postOutputCache.delete(nodeId);

            const builder = useEditorStore.getState().postDebugPreviewOutputBuilder;
            if (!builder) {
                setDebugPreviewError(nodeId, 'Preview scene is not ready.');
                return null;
            }

            try {
                const preview = builder(nodeId);
                const pipeline = new THREE.RenderPipeline(renderer, preview.outputNode as THREE.Node);
                const entry = {
                    version: currentVersion,
                    preview,
                    pipeline,
                };
                postOutputCache.set(nodeId, entry);
                setDebugPreviewError(nodeId, null);
                return entry;
            } catch (error) {
                setDebugPreviewError(
                    nodeId,
                    error instanceof Error ? error.message : 'Failed to build post preview'
                );
                return null;
            }
        };

        /** Draws every slot once and returns what was drawn, for capture. */
        const render = (): RenderedRegion[] => {
            const rendered: RenderedRegion[] = [];
            const currentRenderer = rendererRef.current;
            const currentMesh = meshRef.current;
            const currentScene = sceneRef.current;
            const currentOrthographicCamera = orthographicCameraRef.current;
            if (isDisposed || !currentRenderer || !currentMesh || !currentScene || !currentOrthographicCamera) {
                return rendered;
            }

            const state = useEditorStore.getState();
            const isPostDebugMode = state.editorMode === 'main' && state.activeRootGraph === 'post';
            const postSettings = isPostDebugMode
                ? getPostOutputSettings(state.getRootGraph('post').nodes)
                : DEFAULT_POST_OUTPUT_SETTINGS;
            applyRendererOutputSettings(currentRenderer, postSettings);

            const canvasRect = { x: 0, y: 0, width: container.clientWidth, height: container.clientHeight };
            const slots = driver.getSlots();
            const visibleNodeIds = new Set<string>();

            if (isPostDebugMode) {
                const slot = slots[0];
                const nodeId = slot?.id;
                const rect = slot ? getCanvasRelativeDebugPreviewRect(slot, canvasRect) : null;

                if (!nodeId || !rect) {
                    hideRenderer();
                    postOutputCache.forEach((cached) => {
                        cached.preview.dispose?.();
                        cached.pipeline.dispose();
                    });
                    postOutputCache.clear();
                    currentRenderer.setScissorTest(false);
                    return rendered;
                }

                visibleNodeIds.add(nodeId);
                resizeRendererToSlot(rect);

                currentRenderer.setScissorTest(false);
                currentRenderer.setViewport(0, 0, rect.width, rect.height);
                currentRenderer.setClearColor(0x000000, 0);
                currentRenderer.clear();

                const postOutput = getPostOutput(nodeId);
                if (postOutput) {
                    postOutput.preview.update(rect.width / rect.height);
                    postOutput.pipeline.render();
                    rendered.push({ slot, rect, wholeCanvas: true });
                }

                for (const [cachedNodeId, cached] of postOutputCache) {
                    if (visibleNodeIds.has(cachedNodeId)) continue;
                    cached.preview.dispose?.();
                    cached.pipeline.dispose();
                    postOutputCache.delete(cachedNodeId);
                }

                currentRenderer.setScissorTest(false);
                return rendered;
            }

            resizeRendererToFullOverlay();
            currentRenderer.setScissorTest(false);
            currentRenderer.setViewport(0, 0, canvasRect.width, canvasRect.height);
            currentRenderer.setClearColor(0x000000, 0);
            currentRenderer.clear();
            currentRenderer.setScissorTest(true);

            for (const slot of slots) {
                const nodeId = slot.id;
                const rect = getCanvasRelativeDebugPreviewRect(slot, canvasRect);
                if (!rect) continue;

                visibleNodeIds.add(nodeId);

                currentRenderer.setViewport(rect.x, rect.y, rect.width, rect.height);
                currentRenderer.setScissor(rect.x, rect.y, rect.width, rect.height);

                const material = getMaterial(nodeId);
                if (!material) continue;
                currentMesh.material = material;
                currentRenderer.render(currentScene, currentOrthographicCamera);
                rendered.push({ slot, rect, wholeCanvas: false });
            }

            for (const [nodeId, cached] of materialCache) {
                if (visibleNodeIds.has(nodeId)) continue;
                if (cached.version !== graphStructureVersionRef.current) {
                    cached.material.dispose();
                    materialCache.delete(nodeId);
                }
            }

            for (const [nodeId, cached] of postOutputCache) {
                if (visibleNodeIds.has(nodeId)) continue;
                if (cached.version !== graphStructureVersionRef.current) {
                    cached.preview.dispose?.();
                    cached.pipeline.dispose();
                    postOutputCache.delete(nodeId);
                }
            }

            currentRenderer.setScissorTest(false);
            return rendered;
        };

        // createImageBitmap copies the canvas when it is called, so call it right after drawing.
        const capture = async ({ slot, rect, wholeCanvas }: RenderedRegion): Promise<PreviewFrame> => {
            const canvas = renderer.domElement;
            const ratio = renderer.getPixelRatio();
            const bitmap = wholeCanvas
                ? await createImageBitmap(canvas)
                : await createImageBitmap(
                    canvas,
                    Math.round(rect.x * ratio),
                    Math.round(rect.y * ratio),
                    Math.max(1, Math.round(rect.width * ratio)),
                    Math.max(1, Math.round(rect.height * ratio)),
                );
            return {
                id: slot.id,
                bitmap,
                x: rect.x - slot.x,
                y: rect.y - slot.y,
                width: rect.width,
                height: rect.height,
                slotWidth: slot.width,
                slotHeight: slot.height,
            };
        };

        // One render at a time; requests that arrive meanwhile collapse into one more.
        let busy = false;
        let pending = false;
        let imagesUnavailable = false;
        const renderAndPublish = async () => {
            if (isDisposed) return;
            if (busy) {
                pending = true;
                return;
            }
            busy = true;
            try {
                do {
                    pending = false;
                    const regions = render();
                    if (imagesUnavailable || regions.length === 0) continue;
                    try {
                        const previews = await Promise.all(regions.map(capture));
                        if (isDisposed) {
                            previews.forEach((preview) => preview.bitmap.close());
                            return;
                        }
                        driver.publish(previews);
                    } catch (error) {
                        // The parent then shows this frame itself, as before.
                        console.error('Node debug preview capture failed:', error);
                        imagesUnavailable = true;
                        driver.fail();
                    }
                } while (pending && !isDisposed);
            } finally {
                busy = false;
            }
        };
        const requestFrame = () => {
            renderAndPublish().catch((error) => {
                console.error('Node debug preview render failed:', error);
            });
        };

        const resizeObserver = new ResizeObserver(resizeRendererToFullOverlay);
        let stopRequests: (() => void) | null = null;

        async function init() {
            await renderer.init();
            if (isDisposed) {
                renderer.dispose();
                return;
            }
            resizeRendererToFullOverlay();
            container.appendChild(renderer.domElement);
            resizeObserver.observe(container);
            stopRequests = driver.onRequest(requestFrame);
            requestFrame();
        }

        init().catch((error) => {
            console.error('Node debug preview renderer failed:', error);
        });

        return () => {
            isDisposed = true;
            stopRequests?.();
            resizeObserver.disconnect();
            materialCache.forEach((entry) => entry.material.dispose());
            materialCache.clear();
            postOutputCache.forEach((entry) => {
                entry.preview.dispose?.();
                entry.pipeline.dispose();
            });
            postOutputCache.clear();

            if (meshRef.current) {
                scene.remove(meshRef.current);
                fallbackMaterial.dispose();
                meshRef.current = null;
            }

            scene.clear();
            sceneRef.current = null;
            orthographicCameraRef.current = null;

            renderer.dispose();
            if (container.contains(renderer.domElement)) {
                container.removeChild(renderer.domElement);
            }
            rendererRef.current = null;
            isMountedRef.current = false;
        };
    }, [driver, geometry, setDebugPreviewError]);

    return <div ref={containerRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden="true" />;
});
