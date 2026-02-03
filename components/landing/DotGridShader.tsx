'use client';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { useEffect, useRef } from 'react';
import * as THREE from 'three/webgpu';
import {
    Fn, add, div, float, floor, instanceIndex, length, mod, mul, positionLocal, sin, sub, time, uv, vec2, vec3, smoothstep, dot
} from 'three/tsl';
import { uniforms } from './FlowPreview';

// Code Node Definitions
// Code Node: circleSDF
// @ts-expect-error - Fn types are dynamic
const circleSDF = Fn(([uv, radius]) => {
    const dist = uv.sub(vec2(0.5));
    return float(1).sub(smoothstep(
        radius.sub(radius.mul(0.01)),
        radius.add(radius.mul(0.01)),
        dot(dist, dist).mul(4.0)
    ));
});

export function DotGridShader() {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGPURenderer | null>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const width = container.clientWidth;
        const height = container.clientHeight;

        let renderer: THREE.WebGPURenderer | null = null;
        let scene: THREE.Scene | null = null;
        let geometry: THREE.PlaneGeometry | null = null;
        let material: THREE.MeshBasicNodeMaterial | null = null;
        let controls: OrbitControls | null = null;
        let animationId: number;

        const init = async () => {
            // 1. Setup Scene & Camera
            scene = new THREE.Scene();

            // Perspective Camera
            const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);

            // Position camera based on grid size
            const gridTotalWidth = 50 * 1.5;
            camera.position.set(0, 0, gridTotalWidth * 0.8);
            camera.lookAt(0, 0, 0);

            // 2. Setup Renderer
            renderer = new THREE.WebGPURenderer({ alpha: true, antialias: true });

            // Wait for WebGPU init
            await renderer.init();

            renderer.setSize(width, height);
            renderer.setPixelRatio(window.devicePixelRatio);
            if (container) {
                container.appendChild(renderer.domElement);
            }
            rendererRef.current = renderer;

            // Add OrbitControls
            controls = new OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;

            const { uSpacing, uSpeed, uFreq, uSize } = uniforms;

            // ... shader graph logic ... (keep existing)
            const _node1 = time;
            const _node4 = instanceIndex;
            const _node5 = float(50);
            const _node6 = positionLocal;
            const _node7 = float(2);
            const _node8 = uv();
            const _node9 = mul(_node1, uSpeed);
            const _node10 = float(_node4);
            const _node11 = div(_node5, 2);

            // @ts-expect-error - Dynamic node types
            const _code_node_12 = circleSDF(_node8, float(uSize));

            const _node13 = mod(_node10, _node5);
            const _node14 = div(_node10, _node5);
            const _node15 = floor(_node14);
            const _node16 = vec2(_node13, _node15);
            const _node17 = sub(_node16, _node11);
            const _node18 = mul(_node17, uSpacing);
            const _node19 = length(_node18);
            const _node20 = _node18;
            const _node21 = mul(_node19, uFreq);
            const _node22 = sub(_node21, _node9);
            const _node23 = sin(_node22);
            const _node24 = mul(_node23, _node7);

            const _node25 = add(float(0), _node24);

            const _node26 = vec3(_node20.x, _node20.y, _node25);
            const _node27 = add(_node6, _node26);

            // Material
            material = new THREE.MeshBasicNodeMaterial();
            material.colorNode = _code_node_12
            material.opacityNode = _code_node_12;
            material.positionNode = _node27;
            material.side = THREE.FrontSide;
            material.transparent = true;
            material.depthWrite = true;

            // Instanced Mesh
            geometry = new THREE.PlaneGeometry(1, 1);
            const count = 50 * 50;
            const mesh = new THREE.InstancedMesh(geometry, material, count);
            scene.add(mesh);

            // Animation Loop
            const animate = () => {
                if (!renderer || !scene) return;
                controls?.update();
                renderer.render(scene, camera);
                animationId = requestAnimationFrame(animate);
            };
            animate();
        };

        init();

        // Cleanup
        return () => {
            cancelAnimationFrame(animationId);
            if (controls) controls.dispose();
            if (geometry) geometry.dispose();
            if (material) material.dispose();
            if (renderer) {
                renderer.dispose();
                if (renderer.domElement && container?.contains(renderer.domElement)) {
                    container.removeChild(renderer.domElement);
                }
            }
        };
    }, []);

    return <div ref={containerRef} className="w-full h-full min-h-[200px]" />;
}
