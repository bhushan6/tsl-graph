
import { describe, it, expect, beforeAll } from 'vitest';
import { compileGraph, compilePostGraph, compileSubgraphCode, getRequiredImports } from './compiler';
import { Node, Edge } from '@xyflow/react';
import { TSLNodeData, GlobalContextEntry, NodeType, CodeNodeDefinition, SubgraphDefinition } from '@/lib/types';
import { registry } from './registry';
import { NodeDef } from './types';

// Mock registry data - comprehensive set of nodes
const mockDefs: NodeDef[] = [
    // Math nodes
    {
        type: 'math/add',
        label: 'Add',
        category: 'Math',
        tsl: 'add',
        inputs: { a: { type: 'any', default: 0, label: 'A' }, b: { type: 'any', default: 0, label: 'B' } },
        outputs: { out: { type: 'any', label: 'Out' } }
    },
    {
        type: 'math/mul',
        label: 'Multiply',
        category: 'Math',
        tsl: 'mul',
        inputs: { a: { type: 'any', default: 1, label: 'A' }, b: { type: 'any', default: 1, label: 'B' } },
        outputs: { out: { type: 'any', label: 'Out' } }
    },
    {
        type: 'math/sin',
        label: 'Sin',
        category: 'Math',
        tsl: 'sin',
        inputs: { x: { type: 'any', default: 0, label: 'X' } },
        outputs: { out: { type: 'any', label: 'Out' } }
    },
    {
        type: 'math/fract',
        label: 'Fract',
        category: 'Math',
        tsl: 'fract',
        inputs: { x: { type: 'any', default: 0, label: 'X' } },
        outputs: { out: { type: 'any', label: 'Out' } }
    },
    {
        type: 'math/normalize',
        label: 'Normalize',
        category: 'Math',
        tsl: 'normalize',
        inputs: { x: { type: 'any', default: [1, 0, 0], label: 'Vec' } },
        outputs: { out: { type: 'any', label: 'Vec' } }
    },
    {
        type: 'math/dot',
        label: 'Dot',
        category: 'Math',
        tsl: 'dot',
        inputs: { a: { type: 'any', default: [0, 0, 0], label: 'A' }, b: { type: 'any', default: [0, 1, 0], label: 'B' } },
        outputs: { out: { type: 'float', label: 'Out' } }
    },
    {
        type: 'math/mix',
        label: 'Mix',
        category: 'Math',
        tsl: 'mix',
        inputs: {
            a: { type: 'any', default: 0, label: 'A' },
            b: { type: 'any', default: 1, label: 'B' },
            t: { type: 'any', default: 0.5, label: 'T' }
        },
        outputs: { out: { type: 'any', label: 'Out' } }
    },
    {
        type: 'math/split',
        label: 'Split',
        category: 'Math',
        tsl: 'split',
        inputs: {
            in: { type: 'any', default: 0, label: 'In' },
        },
        outputs: {
            x: { type: 'float', label: 'X' },
            y: { type: 'float', label: 'Y' },
            z: { type: 'float', label: 'Z' },
            w: { type: 'float', label: 'W' },
            out: { type: 'any', label: 'Out' },
        },
    },
    // Material nodes
    {
        type: 'material/standard',
        label: 'Standard Material',
        category: 'Material',
        tsl: 'MeshStandardNodeMaterial',
        inputs: {
            colorNode: { type: 'color', default: '#ffffff', label: 'Color' },
            normalNode: { type: 'vec3', default: [0, 0, 0], label: 'Normal' },
            roughnessNode: { type: 'float', default: 0.5, label: 'Roughness' }
        }
    },
    {
        type: 'material/node',
        label: 'Node Material',
        category: 'Material',
        tsl: 'NodeMaterial',
        inputs: {
            fragmentNode: { type: 'vec4', default: [0, 0, 0, 1], label: 'Fragment', connectionOnly: true },
            vertexNode: { type: 'vec3', default: [0, 0, 0], label: 'Vertex', connectionOnly: true }
        }
    },
    // Constant nodes
    {
        type: 'const/float',
        label: 'Float',
        category: 'Constants',
        tsl: 'float',
        inputs: { value: { type: 'float', default: 0, label: 'Value' } },
        outputs: { out: { type: 'float', label: 'Out' } }
    },
    {
        type: 'const/int',
        label: 'Int',
        category: 'Constants',
        tsl: 'int',
        inputs: { value: { type: 'int', default: 0, label: 'Value' } },
        outputs: { out: { type: 'int', label: 'Out' } }
    },
    {
        type: 'const/vec3',
        label: 'Vec3',
        category: 'Constants',
        tsl: 'vec3',
        inputs: {
            x: { type: 'float', default: 0, label: 'X' },
            y: { type: 'float', default: 0, label: 'Y' },
            z: { type: 'float', default: 0, label: 'Z' }
        },
        outputs: { out: { type: 'vec3', label: 'XYZ' } }
    },
    {
        type: 'const/color',
        label: 'Color',
        category: 'Constants',
        tsl: 'color',
        inputs: { value: { type: 'color', default: '#ffffff', label: 'Color' } },
        outputs: { out: { type: 'color', label: 'RGB' } }
    },
    // Advanced nodes
    {
        type: 'advanced/var',
        label: 'Var',
        category: 'Advanced',
        tsl: 'Var',
        inputs: { node: { type: 'any', default: 0, label: 'Node' } },
        outputs: { out: { type: 'any', label: 'Out' } }
    },
    // Geometry nodes
    {
        type: 'geo/uv',
        label: 'UV',
        category: 'Geometry',
        tsl: 'uv',
        pure: true,
        callable: true,
        inputs: { index: { type: 'int', default: 0, label: 'Index' } },
        outputs: { out: { type: 'vec2', label: 'XY' } }
    },
    {
        type: 'geo/time',
        label: 'Time',
        category: 'Geometry',
        tsl: 'time',
        pure: true,
        outputs: { out: { type: 'float', label: 'Out' } }
    },
    {
        type: 'geo/camera',
        label: 'Camera',
        category: 'Geometry',
        tsl: 'camera',
        pure: true,
        outputs: {
            near: { type: 'float', label: 'Near' },
            far: { type: 'float', label: 'Far' },
            out: { type: 'vec2', label: 'Near/Far' },
        }
    },
    {
        type: 'advanced/perspectiveDepthToViewZ',
        label: 'Perspective Depth To View Z',
        category: 'Advanced',
        tsl: 'perspectiveDepthToViewZ',
        inputs: {
            depth: { type: 'float', default: 0, label: 'Depth' },
            near: { type: 'float', default: 0.01, label: 'Near' },
            far: { type: 'float', default: 2000, label: 'Far' },
        },
        outputs: { out: { type: 'float', label: 'Out' } }
    },
    {
        type: 'advanced/viewZToOrthographicDepth',
        label: 'View Z To Orthographic Depth',
        category: 'Advanced',
        tsl: 'viewZToOrthographicDepth',
        inputs: {
            viewZ: { type: 'float', default: 0, label: 'View Z' },
            near: { type: 'float', default: 0.01, label: 'Near' },
            far: { type: 'float', default: 2000, label: 'Far' },
        },
        outputs: { out: { type: 'float', label: 'Out' } }
    },
    {
        type: 'geo/normalWorld',
        label: 'Normal World',
        category: 'Geometry',
        tsl: 'normalWorld',
        pure: true,
        outputs: { out: { type: 'vec3', label: 'XYZ' } }
    },
    {
        type: 'texture/sampleNode',
        label: 'Sample Texture Node',
        category: 'Texture',
        tsl: 'texture',
        inputs: {
            texture: { type: 'any', label: 'Texture', connectionOnly: true },
            uv: { type: 'vec2', label: 'UV', connectionOnly: true },
        },
        outputs: { out: { type: 'vec4', label: 'Out' } }
    },
    // Logic Nodes
    {
        type: 'logic/select',
        label: 'Select',
        category: 'Logic',
        tsl: 'select',
        inputs: {
            cond: { type: 'bool', default: false, label: 'Cond' },
            trueVal: { type: 'any', default: 1, label: 'True' },
            falseVal: { type: 'any', default: 0, label: 'False' }
        },
        outputs: { out: { type: 'any', label: 'Out' } }
    },
    {
        type: 'logic/lessThan',
        label: 'Less Than',
        category: 'Logic',
        tsl: 'lessThan',
        inputs: { a: { type: 'any', default: 0, label: 'A' }, b: { type: 'any', default: 0, label: 'B' } },
        outputs: { out: { type: 'bool', label: 'Out' } }
    },
    {
        type: 'logic/and',
        label: 'And',
        category: 'Logic',
        tsl: 'and',
        inputs: { a: { type: 'bool', default: false, label: 'A' }, b: { type: 'bool', default: false, label: 'B' } },
        outputs: { out: { type: 'bool', label: 'Out' } }
    },
    {
        type: 'assign/assign',
        label: 'Assign',
        category: 'Advanced',
        tsl: '__assign__',
        inputs: {
            target: { type: 'any', default: 0, label: 'Target', connectionOnly: true },
            value: { type: 'any', default: 0, label: 'Value' }
        },
        outputs: { out: { type: 'any', label: 'Out' } }
    },
    {
        type: 'assign/addAssign',
        label: 'Add Assign',
        category: 'Advanced',
        tsl: '__add_assign__',
        inputs: {
            target: { type: 'any', default: 0, label: 'Target', connectionOnly: true },
            value: { type: 'any', default: 0, label: 'Value' }
        },
        outputs: { out: { type: 'any', label: 'Out' } }
    }
];


// Register mocks before tests
beforeAll(() => {
    registry.registerMany(mockDefs);
});

const createNode = (id: string, type: string, data: Partial<TSLNodeData> = {}): Node<TSLNodeData> => ({
    id,
    position: { x: 0, y: 0 },
    data: {
        type: type as NodeType,
        label: id,
        values: {},
        connected: {},
        ...data
    }
});

describe('compileGraph', () => {
    describe('Basic functionality', () => {
        it('should handle empty graph', () => {
            const code = compileGraph([], []);
            expect(code).toBe('// No nodes in graph');
        });

        it('should compile a simple material node', () => {
            const nodes = [createNode('mat', 'material/standard')];
            const code = compileGraph(nodes, []);
            expect(code).toContain('const material = new MeshStandardNodeMaterial();');
        });

        it('should compile a node material with fragment and vertex inputs', () => {
            const nodes = [
                createNode('frag', 'const/vec3', { values: { x: 0.1, y: 0.2, z: 0.3 } }),
                createNode('vert', 'const/vec3', { values: { x: 1, y: 2, z: 3 } }),
                createNode('mat', 'material/node'),
            ];
            const edges: Edge[] = [
                { id: 'e1', source: 'frag', sourceHandle: 'out', target: 'mat', targetHandle: 'fragmentNode' },
                { id: 'e2', source: 'vert', sourceHandle: 'out', target: 'mat', targetHandle: 'vertexNode' },
            ];
            const code = compileGraph(nodes, edges);
            expect(code).toContain('const material = new NodeMaterial();');
            expect(code).toContain('material.fragmentNode = _node0;');
            expect(code).toContain('material.vertexNode = _node1;');
        });

        it('should compile a uniform node in inline mode', () => {
            const nodes = [
                createNode('u1', 'const/uniform', { values: { uniformType: 'float', value: 0.25 } }),
            ];
            const code = compileGraph(nodes, []);
            const expected = [
                '// Generated TSL Code',
                '',
                'const _node0 = uniform(0.25);',
            ].join('\n');
            expect(code.trim()).toBe(expected.trim());
        });

        it('should compile a uniform node in runtime mode', () => {
            const nodes = [
                createNode('u1', 'const/uniform', { values: { uniformType: 'vec3', value: [1, 2, 3] } }),
            ];
            const code = compileGraph(nodes, [], undefined, undefined, { uniformMode: 'runtime' });
            const expected = [
                '// Generated TSL Code',
                '',
                'const _node0 = __uniform(\"u1\", new THREE.Vector3(1, 2, 3), \"vec3\");',
            ].join('\n');
            expect(code.trim()).toBe(expected.trim());
        });

        it('should compile global context references', () => {
            const nodes = [
                createNode('g1', 'global/ref', { values: { globalId: 'global-1' } }),
            ];
            const globals: GlobalContextEntry[] = [
                { id: 'global-1', name: 'uTime', kind: 'uniform', type: 'float', defaultValue: 1 },
            ];
            const code = compileGraph(nodes, [], undefined, undefined, { globals });
            const expected = [
                '// Global Context',
                'const uTime = uniform(float(1));',
                '',
                '// Generated TSL Code',
                '',
            ].join('\n');
            expect(code).toBe(expected);
            expect(() => new Function(code)).not.toThrow();
        });

        it('should use user-defined names when available', () => {
            const nodes = [
                createNode('add1', 'math/add', { values: { a: 1, b: 2, localName: 'mySum' } })
            ];
            const code = compileGraph(nodes, []);
            expect(code).toContain('const mySum = add(1, 2);');
        });

        it('should sanitize invalid variable names', () => {
            const nodes = [
                createNode('add1', 'math/add', { values: { a: 1, b: 2, localName: '123-invalid-name!' } })
            ];
            const code = compileGraph(nodes, []);
            expect(code).toContain('const _123_invalid_name_ = add(1, 2);');
        });

        it('should compile multi-op chains using method chaining', () => {
            const nodes = [
                createNode('chain1', 'math/multiOp', {
                    operations: [
                        { id: 'op1', op: 'add' },
                        { id: 'op2', op: 'mul' },
                        { id: 'op3', op: 'sub' },
                        { id: 'op4', op: 'clamp' },
                    ],
                    values: {
                        op_op1_a: 1,
                        op_op1_b: 2,
                        op_op2_b: 3,
                        op_op3_b: 10,
                        op_op4_min: 0,
                        op_op4_max: 1,
                    },
                })
            ];
            const code = compileGraph(nodes, []);
            expect(code).toContain('add(1, 2).mul(3).sub(10).clamp(0, 1)');
        });
    });

    describe('Code Nodes', () => {
        it('should compile WGSL code nodes with wgslFn and named args', () => {
            const nodes = [
                createNode('wgsl-node', 'code/wgsl-test'),
            ];

            const codeNodes: Record<string, CodeNodeDefinition> = {
                'code/wgsl-test': {
                    id: 'code/wgsl-test',
                    name: 'WGSL Test',
                    language: 'wgsl' as const,
                    code: `fn colorFn(baseColor: vec4f, uv: vec2f) -> vec4f { return baseColor; }`,
                    inputs: [
                        { id: 'in_0', label: 'baseColor', type: 'vec4' },
                        { id: 'in_1', label: 'uv', type: 'vec2' },
                    ],
                    output: { id: 'out', label: 'Result', type: 'vec4' },
                    createdAt: 0,
                    updatedAt: 0,
                }
            };

            const code = compileGraph(nodes, [], undefined, codeNodes);
            expect(code).toContain('wgslFn(`');
            expect(code).toContain('const WGSL_Test = wgslFn(`');
            expect(code).toContain('const _code_node_0 = WGSL_Test({ baseColor:');
            expect(code).toContain('uv:');
        });
    });

    describe('Numeric inputs', () => {
        it('should compile integer values', () => {
            const nodes = [createNode('add1', 'math/add', { values: { a: 10, b: 5 } })];
            const code = compileGraph(nodes, []);
            expect(code).toContain('add(10, 5)');
        });

        it('should compile float values', () => {
            const nodes = [createNode('add1', 'math/add', { values: { a: 10.5, b: -5.25 } })];
            const code = compileGraph(nodes, []);
            expect(code).toContain('add(10.5, -5.25)');
        });

        it('should compile zero values', () => {
            const nodes = [createNode('add1', 'math/add', { values: { a: 0, b: 0 } })];
            const code = compileGraph(nodes, []);
            expect(code).toContain('add(0, 0)');
        });

        it('should use default values when not specified', () => {
            const nodes = [createNode('add1', 'math/add')]; // Uses defaults from def
            const code = compileGraph(nodes, []);
            expect(code).toContain('add(0, 0)');
        });
    });

    describe('Vector inputs', () => {
        it('should compile vec2 arrays', () => {
            const nodes = [createNode('add1', 'math/add', { values: { a: [1, 2], b: [3, 4] } })];
            const code = compileGraph(nodes, []);
            expect(code).toContain('add(vec2(1, 2), vec2(3, 4))');
        });

        it('should compile vec3 arrays', () => {
            const nodes = [createNode('add1', 'math/add', { values: { a: [1, 0, 0], b: [0, 1, 0] } })];
            const code = compileGraph(nodes, []);
            expect(code).toContain('add(vec3(1, 0, 0), vec3(0, 1, 0))');
        });

        it('should compile vec4 arrays', () => {
            const nodes = [createNode('add1', 'math/add', { values: { a: [1, 0, 0, 1], b: [0, 1, 0, 0.5] } })];
            const code = compileGraph(nodes, []);
            expect(code).toContain('add(vec4(1, 0, 0, 1), vec4(0, 1, 0, 0.5))');
        });

        it('should handle mixed scalar and vector inputs', () => {
            const nodes = [createNode('add1', 'math/add', { values: { a: [1, 2, 3], b: 5 } })];
            const code = compileGraph(nodes, []);
            expect(code).toContain('add(vec3(1, 2, 3), 5)');
        });

        it('should use default vector values from definition', () => {
            const nodes = [createNode('norm1', 'math/normalize')]; // default: [1, 0, 0]
            const code = compileGraph(nodes, []);
            expect(code).toContain('normalize(vec3(1, 0, 0))');
        });

        it('should compile dot product with vector defaults', () => {
            const nodes = [createNode('dot1', 'math/dot')]; // defaults: [0,0,0], [0,1,0]
            const code = compileGraph(nodes, []);
            expect(code).toContain('dot(vec3(0, 0, 0), vec3(0, 1, 0))');
        });
    });

    describe('Color inputs', () => {
        it('should compile color hex values', () => {
            const nodes = [createNode('c1', 'const/color', { values: { value: '#ff0000' } })];
            const code = compileGraph(nodes, []);
            expect(code).toContain('color("#ff0000")');
        });

        it('should use default color when not specified', () => {
            const nodes = [createNode('c1', 'const/color')]; // default: #ffffff
            const code = compileGraph(nodes, []);
            expect(code).toContain('color("#ffffff")');
        });
    });

    describe('Pure nodes (no inputs)', () => {
        it('should compile UV node with parentheses', () => {
            const nodes = [createNode('uv1', 'geo/uv')];
            const code = compileGraph(nodes, []);
            expect(code).toContain('const _node0 = uv(0);');
        });

        it('should compile time node without parentheses', () => {
            const nodes = [createNode('t1', 'geo/time')];
            const code = compileGraph(nodes, []);
            expect(code).toContain('time;');
        });

        it('should compile normal node without parentheses', () => {
            const nodes = [createNode('n1', 'geo/normalWorld')];
            const code = compileGraph(nodes, []);
            expect(code).toContain('normalWorld;');
        });
    });

    describe('Connected nodes', () => {
        it('should connect two math nodes', () => {
            const nodes = [
                createNode('add1', 'math/add', { values: { a: 1, b: 2 } }),
                createNode('mul1', 'math/mul', { values: { a: 3, b: 4 } })
            ];
            const edges: Edge[] = [
                { id: 'e1', source: 'add1', sourceHandle: 'out', target: 'mul1', targetHandle: 'a' }
            ];
            const code = compileGraph(nodes, edges);

            expect(code).toContain('const _node0 = add(1, 2);');
            expect(code).toContain('mul(_node0, 4)');
        });

        it('should connect geometry node to math node', () => {
            const nodes = [
                createNode('t1', 'geo/time'),
                createNode('sin1', 'math/sin')
            ];
            const edges: Edge[] = [
                { id: 'e1', source: 't1', sourceHandle: 'out', target: 'sin1', targetHandle: 'x' }
            ];
            const code = compileGraph(nodes, edges);

            expect(code).toContain('const _node0 = time;');
            expect(code).toContain('sin(_node0)');
        });

        it('should connect node to material', () => {
            const nodes = [
                createNode('add1', 'math/add', { values: { a: 1, b: 2 } }),
                createNode('mat', 'material/standard')
            ];
            const edges: Edge[] = [
                { id: 'e1', source: 'add1', sourceHandle: 'out', target: 'mat', targetHandle: 'colorNode' }
            ];
            const code = compileGraph(nodes, edges);

            expect(code).toContain('material.colorNode = _node0;');
        });

        it('should compile only active material inputs when unconnected', () => {
            const nodes = [
                createNode('mat', 'material/standard', { activeInputs: ['colorNode'] })
            ];
            const code = compileGraph(nodes, []);

            expect(code).toContain('material.colorNode =');
            expect(code).not.toContain('material.roughnessNode');
            expect(code).not.toContain('material.side');
        });

        it('should still compile connected material inputs even if inactive', () => {
            const nodes = [
                createNode('add1', 'math/add', { values: { a: 1, b: 2 } }),
                createNode('mat', 'material/standard', { activeInputs: [] })
            ];
            const edges: Edge[] = [
                { id: 'e1', source: 'add1', sourceHandle: 'out', target: 'mat', targetHandle: 'roughnessNode' }
            ];
            const code = compileGraph(nodes, edges);

            expect(code).toContain('material.roughnessNode = _node0;');
        });

        it('should handle swizzle outputs (component access)', () => {
            const nodes = [
                createNode('v1', 'const/vec3', { values: { x: 1, y: 2, z: 3 } }),
                createNode('add1', 'math/add', { values: { b: 10 } })
            ];
            const edges: Edge[] = [
                { id: 'e1', source: 'v1', sourceHandle: 'x', target: 'add1', targetHandle: 'a' }
            ];
            const code = compileGraph(nodes, edges);

            expect(code).toContain('add(_node0.x, 10)');
        });

        it('should compile camera near/far handles into perspectiveDepthToViewZ', () => {
            const nodes = [
                createNode('cam', 'geo/camera'),
                createNode('depthToViewZ', 'advanced/perspectiveDepthToViewZ', { values: { depth: 0.5 } }),
            ];
            const edges: Edge[] = [
                { id: 'e1', source: 'cam', sourceHandle: 'near', target: 'depthToViewZ', targetHandle: 'near' },
                { id: 'e2', source: 'cam', sourceHandle: 'far', target: 'depthToViewZ', targetHandle: 'far' },
            ];
            const code = compileGraph(nodes, edges);

            expect(code).toContain('const _node0 = vec2(cameraNear, cameraFar);');
            expect(code).toContain('perspectiveDepthToViewZ(0.5, _node0.x, _node0.y)');
        });

        it('should wrap default near/far literals for perspectiveDepthToViewZ', () => {
            const nodes = [
                createNode('depthToViewZ', 'advanced/perspectiveDepthToViewZ', { values: { depth: 0.5 } }),
            ];
            const code = compileGraph(nodes, []);

            expect(code).toContain('perspectiveDepthToViewZ(0.5, float(0.01), float(2000))');
        });

        it('should compile depth -> viewZ -> linear depth chain', () => {
            const nodes = [
                createNode('cam', 'geo/camera'),
                createNode('depthToViewZ', 'advanced/perspectiveDepthToViewZ', { values: { depth: 0.5 } }),
                createNode('toLinear', 'advanced/viewZToOrthographicDepth'),
            ];
            const edges: Edge[] = [
                { id: 'e1', source: 'cam', sourceHandle: 'near', target: 'depthToViewZ', targetHandle: 'near' },
                { id: 'e2', source: 'cam', sourceHandle: 'far', target: 'depthToViewZ', targetHandle: 'far' },
                { id: 'e3', source: 'depthToViewZ', sourceHandle: 'out', target: 'toLinear', targetHandle: 'viewZ' },
                { id: 'e4', source: 'cam', sourceHandle: 'near', target: 'toLinear', targetHandle: 'near' },
                { id: 'e5', source: 'cam', sourceHandle: 'far', target: 'toLinear', targetHandle: 'far' },
            ];
            const code = compileGraph(nodes, edges);

            expect(code).toContain('perspectiveDepthToViewZ(0.5, _node0.x, _node0.y)');
            expect(code).toContain('viewZToOrthographicDepth(_node1, _node0.x, _node0.y)');
        });

    it('should handle complex node chains', () => {
            const nodes = [
                createNode('t1', 'geo/time'),
                createNode('sin1', 'math/sin'),
                createNode('add1', 'math/add', { values: { b: 0.5 } }),
                createNode('mat', 'material/standard')
            ];
            const edges: Edge[] = [
                { id: 'e1', source: 't1', sourceHandle: 'out', target: 'sin1', targetHandle: 'x' },
                { id: 'e2', source: 'sin1', sourceHandle: 'out', target: 'add1', targetHandle: 'a' },
                { id: 'e3', source: 'add1', sourceHandle: 'out', target: 'mat', targetHandle: 'roughnessNode' }
            ];
            const code = compileGraph(nodes, edges);

            expect(code).toContain('const _node0 = time;');
            expect(code).toContain('sin(_node0)');
            expect(code).toContain('add(_node1, 0.5)');
            expect(code).toContain('material.roughnessNode = _node2;');
        });
    });

    describe('Multi-input nodes', () => {
        it('should compile mix node with three inputs', () => {
            const nodes = [createNode('mix1', 'math/mix', { values: { a: 0, b: 1, t: 0.5 } })];
            const code = compileGraph(nodes, []);
            expect(code).toContain('mix(0, 1, 0.5)');
        });

        it('should compile mix with vector inputs', () => {
            const nodes = [createNode('mix1', 'math/mix', {
                values: { a: [1, 0, 0], b: [0, 1, 0], t: 0.5 }
            })];
            const code = compileGraph(nodes, []);
            expect(code).toContain('mix(vec3(1, 0, 0), vec3(0, 1, 0), 0.5)');
        });
    });
});

describe('compilePostGraph', () => {
    it('compiles a connected post graph', () => {
        const nodes = [
            createNode('post-input', 'post/input'),
            createNode('post-output', 'post/output'),
        ];
        const edges: Edge[] = [
            { id: 'e1', source: 'post-input', sourceHandle: 'color', target: 'post-output', targetHandle: 'color' },
        ];

        const result = compilePostGraph(nodes, edges);
        expect(result.functionName).toMatch(/^PostGraph/);
        expect(result.code).toContain('return arg_in_color;');
    });

    it('compiles post graph texture sampling from scene input', () => {
        const nodes = [
            createNode('post-input', 'post/input'),
            createNode('uv0', 'geo/uv'),
            createNode('sample', 'texture/sampleNode'),
            createNode('post-output', 'post/output'),
        ];
        const edges: Edge[] = [
            { id: 'e1', source: 'post-input', sourceHandle: 'sceneTexture', target: 'sample', targetHandle: 'texture' },
            { id: 'e2', source: 'uv0', sourceHandle: 'out', target: 'sample', targetHandle: 'uv' },
            { id: 'e3', source: 'sample', sourceHandle: 'out', target: 'post-output', targetHandle: 'color' },
        ];

        const result = compilePostGraph(nodes, edges);
        expect(result.code).toContain('texture(arg_in_sceneTexture,');
    });

    it('uses screenUV by default when sample texture uv is not connected', () => {
        const nodes = [
            createNode('post-input', 'post/input'),
            createNode('sample', 'texture/sampleNode'),
            createNode('post-output', 'post/output'),
        ];
        const edges: Edge[] = [
            { id: 'e1', source: 'post-input', sourceHandle: 'sceneTexture', target: 'sample', targetHandle: 'texture' },
            { id: 'e2', source: 'sample', sourceHandle: 'out', target: 'post-output', targetHandle: 'color' },
        ];

        const result = compilePostGraph(nodes, edges);
        expect(result.code).toContain('texture(arg_in_sceneTexture, screenUV)');
    });

    it('maps depth input handle for post graph', () => {
        const nodes = [
            createNode('post-input', 'post/input'),
            createNode('add', 'math/add', { values: { b: 1 } }),
            createNode('post-output', 'post/output'),
        ];
        const edges: Edge[] = [
            { id: 'e1', source: 'post-input', sourceHandle: 'depth', target: 'add', targetHandle: 'a' },
            { id: 'e2', source: 'add', sourceHandle: 'out', target: 'post-output', targetHandle: 'color' },
        ];

        const result = compilePostGraph(nodes, edges);
        expect(result.code).toContain('add(arg_in_depth, 1)');
    });

    it('maps depthTexture input handle for post graph', () => {
        const nodes = [
            createNode('post-input', 'post/input'),
            createNode('sample', 'texture/sampleNode'),
            createNode('post-output', 'post/output'),
        ];
        const edges: Edge[] = [
            { id: 'e1', source: 'post-input', sourceHandle: 'depthTexture', target: 'sample', targetHandle: 'texture' },
            { id: 'e2', source: 'sample', sourceHandle: 'out', target: 'post-output', targetHandle: 'color' },
        ];

        const result = compilePostGraph(nodes, edges);
        expect(result.code).toContain('texture(arg_in_depthTexture, screenUV)');
    });

    it('maps normal input handle for post graph', () => {
        const nodes = [
            createNode('post-input', 'post/input'),
            createNode('sample', 'texture/sampleNode'),
            createNode('post-output', 'post/output'),
        ];
        const edges: Edge[] = [
            { id: 'e1', source: 'post-input', sourceHandle: 'normal', target: 'sample', targetHandle: 'texture' },
            { id: 'e2', source: 'sample', sourceHandle: 'out', target: 'post-output', targetHandle: 'color' },
        ];

        const result = compilePostGraph(nodes, edges);
        expect(result.code).toContain('texture(arg_in_normal, screenUV)');
    });

    it('compiles geo/camera in post graph using camera.near/camera.far', () => {
        const nodes = [
            createNode('post-input', 'post/input'),
            createNode('cam', 'geo/camera'),
            createNode('depthToViewZ', 'advanced/perspectiveDepthToViewZ', { values: { depth: 0.5 } }),
            createNode('post-output', 'post/output'),
        ];
        const edges: Edge[] = [
            { id: 'e1', source: 'cam', sourceHandle: 'near', target: 'depthToViewZ', targetHandle: 'near' },
            { id: 'e2', source: 'cam', sourceHandle: 'far', target: 'depthToViewZ', targetHandle: 'far' },
            { id: 'e3', source: 'depthToViewZ', sourceHandle: 'out', target: 'post-output', targetHandle: 'color' },
        ];

        const result = compilePostGraph(nodes, edges);
        expect(result.code).toContain('vec2(camera.near, camera.far)');
        expect(result.code).not.toContain(' = camera;');
        expect(result.code).not.toContain('arg_in_cameraNear');
        expect(result.code).not.toContain('arg_in_cameraFar');
    });

    it('wraps default near/far literals for post perspectiveDepthToViewZ', () => {
        const nodes = [
            createNode('post-input', 'post/input'),
            createNode('depthToViewZ', 'advanced/perspectiveDepthToViewZ', { values: { depth: 0.5 } }),
            createNode('post-output', 'post/output'),
        ];
        const edges: Edge[] = [
            { id: 'e1', source: 'depthToViewZ', sourceHandle: 'out', target: 'post-output', targetHandle: 'color' },
        ];

        const result = compilePostGraph(nodes, edges);
        expect(result.code).toContain('perspectiveDepthToViewZ(0.5, float(0.01), float(2000))');
    });

    it('throws when post output is disconnected', () => {
        const nodes = [
            createNode('post-input', 'post/input'),
            createNode('post-output', 'post/output'),
        ];

        expect(() => compilePostGraph(nodes, [])).toThrow('Post output is not connected.');
    });
});

describe('compileSubgraphCode', () => {
    it('should compile a subgraph function with inputs/outputs', () => {
        const addNode = createNode('add1', 'math/add');

        const subgraph: SubgraphDefinition = {
            id: 'custom/my-subgraph',
            name: 'My Subgraph',
            inputs: [
                { id: 'in_0', label: 'a', type: 'float' },
                { id: 'in_1', label: 'b', type: 'float' },
            ],
            outputs: [{ id: 'out_0', label: 'out', type: 'float' }],
            nodes: [addNode],
            edges: [
                { id: 'e1', source: 'subgraph-input', sourceHandle: 'in_0', target: 'add1', targetHandle: 'a' },
                { id: 'e2', source: 'subgraph-input', sourceHandle: 'in_1', target: 'add1', targetHandle: 'b' },
                { id: 'e3', source: 'add1', sourceHandle: 'out', target: 'subgraph-output', targetHandle: 'out_0' },
            ],
            createdAt: 0,
            updatedAt: 0,
        };

        const code = compileSubgraphCode(subgraph);
        const expected = [
            '// Subgraph Definition: My Subgraph',
            'const My_Subgraph = Fn(([arg_in_0, arg_in_1]) => {',
            '    const _subgraph_node0 = add(arg_in_0, arg_in_1);',
            '    return _subgraph_node0;',
            '});',
        ].join('\n');

        expect(code).toBe(expected);
        expect(() => new Function(code)).not.toThrow();
    });

    it('should compile loop groups inside subgraphs', () => {
        const loop = createNode('loop1', 'loop');
        const count = { ...createNode('loop1::count', 'loop/count', { values: { count: 3 } }), parentId: 'loop1' };
        const index = { ...createNode('loop1::index', 'loop/index'), parentId: 'loop1' };
        const acc = { ...createNode('loop1::acc', 'loop/accumulator', { values: { seed: 0.2 } }), parentId: 'loop1' };
        const output = { ...createNode('loop1::output', 'loop/output'), parentId: 'loop1' };
        const c2 = { ...createNode('loop1::c2', 'const/float', { values: { value: 2 } }), parentId: 'loop1' };
        const add1 = { ...createNode('loop1::add', 'math/add'), parentId: 'loop1' };

        const edges: Edge[] = [
            { id: 'e1', source: acc.id, sourceHandle: 'acc', target: add1.id, targetHandle: 'a' },
            { id: 'e2', source: c2.id, sourceHandle: 'out', target: add1.id, targetHandle: 'b' },
            { id: 'e3', source: add1.id, sourceHandle: 'out', target: output.id, targetHandle: 'next' },
        ];

        const subgraph = {
            id: 'custom/loop-subgraph',
            name: 'Loop Subgraph',
            inputs: [],
            outputs: [],
            nodes: [loop, count, index, acc, output, c2, add1],
            edges,
            createdAt: 0,
            updatedAt: 0,
        };

        const code = compileSubgraphCode(subgraph);
        expect(code).toContain('Loop(');
        expect(code).toContain('Var(');
        expect(code).toContain('.assign(');
        expect(code).not.toContain('__loop_');
        expect(() => new Function(code)).not.toThrow();
    });
});

describe('Logic Nodes', () => {
    it('should compile select node (ternary)', () => {
        const nodes = [createNode('sel1', 'logic/select', { values: { cond: true, trueVal: 1.0, falseVal: 0.0 } })];
        const code = compileGraph(nodes, []);
        expect(code).toContain('select(true, 1, 0)');
    });

    it('should compile comparison node', () => {
        const nodes = [createNode('lt1', 'logic/lessThan', { values: { a: 1, b: 2 } })];
        const code = compileGraph(nodes, []);
        expect(code).toContain('lessThan(1, 2)');
    });

    it('should compile boolean logic node', () => {
        const nodes = [createNode('and1', 'logic/and', { values: { a: true, b: false } })];
        const code = compileGraph(nodes, []);
        expect(code).toContain('and(true, false)');
    });

    it('should compile complex conditional color', () => {
        // if (time > 0.5) ? red : blue
        const nodes = [
            createNode('t1', 'geo/time'),
            createNode('lt1', 'logic/lessThan', { values: { b: 0.5 } }),
            createNode('c_red', 'const/color', { values: { value: '#ff0000' } }),
            createNode('c_blue', 'const/color', { values: { value: '#0000ff' } }),
            createNode('sel1', 'logic/select')
        ];

        const edges: Edge[] = [
            { id: 'e1', source: 't1', sourceHandle: 'out', target: 'lt1', targetHandle: 'a' },
            { id: 'e2', source: 'lt1', sourceHandle: 'out', target: 'sel1', targetHandle: 'cond' },
            { id: 'e3', source: 'c_red', sourceHandle: 'out', target: 'sel1', targetHandle: 'trueVal' },
            { id: 'e4', source: 'c_blue', sourceHandle: 'out', target: 'sel1', targetHandle: 'falseVal' }
        ];

        const code = compileGraph(nodes, edges);

        // Check for existence of all parts
        expect(code).toContain('const _node0 = time;'); // t1
        expect(code).toContain('lessThan(_node0, 0.5)'); // lt1
        expect(code).toContain('color("#ff0000")'); // red
        expect(code).toContain('color("#0000ff")'); // blue
        expect(code).toContain('select(');
    });

    it('should compile component-wise vector comparison', () => {
        // select(vec3(0,1,0) < vec3(1,0,0), red, blue)
        // This should result in component-wise selection
        const nodes = [
            createNode('v_a', 'const/vec3', { values: { x: 0, y: 1, z: 0 } }),
            createNode('v_b', 'const/vec3', { values: { x: 1, y: 0, z: 0 } }),
            createNode('less', 'logic/lessThan'),
            createNode('c_red', 'const/color', { values: { value: '#ff0000' } }),
            createNode('c_blue', 'const/color', { values: { value: '#0000ff' } }),
            createNode('sel1', 'logic/select')
        ];

        const edges: Edge[] = [
            { id: 'e1', source: 'v_a', sourceHandle: 'out', target: 'less', targetHandle: 'a' },
            { id: 'e2', source: 'v_b', sourceHandle: 'out', target: 'less', targetHandle: 'b' },
            { id: 'e3', source: 'less', sourceHandle: 'out', target: 'sel1', targetHandle: 'cond' },
            { id: 'e4', source: 'c_red', sourceHandle: 'out', target: 'sel1', targetHandle: 'trueVal' },
            { id: 'e5', source: 'c_blue', sourceHandle: 'out', target: 'sel1', targetHandle: 'falseVal' }
        ];

        const code = compileGraph(nodes, edges);
        // The compiler generates matches using variables, so we check for the structure
        expect(code).toContain('lessThan(_node');
        expect(code).toContain('select(_node');

    });

    describe('Loop groups', () => {
        it('should compile a loop group with accumulator assignment', () => {
            const loop = createNode('loop1', 'loop');
            const count = { ...createNode('loop1::count', 'loop/count', { values: { count: 3 } }), parentId: 'loop1' };
            const index = { ...createNode('loop1::index', 'loop/index'), parentId: 'loop1' };
            const acc = { ...createNode('loop1::acc', 'loop/accumulator', { values: { seed: 0.2 } }), parentId: 'loop1' };
            const output = { ...createNode('loop1::output', 'loop/output'), parentId: 'loop1' };
            const c2 = { ...createNode('c2', 'const/float', { values: { value: 2 } }), parentId: 'loop1' };
            const add1 = { ...createNode('add1', 'math/add'), parentId: 'loop1' };

            const edges: Edge[] = [
                { id: 'e1', source: acc.id, sourceHandle: 'acc', target: add1.id, targetHandle: 'a' },
                { id: 'e2', source: c2.id, sourceHandle: 'out', target: add1.id, targetHandle: 'b' },
                { id: 'e3', source: add1.id, sourceHandle: 'out', target: output.id, targetHandle: 'next' },
            ];

            const nodes = [loop, count, index, acc, output, c2, add1];
            const code = compileGraph(nodes, edges);

            expect(code).toContain('Loop(');
            expect(code).toContain('Var(');
            expect(code).toContain('.assign(');
            expect(code).toContain('max(int(');
        });

        it('should allow missing output (no assign)', () => {
            const loop = createNode('loop2', 'loop');
            const count = { ...createNode('loop2::count', 'loop/count', { values: { count: 2 } }), parentId: 'loop2' };
            const acc = { ...createNode('loop2::acc', 'loop/accumulator', { values: { seed: 1 } }), parentId: 'loop2' };
            const output = { ...createNode('loop2::output', 'loop/output'), parentId: 'loop2' };

            const nodes = [loop, count, acc, output];
            const code = compileGraph(nodes, []);

            expect(code).toContain('Loop(');
            expect(code).not.toContain('.assign(');
        });

        it('should default seed to float(0) when missing', () => {
            const loop = createNode('loop3', 'loop');
            const count = { ...createNode('loop3::count', 'loop/count', { values: { count: 1 } }), parentId: 'loop3' };
            const acc = { ...createNode('loop3::acc', 'loop/accumulator'), parentId: 'loop3' };
            const output = { ...createNode('loop3::output', 'loop/output'), parentId: 'loop3' };

            const nodes = [loop, count, acc, output];
            const code = compileGraph(nodes, []);

            expect(code).toContain('Var(float(0))');
        });

        it('should compile loop example with uv seed and fract assignment', () => {
            const uv = createNode('uv0', 'geo/uv', { values: { index: 0 } });
            const countConst = createNode('count0', 'const/int', { values: { value: 1 } });
            const loop = createNode('loopExample', 'loop', { localName: 'loop2' });
            const count = { ...createNode('loopExample::count', 'loop/count'), parentId: 'loopExample' };
            const index = { ...createNode('loopExample::index', 'loop/index'), parentId: 'loopExample' };
            const acc = { ...createNode('loopExample::acc', 'loop/accumulator'), parentId: 'loopExample' };
            const output = { ...createNode('loopExample::output', 'loop/output'), parentId: 'loopExample' };
            const c10 = { ...createNode('loopExample::c10', 'const/float', { values: { value: 10 } }), parentId: 'loopExample' };
            const mul = { ...createNode('loopExample::mul', 'math/mul'), parentId: 'loopExample' };
            const fract = { ...createNode('loopExample::fract', 'math/fract'), parentId: 'loopExample' };

            const edges: Edge[] = [
                { id: 'e1', source: uv.id, sourceHandle: 'out', target: acc.id, targetHandle: 'seed' },
                { id: 'e2', source: countConst.id, sourceHandle: 'out', target: count.id, targetHandle: 'count' },
                { id: 'e3', source: uv.id, sourceHandle: 'out', target: mul.id, targetHandle: 'a' },
                { id: 'e4', source: c10.id, sourceHandle: 'out', target: mul.id, targetHandle: 'b' },
                { id: 'e5', source: mul.id, sourceHandle: 'out', target: fract.id, targetHandle: 'x' },
                { id: 'e6', source: fract.id, sourceHandle: 'out', target: output.id, targetHandle: 'next' },
            ];

            const nodes = [uv, countConst, loop, count, index, acc, output, c10, mul, fract];
            const code = compileGraph(nodes, edges);

            const expected = [
                '// Generated TSL Code',
                '',
                'const _node0 = uv(0);',
                'const _node1 = int(1);',
                'const loop2_count = max(int(_node1), 0);',
                'const loop2_fn = Fn(() => {',
                '    const loop2_acc = Var(_node0);',
                '    Loop(loop2_count, ({ i }) => {',
                '        const _node3 = float(10);',
                '        const _node4 = mul(_node0, _node3);',
                '        const _node5 = fract(_node4);',
                '        loop2_acc.assign(_node5);',
                '    });',
                '    return loop2_acc;',
                '});',
                'const loop2 = loop2_fn();',
            ].join('\n');

            expect(code.trim()).toBe(expected.trim());
        });

        it('should compile range loop config', () => {
            const loop = createNode('loopRange', 'loop', {
                values: { loopMode: 'range', loopType: 'int', loopCompare: '<' }
            });
            const start = { ...createNode('loopRange::start', 'loop/start', { values: { start: 0 } }), parentId: 'loopRange' };
            const end = { ...createNode('loopRange::end', 'loop/end', { values: { end: 10 } }), parentId: 'loopRange' };
            const index = { ...createNode('loopRange::index', 'loop/index'), parentId: 'loopRange' };
            const acc = { ...createNode('loopRange::acc', 'loop/accumulator'), parentId: 'loopRange' };
            const output = { ...createNode('loopRange::output', 'loop/output'), parentId: 'loopRange' };

            const nodes = [loop, start, end, index, acc, output];
            const code = compileGraph(nodes, []);

            expect(code).toContain(`Loop({ start: 0, end: 10, type: 'int', condition: '<', name: 'i' }, ({ i }) => {`);
        });

        it('should compile reverse loop config', () => {
            const loop = createNode('loopReverse', 'loop', {
                values: { loopMode: 'reverse', loopType: 'int', loopCompare: '>' }
            });
            const start = { ...createNode('loopReverse::start', 'loop/start', { values: { start: 10 } }), parentId: 'loopReverse' };
            const index = { ...createNode('loopReverse::index', 'loop/index'), parentId: 'loopReverse' };
            const acc = { ...createNode('loopReverse::acc', 'loop/accumulator'), parentId: 'loopReverse' };
            const output = { ...createNode('loopReverse::output', 'loop/output'), parentId: 'loopReverse' };

            const nodes = [loop, start, index, acc, output];
            const code = compileGraph(nodes, []);

            expect(code).toContain(`Loop({ start: 10, type: 'int', condition: '>', name: 'i' }, ({ i }) => {`);
        });

        it('should compile nested loop', () => {
            const loop = createNode('loopNested', 'loop', {
                values: { loopMode: 'nested' }
            });
            const count = { ...createNode('loopNested::count', 'loop/count', { values: { count: 3 } }), parentId: 'loopNested' };
            const index = { ...createNode('loopNested::index', 'loop/index'), parentId: 'loopNested' };
            const count2 = { ...createNode('loopNested::count2', 'loop/count2', { values: { count: 5 } }), parentId: 'loopNested' };
            const index2 = { ...createNode('loopNested::index2', 'loop/index2'), parentId: 'loopNested' };
            const acc = { ...createNode('loopNested::acc', 'loop/accumulator'), parentId: 'loopNested' };
            const output = { ...createNode('loopNested::output', 'loop/output'), parentId: 'loopNested' };

            const nodes = [loop, count, index, count2, index2, acc, output];
            const code = compileGraph(nodes, []);

            expect(code).toContain('({ i, j }) => {');
        });

        it('should compile condition loop', () => {
            const loop = createNode('loopCond', 'loop', {
                values: { loopMode: 'condition' }
            });
            const condition = { ...createNode('loopCond::condition', 'loop/condition', { values: { cond: true } }), parentId: 'loopCond' };
            const acc = { ...createNode('loopCond::acc', 'loop/accumulator'), parentId: 'loopCond' };
            const output = { ...createNode('loopCond::output', 'loop/output'), parentId: 'loopCond' };

            const nodes = [loop, condition, acc, output];
            const code = compileGraph(nodes, []);

            expect(code).toContain('Loop(true, () => {');
        });
    });

    describe('Assign nodes', () => {
        it('should compile assign node as method call and return target', () => {
            const target = createNode('t1', 'const/float', { values: { value: 0 } });
            const value = createNode('v1', 'const/float', { values: { value: 1 } });
            const assignNode = createNode('assign1', 'assign/assign');

            const edges: Edge[] = [
                { id: 'e1', source: target.id, sourceHandle: 'out', target: assignNode.id, targetHandle: 'target' },
                { id: 'e2', source: value.id, sourceHandle: 'out', target: assignNode.id, targetHandle: 'value' },
            ];

            const nodes = [target, value, assignNode];
            const code = compileGraph(nodes, edges);

            const expected = [
                '// Generated TSL Code',
                '',
                'const _node0 = float(0);',
                'const _node1 = float(1);',
                'const _assign_2 = Fn(() => {',
                '    _node0.assign(_node1);',
                '    return _node0;',
                '});',
                'const _node2 = _assign_2();',
            ].join('\n');

            expect(code.trim()).toBe(expected.trim());
        });

        it('should compile addAssign method', () => {
            const target = createNode('t1', 'const/float', { values: { value: 0 } });
            const value = createNode('v1', 'const/float', { values: { value: 2 } });
            const addAssignNode = createNode('assign2', 'assign/addAssign');

            const edges: Edge[] = [
                { id: 'e1', source: target.id, sourceHandle: 'out', target: addAssignNode.id, targetHandle: 'target' },
                { id: 'e2', source: value.id, sourceHandle: 'out', target: addAssignNode.id, targetHandle: 'value' },
            ];

            const nodes = [target, value, addAssignNode];
            const code = compileGraph(nodes, edges);

            const expected = [
                '// Generated TSL Code',
                '',
                'const _node0 = float(0);',
                'const _node1 = float(2);',
                'const _assign_2 = Fn(() => {',
                '    _node0.addAssign(_node1);',
                '    return _node0;',
                '});',
                'const _node2 = _assign_2();',
            ].join('\n');

            expect(code.trim()).toBe(expected.trim());
        });

        it('should assign to Var swizzles when target comes from split(Var)', () => {
            const vec = createNode('vec1', 'const/vec3', { values: { x: 0, y: 0, z: 0 } });
            const varNode = createNode('var1', 'advanced/var', { localName: 'position' });
            const splitNode = createNode('split1', 'math/split');
            const value = createNode('v1', 'const/float', { values: { value: 1 } });
            const addAssignNode = createNode('assign3', 'assign/addAssign');

            const edges: Edge[] = [
                { id: 'e1', source: vec.id, sourceHandle: 'out', target: varNode.id, targetHandle: 'node' },
                { id: 'e2', source: varNode.id, sourceHandle: 'out', target: splitNode.id, targetHandle: 'in' },
                { id: 'e3', source: splitNode.id, sourceHandle: 'y', target: addAssignNode.id, targetHandle: 'target' },
                { id: 'e4', source: value.id, sourceHandle: 'out', target: addAssignNode.id, targetHandle: 'value' },
            ];

            const nodes = [vec, varNode, splitNode, value, addAssignNode];
            const code = compileGraph(nodes, edges);

            expect(code).toContain('const position = Var(');
            expect(code).toContain('position.y.addAssign(');
        });
    });
});

describe('getRequiredImports', () => {

    it('should return empty array for no nodes', () => {
        const imports = getRequiredImports([]);
        expect(imports).toEqual([]);
    });

    it('should include node TSL functions', () => {
        const nodes = [
            createNode('add1', 'math/add'),
            createNode('sin1', 'math/sin')
        ];
        const imports = getRequiredImports(nodes);
        expect(imports).toContain('add');
        expect(imports).toContain('sin');
    });

    it('should include camera/depth conversion imports', () => {
        const nodes = [
            createNode('cam', 'geo/camera'),
            createNode('depthToViewZ', 'advanced/perspectiveDepthToViewZ'),
            createNode('toLinear', 'advanced/viewZToOrthographicDepth'),
        ];
        const imports = getRequiredImports(nodes);
        expect(imports).toEqual(expect.arrayContaining([
            'cameraNear',
            'cameraFar',
            'perspectiveDepthToViewZ',
            'viewZToOrthographicDepth',
        ]));
        expect(imports).not.toContain('camera');
    });

    it('should include material type', () => {
        const nodes = [createNode('mat', 'material/standard')];
        const imports = getRequiredImports(nodes);
        expect(imports).toContain('MeshStandardNodeMaterial');
    });

    it('should include vec2 when node has vec2 value', () => {
        const nodes = [createNode('add1', 'math/add', { values: { a: [1, 2] } })];
        const imports = getRequiredImports(nodes);
        expect(imports).toContain('vec2');
    });

    it('should include vec3 when node has vec3 value', () => {
        const nodes = [createNode('add1', 'math/add', { values: { a: [1, 2, 3] } })];
        const imports = getRequiredImports(nodes);
        expect(imports).toContain('vec3');
    });

    it('should include vec4 when node has vec4 value', () => {
        const nodes = [createNode('add1', 'math/add', { values: { a: [1, 2, 3, 4] } })];
        const imports = getRequiredImports(nodes);
        expect(imports).toContain('vec4');
    });

    it('should include screenUV for sample texture node default UV', () => {
        const nodes = [createNode('sample', 'texture/sampleNode')];
        const imports = getRequiredImports(nodes);
        expect(imports).toContain('screenUV');
    });

    it('should return sorted imports', () => {
        const nodes = [
            createNode('sin1', 'math/sin'),
            createNode('add1', 'math/add'),
            createNode('mul1', 'math/mul')
        ];
        const imports = getRequiredImports(nodes);
        expect(imports).toEqual(['add', 'mul', 'sin']);
    });

    it('should not duplicate imports', () => {
        const nodes = [
            createNode('add1', 'math/add'),
            createNode('add2', 'math/add')
        ];
        const imports = getRequiredImports(nodes);
        expect(imports.filter(i => i === 'add').length).toBe(1);
    });

    it('should include first op import for multi-op', () => {
        const nodes = [
            createNode('chain1', 'math/multiOp', {
                operations: [{ id: 'op1', op: 'sin' }],
                values: { op_op1_x: 1 },
            })
        ];
        const imports = getRequiredImports(nodes);
        expect(imports).toContain('sin');
    });

    it('should include float when multi-op has no operations', () => {
        const nodes = [
            createNode('chain1', 'math/multiOp', {
                operations: [],
            })
        ];
        const imports = getRequiredImports(nodes);
        expect(imports).toContain('float');
    });

    it('should include all ops used in multi-op', () => {
        const nodes = [
            createNode('chain1', 'math/multiOp', {
                operations: [
                    { id: 'op1', op: 'add' },
                    { id: 'op2', op: 'mul' },
                    { id: 'op3', op: 'sin' },
                ],
            })
        ];
        const imports = getRequiredImports(nodes);
        expect(imports).toEqual(expect.arrayContaining(['add', 'mul', 'sin']));
    });

    it('should include wgslFn when WGSL code nodes are used', () => {
        const nodes = [createNode('wgsl-node', 'code/wgsl-test')];
        const codeNodes: Record<string, CodeNodeDefinition> = {
            'code/wgsl-test': {
                id: 'code/wgsl-test',
                name: 'WGSL Test',
                language: 'wgsl' as const,
                code: `fn colorFn(baseColor: vec4f) -> vec4f { return baseColor; }`,
                inputs: [{ id: 'in_0', label: 'baseColor', type: 'vec4' }],
                output: { id: 'out', label: 'Result', type: 'vec4' },
                createdAt: 0,
                updatedAt: 0,
            }
        };
        const imports = getRequiredImports(nodes, undefined, codeNodes);
        expect(imports).toContain('wgslFn');
    });

    it('should include loop-related imports when loop nodes exist', () => {
        const loop = createNode('loop1', 'loop');
        const count = { ...createNode('loop1::count', 'loop/count', { values: { count: 3 } }), parentId: 'loop1' };
        const acc = { ...createNode('loop1::acc', 'loop/accumulator', { values: { seed: 0 } }), parentId: 'loop1' };
        const output = { ...createNode('loop1::output', 'loop/output'), parentId: 'loop1' };

        const imports = getRequiredImports([loop, count, acc, output]);
        expect(imports).toEqual(expect.arrayContaining(['Fn', 'Loop', 'Var', 'int', 'max']));
    });

    it('should include global context imports', () => {
        const nodes = [createNode('g1', 'global/ref', { values: { globalId: 'global-1' } })];
        const globals: GlobalContextEntry[] = [
            { id: 'global-1', name: 'uTime', kind: 'uniform', type: 'float', defaultValue: 1 },
            { id: 'global-2', name: 'vPos', kind: 'varying', type: 'vec2', defaultValue: [0, 0] },
            { id: 'global-3', name: 'cTint', kind: 'const', type: 'color', defaultValue: '#ffffff' },
        ];
        const imports = getRequiredImports(nodes, undefined, undefined, globals);
        expect(imports).toEqual(expect.arrayContaining(['uniform', 'varying', 'float', 'vec2', 'color']));
    });
});
