/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import { useEffect, useState } from 'react';

interface TestResult {
    name: string;
    status: 'pass' | 'fail' | 'warning' | 'info';
    message: string;
    code?: string;
}

export default function TSLTestPage() {
    const [results, setResults] = useState<TestResult[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [isComplete, setIsComplete] = useState(false);

    const addResult = (result: TestResult) => {
        setResults(prev => [...prev, result]);
    };

    const runTests = async () => {
        setIsRunning(true);
        setResults([]);
        setIsComplete(false);

        try {
            addResult({
                name: 'Import TSL',
                status: 'info',
                message: 'Importing Three.js WebGPU and TSL modules...'
            });

            // Import from three/webgpu which includes TSL
            const THREE = await import('three/webgpu');
            const TSL = await import('three/tsl');

            addResult({
                name: 'Import TSL',
                status: 'pass',
                message: 'Successfully imported Three.js WebGPU modules'
            });

            // Test 1: Basic type creation
            addResult({
                name: 'Type Creation',
                status: 'info',
                message: 'Testing basic type creation...'
            });

            try {
                const f = TSL.float(1.0);
                const v2 = TSL.vec2(1, 2);
                const v3 = TSL.vec3(1, 2, 3);
                const v4 = TSL.vec4(1, 2, 3, 4);
                const c = TSL.color(0xff0000);

                addResult({
                    name: 'Type Creation',
                    status: 'pass',
                    message: `Created: float, vec2, vec3, vec4, color`,
                    code: `float(1.0), vec2(1,2), vec3(1,2,3), vec4(1,2,3,4), color(0xff0000)`
                });
            } catch (e) {
                addResult({
                    name: 'Type Creation',
                    status: 'fail',
                    message: e.message
                });
            }

            // Test 2: Float to Vec3 (broadcast)
            addResult({
                name: 'Float → Vec3 (colorNode)',
                status: 'info',
                message: 'Testing float to colorNode (color/vec3)...'
            });

            try {
                const material = new THREE.MeshBasicNodeMaterial();
                const f = TSL.float(0.5);
                material.colorNode = f;

                addResult({
                    name: 'Float → Vec3 (colorNode)',
                    status: 'pass',
                    message: 'Float can be assigned to colorNode',
                    code: `material.colorNode = float(0.5)`
                });
            } catch (e) {
                addResult({
                    name: 'Float → Vec3 (colorNode)',
                    status: 'fail',
                    message: e.message
                });
            }

            // Test 3: Vec3 to Float (extraction)
            addResult({
                name: 'Vec3 → Float (roughnessNode)',
                status: 'info',
                message: 'Testing vec3 to roughnessNode (float)...'
            });

            try {
                const material = new THREE.MeshStandardNodeMaterial();
                const v3 = TSL.vec3(0.5, 0.6, 0.7);
                material.roughnessNode = v3;

                addResult({
                    name: 'Vec3 → Float (roughnessNode)',
                    status: 'pass',
                    message: 'Vec3 can be assigned to roughnessNode (float)',
                    code: `material.roughnessNode = vec3(0.5, 0.6, 0.7)`
                });
            } catch (e) {
                addResult({
                    name: 'Vec3 → Float (roughnessNode)',
                    status: 'fail',
                    message: e.message
                });
            }

            // Test 4: Vec4 to Vec3 (truncation)
            addResult({
                name: 'Vec4 → Vec3 (colorNode)',
                status: 'info',
                message: 'Testing vec4 to colorNode...'
            });

            try {
                const material = new THREE.MeshBasicNodeMaterial();
                const v4 = TSL.vec4(1, 0, 0, 1);
                material.colorNode = v4;

                addResult({
                    name: 'Vec4 → Vec3 (colorNode)',
                    status: 'pass',
                    message: 'Vec4 can be assigned to colorNode',
                    code: `material.colorNode = vec4(1, 0, 0, 1)`
                });
            } catch (e) {
                addResult({
                    name: 'Vec4 → Vec3 (colorNode)',
                    status: 'fail',
                    message: e.message
                });
            }

            // Test 5: Vec2 to Vec3 (expansion)
            addResult({
                name: 'Vec2 → Vec3 (colorNode)',
                status: 'info',
                message: 'Testing vec2 to colorNode...'
            });

            try {
                const material = new THREE.MeshBasicNodeMaterial();
                const v2 = TSL.vec2(1, 0);
                material.colorNode = v2;

                addResult({
                    name: 'Vec2 → Vec3 (colorNode)',
                    status: 'pass',
                    message: 'Vec2 can be assigned to colorNode',
                    code: `material.colorNode = vec2(1, 0)`
                });
            } catch (e) {
                addResult({
                    name: 'Vec2 → Vec3 (colorNode)',
                    status: 'fail',
                    message: e.message
                });
            }

            // Test 6: Color to Vec3 (normalNode)
            addResult({
                name: 'Color → Vec3 (normalNode)',
                status: 'info',
                message: 'Testing color to normalNode (vec3)...'
            });

            try {
                const material = new THREE.MeshStandardNodeMaterial();
                const c = TSL.color(0xff0000);
                material.normalNode = c;

                addResult({
                    name: 'Color → Vec3 (normalNode)',
                    status: 'pass',
                    message: 'Color can be assigned to normalNode (vec3)',
                    code: `material.normalNode = color(0xff0000)`
                });
            } catch (e) {
                addResult({
                    name: 'Color → Vec3 (normalNode)',
                    status: 'fail',
                    message: e.message
                });
            }

            // Test 7: Vec3 to Color (colorNode)
            addResult({
                name: 'Vec3 → Color (colorNode)',
                status: 'info',
                message: 'Testing vec3 to colorNode...'
            });

            try {
                const material = new THREE.MeshStandardNodeMaterial();
                const v3 = TSL.vec3(1, 0.5, 0);
                material.colorNode = v3;

                addResult({
                    name: 'Vec3 → Color (colorNode)',
                    status: 'pass',
                    message: 'Vec3 can be assigned to colorNode',
                    code: `material.colorNode = vec3(1, 0.5, 0)`
                });
            } catch (e) {
                addResult({
                    name: 'Vec3 → Color (colorNode)',
                    status: 'fail',
                    message: e.message
                });
            }

            // Test 8: Swizzling
            addResult({
                name: 'Swizzling',
                status: 'info',
                message: 'Testing swizzle operations...'
            });

            try {
                const v3 = TSL.vec3(1, 2, 3);
                const x = v3.x;
                const xy = v3.xy;
                const zyx = v3.zyx;
                const rgb = v3.rgb;

                addResult({
                    name: 'Swizzling',
                    status: 'pass',
                    message: 'Swizzle works: .x, .xy, .zyx, .rgb',
                    code: `vec3.x, vec3.xy, vec3.zyx, vec3.rgb`
                });
            } catch (e) {
                addResult({
                    name: 'Swizzling',
                    status: 'fail',
                    message: e.message
                });
            }

            // Test 9: Mixed type math - float * vec3
            addResult({
                name: 'Float × Vec3',
                status: 'info',
                message: 'Testing float.mul(vec3)...'
            });

            try {
                const f = TSL.float(2);
                const v3 = TSL.vec3(1, 2, 3);
                const result = f.mul(v3);

                addResult({
                    name: 'Float × Vec3',
                    status: 'pass',
                    message: 'float.mul(vec3) works',
                    code: `float(2).mul(vec3(1,2,3))`
                });
            } catch (e) {
                addResult({
                    name: 'Float × Vec3',
                    status: 'fail',
                    message: e.message
                });
            }

            // Test 10: Mixed type math - vec3 * float
            addResult({
                name: 'Vec3 × Float',
                status: 'info',
                message: 'Testing vec3.mul(float)...'
            });

            try {
                const f = TSL.float(2);
                const v3 = TSL.vec3(1, 2, 3);
                const result = v3.mul(f);

                addResult({
                    name: 'Vec3 × Float',
                    status: 'pass',
                    message: 'vec3.mul(float) works',
                    code: `vec3(1,2,3).mul(float(2))`
                });
            } catch (e) {
                addResult({
                    name: 'Vec3 × Float',
                    status: 'fail',
                    message: e.message
                });
            }

            // Test 11: Vec3 + Float
            addResult({
                name: 'Vec3 + Float',
                status: 'info',
                message: 'Testing vec3.add(float)...'
            });

            try {
                const f = TSL.float(1);
                const v3 = TSL.vec3(1, 2, 3);
                const result = v3.add(f);

                addResult({
                    name: 'Vec3 + Float',
                    status: 'pass',
                    message: 'vec3.add(float) works',
                    code: `vec3(1,2,3).add(float(1))`
                });
            } catch (e) {
                addResult({
                    name: 'Vec3 + Float',
                    status: 'fail',
                    message: e.message
                });
            }

            // Test 12: Vec2 to Float
            addResult({
                name: 'Vec2 → Float (roughnessNode)',
                status: 'info',
                message: 'Testing vec2 to roughnessNode (float)...'
            });

            try {
                const material = new THREE.MeshStandardNodeMaterial();
                const v2 = TSL.vec2(0.5, 0.8);
                material.roughnessNode = v2;

                addResult({
                    name: 'Vec2 → Float (roughnessNode)',
                    status: 'pass',
                    message: 'Vec2 can be assigned to roughnessNode (float)',
                    code: `material.roughnessNode = vec2(0.5, 0.8)`
                });
            } catch (e) {
                addResult({
                    name: 'Vec2 → Float (roughnessNode)',
                    status: 'fail',
                    message: e.message
                });
            }

            // Test 13: Int to Float
            addResult({
                name: 'Int → Float (roughnessNode)',
                status: 'info',
                message: 'Testing int to roughnessNode (float)...'
            });

            try {
                const material = new THREE.MeshStandardNodeMaterial();
                const i = TSL.int(1);
                material.roughnessNode = i;

                addResult({
                    name: 'Int → Float (roughnessNode)',
                    status: 'pass',
                    message: 'Int can be assigned to roughnessNode (float)',
                    code: `material.roughnessNode = int(1)`
                });
            } catch (e) {
                addResult({
                    name: 'Int → Float (roughnessNode)',
                    status: 'fail',
                    message: e.message
                });
            }

            // Test 14: Explicit conversions
            addResult({
                name: 'Explicit Conversions',
                status: 'info',
                message: 'Testing .toFloat(), .toVec2(), .toVec3()...'
            });

            try {
                const v3 = TSL.vec3(1, 2, 3);
                const toFloat = v3.toFloat();
                const toVec2 = v3.toVec2();
                const toVec4 = v3.toVec4();

                const f = TSL.float(0.5);
                const fToVec3 = f.toVec3();

                addResult({
                    name: 'Explicit Conversions',
                    status: 'pass',
                    message: 'Explicit conversions work',
                    code: `vec3.toFloat(), vec3.toVec2(), float.toVec3()`
                });
            } catch (e) {
                addResult({
                    name: 'Explicit Conversions',
                    status: 'fail',
                    message: e.message
                });
            }

            // Test 15: Geometry nodes
            addResult({
                name: 'Geometry Nodes',
                status: 'info',
                message: 'Testing positionLocal, normalWorld, uv, time...'
            });

            try {
                const pos = TSL.positionLocal;
                const norm = TSL.normalWorld;
                const uvCoord = TSL.uv();
                const t = TSL.time;

                const material = new THREE.MeshStandardNodeMaterial();
                material.positionNode = pos;
                material.normalNode = norm;
                material.roughnessNode = t;

                addResult({
                    name: 'Geometry Nodes',
                    status: 'pass',
                    message: 'Geometry nodes work with materials',
                    code: `positionLocal→positionNode, normalWorld→normalNode, time→roughnessNode`
                });
            } catch (e) {
                addResult({
                    name: 'Geometry Nodes',
                    status: 'fail',
                    message: e.message
                });
            }

            // Test 16: UV to Color
            addResult({
                name: 'UV (vec2) → colorNode',
                status: 'info',
                message: 'Testing uv() to colorNode...'
            });

            try {
                const material = new THREE.MeshBasicNodeMaterial();
                material.colorNode = TSL.uv();

                addResult({
                    name: 'UV (vec2) → colorNode',
                    status: 'pass',
                    message: 'UV (vec2) can be assigned to colorNode',
                    code: `material.colorNode = uv()`
                });
            } catch (e) {
                addResult({
                    name: 'UV (vec2) → colorNode',
                    status: 'fail',
                    message: e.message
                });
            }

            // Test 17: Position to Float
            addResult({
                name: 'Position (vec3) → Float',
                status: 'info',
                message: 'Testing positionLocal to roughnessNode...'
            });

            try {
                const material = new THREE.MeshStandardNodeMaterial();
                material.roughnessNode = TSL.positionLocal;

                addResult({
                    name: 'Position (vec3) → Float',
                    status: 'pass',
                    message: 'Position (vec3) can be assigned to roughnessNode (float)',
                    code: `material.roughnessNode = positionLocal`
                });
            } catch (e) {
                addResult({
                    name: 'Position (vec3) → Float',
                    status: 'fail',
                    message: e.message
                });
            }

            // Test 18: WebGPU Render Test
            addResult({
                name: 'WebGPU Render',
                status: 'info',
                message: 'Testing actual shader compilation...'
            });

            try {
                if (!navigator.gpu) {
                    addResult({
                        name: 'WebGPU Render',
                        status: 'warning',
                        message: 'WebGPU not available. Tests above only verify JS-level acceptance.'
                    });
                } else {
                    const renderer = new THREE.WebGPURenderer();
                    await renderer.init();

                    const scene = new THREE.Scene();
                    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
                    camera.position.z = 5;

                    const geometry = new THREE.SphereGeometry(1, 32, 32);

                    // Mixed type material
                    const material = new THREE.MeshStandardNodeMaterial();
                    material.colorNode = TSL.vec3(1, 0.5, 0);
                    material.roughnessNode = TSL.float(0.5);
                    material.metalnessNode = TSL.vec2(0.8, 0.2); // vec2 to float

                    const mesh = new THREE.Mesh(geometry, material);
                    scene.add(mesh);

                    renderer.setSize(100, 100);
                    renderer.render(scene, camera);

                    addResult({
                        name: 'WebGPU Render',
                        status: 'pass',
                        message: 'Shader compiled successfully with mixed types!',
                        code: `colorNode=vec3, roughnessNode=float, metalnessNode=vec2`
                    });

                    renderer.dispose();
                }
            } catch (e) {
                addResult({
                    name: 'WebGPU Render',
                    status: 'fail',
                    message: `Shader compilation failed: ${e.message}`
                });
            }

            // Test 19: Matrix types
            addResult({
                name: 'Matrix Operations',
                status: 'info',
                message: 'Testing matrix * vec4...'
            });

            try {
                const m4 = TSL.modelWorldMatrix;
                const v4 = TSL.vec4(1, 0, 0, 1);
                const transformed = m4.mul(v4);

                addResult({
                    name: 'Matrix Operations',
                    status: 'pass',
                    message: 'Matrix operations work',
                    code: `modelWorldMatrix.mul(vec4(1,0,0,1))`
                });
            } catch (e) {
                addResult({
                    name: 'Matrix Operations',
                    status: 'fail',
                    message: e.message
                });
            }

            // Test 20: Vec4 to Float
            addResult({
                name: 'Vec4 → Float',
                status: 'info',
                message: 'Testing vec4 to roughnessNode...'
            });

            try {
                const material = new THREE.MeshStandardNodeMaterial();
                material.roughnessNode = TSL.vec4(0.5, 0.6, 0.7, 1);

                addResult({
                    name: 'Vec4 → Float',
                    status: 'pass',
                    message: 'Vec4 can be assigned to roughnessNode (float)',
                    code: `material.roughnessNode = vec4(0.5, 0.6, 0.7, 1)`
                });
            } catch (e) {
                addResult({
                    name: 'Vec4 → Float',
                    status: 'fail',
                    message: e.message
                });
            }

            // Test 21: Color to Float
            addResult({
                name: 'Color → Float',
                status: 'info',
                message: 'Testing color to roughnessNode...'
            });

            try {
                const material = new THREE.MeshStandardNodeMaterial();
                material.roughnessNode = TSL.color(0x808080);

                addResult({
                    name: 'Color → Float',
                    status: 'pass',
                    message: 'Color can be assigned to roughnessNode (float)',
                    code: `material.roughnessNode = color(0x808080)`
                });
            } catch (e) {
                addResult({
                    name: 'Color → Float',
                    status: 'fail',
                    message: e.message
                });
            }

            // Test 22: Float to Vec2
            addResult({
                name: 'Float → Vec2',
                status: 'info',
                message: 'Testing float to anisotropyNode (vec2)...'
            });

            try {
                const material = new THREE.MeshPhysicalNodeMaterial();
                material.anisotropyNode = TSL.float(0.5);

                addResult({
                    name: 'Float → Vec2',
                    status: 'pass',
                    message: 'Float can be assigned to anisotropyNode (vec2)',
                    code: `material.anisotropyNode = float(0.5)`
                });
            } catch (e) {
                addResult({
                    name: 'Float → Vec2',
                    status: 'fail',
                    message: e.message
                });
            }

            // Test 23: Vec3 to Vec2
            addResult({
                name: 'Vec3 → Vec2',
                status: 'info',
                message: 'Testing vec3 to anisotropyNode (vec2)...'
            });

            try {
                const material = new THREE.MeshPhysicalNodeMaterial();
                material.anisotropyNode = TSL.vec3(0.5, 0.5, 0.5);

                addResult({
                    name: 'Vec3 → Vec2',
                    status: 'pass',
                    message: 'Vec3 can be assigned to anisotropyNode (vec2)',
                    code: `material.anisotropyNode = vec3(0.5, 0.5, 0.5)`
                });
            } catch (e) {
                addResult({
                    name: 'Vec3 → Vec2',
                    status: 'fail',
                    message: e.message
                });
            }

            setIsComplete(true);

        } catch (e) {
            addResult({
                name: 'Fatal Error',
                status: 'fail',
                message: `Failed to run tests: ${e.message}`
            });
        }

        setIsRunning(false);
    };

    const getStatusColor = (status: TestResult['status']) => {
        switch (status) {
            case 'pass': return 'text-green-500';
            case 'fail': return 'text-red-500';
            case 'warning': return 'text-yellow-500';
            case 'info': return 'text-blue-400';
        }
    };

    const getStatusIcon = (status: TestResult['status']) => {
        switch (status) {
            case 'pass': return '✓';
            case 'fail': return '✗';
            case 'warning': return '⚠';
            case 'info': return '→';
        }
    };

    const summary = {
        pass: results.filter(r => r.status === 'pass').length,
        fail: results.filter(r => r.status === 'fail').length,
        warning: results.filter(r => r.status === 'warning').length,
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-3xl font-bold mb-2">TSL Type Compatibility Tests</h1>
                <p className="text-zinc-400 mb-6">
                    Testing actual Three.js TSL behavior to determine connection rules for the visual editor.
                </p>

                <button
                    onClick={runTests}
                    disabled={isRunning}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 rounded-lg font-medium mb-8 transition-colors"
                >
                    {isRunning ? 'Running Tests...' : 'Run Tests'}
                </button>

                {isComplete && (
                    <div className="mb-6 p-4 bg-zinc-900 rounded-lg border border-zinc-800">
                        <h2 className="font-semibold mb-2">Summary</h2>
                        <div className="flex gap-6">
                            <span className="text-green-500">{summary.pass} passed</span>
                            <span className="text-red-500">{summary.fail} failed</span>
                            <span className="text-yellow-500">{summary.warning} warnings</span>
                        </div>
                    </div>
                )}

                <div className="space-y-2">
                    {results.map((result, index) => (
                        <div
                            key={index}
                            className={`p-4 rounded-lg border ${result.status === 'info'
                                ? 'bg-zinc-900/50 border-zinc-800'
                                : 'bg-zinc-900 border-zinc-700'
                                }`}
                        >
                            <div className="flex items-start gap-3">
                                <span className={`font-mono text-lg ${getStatusColor(result.status)}`}>
                                    {getStatusIcon(result.status)}
                                </span>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium">{result.name}</span>
                                        <span className={`text-sm ${getStatusColor(result.status)}`}>
                                            {result.status.toUpperCase()}
                                        </span>
                                    </div>
                                    <p className="text-zinc-400 text-sm mt-1">{result.message}</p>
                                    {result.code && (
                                        <code className="block mt-2 text-xs bg-zinc-800 px-3 py-2 rounded font-mono text-zinc-300">
                                            {result.code}
                                        </code>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {results.length === 0 && (
                    <div className="text-center text-zinc-500 py-12">
                        Click &quot;Run Tests&quot; to start testing TSL type compatibility
                    </div>
                )}
            </div>
        </div>
    );
}
