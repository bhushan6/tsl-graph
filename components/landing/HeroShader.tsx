'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three/webgpu';
import {
    abs, atan, float, length, max, min, time, uv,
    uniform, sin, cos, floor, vec2, vec4
} from 'three/tsl';

interface HeroShaderProps {
    twist: number;
    softness: number;
    noiseStrength: number; // Renamed from 'noise' to avoid conflict with imported 'noise' const in provided code if any, though the provided code has 'noise' variable.
    noiseFrequency: number;
    color1: string;
    color2: string;
}

export function HeroShader({
    twist: twistValue,
    softness: softnessValue,
    noiseStrength: noiseStrengthValue,
    noiseFrequency: noiseFrequencyValue,
    color1: color1Value,
    color2: color2Value
}: HeroShaderProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGPURenderer | null>(null);

    // Uniforms ref to update values
    const uniforms = useRef<{
        twist: THREE.UniformNode<number>;
        softness: THREE.UniformNode<number>;
        noiseStrength: THREE.UniformNode<number>;
        noiseFrequency: THREE.UniformNode<number>;
        color1: THREE.UniformNode<THREE.Color>;
        color2: THREE.UniformNode<THREE.Color>;
    } | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;
        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;
        // Scene & Camera
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);


        // Renderer
        const renderer = new THREE.WebGPURenderer({ alpha: true, antialias: true });

        const material = new THREE.MeshBasicNodeMaterial();


        // Quad
        const geometry = new THREE.PlaneGeometry(2, 2);
        const quad = new THREE.Mesh(geometry, material);
        (async () => {




            await renderer.init();
            renderer.setSize(width, height);
            renderer.setPixelRatio(window.devicePixelRatio);
            containerRef.current?.appendChild(renderer.domElement);
            rendererRef.current = renderer;

            // Create Uniforms
            const uTwist = uniform(twistValue);
            const uSoftness = uniform(softnessValue);
            const uNoiseStrength = uniform(noiseStrengthValue);
            const uNoiseFrequency = uniform(noiseFrequencyValue);
            const uColor1 = uniform(new THREE.Color(color1Value));
            const uColor2 = uniform(new THREE.Color(color2Value));

            uniforms.current = {
                twist: uTwist,
                softness: uSoftness,
                noiseStrength: uNoiseStrength,
                noiseFrequency: uNoiseFrequency,
                color1: uColor1,
                color2: uColor2
            };

            // --- TSL Graph Construction (Balatro Shader Conversion) ---

            // Constants & Props mapping
            const pixelFilter = float(745.0);
            // Map props to shader parameters
            const spinRotation = uTwist.mul(-2.0); // twist prop -2 to 2 range approx
            const spinSpeed = float(7.0);
            const contrast = uSoftness.mul(5.0).add(1.0); // Map softness to contrast (1.0 to 6.0)
            const lighting = uNoiseFrequency; // Mapped to noiseFrequency input
            const spinAmount = uNoiseStrength; // Map noiseStrength (0.0 to 1.0)

            // Fixed colors
            const colour3 = vec4(0.086, 0.137, 0.145, 1.0);

            // Inputs
            const resolution = uniform(new THREE.Vector2(width, height));
            const pixelSize = length(resolution).div(pixelFilter);
            const halfScreen = resolution.mul(0.5);
            const screenSizeLength = length(resolution);

            // UV Calculation
            // vec2 uv = (floor(screen_coords.xy*(1./pixel_size))*pixel_size - 0.5*screenSize.xy)/length(screenSize.xy) - OFFSET;
            const screenCoords = uv().mul(resolution); // 0..1 uv * resolution
            const uvRaw = floor(screenCoords.div(pixelSize)).mul(pixelSize).sub(halfScreen).div(screenSizeLength);
            let uvNode = uvRaw; // Mutable uv node reference

            const uvLen = length(uvNode);

            // Angle Speed (Static part usually, unless IS_ROTATE is true)
            // float speed = (SPIN_ROTATION*SPIN_EASE*0.2);
            // IS_ROTATE is false in original, so we replicate that logic
            let angleSpeed = spinRotation.mul(0.2); // SPIN_EASE = 1.0
            angleSpeed = angleSpeed.add(302.2);

            // new_pixel_angle
            // atan(uv.y, uv.x) + speed - SPIN_EASE*20.*(1.*SPIN_AMOUNT*uv_len + (1. - 1.*SPIN_AMOUNT));
            const term = spinAmount.mul(uvLen).add(float(1.0).sub(spinAmount));
            const newPixelAngle = atan(uvNode.y, uvNode.x).add(angleSpeed).sub(float(20.0).mul(term));

            const mid = resolution.div(screenSizeLength).div(2.0);

            // Update UV based on angle
            // uv = (vec2((uv_len * cos(new_pixel_angle) + mid.x), (uv_len * sin(new_pixel_angle) + mid.y)) - mid);
            const uvX = uvLen.mul(cos(newPixelAngle)).add(mid.x);
            const uvY = uvLen.mul(sin(newPixelAngle)).add(mid.y);
            uvNode = vec2(uvX, uvY).sub(mid);

            uvNode = uvNode.mul(30.0);

            // Animation Loop
            // speed = iTime*(SPIN_SPEED);
            const animSpeed = time.mul(spinSpeed);
            let uv2Node = vec2(uvNode.x.add(uvNode.y));

            // Unrolled Loop (5 iterations)
            for (let i = 0; i < 5; i++) {
                // uv2 += sin(max(uv.x, uv.y)) + uv;
                uv2Node = uv2Node.add(sin(max(uvNode.x, uvNode.y)).add(uvNode));

                // uv  += 0.5*vec2(cos(5.1123314 + 0.353*uv2.y + speed*0.131121),sin(uv2.x - 0.113*speed));
                const arg1 = float(5.1123314).add(float(0.353).mul(uv2Node.y)).add(animSpeed.mul(0.131121));
                const arg2 = uv2Node.x.sub(float(0.113).mul(animSpeed));
                const addTerm = vec2(cos(arg1), sin(arg2)).mul(0.5);
                uvNode = uvNode.add(addTerm);

                // uv  -= 1.0*cos(uv.x + uv.y) - 1.0*sin(uv.x*0.711 - uv.y);
                const subArg1 = uvNode.x.add(uvNode.y);
                const subArg2 = uvNode.x.mul(0.711).sub(uvNode.y);
                const subTerm = cos(subArg1).sub(sin(subArg2)).mul(1.0);
                uvNode = uvNode.sub(subTerm);
            }

            // Colors & Lighting
            // float contrast_mod = (0.25*CONTRAST + 0.5*SPIN_AMOUNT + 1.2);
            const contrastMod = contrast.mul(0.25).add(spinAmount.mul(0.5)).add(1.2);

            // float paint_res = min(2., max(0.,length(uv)*(0.035)*contrast_mod));
            const paintRes = min(float(2.0), max(float(0.0), length(uvNode).mul(0.035).mul(contrastMod)));

            // float c1p = max(0.,1. - contrast_mod*abs(1.-paint_res));
            const c1p = max(float(0.0), float(1.0).sub(contrastMod.mul(abs(float(1.0).sub(paintRes)))));

            // float c2p = max(0.,1. - contrast_mod*abs(paint_res));
            const c2p = max(float(0.0), float(1.0).sub(contrastMod.mul(abs(paintRes))));

            // float c3p = 1. - min(1., c1p + c2p);
            const c3p = float(1.0).sub(min(float(1.0), c1p.add(c2p)));

            // float light = (LIGTHING - 0.2)*max(c1p*5. - 4., 0.) + LIGTHING*max(c2p*5. - 4., 0.);
            const lightTerm1 = lighting.sub(0.2).mul(max(c1p.mul(5.0).sub(4.0), 0.0));
            const lightTerm2 = lighting.mul(max(c2p.mul(5.0).sub(4.0), 0.0));
            const light = lightTerm1.add(lightTerm2);

            // Final Color
            // return (0.3/CONTRAST)*COLOUR_1 + (1. - 0.3/CONTRAST)*(COLOUR_1*c1p + COLOUR_2*c2p + vec4(c3p*COLOUR_3.rgb, c3p*COLOUR_1.a)) + light;
            const contrastFactor = float(0);
            const termA = uColor1.mul(contrastFactor); // COLOUR_1

            const termB1 = uColor1.mul(c1p);
            const termB2 = uColor2.mul(c2p);

            // colour3 logic
            const mixedColor = termB1.add(termB2).add(colour3.mul(c3p));

            const termB = mixedColor.mul(float(1.0).sub(contrastFactor));
            const finalColor = termA.add(termB).add(light);

            // Material
            material.colorNode = vec4(finalColor.xyz, 1.0);
            material.side = THREE.DoubleSide;
            material.transparent = true;
            material.depthWrite = true;

            // Quad
            scene.add(quad);

            // Animation Loop
            const animate = () => {
                renderer.render(scene, camera);
                requestAnimationFrame(animate);
            };
            animate();

        })()

        // Cleanup
        return () => {
            // Dispose resources
            geometry.dispose();
            material.dispose();
            renderer.dispose();
            if (containerRef.current?.contains(renderer.domElement)) {
                containerRef.current.removeChild(renderer.domElement);
            }
        };
    }, []); // Only run once on mount

    // Update Uniforms when props change
    useEffect(() => {
        if (uniforms.current) {
            uniforms.current.twist.value = twistValue;
            uniforms.current.softness.value = softnessValue;
            uniforms.current.noiseStrength.value = noiseStrengthValue;
            uniforms.current.noiseFrequency.value = noiseFrequencyValue;
            uniforms.current.color1.value.set(color1Value);
            uniforms.current.color2.value.set(color2Value);
        }
    }, [twistValue, softnessValue, noiseStrengthValue, noiseFrequencyValue, color1Value, color2Value]);

    return (
        <div ref={containerRef} className="w-full h-full min-h-[500px]" />
    );
}
