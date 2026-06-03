'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three/webgpu';
import { buildNodePreviewMaterial } from '@/lib/tsl-builder';
import { getCanvasRelativeDebugPreviewRect } from '@/lib/debug-preview';
import { useEditorStore } from '@/store/editor';

interface CachedMaterial {
    version: number;
    material: THREE.Material;
}

const DEBUG_PREVIEW_SELECTOR = '[data-debug-preview-node-id]';

export function NodeDebugPreviewOverlay() {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGPURenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const meshRef = useRef<THREE.Mesh | null>(null);
    const orthographicCameraRef = useRef<THREE.OrthographicCamera | null>(null);
    const frameIdRef = useRef<number>(0);
    const materialCacheRef = useRef<Map<string, CachedMaterial>>(new Map());
    const graphStructureVersionRef = useRef(0);
    const isMountedRef = useRef(false);

    const graphStructureVersion = useEditorStore((state) => state.graphStructureVersion);
    const editorMode = useEditorStore((state) => state.editorMode);
    const editingSubgraphId = useEditorStore((state) => state.editingSubgraphId);
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
    }, [graphStructureVersion]);

    useEffect(() => {
        materialCacheRef.current.forEach((entry) => entry.material.dispose());
        materialCacheRef.current.clear();
    }, [editorMode, editingSubgraphId]);

    useEffect(() => {
        if (!containerRef.current || isMountedRef.current) return;
        isMountedRef.current = true;
        let isDisposed = false;

        const container = containerRef.current;
        const materialCache = materialCacheRef.current;
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

        const resizeRenderer = () => {
            const width = container.clientWidth;
            const height = container.clientHeight;
            if (width <= 0 || height <= 0) return;
            renderer.setPixelRatio(window.devicePixelRatio);
            renderer.setSize(width, height, false);
            renderer.domElement.style.width = '100%';
            renderer.domElement.style.height = '100%';
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

            resizeRenderer();

            const canvasRect = container.getBoundingClientRect();
            currentRenderer.setScissorTest(false);
            currentRenderer.setViewport(0, 0, canvasRect.width, canvasRect.height);
            currentRenderer.setClearColor(0x000000, 0);
            currentRenderer.clear();
            currentRenderer.setScissorTest(true);

            const visibleNodeIds = new Set<string>();
            const slots = Array.from(
                document.querySelectorAll<HTMLElement>(DEBUG_PREVIEW_SELECTOR)
            );

            for (const slot of slots) {
                const nodeId = slot.dataset.debugPreviewNodeId;
                if (!nodeId) continue;

                const rect = getCanvasRelativeDebugPreviewRect(slot.getBoundingClientRect(), canvasRect);
                if (!rect) continue;

                const material = getMaterial(nodeId);
                if (!material) continue;

                visibleNodeIds.add(nodeId);
                currentMesh.material = material;

                currentRenderer.setViewport(rect.x, rect.y, rect.width, rect.height);
                currentRenderer.setScissor(rect.x, rect.y, rect.width, rect.height);
                currentRenderer.render(currentScene, currentOrthographicCamera);
            }

            for (const [nodeId, cached] of materialCache) {
                if (!visibleNodeIds.has(nodeId)) continue;
                if (cached.version !== graphStructureVersionRef.current) {
                    cached.material.dispose();
                    materialCache.delete(nodeId);
                }
            }

            currentRenderer.setScissorTest(false);
        };

        const resizeObserver = new ResizeObserver(resizeRenderer);

        async function init() {
            await renderer.init();
            if (isDisposed) {
                renderer.dispose();
                return;
            }
            resizeRenderer();
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
}
