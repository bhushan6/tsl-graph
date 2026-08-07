import { describe, expect, it, beforeAll } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { getMultiOpHandleId } from './multi-op';
import { registry } from './registry';
import { resolveNodeOutputTypeById } from './type-inference';
import type { GlobalContextEntry, NodeType, TSLNodeData } from '@/lib/types';

const createNode = (
    id: string,
    type: string,
    data: Partial<TSLNodeData> = {},
    nodeOverrides: Partial<Node<TSLNodeData>> = {}
): Node<TSLNodeData> => ({
    id,
    type,
    position: { x: 0, y: 0 },
    data: {
        type: type as NodeType,
        values: {},
        connected: {},
        ...data,
    },
    ...nodeOverrides,
});

beforeAll(() => {
    registry.registerMany([
        {
            type: 'math/add',
            label: 'Add',
            category: 'Math',
            tsl: 'add',
            inputs: {
                a: { type: 'any', default: 0, label: 'A' },
                b: { type: 'any', default: 0, label: 'B' },
            },
            outputs: { out: { type: 'any', label: 'Out' } },
        },
        {
            type: 'math/mix',
            label: 'Mix',
            category: 'Math',
            tsl: 'mix',
            inputs: {
                a: { type: 'any', default: 0, label: 'A' },
                b: { type: 'any', default: 1, label: 'B' },
                t: { type: 'any', default: 0.5, label: 'T' },
            },
            outputs: { out: { type: 'any', label: 'Out' } },
        },
        {
            type: 'math/normalize',
            label: 'Normalize',
            category: 'Math',
            tsl: 'normalize',
            inputs: { x: { type: 'any', default: [1, 0, 0], label: 'X' } },
            outputs: { out: { type: 'any', label: 'Out' } },
        },
        {
            type: 'math/dot',
            label: 'Dot',
            category: 'Math',
            tsl: 'dot',
            inputs: {
                a: { type: 'any', default: [0, 0, 0], label: 'A' },
                b: { type: 'any', default: [0, 1, 0], label: 'B' },
            },
            outputs: { out: { type: 'float', label: 'Out' } },
        },
        {
            type: 'math/length',
            label: 'Length',
            category: 'Math',
            tsl: 'length',
            inputs: { x: { type: 'any', default: [0, 0, 0], label: 'X' } },
            outputs: { out: { type: 'float', label: 'Out' } },
        },
        {
            type: 'math/all',
            label: 'All',
            category: 'Math',
            tsl: 'all',
            inputs: { x: { type: 'any', default: false, label: 'X' } },
            outputs: { out: { type: 'bool', label: 'Out' } },
        },
        {
            type: 'math/any',
            label: 'Any',
            category: 'Math',
            tsl: 'any',
            inputs: { x: { type: 'any', default: false, label: 'X' } },
            outputs: { out: { type: 'bool', label: 'Out' } },
        },
        {
            type: 'math/split',
            label: 'Split',
            category: 'Math',
            tsl: 'split',
            inputs: { in: { type: 'any', default: 0, label: 'In' } },
            outputs: {
                x: { type: 'float', label: 'X' },
                y: { type: 'float', label: 'Y' },
                z: { type: 'float', label: 'Z' },
                w: { type: 'float', label: 'W' },
                out: { type: 'any', label: 'Out' },
            },
        },
        {
            type: 'math/multiOp',
            label: 'Multi-op',
            category: 'Math',
            tsl: 'multiOp',
            inputs: {},
            outputs: { out: { type: 'any', label: 'Out' } },
        },
        {
            type: 'math/range',
            label: 'Range',
            category: 'Math',
            tsl: 'range',
            inputs: {
                min: { type: 'any', default: 0, label: 'Min' },
                max: { type: 'any', default: 1, label: 'Max' },
            },
            outputs: { out: { type: 'any', label: 'Out' } },
        },
        {
            type: 'advanced/var',
            label: 'Var',
            category: 'Advanced',
            tsl: 'Var',
            inputs: { node: { type: 'any', label: 'Node' } },
            outputs: { out: { type: 'any', label: 'Out' } },
        },
    ]);
});

describe('resolveNodeOutputTypeById math inference', () => {
    const globals: GlobalContextEntry[] = [];

    it('infers add(vec3, float) -> vec3', () => {
        const addNode = createNode('add', 'math/add', { values: { a: [1, 2, 3], b: 1 } });
        const nodesById = new Map([['add', addNode]]);

        expect(resolveNodeOutputTypeById('add', 'out', nodesById, [], globals)).toBe('vec3');
    });

    it('uses math defaults when inputs are unconnected', () => {
        const addNode = createNode('add', 'math/add');
        const nodesById = new Map([['add', addNode]]);

        expect(resolveNodeOutputTypeById('add', 'out', nodesById, [], globals)).toBe('float');
    });

    it('combines inline any values with unconnected defaults', () => {
        const addNode = createNode('add', 'math/add', { values: { b: [1, 2] } });
        const nodesById = new Map([['add', addNode]]);

        expect(resolveNodeOutputTypeById('add', 'out', nodesById, [], globals)).toBe('vec2');
        expect(resolveNodeOutputTypeById('add', 'x', nodesById, [], globals)).toBe('float');
        expect(resolveNodeOutputTypeById('add', 'y', nodesById, [], globals)).toBe('float');
        expect(resolveNodeOutputTypeById('add', 'z', nodesById, [], globals)).toBe('any');
    });

    it('preserves left-first ties for add(color, vec3) -> color', () => {
        const addNode = createNode('add', 'math/add', { values: { a: '#ffffff', b: [1, 2, 3] } });
        const nodesById = new Map([['add', addNode]]);

        expect(resolveNodeOutputTypeById('add', 'out', nodesById, [], globals)).toBe('color');
    });

    it('preserves left-first ties for add(vec3, color) -> vec3', () => {
        const addNode = createNode('add', 'math/add', { values: { a: [1, 2, 3], b: '#ffffff' } });
        const nodesById = new Map([['add', addNode]]);

        expect(resolveNodeOutputTypeById('add', 'out', nodesById, [], globals)).toBe('vec3');
    });

    it('infers mix(vec3, vec3, float) -> vec3', () => {
        const mixNode = createNode('mix', 'math/mix', { values: { a: [1, 2, 3], b: [3, 4, 5], t: 0.5 } });
        const nodesById = new Map([['mix', mixNode]]);

        expect(resolveNodeOutputTypeById('mix', 'out', nodesById, [], globals)).toBe('vec3');
    });

    it('infers normalize(color) -> color', () => {
        const normalizeNode = createNode('normalize', 'math/normalize', { values: { x: '#ff00ff' } });
        const nodesById = new Map([['normalize', normalizeNode]]);

        expect(resolveNodeOutputTypeById('normalize', 'out', nodesById, [], globals)).toBe('color');
    });

    it('keeps fixed outputs for dot, length, all, and any', () => {
        const dotNode = createNode('dot', 'math/dot');
        const lengthNode = createNode('length', 'math/length');
        const allNode = createNode('all', 'math/all');
        const anyNode = createNode('anyNode', 'math/any');
        const nodesById = new Map([
            ['dot', dotNode],
            ['length', lengthNode],
            ['all', allNode],
            ['anyNode', anyNode],
        ]);

        expect(resolveNodeOutputTypeById('dot', 'out', nodesById, [], globals)).toBe('float');
        expect(resolveNodeOutputTypeById('length', 'out', nodesById, [], globals)).toBe('float');
        expect(resolveNodeOutputTypeById('all', 'out', nodesById, [], globals)).toBe('bool');
        expect(resolveNodeOutputTypeById('anyNode', 'out', nodesById, [], globals)).toBe('bool');
    });

    it('mirrors split.out while keeping split.x fixed as float', () => {
        const splitNode = createNode('split', 'math/split', { values: { in: [1, 2, 3, 4] } });
        const nodesById = new Map([['split', splitNode]]);

        expect(resolveNodeOutputTypeById('split', 'out', nodesById, [], globals)).toBe('vec4');
        expect(resolveNodeOutputTypeById('split', 'x', nodesById, [], globals)).toBe('float');
    });

    it('folds math/multiOp types across operations', () => {
        const addOpId = 'op_add';
        const mulOpId = 'op_mul';
        const multiOpNode = createNode('multi', 'math/multiOp', {
            operations: [
                { id: addOpId, op: 'add' },
                { id: mulOpId, op: 'mul' },
            ],
            values: {
                [getMultiOpHandleId(addOpId, 'a')]: [1, 2, 3],
                [getMultiOpHandleId(addOpId, 'b')]: 1,
                [getMultiOpHandleId(mulOpId, 'b')]: 2,
            },
        });
        const nodesById = new Map([['multi', multiOpNode]]);

        expect(resolveNodeOutputTypeById('multi', 'out', nodesById, [], globals)).toBe('vec3');
        expect(resolveNodeOutputTypeById('multi', 'z', nodesById, [], globals)).toBe('float');
    });

    it('keeps math/range unresolved as any', () => {
        const rangeNode = createNode('range', 'math/range', { values: { min: [0, 0, 0], max: 1 } });
        const nodesById = new Map([['range', rangeNode]]);

        expect(resolveNodeOutputTypeById('range', 'out', nodesById, [], globals)).toBe('any');
    });

    it('resolves inferred math output through connections', () => {
        const addNode = createNode('add', 'math/add', { values: { a: [1, 2, 3], b: 1 } });
        const mixNode = createNode('mix', 'math/mix', { values: { b: [3, 4, 5], t: 0.5 } });
        const nodesById = new Map([
            ['add', addNode],
            ['mix', mixNode],
        ]);
        const edges: Edge[] = [
            { id: 'e1', source: 'add', sourceHandle: 'out', target: 'mix', targetHandle: 'a' },
        ];

        expect(resolveNodeOutputTypeById('mix', 'out', nodesById, edges, globals)).toBe('vec3');
    });
});

describe('resolveNodeOutputTypeById local inference', () => {
    const globals: GlobalContextEntry[] = [];

    it('preserves a vec4 type through Set/Get Local and types its components', () => {
        const sourceNode = createNode('source', 'math/add', {
            values: { a: [1, 2, 3, 4], b: 1 },
        });
        const setNode = createNode('set', 'local/set');
        const getNode = createNode('get', 'local/get', {
            values: { localSourceId: 'set' },
        });
        const nodesById = new Map([
            ['source', sourceNode],
            ['set', setNode],
            ['get', getNode],
        ]);
        const edges: Edge[] = [
            {
                id: 'source-to-set',
                source: 'source',
                sourceHandle: 'out',
                target: 'set',
                targetHandle: 'value',
            },
        ];

        expect(resolveNodeOutputTypeById('set', 'out', nodesById, edges, globals)).toBe('vec4');
        expect(resolveNodeOutputTypeById('get', 'out', nodesById, edges, globals)).toBe('vec4');
        expect(resolveNodeOutputTypeById('get', 'x', nodesById, edges, globals)).toBe('float');
        expect(resolveNodeOutputTypeById('get', 'w', nodesById, edges, globals)).toBe('float');
        expect(resolveNodeOutputTypeById('get', 'z', nodesById, edges, globals)).toBe('float');
    });

    it('exposes RGB scalar types for a color local', () => {
        const sourceNode = createNode('source', 'math/add', {
            values: { a: '#336699', b: 0 },
        });
        const setNode = createNode('set', 'local/set');
        const getNode = createNode('get', 'local/get', {
            values: { localSourceId: 'set' },
        });
        const nodesById = new Map([
            ['source', sourceNode],
            ['set', setNode],
            ['get', getNode],
        ]);
        const edges: Edge[] = [
            {
                id: 'source-to-set',
                source: 'source',
                sourceHandle: 'out',
                target: 'set',
                targetHandle: 'value',
            },
        ];

        expect(resolveNodeOutputTypeById('get', 'out', nodesById, edges, globals)).toBe('color');
        expect(resolveNodeOutputTypeById('get', 'r', nodesById, edges, globals)).toBe('float');
        expect(resolveNodeOutputTypeById('get', 'g', nodesById, edges, globals)).toBe('float');
        expect(resolveNodeOutputTypeById('get', 'b', nodesById, edges, globals)).toBe('float');
    });

    it.each([
        ['float', 'out', 'float'],
        ['int', 'out', 'int'],
        ['bool', 'out', 'bool'],
        ['vec2', 'out', 'vec2'],
        ['vec3', 'z', 'float'],
        ['vec4', 'w', 'float'],
        ['color', 'r', 'float'],
    ] as const)(
        'preserves a %s uniform through Set/Get Local for the %s output',
        (uniformType, handleId, expectedType) => {
            const uniformNode = createNode('uniform', 'const/uniform', {
                values: { uniformType },
            });
            const setNode = createNode('set', 'local/set');
            const getNode = createNode('get', 'local/get', {
                values: { localSourceId: 'set' },
            });
            const nodesById = new Map([
                ['uniform', uniformNode],
                ['set', setNode],
                ['get', getNode],
            ]);
            const edges: Edge[] = [
                {
                    id: 'uniform-to-set',
                    source: 'uniform',
                    sourceHandle: 'out',
                    target: 'set',
                    targetHandle: 'value',
                },
            ];

            expect(resolveNodeOutputTypeById('get', handleId, nodesById, edges, globals)).toBe(expectedType);
        },
    );
});

describe('resolveNodeOutputTypeById Var inference', () => {
    const globals: GlobalContextEntry[] = [];

    it.each([
        [0, 'float'],
        [false, 'bool'],
        [[1, 2], 'vec2'],
        [[1, 2, 3], 'vec3'],
        [[1, 2, 3, 4], 'vec4'],
        ['#336699', 'color'],
    ] as const)('mirrors a connected %s input as %s', (value, expectedType) => {
        const sourceNode = createNode('source', 'math/add', {
            values: { a: value, b: 0 },
        });
        const varNode = createNode('var', 'advanced/var');
        const nodesById = new Map([
            ['source', sourceNode],
            ['var', varNode],
        ]);
        const edges: Edge[] = [
            {
                id: 'source-to-var',
                source: 'source',
                sourceHandle: 'out',
                target: 'var',
                targetHandle: 'node',
            },
        ];

        expect(resolveNodeOutputTypeById('var', 'out', nodesById, edges, globals)).toBe(expectedType);
    });

    it('types vector component outputs as floats', () => {
        const sourceNode = createNode('source', 'math/add', {
            values: { a: [1, 2, 3, 4], b: 0 },
        });
        const varNode = createNode('var', 'advanced/var');
        const nodesById = new Map([
            ['source', sourceNode],
            ['var', varNode],
        ]);
        const edges: Edge[] = [
            {
                id: 'source-to-var',
                source: 'source',
                sourceHandle: 'out',
                target: 'var',
                targetHandle: 'node',
            },
        ];

        expect(resolveNodeOutputTypeById('var', 'w', nodesById, edges, globals)).toBe('float');
    });
});
