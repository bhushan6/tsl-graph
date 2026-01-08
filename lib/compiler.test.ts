
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
});

