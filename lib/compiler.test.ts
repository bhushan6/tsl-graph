
import { describe, it, expect, beforeAll } from 'vitest';
import { compileGraph, getRequiredImports } from './compiler';
import { Node, Edge } from '@xyflow/react';
import { TSLNodeData } from '@/lib/types';
import { registry } from './registry';
import { NodeDef } from './types';
import { NodeType } from '@/lib/types';

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
        type: 'math/assign',
        label: 'Assign',
        category: 'Math',
        tsl: 'assign',
        inputs: {
            target: { type: 'any', label: 'Target' },
            value: { type: 'any', default: 0, label: 'Value' }
        },
        outputs: { out: { type: 'any', label: 'Out' } }
    },
    {
        type: 'math/addAssign',
        label: 'Add Assign',
        category: 'Math',
        tsl: 'addAssign',
        inputs: {
            target: { type: 'any', label: 'Target' },
            value: { type: 'any', default: 0, label: 'Value' }
        },
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
    // Geometry nodes
    {
        type: 'geo/uv',
        label: 'UV',
        category: 'Geometry',
        tsl: 'uv',
        pure: true,
        callable: true,
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
        type: 'geo/normalWorld',
        label: 'Normal World',
        category: 'Geometry',
        tsl: 'normalWorld',
        pure: true,
        outputs: { out: { type: 'vec3', label: 'XYZ' } }
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
    }
];


// Register mocks before tests
beforeAll(() => {
    registry.registerMany(mockDefs);
});

const createNode = (id: string, type: string, data: Partial<TSLNodeData> = {}): Node<TSLNodeData> => ({
    id,
    type: type as NodeType,
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
            expect(code).toContain('const _node0 = uv();');
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

    describe('Loops', () => {
        it('should compile loop with accumulator mutation', () => {
            const loopId = 'loop1';
            const outputPortId = `${loopId}-out`;
            const indexNodeId = `${loopId}-index`;
            const accNodeId = `${loopId}-acc`;

            const nodes: Node<TSLNodeData>[] = [
                {
                    id: loopId,
                    type: 'group',
                    position: { x: 0, y: 0 },
                    data: {
                        type: 'group',
                        label: 'Loop',
                        values: { count: 4, init: 0 },
                        connected: {},
                        loop: {
                            kind: 'loop',
                            mode: 'count',
                            outputPortId,
                            accNodeId,
                            indexNodeId,
                        },
                    },
                },
                {
                    id: outputPortId,
                    type: 'loop/output',
                    parentId: loopId,
                    position: { x: 0, y: 0 },
                    data: {
                        type: 'loop/output',
                        values: {},
                        connected: {},
                        loopPort: {
                            kind: 'output',
                            portId: 'out',
                            label: 'Acc',
                            type: 'float',
                        },
                    },
                },
                {
                    id: indexNodeId,
                    type: 'loop/index',
                    parentId: loopId,
                    position: { x: 0, y: 0 },
                    data: {
                        type: 'loop/index',
                        values: {},
                        connected: {},
                    },
                },
                {
                    id: accNodeId,
                    type: 'advanced/var',
                    parentId: loopId,
                    position: { x: 0, y: 0 },
                    data: {
                        type: 'advanced/var',
                        values: { localName: 'acc' },
                        connected: {},
                    },
                },
                {
                    id: 'add1',
                    type: 'math/addAssign',
                    parentId: loopId,
                    position: { x: 0, y: 0 },
                    data: {
                        type: 'math/addAssign',
                        values: {},
                        connected: {},
                    },
                },
            ];

            const edges: Edge[] = [
                { id: 'e1', source: accNodeId, sourceHandle: 'out', target: 'add1', targetHandle: 'target' },
                { id: 'e2', source: indexNodeId, sourceHandle: 'out', target: 'add1', targetHandle: 'value' },
                { id: 'e3', source: accNodeId, sourceHandle: 'out', target: outputPortId, targetHandle: 'in' },
            ];

            const code = compileGraph(nodes, edges);
            const expected = [
                '// Generated TSL Code',
                '',
                'const _loop0_fn = Fn(() => {',
                '  const _loop0_acc = Var(float(0));',
                '  Loop(int(4), ({ i }) => {',
                '    _loop0_acc.addAssign(i);',
                '  });',
                '  return _loop0_acc;',
                '});',
                'const _loop0 = _loop0_fn();',
            ].join('\n');

            expect(code).toBe(expected);
        });

        it('should resolve legacy loop count/init from input nodes', () => {
            const loopId = 'loop-legacy';
            const outputPortId = `${loopId}-out`;
            const indexNodeId = `${loopId}-index`;
            const accNodeId = `${loopId}-acc`;
            const countPortId = `${loopId}-count`;
            const initPortId = `${loopId}-init`;

            const nodes: Node<TSLNodeData>[] = [
                createNode('count-const', 'const/int', { values: { value: 6 } }),
                createNode('init-const', 'const/vec3', { values: { x: 1, y: 2, z: 3 } }),
                {
                    id: loopId,
                    type: 'group',
                    position: { x: 0, y: 0 },
                    data: {
                        type: 'group',
                        label: 'Loop',
                        values: { count: 4, init: 0 },
                        connected: {},
                        loop: {
                            kind: 'loop',
                            mode: 'count',
                            outputPortId,
                            accNodeId,
                            indexNodeId,
                            countPortId,
                            initPortId,
                        },
                    },
                },
                {
                    id: countPortId,
                    type: 'loop/input',
                    parentId: loopId,
                    position: { x: 0, y: 0 },
                    data: {
                        type: 'loop/input',
                        values: {},
                        connected: {},
                        loopPort: {
                            kind: 'input',
                            portId: 'count',
                            label: 'Count',
                            role: 'count',
                            type: 'int',
                        },
                    },
                },
                {
                    id: initPortId,
                    type: 'loop/input',
                    parentId: loopId,
                    position: { x: 0, y: 0 },
                    data: {
                        type: 'loop/input',
                        values: {},
                        connected: {},
                        loopPort: {
                            kind: 'input',
                            portId: 'init',
                            label: 'Init',
                            role: 'init',
                            type: 'vec3',
                        },
                    },
                },
                {
                    id: outputPortId,
                    type: 'loop/output',
                    parentId: loopId,
                    position: { x: 0, y: 0 },
                    data: {
                        type: 'loop/output',
                        values: {},
                        connected: {},
                        loopPort: {
                            kind: 'output',
                            portId: 'out',
                            label: 'Acc',
                            type: 'vec3',
                        },
                    },
                },
                {
                    id: indexNodeId,
                    type: 'loop/index',
                    parentId: loopId,
                    position: { x: 0, y: 0 },
                    data: {
                        type: 'loop/index',
                        values: {},
                        connected: {},
                    },
                },
                {
                    id: accNodeId,
                    type: 'advanced/var',
                    parentId: loopId,
                    position: { x: 0, y: 0 },
                    data: {
                        type: 'advanced/var',
                        values: { localName: 'acc' },
                        connected: {},
                    },
                },
            ];

            const edges: Edge[] = [
                { id: 'e-count', source: 'count-const', sourceHandle: 'out', target: countPortId, targetHandle: 'in' },
                { id: 'e-init', source: 'init-const', sourceHandle: 'out', target: initPortId, targetHandle: 'in' },
                { id: 'e-init-acc', source: initPortId, sourceHandle: 'out', target: accNodeId, targetHandle: 'node' },
                { id: 'e-acc-out', source: accNodeId, sourceHandle: 'out', target: outputPortId, targetHandle: 'in' },
            ];

            const code = compileGraph(nodes, edges);
            const expected = [
                '// Generated TSL Code',
                '',
                'const _node0 = int(6);',
                'const _node1 = vec3(1, 2, 3);',
                'const _loop2_fn = Fn(() => {',
                '  const _loop2_acc = Var(_node1);',
                '  Loop(_node0, ({ i }) => {',
                '  });',
                '  return _loop2_acc;',
                '});',
                'const _loop2 = _loop2_fn();',
            ].join('\n');

            expect(code).toBe(expected);
        });
    });

    describe('Assign nodes', () => {
        it('should skip assign when target input is not connected', () => {
            const nodes = [
                createNode('assign1', 'math/assign', { values: { value: 2 } }),
            ];
            const code = compileGraph(nodes, []);
            expect(code).toBe('// Generated TSL Code\n');
        });
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

    it('should include loop imports when loop groups exist', () => {
        const nodes = [
            createNode('loop1', 'group', { loop: { kind: 'loop' } }),
        ];
        const imports = getRequiredImports(nodes);
        expect(imports).toEqual(expect.arrayContaining(['Loop', 'Var', 'Fn', 'float', 'int']));
    });
});
