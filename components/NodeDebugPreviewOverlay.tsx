'use client';

import { memo, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three/webgpu';
import { buildNodePreviewMaterial } from '@/lib/tsl-builder';
import { getCanvasRelativeDebugPreviewRect } from '@/lib/debug-preview';
import { useEditorStore } from '@/store/editor';
import type { PostDebugPreviewOutput } from '@/store/editor';
import { DEFAULT_POST_OUTPUT_SETTINGS, getPostOutputSettings, type PostOutputSettings } from '@/lib/post-output-settings';

interface CachedMaterial {
    version: number;
    material: THREE.Material;
}

interface CachedPostOutput {
    version: number;
    preview: PostDebugPreviewOutput;
    pipeline: THREE.RenderPipeline;
}

const DEBUG_PREVIEW_SELECTOR = '[data-debug-preview-node-id]';

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

export const NodeDebugPreviewOverlay = memo(function NodeDebugPreviewOverlay() {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGPURenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const meshRef = useRef<THREE.Mesh | null>(null);
    const orthographicCameraRef = useRef<THREE.OrthographicCamera | null>(null);
    const frameIdRef = useRef<number>(0);
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

        const render = () => {
            if (isDisposed) return;
            frameIdRef.current = requestAnimationFrame(render);

            const currentRenderer = rendererRef.current;
            const currentMesh = meshRef.current;
            const currentScene = sceneRef.current;
            const currentOrthographicCamera = orthographicCameraRef.current;
            if (!currentRenderer || !currentMesh || !currentScene || !currentOrthographicCamera) {
                return;
            }

            const state = useEditorStore.getState();
            const isPostDebugMode = state.editorMode === 'main' && state.activeRootGraph === 'post';
            const postSettings = isPostDebugMode
                ? getPostOutputSettings(state.getRootGraph('post').nodes)
                : DEFAULT_POST_OUTPUT_SETTINGS;
            applyRendererOutputSettings(currentRenderer, postSettings);

            const canvasRect = container.getBoundingClientRect();
            const slots = Array.from(
                document.querySelectorAll<HTMLElement>(DEBUG_PREVIEW_SELECTOR)
            );
            const visibleNodeIds = new Set<string>();

            if (isPostDebugMode) {
                const slot = slots.find((candidate) => candidate.dataset.debugPreviewNodeId);
                const nodeId = slot?.dataset.debugPreviewNodeId;
                const rect = slot
                    ? getCanvasRelativeDebugPreviewRect(slot.getBoundingClientRect(), canvasRect)
                    : null;

                if (!nodeId || !rect) {
                    hideRenderer();
                    postOutputCache.forEach((cached) => {
                        cached.preview.dispose?.();
                        cached.pipeline.dispose();
                    });
                    postOutputCache.clear();
                    currentRenderer.setScissorTest(false);
                    return;
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
                }

                for (const [cachedNodeId, cached] of postOutputCache) {
                    if (visibleNodeIds.has(cachedNodeId)) continue;
                    cached.preview.dispose?.();
                    cached.pipeline.dispose();
                    postOutputCache.delete(cachedNodeId);
                }

                currentRenderer.setScissorTest(false);
                return;
            }

            resizeRendererToFullOverlay();
            currentRenderer.setScissorTest(false);
            currentRenderer.setViewport(0, 0, canvasRect.width, canvasRect.height);
            currentRenderer.setClearColor(0x000000, 0);
            currentRenderer.clear();
            currentRenderer.setScissorTest(true);

            for (const slot of slots) {
                const nodeId = slot.dataset.debugPreviewNodeId;
                if (!nodeId) continue;

                const rect = getCanvasRelativeDebugPreviewRect(slot.getBoundingClientRect(), canvasRect);
                if (!rect) continue;

                visibleNodeIds.add(nodeId);

                currentRenderer.setViewport(rect.x, rect.y, rect.width, rect.height);
                currentRenderer.setScissor(rect.x, rect.y, rect.width, rect.height);

                const material = getMaterial(nodeId);
                if (!material) continue;
                currentMesh.material = material;
                currentRenderer.render(currentScene, currentOrthographicCamera);
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
        };

        const resizeObserver = new ResizeObserver(resizeRendererToFullOverlay);

        async function init() {
            await renderer.init();
            if (isDisposed) {
                renderer.dispose();
                return;
            }
            resizeRendererToFullOverlay();
            container.appendChild(renderer.domElement);
            resizeObserver.observe(container);
            render();
        }

        init().catch((error) => {
            console.error('Node debug preview renderer failed:', error);
        });

        return () => {
            isDisposed = true;
            cancelAnimationFrame(frameIdRef.current);
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
    }, [geometry, setDebugPreviewError]);

    return (
        <div
            ref={containerRef}
            className="absolute inset-0 z-10 pointer-events-none"
            aria-hidden="true"
        />
    );
});
