'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import { useEditorStore } from '@/store/editor';
import * as THREE from 'three/webgpu'; // Changed to webgpu as per file content
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildTSLMaterial } from '@/lib/tsl-builder';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type PreviewMesh = 'sphere' | 'cube' | 'torus' | 'plane';

export function Preview() {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGPURenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const meshRef = useRef<THREE.Mesh | null>(null);
    const frameIdRef = useRef<number>(0);
    const initRef = useRef<boolean>(false);

    const [isExpanded, setIsExpanded] = useState(false);
    const [currentMesh, setCurrentMesh] = useState<PreviewMesh>('sphere');
    const [error, setError] = useState<string | null>(null);
    const [isReady, setIsReady] = useState(false);


    const graphStructureVersion = useEditorStore((state) => state.graphStructureVersion);
    const nodes = useEditorStore((state) => state.nodes);
    const edges = useEditorStore((state) => state.edges);
    const subgraphs = useEditorStore((state) => state.subgraphs);
    const codeNodes = useEditorStore((state) => state.codeNodes);



    // Build material from graph
    const material = useMemo(() => {
        if (!isReady) return null;
        try {
            setError(null);
            return buildTSLMaterial(nodes, edges, subgraphs, codeNodes);
        } catch (e) {
            console.error('Material build error:', e);
            setError(e instanceof Error ? e.message : 'Failed to build material');
            return new THREE.MeshStandardMaterial({ color: 0x888888 });
        }
    }, [graphStructureVersion, isReady]);

    // Get geometry based on selected mesh (high subdivision for smooth shading)
    const geometry = useMemo(() => {
        switch (currentMesh) {
            case 'cube':
                return new THREE.BoxGeometry(1.5, 1.5, 1.5, 64, 64, 64);
            case 'torus':
                return new THREE.TorusKnotGeometry(0.8, 0.3, 256, 64);
            case 'plane':
                return new THREE.PlaneGeometry(2, 2, 128, 128);
            case 'sphere':
            default:
                return new THREE.SphereGeometry(1, 128, 128);
        }
    }, [currentMesh]);

    // Initialize Three.js with WebGPU
    useEffect(() => {
        if (!containerRef.current || initRef.current) return;
        initRef.current = true;

        const container = containerRef.current;

        async function init() {
            const width = container.clientWidth;
            const height = container.clientHeight;

            // Scene
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x1a1a1a);
            sceneRef.current = scene;

            // Camera
            const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
            camera.position.set(3, 2, 3);
            camera.lookAt(0, 0, 0);
            cameraRef.current = camera;

            // WebGPU Renderer
            const renderer = new THREE.WebGPURenderer({ antialias: true });
            await renderer.init();
            renderer.setSize(width, height);
            renderer.setPixelRatio(window.devicePixelRatio);
            container.appendChild(renderer.domElement);
            rendererRef.current = renderer;

            // Lights
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
            scene.add(ambientLight);

            const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
            directionalLight.position.set(5, 5, 5);
            scene.add(directionalLight);

            // Grid helper
            const gridHelper = new THREE.GridHelper(10, 10, 0x333333, 0x333333);
            scene.add(gridHelper);

            // Orbit Controls
            const controls = new OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;
            controls.target.set(0, 0.75, 0);
            controls.update();
            controlsRef.current = controls;

            setIsReady(true);

            // Animation loop
            const animate = () => {
                frameIdRef.current = requestAnimationFrame(animate);
                controls.update();
                renderer.render(scene, camera);
            };
            animate();
        }

        init().catch(console.error);

        // Handle resize
        const handleResize = () => {
            if (!rendererRef.current || !cameraRef.current) return;
            const w = container.clientWidth;
            const h = container.clientHeight;
            cameraRef.current.aspect = w / h;
            cameraRef.current.updateProjectionMatrix();
            rendererRef.current.setSize(w, h);
        };

        const resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(container);

        return () => {
            cancelAnimationFrame(frameIdRef.current);
            resizeObserver.disconnect();
            if (controlsRef.current) {
                controlsRef.current.dispose();
            }
            if (rendererRef.current) {
                rendererRef.current.dispose();
                if (container.contains(rendererRef.current.domElement)) {
                    container.removeChild(rendererRef.current.domElement);
                }
            }
        };
    }, []);

    // Update mesh when geometry or material changes
    useEffect(() => {
        if (!sceneRef.current || !material) return;

        // Remove old mesh
        if (meshRef.current) {
            sceneRef.current.remove(meshRef.current);
            meshRef.current.geometry.dispose();
        }

        // Create new mesh
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(0, 0.75, 0);
        sceneRef.current.add(mesh);
        meshRef.current = mesh;

        return () => {
            geometry.dispose();
        };
    }, [geometry, material]);

    const meshOptions: { value: PreviewMesh; name: string }[] = [
        { value: 'sphere', name: 'Sphere' },
        { value: 'cube', name: 'Cube' },
        { value: 'torus', name: 'Torus' },
        { value: 'plane', name: 'Plane' },
    ];

    return (
        <div
            className={cn(
                'pointer-events-auto relative bg-card border border-border rounded-xl shadow-lg overflow-hidden transition-all duration-200',
                isExpanded ? 'w-96 h-96' : 'w-72 h-72'
            )}
        >
            <div className="absolute top-2 right-2 z-10">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-auto px-2 text-xs">
                            {meshOptions.find((opt) => opt.value === currentMesh)?.name}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Geometry</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                            {meshOptions.map((opt) => (
                                <DropdownMenuItem
                                    key={opt.value}
                                    onClick={() => setCurrentMesh(opt.value)}
                                >
                                    <span>{opt.name}</span>
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Error display */}
            {error && (
                <div className="absolute bottom-2 left-2 right-2 z-10 bg-destructive/80 text-destructive-foreground text-xs p-2 rounded">
                    {error}
                </div>
            )}

            {/* Loading state */}
            {!isReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-card">
                    <span className="text-xs text-muted-foreground">Initializing WebGPU...</span>
                </div>
            )}

            {/* Canvas container */}
            <div ref={containerRef} className="w-full h-full" />
        </div>
    );
}
