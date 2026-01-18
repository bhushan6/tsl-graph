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

import { Maximize2, Minimize2 } from 'lucide-react';

export function Preview() {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGPURenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const meshRef = useRef<THREE.Mesh | null>(null);
    const frameIdRef = useRef<number>(0);
    const initRef = useRef<boolean>(false);

    const [currentMesh, setCurrentMesh] = useState<PreviewMesh>('sphere');
    const isInstanced = useEditorStore((state) => state.isInstanced);
    const setIsInstanced = useEditorStore((state) => state.setIsInstanced);
    const instanceCount = useEditorStore((state) => state.instanceCount);
    const setInstanceCount = useEditorStore((state) => state.setInstanceCount);
    const [isFullScreen, setIsFullScreen] = useState(false);

    const [isReady, setIsReady] = useState(false);



    const graphStructureVersion = useEditorStore((state) => state.graphStructureVersion);



    // Build material from graph
    const { material, error } = useMemo(() => {
        if (!isReady) return { material: null, error: null };
        try {
            const { nodes, edges, subgraphs, codeNodes } = useEditorStore.getState();
            // Pass instanceCount to the builder so it's available in the scope (if needed)
            // Even though we moved to baking it into the compiled code, 
            // the builder might still use it for other things or future proofing.
            // But wait, compileGraph uses the NODE's value. 
            // buildTSLMaterial calls compileGraph.
            // So we don't strictly need to pass it to buildTSLMaterial if the nodes are already updated.
            return {
                material: buildTSLMaterial(nodes, edges, subgraphs, codeNodes),
                error: null
            };
        } catch (e) {
            console.error('Material build error:', e);
            return {
                material: new THREE.MeshStandardMaterial({ color: 0x888888 }),
                error: e instanceof Error ? e.message : 'Failed to build material'
            };
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

    const handleResize = () => {
        if (!rendererRef.current || !cameraRef.current || !containerRef.current) return;
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        cameraRef.current.aspect = w / h;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(w, h);
    };

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
            if (meshRef.current instanceof THREE.InstancedMesh) {
                meshRef.current.dispose();
            }
        }

        let mesh: THREE.Mesh;

        if (isInstanced) {
            mesh = new THREE.InstancedMesh(geometry, material, instanceCount);
            mesh.position.set(0, 0, 0); // Galaxy usually centered
            // We don't need to set matrices if the material handles positioning via storage/attributes,
            // BUT for TSL SpriteNodeMaterial examples, it often uses instanceIndex.
            // If it's a TSL example relying on `range(0, count)`, the dummy matrices are fine.
            // If it relies on standard instanceMatrix, we might need to populate it.
            // For the specific Galaxy example, it uses `range(0, 1).mul(size)` for scale
            // and `range(0, 1)` for other calc.
            // It essentially needs TSL to handle position.
            // Standard InstancedMesh initialized with identity matrices is usually enough if TSL overrides position.

            // However, to be safe, let's fill it with dummy data so it renders if TSL doesn't fully override
            for (let i = 0; i < instanceCount; i++) {
                const matrix = new THREE.Matrix4();
                matrix.setPosition(0, 0, 0);
                (mesh as THREE.InstancedMesh).setMatrixAt(i, matrix);
            }
        } else {
            mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(0, 0, 0);
        }

        sceneRef.current.add(mesh);
        meshRef.current = mesh;

    }, [geometry, material, isInstanced, instanceCount]);

    useEffect(() => {
        handleResize();
    }, [isFullScreen])

    // Sync instance count to InstanceCount nodes
    useEffect(() => {
        const { nodes, updateNodeValue } = useEditorStore.getState();
        const instanceCountNodes = nodes.filter(n => n.data.type === 'geo/instanceCount');

        instanceCountNodes.forEach(node => {
            if (isInstanced) {
                // Only update if value matches to avoid loops (though 100 !== 100 is false, so safe)
                if (node.data.values?.value !== instanceCount) {
                    updateNodeValue(node.id, 'value', instanceCount);
                }
            } else {
                if (node.data.values?.value !== 1) {
                    updateNodeValue(node.id, 'value', 1);
                }
            }
        });
    }, [instanceCount, isInstanced]);

    const meshOptions: { value: PreviewMesh; name: string }[] = [
        { value: 'sphere', name: 'Sphere' },
        { value: 'cube', name: 'Cube' },
        { value: 'torus', name: 'Torus' },
        { value: 'plane', name: 'Plane' },
    ];

    return (
        <div
            className={cn(
                'pointer-events-auto bg-card border border-border overflow-hidden transition-all duration-200',
                isFullScreen
                    ? 'fixed inset-4 z-50 rounded-xl shadow-2xl '
                    : 'relative rounded-xl shadow-lg w-72 h-72'
            )}
        >
            <div className="absolute top-2 right-2 z-10 flex gap-1">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setIsFullScreen(!isFullScreen)}
                >
                    {isFullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
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

                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>Instancing</DropdownMenuLabel>
                        <div className="p-2 flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <label className="text-xs">Enable</label>
                                <input
                                    type="checkbox"
                                    checked={isInstanced}
                                    onChange={(e) => setIsInstanced(e.target.checked)}
                                />
                            </div>
                            {isInstanced && (
                                <div className="flex items-center gap-2">
                                    <label className="text-xs">Count</label>
                                    <input
                                        type="number"
                                        value={instanceCount}
                                        onChange={(e) => setInstanceCount(Number(e.target.value))}
                                        className="w-16 h-6 text-xs border rounded px-1 text-black"
                                    />
                                </div>
                            )}
                        </div>
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
