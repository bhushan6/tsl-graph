'use client';

import {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react';
import * as THREE from 'three/webgpu';
import { pass, mrt, output, normalView } from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildTSLMaterial, buildTSLPostOutputNode } from '@/lib/tsl-builder';
import { useEditorStore } from '@/store/editor';
import { buildPreviewGeometry } from './geometry';
import type { PreviewCanvas3DProps, PreviewCanvasHandle, PreviewCaptureOptions } from './types';

interface CapturedFrame {
    blob: Blob;
    mimeType: string;
    width: number;
    height: number;
    format: string;
}

export const PreviewCanvas3D = forwardRef<PreviewCanvasHandle, PreviewCanvas3DProps>(function PreviewCanvas3D(
    {
        layoutMode,
        postGraphEnabled,
        onUploadPreviewBlob,
        onMaterialErrorChange,
        onPostErrorChange,
        onGeometryScriptErrorChange,
        onReadyChange,
    },
    ref
) {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGPURenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const perspectiveCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const orthographicCameraRef = useRef<THREE.OrthographicCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const postProcessingRef = useRef<THREE.PostProcessing | null>(null);
    const usePostProcessingRef = useRef(false);
    const meshRef = useRef<THREE.Mesh | null>(null);
    const backdropRef = useRef<THREE.Group | null>(null);
    const gridRef = useRef<THREE.GridHelper | null>(null);
    const frameIdRef = useRef<number>(0);
    const initRef = useRef<boolean>(false);
    const [isReady, setIsReady] = useState(false);

    const previewSettings = useEditorStore((state) => state.previewSettings);
    const graphStructureVersion = useEditorStore((state) => state.graphStructureVersion);
    const isFullscreenQuad = previewSettings.mesh === 'fullscreenQuad';

    const getActiveCamera = useCallback((): THREE.Camera | null => {
        const currentMesh = useEditorStore.getState().previewSettings.mesh;
        if (currentMesh === 'fullscreenQuad') {
            return orthographicCameraRef.current ?? perspectiveCameraRef.current;
        }
        return perspectiveCameraRef.current;
    }, []);

    const captureBlob = useCallback((options?: PreviewCaptureOptions): Promise<CapturedFrame> => {
        const renderer = rendererRef.current;
        if (!renderer) {
            return Promise.reject(new Error('Preview renderer not ready'));
        }

        const canvas = renderer.domElement;
        const format = options?.format === 'jpeg' ? 'jpeg' : 'png';
        const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
        const quality = format === 'jpeg' ? options?.quality ?? 0.85 : undefined;

        return new Promise<CapturedFrame>((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (!blob) {
                    reject(new Error('Failed to capture preview image'));
                    return;
                }
                resolve({
                    blob,
                    mimeType,
                    width: canvas.width,
                    height: canvas.height,
                    format: mimeType,
                });
            }, mimeType, quality);
        });
    }, []);

    useImperativeHandle(ref, () => ({
        downloadSnapshot: () => {
            const renderer = rendererRef.current;
            if (!renderer) return;

            const canvas = renderer.domElement;
            const link = document.createElement('a');
            link.download = `snapshot-${new Date().toISOString()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        },
        capturePreviewForAi: async (options) => {
            const captured = await captureBlob(options);
            return onUploadPreviewBlob({
                ...captured,
                purpose: options?.purpose ?? 'ai',
            });
        },
    }), [captureBlob, onUploadPreviewBlob]);

    const { material, materialError } = useMemo(() => {
        if (!isReady) return { material: null as THREE.Material | null, materialError: null as string | null };
        try {
            const { getRootGraph, subgraphs, codeNodes, globals } = useEditorStore.getState();
            const materialGraph = getRootGraph('material');
            return {
                material: buildTSLMaterial(materialGraph.nodes, materialGraph.edges, subgraphs, codeNodes, globals),
                materialError: null,
            };
        } catch (e) {
            // console.error('Material build error:', e);
            return {
                material: new THREE.MeshStandardMaterial({ color: 0x888888 }),
                materialError: e instanceof Error ? e.message : 'Failed to build material',
            };
        }
        // Recompile material only when graph structure changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [graphStructureVersion, isReady]);

    useEffect(() => {
        onMaterialErrorChange(materialError);
    }, [materialError, onMaterialErrorChange]);

    useEffect(() => {
        return () => {
            if (!material) return;
            try {
                material.dispose();
            } catch (error) {
                console.warn('Preview material dispose failed:', error);
            }
        };
    }, [material]);

    const { geometry, geometryScriptError } = useMemo(
        () => buildPreviewGeometry(previewSettings),
        [previewSettings]
    );

    useEffect(() => {
        onGeometryScriptErrorChange(geometryScriptError);
    }, [geometryScriptError, onGeometryScriptErrorChange]);

    useEffect(() => {
        return () => {
            try {
                geometry.dispose();
            } catch (error) {
                console.warn('Preview geometry dispose failed:', error);
            }
        };
    }, [geometry]);

    useEffect(() => {
        onReadyChange(isReady);
    }, [isReady, onReadyChange]);

    useEffect(() => {
        const camera = getActiveCamera();
        if (!isReady || !rendererRef.current || !sceneRef.current || !camera) {
            usePostProcessingRef.current = false;
            return;
        }

        if (!postProcessingRef.current) {
            postProcessingRef.current = new THREE.PostProcessing(rendererRef.current);
        }

        if (!(previewSettings.postEnabled ?? true) || !postGraphEnabled) {
            usePostProcessingRef.current = false;
            onPostErrorChange(null);
            return;
        }

        try {
            const { getRootGraph, subgraphs, codeNodes, globals } = useEditorStore.getState();
            const postGraph = getRootGraph('post');
            const scenePass = pass(sceneRef.current, camera);
            scenePass.setMRT(mrt({ output, normal: normalView }));
            const outputNode = buildTSLPostOutputNode(
                scenePass,
                scenePass.getTextureNode(),
                scenePass.getLinearDepthNode(),
                scenePass.getTextureNode('depth'),
                scenePass.getTextureNode('normal'),
                camera,
                postGraph.nodes,
                postGraph.edges,
                subgraphs,
                codeNodes,
                globals
            );

            if (!outputNode) {
                usePostProcessingRef.current = false;
                onPostErrorChange('Post graph output is not connected.');
                return;
            }

            postProcessingRef.current.outputNode = outputNode;
            postProcessingRef.current.needsUpdate = true;
            usePostProcessingRef.current = true;
            onPostErrorChange(null);
        } catch (e) {
            console.error('Post-processing build error:', e);
            usePostProcessingRef.current = false;
            onPostErrorChange(e instanceof Error ? e.message : 'Failed to build post-processing graph');
        }
    }, [
        graphStructureVersion,
        isReady,
        postGraphEnabled,
        previewSettings.mesh,
        previewSettings.postEnabled,
        onPostErrorChange,
        getActiveCamera,
    ]);

    const handleResize = useCallback(() => {
        if (!rendererRef.current || !perspectiveCameraRef.current || !containerRef.current) return;
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        if (w <= 0 || h <= 0) return;
        perspectiveCameraRef.current.aspect = w / h;
        perspectiveCameraRef.current.updateProjectionMatrix();
        orthographicCameraRef.current?.updateProjectionMatrix();
        rendererRef.current.setSize(w, h);
    }, []);

    useEffect(() => {
        const id = requestAnimationFrame(() => handleResize());
        return () => cancelAnimationFrame(id);
    }, [layoutMode, handleResize]);

    useEffect(() => {
        if (!containerRef.current || initRef.current) return;
        initRef.current = true;
        let isUnmounted = false;

        const container = containerRef.current;

        async function init() {
            const width = container.clientWidth;
            const height = container.clientHeight;

            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x1a1a1a);
            sceneRef.current = scene;

            const perspectiveCamera = new THREE.PerspectiveCamera(45, width / height, 0.01, 2000);
            perspectiveCamera.position.set(3.6, 2, 2);
            perspectiveCamera.lookAt(0, 0, 0);
            perspectiveCameraRef.current = perspectiveCamera;

            const orthographicCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
            orthographicCamera.position.set(0, 0, 1);
            orthographicCamera.lookAt(0, 0, 0);
            orthographicCameraRef.current = orthographicCamera;

            const renderer = new THREE.WebGPURenderer({ antialias: true });
            await renderer.init();
            if (isUnmounted) {
                renderer.dispose();
                return;
            }
            renderer.setSize(width, height);
            renderer.setPixelRatio(window.devicePixelRatio);
            container.appendChild(renderer.domElement);
            rendererRef.current = renderer;
            postProcessingRef.current = new THREE.PostProcessing(renderer);

            const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
            scene.add(ambientLight);

            const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
            directionalLight.position.set(5, 5, 5);
            scene.add(directionalLight);

            const gridHelper = new THREE.GridHelper(10, 10, 0x333333, 0x333333);
            scene.add(gridHelper);
            gridRef.current = gridHelper;

            const controls = new OrbitControls(perspectiveCamera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;
            controls.target.set(0, 0, 0);
            controls.update();
            controlsRef.current = controls;

            if (isUnmounted) return;
            setIsReady(true);

            const animate = () => {
                if (isUnmounted) return;
                frameIdRef.current = requestAnimationFrame(animate);
                if (controls.enabled) {
                    controls.update();
                }
                const activeCamera = getActiveCamera();
                if (!activeCamera) return;
                if (usePostProcessingRef.current && postProcessingRef.current) {
                    postProcessingRef.current.render();
                } else {
                    renderer.render(scene, activeCamera);
                }
            };
            animate();
        }

        init().catch(console.error);

        const resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(container);

        return () => {
            isUnmounted = true;
            cancelAnimationFrame(frameIdRef.current);
            resizeObserver.disconnect();
            setIsReady(false);
            usePostProcessingRef.current = false;

            const controls = controlsRef.current;
            if (controls) {
                controls.dispose();
                controlsRef.current = null;
            }

            const scene = sceneRef.current;

            const mesh = meshRef.current;
            if (scene && mesh) {
                scene.remove(mesh);
                if (mesh instanceof THREE.InstancedMesh) {
                    try {
                        mesh.dispose();
                    } catch (error) {
                        console.warn('Preview mesh dispose failed:', error);
                    }
                }
                meshRef.current = null;
            }

            const backdrop = backdropRef.current;
            if (scene && backdrop) {
                scene.remove(backdrop);
                backdrop.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        try {
                            child.geometry?.dispose();
                        } catch (error) {
                            console.warn('Preview backdrop geometry dispose failed:', error);
                        }
                        if (Array.isArray(child.material)) {
                            child.material.forEach((m) => {
                                try {
                                    m.dispose();
                                } catch (error) {
                                    console.warn('Preview backdrop material dispose failed:', error);
                                }
                            });
                        } else {
                            try {
                                child.material?.dispose();
                            } catch (error) {
                                console.warn('Preview backdrop material dispose failed:', error);
                            }
                        }
                    }
                });
                backdropRef.current = null;
            }

            const grid = gridRef.current;
            if (scene && grid) {
                scene.remove(grid);
                try {
                    grid.dispose();
                } catch (error) {
                    console.warn('Preview grid dispose failed:', error);
                }
                gridRef.current = null;
            }

            const postProcessing = postProcessingRef.current;
            if (postProcessing) {
                try {
                    postProcessing.dispose();
                } catch (error) {
                    console.warn('Preview post-processing dispose failed:', error);
                }
                postProcessingRef.current = null;
            }

            if (scene) {
                const disposedTextures = new Set<THREE.Texture>();
                const disposeTexture = (value: THREE.Texture | THREE.Color | null) => {
                    if (!(value instanceof THREE.Texture) || disposedTextures.has(value)) return;
                    disposedTextures.add(value);
                    value.dispose();
                };
                disposeTexture(scene.environment);
                disposeTexture(scene.background);
                scene.clear();
                sceneRef.current = null;
            }

            const renderer = rendererRef.current;
            if (renderer) {
                try {
                    renderer.dispose();
                } catch (error) {
                    console.warn('Preview renderer dispose failed:', error);
                }
                if (container.contains(renderer.domElement)) {
                    container.removeChild(renderer.domElement);
                }
                rendererRef.current = null;
            }

            perspectiveCameraRef.current = null;
            orthographicCameraRef.current = null;
            initRef.current = false;
        };
    }, [getActiveCamera, handleResize]);

    useEffect(() => {
        if (!sceneRef.current || !material) return;

        if (meshRef.current) {
            sceneRef.current.remove(meshRef.current);
            if (meshRef.current instanceof THREE.InstancedMesh) {
                meshRef.current.dispose();
            }
        }

        const shouldInstance = previewSettings.isInstanced && !isFullscreenQuad;
        let mesh: THREE.Mesh;
        if (shouldInstance) {
            mesh = new THREE.InstancedMesh(geometry, material, previewSettings.instanceCount);
            mesh.position.set(0, 0, 0);
        } else {
            mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(0, 0, 0);
        }

        sceneRef.current.add(mesh);
        meshRef.current = mesh;
    }, [geometry, material, previewSettings.isInstanced, previewSettings.instanceCount, isFullscreenQuad]);

    useEffect(() => {
        if (!sceneRef.current || !isReady) return;

        const scene = sceneRef.current;
        if (isFullscreenQuad) {
            scene.environment = null;
            scene.background = new THREE.Color(0x1a1a1a);
            return;
        }

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
    }, [
        isReady,
        previewSettings.environment,
        previewSettings.environmentIntensity,
        previewSettings.showEnvironmentBackground,
        isFullscreenQuad,
    ]);

    useEffect(() => {
        if (!sceneRef.current || !isReady) return;

        const scene = sceneRef.current;

        if (backdropRef.current) {
            scene.remove(backdropRef.current);
            backdropRef.current.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.geometry?.dispose();
                    if (Array.isArray(child.material)) {
                        child.material.forEach((m) => m.dispose());
                    } else {
                        child.material?.dispose();
                    }
                }
            });
            backdropRef.current = null;
        }

        if (isFullscreenQuad) return;
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
    }, [isReady, previewSettings.showBackdrop, isFullscreenQuad]);

    useEffect(() => {
        if (gridRef.current) {
            gridRef.current.visible = !!previewSettings.showGrid && !isFullscreenQuad;
        }
    }, [previewSettings.showGrid, isFullscreenQuad, isReady]);

    useEffect(() => {
        if (!controlsRef.current) return;
        controlsRef.current.enabled = !isFullscreenQuad;
    }, [isFullscreenQuad]);

    return <div ref={containerRef} className="w-full h-full" />;
});
