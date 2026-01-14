'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import { useEditorStore } from '@/store/editor';
import * as THREE from 'three/webgpu';
import { buildNodePreviewMaterial } from '@/lib/tsl-builder';
import { MATERIAL_NODE_TYPES } from '@/lib/nodes';

/**
 * NodePreview - Shows a live preview of the selected node's output.
 * Uses a fullscreen quad with orthographic camera for undistorted UV-based preview.
 */
export function NodePreview() {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGPURenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const meshRef = useRef<THREE.Mesh | null>(null);
    const frameIdRef = useRef<number>(0);
    const initRef = useRef<boolean>(false);

    const [error, setError] = useState<string | null>(null);
    const [isReady, setIsReady] = useState(false);

    // Store subscriptions
    const graphStructureVersion = useEditorStore((state) => state.graphStructureVersion);
    const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
    const nodes = useEditorStore((state) => state.nodes);
    const edges = useEditorStore((state) => state.edges);
    const subgraphs = useEditorStore((state) => state.subgraphs);
    const codeNodes = useEditorStore((state) => state.codeNodes);

    // Check if selected node should show preview
    const selectedNode = useMemo(() => {
        return nodes.find(n => n.id === selectedNodeId);
    }, [nodes, selectedNodeId]);

    const shouldShowPreview = useMemo(() => {
        if (!selectedNode) return false;
        // Don't show preview for material nodes or anchor nodes
        if ((MATERIAL_NODE_TYPES as readonly string[]).includes(selectedNode.data.type)) return false;
        if (selectedNode.data.type === 'subgraph/input' || selectedNode.data.type === 'subgraph/output') return false;
        if (selectedNode.type === 'group') return false;
        return true;
    }, [selectedNode]);

    // Build preview material using useEffect to avoid setState in useMemo
    const [material, setMaterial] = useState<THREE.Material | null>(null);

    useEffect(() => {
        if (!isReady || !shouldShowPreview || !selectedNodeId) {
            setMaterial(null);
            setError(null);
            return;
        }
        try {
            setError(null);
            const mat = buildNodePreviewMaterial(selectedNodeId, nodes, edges, subgraphs, codeNodes);
            setMaterial(mat);
        } catch (e) {
            console.error('Preview material build error:', e);
            setError(e instanceof Error ? e.message : 'Failed to build preview');
            setMaterial(null);
        }
    }, [graphStructureVersion, isReady, shouldShowPreview, selectedNodeId, nodes, edges, subgraphs, codeNodes]);

    // Initialize Three.js with WebGPU
    useEffect(() => {
        if (!containerRef.current || initRef.current) return;
        initRef.current = true;

        const container = containerRef.current;

        async function init() {
            // Get initial size from container
            const width = container.clientWidth || 150;
            const height = container.clientHeight || 150;

            // Scene
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x1a1a1a);
            sceneRef.current = scene;

            // Perspective camera for 3D preview (similar to main Preview)
            const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
            camera.position.set(0, 0, 3);
            camera.lookAt(0, 0, 0);
            cameraRef.current = camera;

            // WebGPU Renderer
            const renderer = new THREE.WebGPURenderer({ antialias: true });
            await renderer.init();
            renderer.setSize(width, height);
            renderer.setPixelRatio(window.devicePixelRatio);
            container.appendChild(renderer.domElement);
            rendererRef.current = renderer;

            // Lighting (similar to main Preview)
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
            scene.add(ambientLight);

            const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
            directionalLight.position.set(3, 3, 3);
            scene.add(directionalLight);

            // Sphere geometry (similar to main Preview)
            const geometry = new THREE.SphereGeometry(1, 64, 64);
            const defaultMaterial = new THREE.MeshBasicNodeMaterial();
            defaultMaterial.color = new THREE.Color(0x333333);

            const mesh = new THREE.Mesh(geometry, defaultMaterial);
            scene.add(mesh);
            meshRef.current = mesh;

            setIsReady(true);

            // Animation loop with slow rotation for better visualization
            const animate = () => {
                frameIdRef.current = requestAnimationFrame(animate);
                if (meshRef.current) {
                    meshRef.current.rotation.y += 0.005;
                }
                renderer.render(scene, camera);
            };
            animate();
        }

        init().catch(console.error);

        // Handle resize with ResizeObserver
        const handleResize = () => {
            if (!rendererRef.current || !cameraRef.current || !containerRef.current) return;
            const w = containerRef.current.clientWidth;
            const h = containerRef.current.clientHeight;
            if (w > 0 && h > 0) {
                rendererRef.current.setSize(w, h);
                // Update camera aspect ratio for perspective camera
                cameraRef.current.aspect = w / h;
                cameraRef.current.updateProjectionMatrix();
            }
        };

        const resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(container);

        return () => {
            resizeObserver.disconnect();
            cancelAnimationFrame(frameIdRef.current);
            if (rendererRef.current) {
                rendererRef.current.dispose();
                if (container.contains(rendererRef.current.domElement)) {
                    container.removeChild(rendererRef.current.domElement);
                }
            }
        };
    }, []);

    // Update mesh material when it changes
    useEffect(() => {
        if (!meshRef.current || !material) return;
        meshRef.current.material = material;
    }, [material]);

    // Don't render if we shouldn't show preview
    if (!shouldShowPreview) {
        return null;
    }

    return (
        <div className="flex flex-col gap-2 mb-4">
            <label className="text-[10px] font-medium text-sidebar-foreground/70 uppercase tracking-wider">
                Preview
            </label>
            <div className="relative w-full aspect-square rounded-lg overflow-hidden border border-sidebar-border bg-card">
                {/* Error display */}
                {error && (
                    <div className="absolute inset-0 flex items-center justify-center bg-destructive/20 text-destructive text-xs p-2 text-center">
                        {error}
                    </div>
                )}

                {/* Loading state */}
                {!isReady && (
                    <div className="absolute inset-0 flex items-center justify-center bg-card">
                        <span className="text-xs text-muted-foreground">Initializing...</span>
                    </div>
                )}

                {/* Canvas container */}
                <div ref={containerRef} className="w-full h-full" />
            </div>
        </div>
    );
}
