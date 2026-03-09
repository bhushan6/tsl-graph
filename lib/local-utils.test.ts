import { describe, it, expect, beforeAll } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import type { NodeType, TSLNodeData, GlobalContextEntry } from '@/lib/types';
import { registry } from './registry';
import {
    normalizeLocalName,
    sanitizeLocalIdentifier,
    isLocalSetNode,
    isLocalGetNode,
    isLocalSetType,
    isLocalGetType,
    getLocalName,
    getLocalSourceId,
    getLocalSetSourceEdge,
    getLocalSetSourceNode,
    getLocalSetReferenceLabel,
    getLoopAncestorIds,
    isLocalScopeAccessible,
    withLocalDependencyEdges,
    getValidLocalSetNodesForGetNode,
    createTypeInferenceResolver,
    resolveNodeInputTypeById,
    resolveNodeOutputTypeById,
    collectLocalSetNames,
} from './local-utils';

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
            type: 'const/float',
            label: 'Float',
            category: 'Constants',
            tsl: 'float',
            inputs: { value: { type: 'float', default: 0, label: 'Value' } },
            outputs: { out: { type: 'float', label: 'Out' } },
        },
        {
            type: 'const/vec3',
            label: 'Vec3',
            category: 'Constants',
            tsl: 'vec3',
            inputs: {
                x: { type: 'float', default: 0, label: 'X' },
                y: { type: 'float', default: 0, label: 'Y' },
                z: { type: 'float', default: 0, label: 'Z' },
            },
            outputs: { out: { type: 'vec3', label: 'XYZ' } },
        },
        {
            type: 'local/set',
            label: 'Set Local',
            category: 'Locals',
            tsl: '__local_set__',
            inputs: { value: { type: 'any', label: 'Value', connectionOnly: true } },
            outputs: { out: { type: 'any', label: 'Out' } },
        },
        {
            type: 'local/get',
            label: 'Get Local',
            category: 'Locals',
            tsl: '__local_get__',
            outputs: { out: { type: 'any', label: 'Out' } },
        },
        {
            type: 'math/add',
            label: 'Add',
            category: 'Math',
            tsl: 'add',
            inputs: { a: { type: 'any', default: 0, label: 'A' }, b: { type: 'any', default: 0, label: 'B' } },
            outputs: { out: { type: 'any', label: 'Out' } },
        },
        {
            type: 'math/split',
            label: 'Split',
            category: 'Math',
            tsl: 'split',
            inputs: { in: { type: 'any', default: 0, label: 'In' } },
            outputs: { out: { type: 'any', label: 'Out' } },
        },
        {
            type: 'math/remap',
            label: 'Remap',
            category: 'Math',
            tsl: 'remap',
            inputs: {
                node: { type: 'any', default: 0, label: 'Node' },
                inLow: { type: 'float', default: 0, label: 'In Low' },
                inHigh: { type: 'float', default: 1, label: 'In High' },
                outLow: { type: 'float', default: 0, label: 'Out Low' },
                outHigh: { type: 'float', default: 1, label: 'Out High' },
            },
            outputs: { out: { type: 'any', label: 'Out' } },
        },
        {
            type: 'math/remapClamp',
            label: 'Remap Clamp',
            category: 'Math',
            tsl: 'remapClamp',
            inputs: {
                node: { type: 'any', default: 0, label: 'Node' },
                inLow: { type: 'float', default: 0, label: 'In Low' },
                inHigh: { type: 'float', default: 1, label: 'In High' },
                outLow: { type: 'float', default: 0, label: 'Out Low' },
                outHigh: { type: 'float', default: 1, label: 'Out High' },
            },
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
    ]);
});

describe('normalizeLocalName', () => {
    it('lowercases and trims', () => {
        expect(normalizeLocalName('  FoO  ')).toBe('foo');
    });

    it('returns empty for blank string', () => {
        expect(normalizeLocalName('   ')).toBe('');
    });

    it('handles single character', () => {
        expect(normalizeLocalName('A')).toBe('a');
    });
});

describe('sanitizeLocalIdentifier', () => {
    it('replaces special characters', () => {
        expect(sanitizeLocalIdentifier('hello world!', 'fallback')).toBe('hello_world_');
    });

    it('prefixes leading digit', () => {
        expect(sanitizeLocalIdentifier('3abc', 'fallback')).toBe('_3abc');
    });

    it('uses fallback for empty string', () => {
        expect(sanitizeLocalIdentifier('', 'myFallback')).toBe('myFallback');
    });

    it('uses fallback for whitespace-only input', () => {
        expect(sanitizeLocalIdentifier('   ', 'fb')).toBe('fb');
    });
});

describe('type guard functions', () => {
    it('isLocalSetType', () => {
        expect(isLocalSetType('local/set')).toBe(true);
        expect(isLocalSetType('local/get')).toBe(false);
        expect(isLocalSetType('math/add')).toBe(false);
    });

    it('isLocalGetType', () => {
        expect(isLocalGetType('local/get')).toBe(true);
        expect(isLocalGetType('local/set')).toBe(false);
    });

    it('isLocalSetNode returns false for undefined', () => {
        expect(isLocalSetNode(undefined)).toBe(false);
    });

    it('isLocalGetNode returns false for undefined', () => {
        expect(isLocalGetNode(undefined)).toBe(false);
    });

    it('isLocalSetNode works with actual nodes', () => {
        expect(isLocalSetNode(createNode('s', 'local/set'))).toBe(true);
        expect(isLocalSetNode(createNode('g', 'local/get'))).toBe(false);
    });

    it('isLocalGetNode works with actual nodes', () => {
        expect(isLocalGetNode(createNode('g', 'local/get'))).toBe(true);
        expect(isLocalGetNode(createNode('s', 'local/set'))).toBe(false);
    });
});

describe('getLocalName', () => {
    it('reads from data.values.localName', () => {
        const node = createNode('s', 'local/set', { values: { localName: 'myVar' } });
        expect(getLocalName(node)).toBe('myVar');
    });

    it('falls back to data.localName', () => {
        const node = createNode('s', 'local/set', { localName: 'fallbackName' });
        expect(getLocalName(node)).toBe('fallbackName');
    });

    it('returns empty for undefined node', () => {
        expect(getLocalName(undefined)).toBe('');
    });

    it('returns empty when no name is set', () => {
        const node = createNode('s', 'local/set');
        expect(getLocalName(node)).toBe('');
    });
});

describe('getLocalSourceId', () => {
    it('reads localSourceId from values', () => {
        const node = createNode('g', 'local/get', { values: { localSourceId: 'set-1' } });
        expect(getLocalSourceId(node)).toBe('set-1');
    });

    it('returns null for empty string', () => {
        const node = createNode('g', 'local/get', { values: { localSourceId: '' } });
        expect(getLocalSourceId(node)).toBe(null);
    });

    it('returns null for undefined node', () => {
        expect(getLocalSourceId(undefined)).toBe(null);
    });

    it('returns null when no localSourceId set', () => {
        const node = createNode('g', 'local/get');
        expect(getLocalSourceId(node)).toBe(null);
    });
});

describe('getLocalSetSourceEdge', () => {
    it('finds the value input edge', () => {
        const set = createNode('s', 'local/set');
        const edges: Edge[] = [
            { id: 'e1', source: 'src', sourceHandle: 'out', target: 's', targetHandle: 'value' },
            { id: 'e2', source: 'other', sourceHandle: 'out', target: 's', targetHandle: 'other' },
        ];
        const edge = getLocalSetSourceEdge(set, edges);
        expect(edge?.id).toBe('e1');
    });

    it('returns null when no matching edge', () => {
        const set = createNode('s', 'local/set');
        const edge = getLocalSetSourceEdge(set, []);
        expect(edge).toBe(null);
    });
});

describe('getLocalSetSourceNode', () => {
    it('returns the source node connected to value handle', () => {
        const srcNode = createNode('src', 'const/float', { values: { value: 42 } });
        const setNode = createNode('s', 'local/set');
        const nodesById = new Map([
            ['src', srcNode],
            ['s', setNode],
        ]);
        const edges: Edge[] = [
            { id: 'e1', source: 'src', sourceHandle: 'out', target: 's', targetHandle: 'value' },
        ];
        expect(getLocalSetSourceNode(setNode, nodesById, edges)).toBe(srcNode);
    });

    it('returns null when not connected', () => {
        const setNode = createNode('s', 'local/set');
        const nodesById = new Map([['s', setNode]]);
        expect(getLocalSetSourceNode(setNode, nodesById, [])).toBe(null);
    });
});

describe('getLocalSetReferenceLabel', () => {
    it('returns source node localName when available', () => {
        const srcNode = createNode('src', 'const/float', { values: { localName: 'brightness' } });
        const setNode = createNode('s', 'local/set');
        const nodesById = new Map<string, Node<TSLNodeData>>([['src', srcNode], ['s', setNode]]);
        const edges: Edge[] = [
            { id: 'e1', source: 'src', sourceHandle: 'out', target: 's', targetHandle: 'value' },
        ];
        expect(getLocalSetReferenceLabel(setNode, nodesById, edges)).toBe('brightness');
    });

    it('includes handle name when not "out"', () => {
        const srcNode = createNode('src', 'const/vec3', { values: { localName: 'pos' } });
        const setNode = createNode('s', 'local/set');
        const nodesById = new Map<string, Node<TSLNodeData>>([['src', srcNode], ['s', setNode]]);
        const edges: Edge[] = [
            { id: 'e1', source: 'src', sourceHandle: 'x', target: 's', targetHandle: 'value' },
        ];
        expect(getLocalSetReferenceLabel(setNode, nodesById, edges)).toBe('pos.x');
    });

    it('falls back to node id when no label or source', () => {
        const setNode = createNode('s', 'local/set');
        const nodesById = new Map<string, Node<TSLNodeData>>([['s', setNode]]);
        expect(getLocalSetReferenceLabel(setNode, nodesById, [])).toBe('s');
    });
});

describe('getLoopAncestorIds', () => {
    it('returns empty for top-level node', () => {
        const node = createNode('n', 'local/set');
        const nodesById = new Map([['n', node]]);
        expect(getLoopAncestorIds(node, nodesById)).toEqual([]);
    });

    it('returns loop parent when directly inside a loop', () => {
        const loop = createNode('loop1', 'loop');
        const inner = createNode('inner', 'local/set', {}, { parentId: 'loop1' });
        const nodesById = new Map([['loop1', loop], ['inner', inner]]);
        expect(getLoopAncestorIds(inner, nodesById)).toEqual(['loop1']);
    });

    it('returns nested loop ancestors in order (nearest first)', () => {
        const outerLoop = createNode('outer', 'loop');
        const innerLoop = createNode('inner-loop', 'loop', {}, { parentId: 'outer' });
        const node = createNode('n', 'local/set', {}, { parentId: 'inner-loop' });
        const nodesById = new Map([
            ['outer', outerLoop],
            ['inner-loop', innerLoop],
            ['n', node],
        ]);
        expect(getLoopAncestorIds(node, nodesById)).toEqual(['inner-loop', 'outer']);
    });
});

describe('isLocalScopeAccessible', () => {
    it('set outside any loop is accessible from anywhere', () => {
        const set = createNode('s', 'local/set');
        const get = createNode('g', 'local/get', {}, { parentId: 'loop1' });
        const loop = createNode('loop1', 'loop');
        const nodesById = new Map([['s', set], ['g', get], ['loop1', loop]]);
        expect(isLocalScopeAccessible(set, get, nodesById)).toBe(true);
    });

    it('set inside loop is accessible from same loop', () => {
        const loop = createNode('loop1', 'loop');
        const set = createNode('s', 'local/set', {}, { parentId: 'loop1' });
        const get = createNode('g', 'local/get', {}, { parentId: 'loop1' });
        const nodesById = new Map([['loop1', loop], ['s', set], ['g', get]]);
        expect(isLocalScopeAccessible(set, get, nodesById)).toBe(true);
    });

    it('set inside loop is NOT accessible from outside', () => {
        const loop = createNode('loop1', 'loop');
        const set = createNode('s', 'local/set', {}, { parentId: 'loop1' });
        const get = createNode('g', 'local/get');
        const nodesById = new Map([['loop1', loop], ['s', set], ['g', get]]);
        expect(isLocalScopeAccessible(set, get, nodesById)).toBe(false);
    });

    it('set in loop A is NOT accessible from loop B (sibling loops)', () => {
        const loopA = createNode('loopA', 'loop');
        const loopB = createNode('loopB', 'loop');
        const set = createNode('s', 'local/set', {}, { parentId: 'loopA' });
        const get = createNode('g', 'local/get', {}, { parentId: 'loopB' });
        const nodesById = new Map([['loopA', loopA], ['loopB', loopB], ['s', set], ['g', get]]);
        expect(isLocalScopeAccessible(set, get, nodesById)).toBe(false);
    });

    it('set in outer loop is accessible from nested inner loop', () => {
        const outerLoop = createNode('outer', 'loop');
        const innerLoop = createNode('inner', 'loop', {}, { parentId: 'outer' });
        const set = createNode('s', 'local/set', {}, { parentId: 'outer' });
        const get = createNode('g', 'local/get', {}, { parentId: 'inner' });
        const nodesById = new Map([
            ['outer', outerLoop],
            ['inner', innerLoop],
            ['s', set],
            ['g', get],
        ]);
        expect(isLocalScopeAccessible(set, get, nodesById)).toBe(true);
    });
});

describe('withLocalDependencyEdges', () => {
    it('adds synthetic edges from source→setLocal and setLocal→getLocal', () => {
        const src = createNode('src', 'const/float');
        const set = createNode('set1', 'local/set');
        const get = createNode('get1', 'local/get', { values: { localSourceId: 'set1' } });
        const nodes = [src, set, get];
        const edges: Edge[] = [
            { id: 'e1', source: 'src', sourceHandle: 'out', target: 'set1', targetHandle: 'value' },
        ];

        const result = withLocalDependencyEdges(nodes, edges);
        // Original edge + synthetic set→get dependency
        expect(result.length).toBe(2);
        const syntheticEdge = result.find((e) => e.id.startsWith('__local_dep__'));
        expect(syntheticEdge).toBeDefined();
        expect(syntheticEdge?.source).toBe('set1');
        expect(syntheticEdge?.target).toBe('get1');
    });

    it('does not duplicate existing edges', () => {
        const src = createNode('src', 'const/float');
        const set = createNode('set1', 'local/set');
        const get = createNode('get1', 'local/get', { values: { localSourceId: 'set1' } });
        const nodes = [src, set, get];
        const existingEdges: Edge[] = [
            { id: 'e1', source: 'src', sourceHandle: 'out', target: 'set1', targetHandle: 'value' },
            { id: 'manual', source: 'set1', sourceHandle: 'out', target: 'get1', targetHandle: '__local_dep__' },
        ];

        const result = withLocalDependencyEdges(nodes, existingEdges);
        // Should not add a duplicate
        expect(result.filter((e) => e.source === 'set1' && e.target === 'get1').length).toBe(1);
    });

    it('skips get nodes referencing non-existent sets', () => {
        const get = createNode('get1', 'local/get', { values: { localSourceId: 'missing' } });
        const result = withLocalDependencyEdges([get], []);
        expect(result.length).toBe(0);
    });
});

describe('getValidLocalSetNodesForGetNode', () => {
    it('returns all accessible set nodes', () => {
        const set1 = createNode('s1', 'local/set');
        const set2 = createNode('s2', 'local/set');
        const get = createNode('g', 'local/get');
        const nodesById = new Map([['s1', set1], ['s2', set2], ['g', get]]);
        const validSets = getValidLocalSetNodesForGetNode(get, nodesById);
        expect(validSets.length).toBe(2);
    });

    it('excludes out-of-scope set nodes', () => {
        const loop = createNode('loop1', 'loop');
        const innerSet = createNode('s1', 'local/set', {}, { parentId: 'loop1' });
        const outerGet = createNode('g', 'local/get');
        const nodesById = new Map([['loop1', loop], ['s1', innerSet], ['g', outerGet]]);
        const validSets = getValidLocalSetNodesForGetNode(outerGet, nodesById);
        expect(validSets.length).toBe(0);
    });
});

describe('resolveNodeOutputTypeById', () => {
    const globals: GlobalContextEntry[] = [];

    it('resolves float type for const/float node', () => {
        const node = createNode('f', 'const/float');
        const nodesById = new Map([['f', node]]);
        expect(resolveNodeOutputTypeById('f', 'out', nodesById, [], globals)).toBe('float');
    });

    it('resolves type through a Set→Get chain', () => {
        const src = createNode('src', 'const/float');
        const set = createNode('set1', 'local/set');
        const get = createNode('get1', 'local/get', { values: { localSourceId: 'set1' } });
        const nodesById = new Map([['src', src], ['set1', set], ['get1', get]]);
        const edges: Edge[] = [
            { id: 'e1', source: 'src', sourceHandle: 'out', target: 'set1', targetHandle: 'value' },
        ];
        expect(resolveNodeOutputTypeById('get1', 'out', nodesById, edges, globals)).toBe('float');
    });

    it('returns "any" for missing node', () => {
        expect(resolveNodeOutputTypeById('missing', 'out', new Map(), [], globals)).toBe('any');
    });

    it('returns "any" on cycle (set→get→set loop)', () => {
        // Simulate a pathological cycle: set references itself through get
        const set = createNode('set1', 'local/set');
        const get = createNode('get1', 'local/get', { values: { localSourceId: 'set1' } });
        const nodesById = new Map([['set1', set], ['get1', get]]);
        const edges: Edge[] = [
            { id: 'e1', source: 'get1', sourceHandle: 'out', target: 'set1', targetHandle: 'value' },
        ];
        // Should not infinite loop — cycle detection returns 'any'
        expect(resolveNodeOutputTypeById('get1', 'out', nodesById, edges, globals)).toBe('any');
    });

    it('returns "any" for get node with missing source', () => {
        const get = createNode('get1', 'local/get', { values: { localSourceId: 'nonexistent' } });
        const nodesById = new Map([['get1', get]]);
        expect(resolveNodeOutputTypeById('get1', 'out', nodesById, [], globals)).toBe('any');
    });
});

describe('math runtime inference', () => {
    const globals: GlobalContextEntry[] = [];

    it('infers add(float, float) and keeps both inputs/output as float', () => {
        const a = createNode('a', 'const/float');
        const b = createNode('b', 'const/float');
        const add = createNode('add', 'math/add');
        const nodesById = new Map([
            ['a', a],
            ['b', b],
            ['add', add],
        ]);
        const edges: Edge[] = [
            { id: 'e1', source: 'a', sourceHandle: 'out', target: 'add', targetHandle: 'a' },
            { id: 'e2', source: 'b', sourceHandle: 'out', target: 'add', targetHandle: 'b' },
        ];

        expect(resolveNodeInputTypeById('add', 'a', nodesById, edges, globals)).toBe('float');
        expect(resolveNodeInputTypeById('add', 'b', nodesById, edges, globals)).toBe('float');
        expect(resolveNodeOutputTypeById('add', 'out', nodesById, edges, globals)).toBe('float');
    });

    it('infers add(float, vec3) to vec3 for both inputs and output', () => {
        const a = createNode('a', 'const/float');
        const b = createNode('b', 'const/vec3');
        const add = createNode('add', 'math/add');
        const nodesById = new Map([
            ['a', a],
            ['b', b],
            ['add', add],
        ]);
        const edges: Edge[] = [
            { id: 'e1', source: 'a', sourceHandle: 'out', target: 'add', targetHandle: 'a' },
            { id: 'e2', source: 'b', sourceHandle: 'out', target: 'add', targetHandle: 'b' },
        ];

        expect(resolveNodeInputTypeById('add', 'a', nodesById, edges, globals)).toBe('vec3');
        expect(resolveNodeInputTypeById('add', 'b', nodesById, edges, globals)).toBe('vec3');
        expect(resolveNodeOutputTypeById('add', 'out', nodesById, edges, globals)).toBe('vec3');
    });

    it('uses sibling/value/default fallbacks for unconnected math inputs', () => {
        const add = createNode('add', 'math/add', { values: { a: [1, 2, 3] } });
        const nodesById = new Map([['add', add]]);

        expect(resolveNodeInputTypeById('add', 'b', nodesById, [], globals)).toBe('vec3');
        expect(resolveNodeInputTypeById('add', 'a', nodesById, [], globals)).toBe('float');
        expect(resolveNodeOutputTypeById('add', 'out', nodesById, [], globals)).toBe('vec3');
    });

    it('split output follows input type', () => {
        const source = createNode('v', 'const/vec3');
        const split = createNode('split', 'math/split');
        const nodesById = new Map([
            ['v', source],
            ['split', split],
        ]);
        const edges: Edge[] = [
            { id: 'e1', source: 'v', sourceHandle: 'out', target: 'split', targetHandle: 'in' },
        ];

        expect(resolveNodeInputTypeById('split', 'in', nodesById, edges, globals)).toBe('vec3');
        expect(resolveNodeOutputTypeById('split', 'out', nodesById, edges, globals)).toBe('vec3');
    });

    it('remap and remapClamp outputs follow the node input type', () => {
        const source = createNode('v', 'const/vec3');
        const remap = createNode('remap', 'math/remap');
        const remapClamp = createNode('remapClamp', 'math/remapClamp');
        const nodesById = new Map([
            ['v', source],
            ['remap', remap],
            ['remapClamp', remapClamp],
        ]);
        const edges: Edge[] = [
            { id: 'e1', source: 'v', sourceHandle: 'out', target: 'remap', targetHandle: 'node' },
            { id: 'e2', source: 'v', sourceHandle: 'out', target: 'remapClamp', targetHandle: 'node' },
        ];

        expect(resolveNodeOutputTypeById('remap', 'out', nodesById, edges, globals)).toBe('vec3');
        expect(resolveNodeOutputTypeById('remapClamp', 'out', nodesById, edges, globals)).toBe('vec3');
    });

    it('range output uses dominant type from min/max', () => {
        const min = createNode('min', 'const/float');
        const max = createNode('max', 'const/vec3');
        const range = createNode('range', 'math/range');
        const nodesById = new Map([
            ['min', min],
            ['max', max],
            ['range', range],
        ]);
        const edges: Edge[] = [
            { id: 'e1', source: 'min', sourceHandle: 'out', target: 'range', targetHandle: 'min' },
            { id: 'e2', source: 'max', sourceHandle: 'out', target: 'range', targetHandle: 'max' },
        ];

        expect(resolveNodeOutputTypeById('range', 'out', nodesById, edges, globals)).toBe('vec3');
    });

    it('propagates type through multi-op chains', () => {
        const a = createNode('a', 'const/float');
        const b = createNode('b', 'const/vec3');
        const c = createNode('c', 'const/float');
        const multiOp = createNode('m', 'math/multiOp', {
            operations: [
                { id: 'opA', op: 'add' },
                { id: 'opB', op: 'mul' },
            ],
        });
        const nodesById = new Map([
            ['a', a],
            ['b', b],
            ['c', c],
            ['m', multiOp],
        ]);
        const edges: Edge[] = [
            { id: 'e1', source: 'a', sourceHandle: 'out', target: 'm', targetHandle: 'op_opA_a' },
            { id: 'e2', source: 'b', sourceHandle: 'out', target: 'm', targetHandle: 'op_opA_b' },
            { id: 'e3', source: 'c', sourceHandle: 'out', target: 'm', targetHandle: 'op_opB_b' },
        ];

        expect(resolveNodeInputTypeById('m', 'op_opB_b', nodesById, edges, globals)).toBe('vec3');
        expect(resolveNodeOutputTypeById('m', 'out', nodesById, edges, globals)).toBe('vec3');
    });

    it('createTypeInferenceResolver exposes the same inferred results', () => {
        const a = createNode('a', 'const/float');
        const b = createNode('b', 'const/vec3');
        const add = createNode('add', 'math/add');
        const nodesById = new Map([
            ['a', a],
            ['b', b],
            ['add', add],
        ]);
        const edges: Edge[] = [
            { id: 'e1', source: 'a', sourceHandle: 'out', target: 'add', targetHandle: 'a' },
            { id: 'e2', source: 'b', sourceHandle: 'out', target: 'add', targetHandle: 'b' },
        ];
        const resolver = createTypeInferenceResolver(nodesById, edges, globals);

        expect(resolver.resolveInputType('add', 'a')).toBe('vec3');
        expect(resolver.resolveInputType('add', 'b')).toBe('vec3');
        expect(resolver.resolveOutputType('add', 'out')).toBe('vec3');
    });
});

describe('collectLocalSetNames', () => {
    it('groups set nodes by normalized name', () => {
        const nodes = [
            createNode('s1', 'local/set', { values: { localName: 'foo' } }),
            createNode('s2', 'local/set', { values: { localName: 'FOO' } }),
            createNode('s3', 'local/set', { values: { localName: 'bar' } }),
        ];
        const names = collectLocalSetNames(nodes);
        expect(names.get('foo')).toEqual(['s1', 's2']);
        expect(names.get('bar')).toEqual(['s3']);
    });

    it('ignores non-set nodes', () => {
        const nodes = [
            createNode('g1', 'local/get', { values: { localName: 'test' } }),
            createNode('a1', 'math/add'),
        ];
        const names = collectLocalSetNames(nodes);
        expect(names.size).toBe(0);
    });

    it('skips nodes with empty name', () => {
        const nodes = [
            createNode('s1', 'local/set', { values: { localName: '' } }),
            createNode('s2', 'local/set', { values: { localName: '  ' } }),
        ];
        const names = collectLocalSetNames(nodes);
        expect(names.size).toBe(0);
    });
});
