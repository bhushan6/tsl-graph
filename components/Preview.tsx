'use client';

import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useEditorStore, PreviewMeshType } from '@/store/editor';
import * as THREE from 'three/webgpu'; // Changed to webgpu as per file content
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
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

import { Maximize2, Minimize2, Settings2, Camera, Box, Trash2, Plus, Eye, EyeOff, Move, RotateCcw, Scale } from 'lucide-react';
import { Id } from '@/convex/_generated/dataModel';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { SceneObject } from '@/store/editor';

export function Preview(props: { projectId?: string; hasThumbnail?: boolean }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGPURenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const transformControlsRef = useRef<TransformControls | null>(null);
    const meshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
    const backdropRef = useRef<THREE.Group | null>(null);
    const gridRef = useRef<THREE.GridHelper | null>(null);
    const frameIdRef = useRef<number>(0);
    const initRef = useRef<boolean>(false);

    const previewSettings = useEditorStore((state) => state.previewSettings);
    const updatePreviewSettings = useEditorStore((state) => state.updatePreviewSettings);
    const sceneObjects = previewSettings.sceneObjects;
    const selectedObjectId = previewSettings.selectedObjectId;
    const addSceneObject = useEditorStore((state) => state.addSceneObject);
    const removeSceneObject = useEditorStore((state) => state.removeSceneObject);
    const updateSceneObject = useEditorStore((state) => state.updateSceneObject);
    const setSelectedObject = useEditorStore((state) => state.setSelectedObject);

    const [isFullScreen, setIsFullScreen] = useState(false);
    const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');


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

            console.log('Thumbnail updated');
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

    // Get geometry helper
    const createGeometry = useCallback((type: PreviewMeshType, config: any) => {
        let geo: THREE.BufferGeometry;

        switch (type) {
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
                    config.tubularSegments ?? 32,
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
    }, []);

    // Dispose all meshes
    const disposeMeshes = useCallback(() => {
        if (sceneRef.current) {
            meshesRef.current.forEach((mesh) => {
                sceneRef.current?.remove(mesh);
                mesh.geometry?.dispose();
                if (mesh instanceof THREE.InstancedMesh) {
                    mesh.dispose();
                }
            });
            meshesRef.current.clear();
        }
    }, []);

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

            // Transform Controls
            const transformControls = new TransformControls(camera, renderer.domElement);
            transformControls.addEventListener('dragging-changed', (event) => {
                controls.enabled = !event.value;
            });

            transformControls.addEventListener('objectChange', () => {
                const object = transformControls.object;
                if (object) {
                    const id = [...meshesRef.current.entries()].find(([_, mesh]) => mesh === object)?.[0];
                    if (id) {
                        const position: [number, number, number] = [object.position.x, object.position.y, object.position.z];
                        const rotation: [number, number, number] = [object.rotation.x, object.rotation.y, object.rotation.z];
                        const scale: [number, number, number] = [object.scale.x, object.scale.y, object.scale.z];

                        // Use a debounced or throttled update if needed, but for now direct update
                        useEditorStore.getState().updateSceneObject(id, { position, rotation, scale });
                    }
                }
            });

            scene.add(transformControls.getHelper());
            transformControlsRef.current = transformControls;

            // Click to select
            const raycaster = new THREE.Raycaster();
            const mouse = new THREE.Vector2();

            const onPointerDown = (event: PointerEvent) => {
                if (!containerRef.current || !cameraRef.current) return;
                
                const rect = containerRef.current.getBoundingClientRect();
                mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

                raycaster.setFromCamera(mouse, cameraRef.current);
                const intersects = raycaster.intersectObjects([...meshesRef.current.values()]);

                if (intersects.length > 0) {
                    const object = intersects[0].object;
                    const id = [...meshesRef.current.entries()].find(([_, mesh]) => mesh === object)?.[0];
                    if (id) {
                        useEditorStore.getState().setSelectedObject(id);
                    }
                }
            };

            container.addEventListener('pointerdown', onPointerDown);

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

    // Update meshes when sceneObjects, material, or instancing changes
    useEffect(() => {
        if (!sceneRef.current || !material || !isReady) return;

        const scene = sceneRef.current;
        const currentObjectIds = new Set(sceneObjects.map(obj => obj.id));

        // Remove old meshes
        for (const [id, mesh] of meshesRef.current.entries()) {
            if (!currentObjectIds.has(id)) {
                scene.remove(mesh);
                mesh.geometry?.dispose();
                if (mesh instanceof THREE.InstancedMesh) {
                    mesh.dispose();
                }
                meshesRef.current.delete(id);
            }
        }

        // Add or update meshes
        sceneObjects.forEach(obj => {
            let mesh = meshesRef.current.get(obj.id);
            const geo = createGeometry(obj.type, obj.config);

            if (!mesh) {
                // If instanced and is the default mesh, create instanced mesh
                if (previewSettings.isInstanced && obj.id === 'default-mesh') {
                    mesh = new THREE.InstancedMesh(geo, material, previewSettings.instanceCount);
                } else {
                    mesh = new THREE.Mesh(geo, material);
                }
                scene.add(mesh);
                meshesRef.current.set(obj.id, mesh);
            } else {
                // Check if we need to switch between regular and instanced mesh for default-mesh
                const isCurrentlyInstanced = mesh instanceof THREE.InstancedMesh;
                const shouldBeInstanced = previewSettings.isInstanced && obj.id === 'default-mesh';

                if (isCurrentlyInstanced !== shouldBeInstanced) {
                    scene.remove(mesh);
                    mesh.geometry?.dispose();
                    if (mesh instanceof THREE.InstancedMesh) {
                        mesh.dispose();
                    }
                    
                    if (shouldBeInstanced) {
                        mesh = new THREE.InstancedMesh(geo, material, previewSettings.instanceCount);
                    } else {
                        mesh = new THREE.Mesh(geo, material);
                    }
                    scene.add(mesh);
                    meshesRef.current.set(obj.id, mesh);
                } else {
                    // Update existing mesh geometry and material
                    if (mesh.geometry) mesh.geometry.dispose();
                    mesh.geometry = geo;
                    mesh.material = material;
                    
                    if (mesh instanceof THREE.InstancedMesh && mesh.count !== previewSettings.instanceCount) {
                        // For simplicity, recreate instanced mesh if count changes
                        scene.remove(mesh);
                        mesh.dispose();
                        mesh = new THREE.InstancedMesh(geo, material, previewSettings.instanceCount);
                        scene.add(mesh);
                        meshesRef.current.set(obj.id, mesh);
                    }
                }
            }

            // Update transform
            mesh.position.set(...obj.position);
            mesh.rotation.set(...obj.rotation);
            mesh.scale.set(...obj.scale);
            mesh.visible = obj.visible;
        });

    }, [sceneObjects, material, previewSettings.isInstanced, previewSettings.instanceCount, isReady, createGeometry]);

    // Handle selection and transform controls
    useEffect(() => {
        if (!transformControlsRef.current || !isReady) return;

        const transformControls = transformControlsRef.current;
        const selectedMesh = selectedObjectId ? meshesRef.current.get(selectedObjectId) : null;

        if (selectedMesh && isFullScreen) {
            transformControls.attach(selectedMesh);
            transformControls.setMode(transformMode);
            transformControls.visible = true;
        } else {
            transformControls.detach();
            transformControls.visible = false;
        }
    }, [selectedObjectId, transformMode, isFullScreen, isReady]);

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

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isFullScreen) return;
            switch (e.key.toLowerCase()) {
                case 'w': setTransformMode('translate'); break;
                case 'e': setTransformMode('rotate'); break;
                case 'r': setTransformMode('scale'); break;
                case 'delete':
                case 'backspace':
                    if (selectedObjectId && selectedObjectId !== 'default-mesh') {
                        removeSceneObject(selectedObjectId);
                    }
                    break;
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isFullScreen, selectedObjectId, removeSceneObject]);

    const selectedObject = useMemo(() => 
        sceneObjects.find(obj => obj.id === selectedObjectId),
    [sceneObjects, selectedObjectId]);

    const updateSelectedObjectConfig = useCallback((updates: any) => {
        if (selectedObjectId) {
            const obj = sceneObjects.find(o => o.id === selectedObjectId);
            if (obj) {
                updateSceneObject(selectedObjectId, {
                    config: { ...obj.config, ...updates }
                });
            }
        }
    }, [selectedObjectId, sceneObjects, updateSceneObject]);

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
                    ? 'fixed inset-4 z-50 rounded-xl shadow-2xl flex'
                    : 'relative rounded-xl shadow-lg w-72 h-72'
            )}
        >
            {isFullScreen && (
                <div className="w-64 border-r border-border flex flex-col bg-background shrink-0">
                    <div className="p-3 border-b border-border flex items-center justify-between">
                        <span className="font-semibold text-sm">Scene Graph</span>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6">
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-40 p-1" align="start">
                                {meshOptions.map(opt => (
                                    <Button
                                        key={opt.value}
                                        variant="ghost"
                                        className="w-full justify-start h-8 text-xs"
                                        onClick={() => addSceneObject(opt.value)}
                                    >
                                        <Box className="mr-2 h-3 w-3" />
                                        {opt.name}
                                    </Button>
                                ))}
                            </PopoverContent>
                        </Popover>
                    </div>
                    <ScrollArea className="flex-1 p-2">
                        <div className="space-y-1">
                            {sceneObjects.map(obj => (
                                <div
                                    key={obj.id}
                                    className={cn(
                                        "group flex items-center gap-2 px-2 py-1.5 rounded-md text-sm cursor-pointer transition-colors",
                                        selectedObjectId === obj.id ? "bg-primary/10 text-primary" : "hover:bg-accent"
                                    )}
                                    onClick={() => setSelectedObject(obj.id)}
                                >
                                    <Box className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    <span className="flex-1 truncate">{obj.name}</span>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            className="hover:text-primary transition-colors"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                updateSceneObject(obj.id, { visible: !obj.visible });
                                            }}
                                        >
                                            {obj.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                                        </button>
                                        {obj.id !== 'default-mesh' && (
                                            <button
                                                className="hover:text-destructive transition-colors"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeSceneObject(obj.id);
                                                }}
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </div>
            )}

            <div className="flex-1 relative flex flex-col min-w-0">
                <div className="absolute top-2 left-2 right-2 z-10 flex justify-between items-start pointer-events-none">
                    <div className="flex flex-col gap-2">
                        {isFullScreen && (
                            <div className="bg-background/90 backdrop-blur shadow-sm border border-border rounded-md p-0.5 flex pointer-events-auto">
                                <Button
                                    variant={transformMode === 'translate' ? 'secondary' : 'ghost'}
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setTransformMode('translate')}
                                    title="Translate (W)"
                                >
                                    <Move className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant={transformMode === 'rotate' ? 'secondary' : 'ghost'}
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setTransformMode('rotate')}
                                    title="Rotate (E)"
                                >
                                    <RotateCcw className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant={transformMode === 'scale' ? 'secondary' : 'ghost'}
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setTransformMode('scale')}
                                    title="Scale (R)"
                                >
                                    <Scale className="h-4 w-4" />
                                </Button>
                            </div>
                        )}
                        
                        <div className="flex gap-1 pointer-events-auto">
                            <Button
                                variant="secondary"
                                size="icon"
                                className="h-8 w-8 bg-background/90 backdrop-blur border border-border shadow-sm"
                                onClick={() => setIsFullScreen(!isFullScreen)}
                            >
                                {isFullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                            </Button>

                            <Button
                                variant="secondary"
                                size="icon"
                                className="h-8 w-8 bg-background/90 backdrop-blur border border-border shadow-sm"
                                onClick={handleDownloadSnapshot}
                                title="Take Snapshot"
                            >
                                <Camera className="h-4 w-4" />
                            </Button>

                            {!isFullScreen && (
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="secondary" size="icon" className="h-8 w-8 bg-background/90 backdrop-blur border border-border shadow-sm">
                                            <Settings2 className="h-4 w-4" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80" align="end">
                                        <div className="grid gap-4">
                                            <div className="space-y-2">
                                                <h4 className="font-medium leading-none">Preview Settings</h4>
                                                <p className="text-sm text-muted-foreground">
                                                    Configure the preview geometry and environment.
                                                </p>
                                            </div>

                                            <div className="grid gap-4">
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
                            )}
                        </div>
                    </div>
                </div>

                <div ref={containerRef} className="w-full h-full" />

                {error && (
                    <div className="absolute bottom-4 left-4 right-4 z-10 bg-destructive/90 text-destructive-foreground text-xs p-3 rounded-lg shadow-lg backdrop-blur-sm">
                        {error}
                    </div>
                )}
            </div>

            {isFullScreen && (
                <div className="w-80 border-l border-border flex flex-col bg-background shrink-0">
                    <Tabs defaultValue="properties" className="flex-1 flex flex-col">
                        <div className="p-1 border-b border-border bg-muted/30">
                            <TabsList className="w-full h-8">
                                <TabsTrigger value="properties" className="flex-1 text-xs">Properties</TabsTrigger>
                                <TabsTrigger value="scene" className="flex-1 text-xs">Scene</TabsTrigger>
                            </TabsList>
                        </div>

                        <TabsContent value="properties" className="flex-1 m-0 overflow-hidden flex flex-col">
                            {selectedObject ? (
                                <ScrollArea className="flex-1">
                                    <div className="p-4 space-y-6">
                                        <div className="space-y-3">
                                            <Label className="text-[10px] uppercase text-muted-foreground font-bold">Mesh Info</Label>
                                            <div className="grid gap-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs">Name</span>
                                                    <Input 
                                                        className="h-7 text-xs w-2/3" 
                                                        value={selectedObject.name} 
                                                        onChange={(e) => updateSceneObject(selectedObject.id, { name: e.target.value })}
                                                    />
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs">Type</span>
                                                    <select
                                                        className="h-7 w-2/3 rounded-md border border-input bg-background px-2 py-0 text-xs"
                                                        value={selectedObject.type}
                                                        onChange={(e) => updateSceneObject(selectedObject.id, { type: e.target.value as PreviewMeshType })}
                                                    >
                                                        {meshOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.name}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>

                                        <Separator />

                                        <div className="space-y-3">
                                            <Label className="text-[10px] uppercase text-muted-foreground font-bold">Transform</Label>
                                            <div className="grid gap-3">
                                                <div className="space-y-1">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-[10px] text-muted-foreground">Position</span>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        {['X', 'Y', 'Z'].map((axis, i) => (
                                                            <div key={axis} className="flex-1 flex items-center bg-muted/50 rounded overflow-hidden border border-border">
                                                                <span className="text-[9px] px-1 text-muted-foreground">{axis}</span>
                                                                <input 
                                                                    type="number"
                                                                    step={0.1}
                                                                    className="h-6 w-full border-0 bg-transparent text-[10px] px-1 focus:outline-none"
                                                                    value={selectedObject.position[i]}
                                                                    onChange={(e) => {
                                                                        const pos = [...selectedObject.position] as [number, number, number];
                                                                        pos[i] = parseFloat(e.target.value) || 0;
                                                                        updateSceneObject(selectedObject.id, { position: pos });
                                                                    }}
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-[10px] text-muted-foreground">Rotation</span>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        {['X', 'Y', 'Z'].map((axis, i) => (
                                                            <div key={axis} className="flex-1 flex items-center bg-muted/50 rounded overflow-hidden border border-border">
                                                                <span className="text-[9px] px-1 text-muted-foreground">{axis}</span>
                                                                <input 
                                                                    type="number"
                                                                    step={0.1}
                                                                    className="h-6 w-full border-0 bg-transparent text-[10px] px-1 focus:outline-none"
                                                                    value={selectedObject.rotation[i]}
                                                                    onChange={(e) => {
                                                                        const rot = [...selectedObject.rotation] as [number, number, number];
                                                                        rot[i] = parseFloat(e.target.value) || 0;
                                                                        updateSceneObject(selectedObject.id, { rotation: rot });
                                                                    }}
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-[10px] text-muted-foreground">Scale</span>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        {['X', 'Y', 'Z'].map((axis, i) => (
                                                            <div key={axis} className="flex-1 flex items-center bg-muted/50 rounded overflow-hidden border border-border">
                                                                <span className="text-[9px] px-1 text-muted-foreground">{axis}</span>
                                                                <input 
                                                                    type="number"
                                                                    step={0.1}
                                                                    className="h-6 w-full border-0 bg-transparent text-[10px] px-1 focus:outline-none"
                                                                    value={selectedObject.scale[i]}
                                                                    onChange={(e) => {
                                                                        const scale = [...selectedObject.scale] as [number, number, number];
                                                                        scale[i] = parseFloat(e.target.value) || 0;
                                                                        updateSceneObject(selectedObject.id, { scale: scale });
                                                                    }}
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <Separator />

                                        <div className="space-y-3">
                                            <Label className="text-[10px] uppercase text-muted-foreground font-bold">Geometry Settings</Label>
                                            <div className="grid gap-4">
                                                {selectedObject.type === 'box' && (
                                                    <>
                                                        <div className="space-y-2">
                                                            <Label className="text-[11px]">Size (W/H/D)</Label>
                                                            <div className="flex gap-1">
                                                                <DebouncedInput type="number" step={0.1} className="h-7 text-xs" value={selectedObject.config.width ?? 1.5} onChange={(v) => updateSelectedObjectConfig({ width: Number(v) })} />
                                                                <DebouncedInput type="number" step={0.1} className="h-7 text-xs" value={selectedObject.config.height ?? 1.5} onChange={(v) => updateSelectedObjectConfig({ height: Number(v) })} />
                                                                <DebouncedInput type="number" step={0.1} className="h-7 text-xs" value={selectedObject.config.depth ?? 1.5} onChange={(v) => updateSelectedObjectConfig({ depth: Number(v) })} />
                                                            </div>
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label className="text-[11px]">Segments</Label>
                                                            <div className="flex gap-1">
                                                                <DebouncedInput type="number" className="h-7 text-xs" value={selectedObject.config.widthSegments ?? 1} onChange={(v) => updateSelectedObjectConfig({ widthSegments: Number(v) })} />
                                                                <DebouncedInput type="number" className="h-7 text-xs" value={selectedObject.config.heightSegments ?? 1} onChange={(v) => updateSelectedObjectConfig({ heightSegments: Number(v) })} />
                                                                <DebouncedInput type="number" className="h-7 text-xs" value={selectedObject.config.depthSegments ?? 1} onChange={(v) => updateSelectedObjectConfig({ depthSegments: Number(v) })} />
                                                            </div>
                                                        </div>
                                                    </>
                                                )}

                                                {selectedObject.type === 'sphere' && (
                                                    <>
                                                        <div className="flex items-center justify-between">
                                                            <Label className="text-[11px]">Radius</Label>
                                                            <DebouncedInput type="number" step={0.1} className="h-7 text-xs w-24" value={selectedObject.config.radius ?? 1} onChange={(v) => updateSelectedObjectConfig({ radius: Number(v) })} />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label className="text-[11px]">Segments (W/H)</Label>
                                                            <div className="flex gap-1">
                                                                <DebouncedInput type="number" className="h-7 text-xs" value={selectedObject.config.widthSegmentsSphere ?? 32} onChange={(v) => updateSelectedObjectConfig({ widthSegmentsSphere: Number(v) })} />
                                                                <DebouncedInput type="number" className="h-7 text-xs" value={selectedObject.config.heightSegmentsSphere ?? 16} onChange={(v) => updateSelectedObjectConfig({ heightSegmentsSphere: Number(v) })} />
                                                            </div>
                                                        </div>
                                                    </>
                                                )}

                                                {selectedObject.type === 'torus' && (
                                                    <>
                                                        <div className="flex items-center justify-between">
                                                            <Label className="text-[11px]">Radius</Label>
                                                            <DebouncedInput type="number" step={0.1} className="h-7 text-xs w-24" value={selectedObject.config.radiusTorus ?? 0.8} onChange={(v) => updateSelectedObjectConfig({ radiusTorus: Number(v) })} />
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <Label className="text-[11px]">Tube</Label>
                                                            <DebouncedInput type="number" step={0.1} className="h-7 text-xs w-24" value={selectedObject.config.tube ?? 0.3} onChange={(v) => updateSelectedObjectConfig({ tube: Number(v) })} />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label className="text-[11px]">Segments (T/R)</Label>
                                                            <div className="flex gap-1">
                                                                <DebouncedInput type="number" className="h-7 text-xs" value={selectedObject.config.tubularSegments ?? 32} onChange={(v) => updateSelectedObjectConfig({ tubularSegments: Number(v) })} />
                                                                <DebouncedInput type="number" className="h-7 text-xs" value={selectedObject.config.radialSegments ?? 16} onChange={(v) => updateSelectedObjectConfig({ radialSegments: Number(v) })} />
                                                            </div>
                                                        </div>
                                                    </>
                                                )}

                                                {selectedObject.type === 'plane' && (
                                                    <>
                                                        <div className="space-y-2">
                                                            <Label className="text-[11px]">Size (W/H)</Label>
                                                            <div className="flex gap-1">
                                                                <DebouncedInput type="number" step={0.1} className="h-7 text-xs" value={selectedObject.config.widthPlane ?? 1} onChange={(v) => updateSelectedObjectConfig({ widthPlane: Number(v) })} />
                                                                <DebouncedInput type="number" step={0.1} className="h-7 text-xs" value={selectedObject.config.heightPlane ?? 1} onChange={(v) => updateSelectedObjectConfig({ heightPlane: Number(v) })} />
                                                            </div>
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label className="text-[11px]">Segments (W/H)</Label>
                                                            <div className="flex gap-1">
                                                                <DebouncedInput type="number" className="h-7 text-xs" value={selectedObject.config.widthSegmentsPlane ?? 1} onChange={(v) => updateSelectedObjectConfig({ widthSegmentsPlane: Number(v) })} />
                                                                <DebouncedInput type="number" className="h-7 text-xs" value={selectedObject.config.heightSegmentsPlane ?? 1} onChange={(v) => updateSelectedObjectConfig({ heightSegmentsPlane: Number(v) })} />
                                                            </div>
                                                        </div>
                                                    </>
                                                )}

                                                {selectedObject.type === 'cylinder' && (
                                                    <>
                                                        <div className="space-y-2">
                                                            <Label className="text-[11px]">Radius (Top/Bot)</Label>
                                                            <div className="flex gap-1">
                                                                <DebouncedInput type="number" step={0.1} className="h-7 text-xs" value={selectedObject.config.radiusTop ?? 1} onChange={(v) => updateSelectedObjectConfig({ radiusTop: Number(v) })} />
                                                                <DebouncedInput type="number" step={0.1} className="h-7 text-xs" value={selectedObject.config.radiusBottom ?? 1} onChange={(v) => updateSelectedObjectConfig({ radiusBottom: Number(v) })} />
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <Label className="text-[11px]">Height</Label>
                                                            <DebouncedInput type="number" step={0.1} className="h-7 text-xs w-24" value={selectedObject.config.heightCylinder ?? 1} onChange={(v) => updateSelectedObjectConfig({ heightCylinder: Number(v) })} />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label className="text-[11px]">Segments (R/H)</Label>
                                                            <div className="flex gap-1">
                                                                <DebouncedInput type="number" className="h-7 text-xs" value={selectedObject.config.radialSegmentsCylinder ?? 20} onChange={(v) => updateSelectedObjectConfig({ radialSegmentsCylinder: Number(v) })} />
                                                                <DebouncedInput type="number" className="h-7 text-xs" value={selectedObject.config.heightSegmentsCylinder ?? 20} onChange={(v) => updateSelectedObjectConfig({ heightSegmentsCylinder: Number(v) })} />
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <Label className="text-[11px]">Open Ended</Label>
                                                            <input type="checkbox" checked={selectedObject.config.openEnded ?? true} onChange={(e) => updateSelectedObjectConfig({ openEnded: e.target.checked })} />
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </ScrollArea>
                            ) : (
                                <div className="flex-1 flex items-center justify-center text-muted-foreground p-4 text-center">
                                    <p className="text-xs">Select an object in the scene or scene graph to edit its properties.</p>
                                </div>
                            )}
                        </TabsContent>
                        <TabsContent value="scene" className="flex-1 m-0 overflow-hidden flex flex-col">
                            <ScrollArea className="flex-1">
                                <div className="p-4 space-y-6">
                                    <div className="space-y-3">
                                        <Label className="text-[10px] uppercase text-muted-foreground font-bold">Environment</Label>
                                        <div className="grid gap-4">
                                            <div className="flex flex-col gap-1.5">
                                                <Label className="text-xs">HDRI Map</Label>
                                                <select
                                                    className="h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm transition-colors"
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
                                        </div>
                                    </div>
                                </div>
                            </ScrollArea>
                        </TabsContent>
                    </Tabs>
                </div>
            )}
        </div>
    );
}
