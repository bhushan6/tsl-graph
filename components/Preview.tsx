'use client';

import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useEditorStore, PreviewMeshType } from '@/store/editor';
import * as THREE from 'three/webgpu'; // Changed to webgpu as per file content
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildTSLMaterial } from '@/lib/tsl-builder';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input'; // Keeping it if instance count uses it or we can replace that too
import { DebouncedInput } from './DebouncedInput';
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

import { Maximize2, Minimize2, Settings2, Camera } from 'lucide-react';
import { Id } from '@/convex/_generated/dataModel';

export function Preview(props: { projectId?: string; hasThumbnail?: boolean }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGPURenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const meshRef = useRef<THREE.Mesh | null>(null);
    const backdropRef = useRef<THREE.Group | null>(null);
    const gridRef = useRef<THREE.GridHelper | null>(null);
    const frameIdRef = useRef<number>(0);
    const initRef = useRef<boolean>(false);

    const previewSettings = useEditorStore((state) => state.previewSettings);
    const updatePreviewSettings = useEditorStore((state) => state.updatePreviewSettings);
    const [isFullScreen, setIsFullScreen] = useState(false);


    const [isReady, setIsReady] = useState(false);

    // Thumbnail generation
    const generateThumbnailUploadUrl = useMutation(api.projects.generateThumbnailUploadUrl);
    const updateThumbnail = useMutation(api.projects.updateThumbnail);
    const nodes = useEditorStore((state) => state.nodes);
    const lastSnapshotNodeCount = useRef(nodes.length);
    // Track if we've done the initial snapshot for this session
    const initialSnapshotTaken = useRef(false);

    const handleDownloadSnapshot = useCallback(() => {
        if (!rendererRef.current) return;

        try {
            const canvas = rendererRef.current.domElement;
            const link = document.createElement('a');
            link.download = `snapshot-${new Date().toISOString()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (err) {
            console.error('Failed to download snapshot:', err);
        }
    }, []);

    const captureSnapshot = useCallback(async () => {
        if (!rendererRef.current || !props.projectId) return;

        try {
            // Convert canvas to blob
            const canvas = rendererRef.current.domElement;
            const blob = await new Promise<Blob | null>((resolve) => {
                canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.7);
            });

            if (!blob) {
                console.error('Failed to create blob from canvas');
                return;
            }

            // Get upload URL from Convex
            const uploadUrl = await generateThumbnailUploadUrl();

            // Upload blob to Convex storage
            const response = await fetch(uploadUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'image/jpeg' },
                body: blob,
            });

            if (!response.ok) {
                throw new Error('Failed to upload thumbnail');
            }

            const { storageId } = await response.json();

            // Update project with new thumbnail (old one will be deleted by mutation)
            await updateThumbnail({
                id: props.projectId as Id<"projects">,
                storageId,
            });
        } catch (err) {
            console.error('Failed to update thumbnail:', err);
        }
    }, [props.projectId, generateThumbnailUploadUrl, updateThumbnail]);

    // Initial snapshot when landing in editor
    useEffect(() => {
        if (isReady && props.projectId && !props.hasThumbnail && !initialSnapshotTaken.current) {
            // Wait a bit for scene to settle/render
            const timeout = setTimeout(() => {
                captureSnapshot();
                initialSnapshotTaken.current = true;
            }, 1000);
            return () => clearTimeout(timeout);
        }
    }, [isReady, props.projectId, props.hasThumbnail, captureSnapshot]);

    // Snapshot every 5 nodes added
    useEffect(() => {
        if (!isReady || !props.projectId) return;

        // If nodes decreased, just sync the ref to avoid getting stuck
        if (nodes.length < lastSnapshotNodeCount.current) {
            lastSnapshotNodeCount.current = nodes.length;
            return;
        }

        // Check if we added 5+ nodes since last snapshot
        if (nodes.length - lastSnapshotNodeCount.current >= 5) {
            // Wait small delay for new node to render
            const timeout = setTimeout(() => {
                captureSnapshot();
                lastSnapshotNodeCount.current = nodes.length;
            }, 1000);
            return () => clearTimeout(timeout);
        }
    }, [nodes.length, isReady, props.projectId, captureSnapshot]);





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

    // Dispose material when it changes
    useEffect(() => {
        return () => {
            material?.dispose();
        };
    }, [material]);

    // Get geometry based on selected mesh (high subdivision for smooth shading)
    const geometry = useMemo(() => {
        const config = previewSettings.config || {};
        let geo: THREE.BufferGeometry;

        switch (previewSettings.mesh) {
            case 'box':
                geo = new THREE.BoxGeometry(
                    config.width ?? 1.5,
                    config.height ?? 1.5,
                    config.depth ?? 1.5,
                    config.widthSegments ?? 1,
                    config.heightSegments ?? 1,
                    config.depthSegments ?? 1
                );
                break;
            case 'torus':
                geo = new THREE.TorusKnotGeometry(
                    config.radiusTorus ?? 0.8,
                    config.tube ?? 0.3,
                    config.tubularSegments ?? 32, // Lower default
                    config.radialSegments ?? 16
                );
                break;
            case 'plane':
                geo = new THREE.PlaneGeometry(
                    config.widthPlane ?? 1,
                    config.heightPlane ?? 1,
                    config.widthSegmentsPlane ?? 1,
                    config.heightSegmentsPlane ?? 1
                );
                break;
            case 'sphere':
            default:
                geo = new THREE.SphereGeometry(
                    config.radius ?? 1,
                    config.widthSegmentsSphere ?? 32,
                    config.heightSegmentsSphere ?? 16
                );
                break;
            case 'cylinder':
                geo = new THREE.CylinderGeometry(
                    config.radiusTop ?? 1,
                    config.radiusBottom ?? 1,
                    config.heightCylinder ?? 1,
                    config.radialSegmentsCylinder ?? 20,
                    config.heightSegmentsCylinder ?? 20,
                    config.openEnded ?? true
                );
                break;
        }

        geo.computeTangents();
        return geo;
    }, [previewSettings.mesh, previewSettings.config]);

    // Dispose geometry when it changes
    useEffect(() => {
        return () => {
            geometry?.dispose();
        };
    }, [geometry]);

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
            const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 2000);
            camera.position.set(3.6, 2, 2);
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
            gridRef.current = gridHelper;

            // Orbit Controls
            const controls = new OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;
            controls.target.set(0, 0, 0);
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

            // Clean up scene
            if (sceneRef.current) {
                sceneRef.current.traverse((object) => {
                    if (object instanceof THREE.Mesh) {
                        object.geometry?.dispose();
                        if (Array.isArray(object.material)) {
                            object.material.forEach(m => m.dispose());
                        } else {
                            object.material?.dispose();
                        }
                    }
                    // Dispose helpers
                    if (object instanceof THREE.GridHelper) {
                        object.dispose();
                    }
                });
                sceneRef.current.clear();
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

        if (previewSettings.isInstanced) {
            mesh = new THREE.InstancedMesh(geometry, material, previewSettings.instanceCount);
            mesh.position.set(0, 0, 0); // Galaxy usually centered
        } else {
            mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(0, 0, 0);
        }

        sceneRef.current.add(mesh);
        meshRef.current = mesh;



    }, [geometry, material, previewSettings.isInstanced, previewSettings.instanceCount]);

    useEffect(() => {
        handleResize();
    }, [isFullScreen])

    useEffect(() => {
        handleResize();
    }, [isFullScreen])

    useEffect(() => {
        handleResize();
    }, [isFullScreen])

    // Sync instance count to InstanceCount nodes
    useEffect(() => {
        const { nodes, updateNodeValue } = useEditorStore.getState();
        const instanceCountNodes = nodes.filter(n => n.data.type === 'geo/instanceCount');

        instanceCountNodes.forEach(node => {
            if (previewSettings.isInstanced) {
                // Only update if value matches to avoid loops (though 100 !== 100 is false, so safe)
                if (node.data.values?.value !== previewSettings.instanceCount) {
                    updateNodeValue(node.id, 'value', previewSettings.instanceCount);
                }
            } else {
                if (node.data.values?.value !== 1) {
                    updateNodeValue(node.id, 'value', 1);
                }
            }
        });
    }, [previewSettings.instanceCount, previewSettings.isInstanced]);

    const meshOptions: { value: PreviewMeshType; name: string }[] = [
        { value: 'sphere', name: 'Sphere' },
        { value: 'box', name: 'Box' },
        { value: 'torus', name: 'Torus' },
        { value: 'plane', name: 'Plane' },
        { value: 'cylinder', name: 'Cylinder' },
    ];

    const hdriOptions = [
        { value: 'none', label: 'None' },
        { value: 'apartment', label: 'Apartment' },
        { value: 'bridge', label: 'Bridge' },
        { value: 'city', label: 'City' },
        { value: 'dawn', label: 'Dawn' },
        { value: 'esplanade', label: 'Esplanade' },
        { value: 'forest', label: 'Forest' },
        { value: 'hall', label: 'Hall' },
        { value: 'lab', label: 'Lab' },
        { value: 'lobby', label: 'Lobby' },
        { value: 'night', label: 'Night' },
        { value: 'park', label: 'Park' },
        { value: 'sky', label: 'Sky' },
        { value: 'studio', label: 'Studio' },
        { value: 'sunrise', label: 'Sunrise' },
        { value: 'sunset', label: 'Sunset' },
        { value: 'venice', label: 'Venice' },
        { value: 'warehouse', label: 'Warehouse' },
        { value: 'workshop', label: 'Workshop' },
    ];

    // Load and apply HDRI environment
    useEffect(() => {
        if (!sceneRef.current || !isReady) return;

        const scene = sceneRef.current;
        const envName = previewSettings.environment;

        if (!envName || envName === 'none') {
            scene.environment = null;
            scene.background = new THREE.Color(0x1a1a1a);
            return;
        }

        const loader = new RGBELoader();
        const url = `https://raw.githubusercontent.com/pmndrs/assets/main/src/hdri/${envName}.hdr`;

        loader.load(
            url,
            (texture) => {
                texture.mapping = THREE.EquirectangularReflectionMapping;
                scene.environment = texture;
                scene.environmentIntensity = previewSettings.environmentIntensity ?? 1;
                if (previewSettings.showEnvironmentBackground) {
                    scene.background = texture;
                } else {
                    scene.background = new THREE.Color(0x1a1a1a);
                }
            },
            undefined,
            (err) => {
                console.error('Failed to load HDRI:', err);
            }
        );

        return () => {
            // Cleanup is handled by scene disposal
        };
    }, [previewSettings.environment, previewSettings.environmentIntensity, previewSettings.showEnvironmentBackground, isReady]);

    // Load and display backdrop model
    useEffect(() => {
        if (!sceneRef.current || !isReady) return;

        const scene = sceneRef.current;

        // Remove existing backdrop if any
        if (backdropRef.current) {
            scene.remove(backdropRef.current);
            backdropRef.current.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.geometry?.dispose();
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material?.dispose();
                    }
                }
            });
            backdropRef.current = null;
        }

        if (!previewSettings.showBackdrop) return;

        const loader = new GLTFLoader();
        loader.load(
            '/clothe-backdrop.glb',
            (gltf) => {
                const model = gltf.scene;
                model.position.set(0, 0, -2);
                model.scale.setScalar(40);
                scene.add(model);
                backdropRef.current = model;
            },
            undefined,
            (err) => {
                console.error('Failed to load backdrop model:', err);
            }
        );

        return () => {
            // Cleanup handled above when showBackdrop changes
        };
    }, [previewSettings.showBackdrop, isReady]);

    // specific effect to toggle grid visibility
    useEffect(() => {
        if (gridRef.current) {
            gridRef.current.visible = !!previewSettings.showGrid;
        }
    }, [previewSettings.showGrid, isReady]);

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

                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleDownloadSnapshot}
                    title="Take Snapshot"
                >
                    <Camera className="h-4 w-4" />
                </Button>

                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Settings2 className="h-4 w-4" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80" align="end">
                        <div className="grid gap-4">
                            <div className="space-y-2">
                                <h4 className="font-medium leading-none">Preview Settings</h4>
                                <p className="text-sm text-muted-foreground">
                                    Configure the preview geometry and instancing.
                                </p>
                            </div>

                            <div className="grid gap-4">
                                <div className="grid grid-cols-2 items-center gap-4">
                                    <Label>Geometry</Label>
                                    <select
                                        className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors"
                                        value={previewSettings.mesh}
                                        onChange={(e) => updatePreviewSettings({ mesh: e.target.value as PreviewMeshType })}
                                    >
                                        {meshOptions.map((opt) => (
                                            <option key={opt.value} value={opt.value}>
                                                {opt.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 items-center gap-4">
                                    <Label>Environment</Label>
                                    <select
                                        className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors"
                                        value={previewSettings.environment || 'none'}
                                        onChange={(e) => updatePreviewSettings({ environment: e.target.value })}
                                    >
                                        {hdriOptions.map((opt) => (
                                            <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {previewSettings.environment && previewSettings.environment !== 'none' && (
                                    <>
                                        <div className="grid grid-cols-2 items-center gap-4">
                                            <Label>Intensity</Label>
                                            <DebouncedInput
                                                type="number"
                                                step={0.1}
                                                min={0}
                                                max={5}
                                                value={previewSettings.environmentIntensity ?? 1}
                                                onChange={(value) => updatePreviewSettings({ environmentIntensity: Number(value) })}
                                                className="h-8"
                                            />
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <Label>Show Background</Label>
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 rounded border-primary"
                                                checked={previewSettings.showEnvironmentBackground ?? false}
                                                onChange={(e) => updatePreviewSettings({ showEnvironmentBackground: e.target.checked })}
                                            />
                                        </div>
                                    </>
                                )}

                                <div className="flex items-center justify-between">
                                    <Label>Show Grid</Label>
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-primary"
                                        checked={previewSettings.showGrid ?? true}
                                        onChange={(e) => updatePreviewSettings({ showGrid: e.target.checked })}
                                    />
                                </div>

                                {/* Geometry Specific Controls */}
                                {previewSettings.mesh === 'box' && (
                                    <>
                                        <div className="grid grid-cols-2 items-center gap-4">
                                            <Label>Size (W/H/D)</Label>
                                            <div className="flex gap-1">
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.width ?? 1.5}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, width: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.height ?? 1.5}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, height: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.depth ?? 1.5}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, depth: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 items-center gap-4">
                                            <Label>Segments</Label>
                                            <div className="flex gap-1">
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.widthSegments ?? 1}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, widthSegments: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.heightSegments ?? 1}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, heightSegments: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.depthSegments ?? 1}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, depthSegments: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                            </div>
                                        </div>
                                    </>
                                )}

                                {previewSettings.mesh === 'sphere' && (
                                    <>
                                        <div className="grid grid-cols-2 items-center gap-4">
                                            <Label>Radius</Label>
                                            <DebouncedInput
                                                type="number"
                                                value={previewSettings.config?.radius ?? 1}
                                                onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, radius: Number(value) } })}
                                                className="h-8"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 items-center gap-4">
                                            <Label>Segments (W/H)</Label>
                                            <div className="flex gap-1">
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.widthSegmentsSphere ?? 32}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, widthSegmentsSphere: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.heightSegmentsSphere ?? 16}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, heightSegmentsSphere: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                            </div>
                                        </div>
                                    </>
                                )}

                                {previewSettings.mesh === 'torus' && (
                                    <>
                                        <div className="grid grid-cols-2 items-center gap-4">
                                            <Label>Radius</Label>
                                            <DebouncedInput
                                                type="number"
                                                value={previewSettings.config?.radiusTorus ?? 0.8}
                                                onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, radiusTorus: Number(value) } })}
                                                className="h-8"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 items-center gap-4">
                                            <Label>Tube</Label>
                                            <DebouncedInput
                                                type="number"
                                                value={previewSettings.config?.tube ?? 0.3}
                                                onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, tube: Number(value) } })}
                                                className="h-8"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 items-center gap-4">
                                            <Label>Segments (T/R)</Label>
                                            <div className="flex gap-1">
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.tubularSegments ?? 32}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, tubularSegments: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.radialSegments ?? 16}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, radialSegments: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                            </div>
                                        </div>
                                    </>
                                )}

                                {previewSettings.mesh === 'plane' && (
                                    <>
                                        <div className="grid grid-cols-2 items-center gap-4">
                                            <Label>Size (W/H)</Label>
                                            <div className="flex gap-1">
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.widthPlane ?? 1}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, widthPlane: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.heightPlane ?? 1}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, heightPlane: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 items-center gap-4">
                                            <Label>Segments (W/H)</Label>
                                            <div className="flex gap-1">
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.widthSegmentsPlane ?? 1}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, widthSegmentsPlane: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.heightSegmentsPlane ?? 1}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, heightSegmentsPlane: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                            </div>
                                        </div>
                                    </>
                                )}

                                {previewSettings.mesh === 'cylinder' && (
                                    <>
                                        <div className="grid grid-cols-2 items-center gap-4">
                                            <Label>Radius (Top/Bot)</Label>
                                            <div className="flex gap-1">
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.radiusTop ?? 1}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, radiusTop: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.radiusBottom ?? 1}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, radiusBottom: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 items-center gap-4">
                                            <Label>Height</Label>
                                            <DebouncedInput
                                                type="number"
                                                value={previewSettings.config?.heightCylinder ?? 1}
                                                onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, heightCylinder: Number(value) } })}
                                                className="h-8"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 items-center gap-4">
                                            <Label>Segments (R/H)</Label>
                                            <div className="flex gap-1">
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.radialSegmentsCylinder ?? 20}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, radialSegmentsCylinder: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.heightSegmentsCylinder ?? 20}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, heightSegmentsCylinder: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <Label>Open Ended</Label>
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 rounded border-primary"
                                                checked={previewSettings.config?.openEnded ?? true}
                                                onChange={(e) => updatePreviewSettings({ config: { ...previewSettings.config, openEnded: e.target.checked } })}
                                            />
                                        </div>
                                    </>
                                )}

                                <div className="h-[1px] bg-border my-1" />

                                <div className="flex items-center justify-between">
                                    <Label>Show Backdrop</Label>
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-primary"
                                        checked={previewSettings.showBackdrop ?? false}
                                        onChange={(e) => updatePreviewSettings({ showBackdrop: e.target.checked })}
                                    />
                                </div>

                                <div className="flex items-center justify-between">
                                    <Label>Instancing</Label>
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-primary"
                                        checked={previewSettings.isInstanced}
                                        onChange={(e) => updatePreviewSettings({ isInstanced: e.target.checked })}
                                    />
                                </div>
                                {previewSettings.isInstanced && (
                                    <div className="grid grid-cols-2 items-center gap-4">
                                        <Label>Instance Count</Label>
                                        <Input
                                            type="number"
                                            value={previewSettings.instanceCount}
                                            onChange={(e) => updatePreviewSettings({ instanceCount: Number(e.target.value) })}
                                            className="h-8"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
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
