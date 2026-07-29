import { describe, it, expect, beforeAll } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import type { NodeType, TSLNodeData } from '@/lib/types';
import { registry } from './registry';
import {
    getConnectableInputHandles,
    getConnectableOutputHandles,
    resolveInputHandleType,
    type GraphHandleContext,
} from './graph-handles';

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

const makeCtx = (
    nodes: Node<TSLNodeData>[],
    edges: Edge[] = [],
    overrides: Partial<GraphHandleContext> = {}
): GraphHandleContext => ({
    nodesById: new Map(nodes.map((node) => [node.id, node])),
    edges,
    globals: [],
    subgraphs: {},
    codeNodes: {},
    ...overrides,
});

beforeAll(() => {
    registry.registerMany([
        {
            type: 'const/float' as NodeType,
            label: 'Float',
            category: 'Constants',
            tsl: 'float',
            inputs: { value: { type: 'float', default: 0, label: 'Value', propertyOnly: true } },
            outputs: { out: { type: 'float', label: 'Out' } },
        },
        {
            type: 'math/mix' as NodeType,
            label: 'Mix',
            category: 'Math',
            tsl: 'mix',
            inputs: {
                a: { type: 'any', default: 0, label: 'A' },
                b: { type: 'any', default: 0, label: 'B' },
                t: { type: 'float', default: 0, label: 'T' },
                secret: { type: 'float', default: 0, label: 'Secret', hidden: true },
            },
            outputs: { out: { type: 'any', label: 'Out' } },
        },
        {
            type: 'math/multiOp' as NodeType,
            label: 'Multi Op',
            category: 'Math',
            tsl: 'multiOp',
            inputs: {},
            outputs: { out: { type: 'any', label: 'Out' } },
        },
        {
            type: 'math/add' as NodeType,
            label: 'Add',
            category: 'Math',
            tsl: 'add',
            inputs: {
                a: { type: 'any', default: 0, label: 'A' },
                b: { type: 'any', default: 0, label: 'B' },
            },
            outputs: { out: { type: 'any', label: 'Out' } },
        },
    ] as never[]);
});

describe('getConnectableInputHandles', () => {
    it('lists visible registry inputs, skipping hidden and propertyOnly ports', () => {
        const node = createNode('mix', 'math/mix');
        const handles = getConnectableInputHandles(node, makeCtx([node]));
        expect(handles.map((h) => h.id)).toEqual(['a', 'b', 't']);

        const floatNode = createNode('f', 'const/float');
        expect(getConnectableInputHandles(floatNode, makeCtx([floatNode]))).toEqual([]);
    });

    it('derives multiOp inputs from operations', () => {
        const node = createNode('m', 'math/multiOp', {
            operations: [{ id: 'op1', op: 'add' }],
        });
        const handles = getConnectableInputHandles(node, makeCtx([node]));
        expect(handles.length).toBeGreaterThan(0);
        expect(handles.every((h) => h.id.startsWith('op_op1_'))).toBe(true);
    });

    it('uses subgraph template ports for custom instances', () => {
        const node = createNode('sub', 'custom/blur-1');
        const ctx = makeCtx([node], [], {
            subgraphs: {
                'custom/blur-1': {
                    id: 'custom/blur-1',
                    name: 'Blur',
                    inputs: [{ id: 'in_strength', label: 'Strength', type: 'float' }],
                    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }],
                    nodes: [],
                    edges: [],
                    createdAt: 0,
                    updatedAt: 0,
                },
            },
        });
        expect(getConnectableInputHandles(node, ctx)).toEqual([
            { id: 'in_strength', label: 'Strength', type: 'float' },
        ]);
        expect(getConnectableOutputHandles(node, ctx).map((h) => h.id)).toEqual(['out']);
    });

    it('uses dynamicPorts for code instances', () => {
        const node = createNode('code', 'code/fx-1', {
            dynamicPorts: [
                { id: 'in_amount', label: 'Amount', type: 'float' },
                { id: 'out', label: 'Out', type: 'vec3' },
            ],
        });
        const ctx = makeCtx([node]);
        expect(getConnectableInputHandles(node, ctx).map((h) => h.id)).toEqual(['in_amount']);
        expect(getConnectableOutputHandles(node, ctx).map((h) => h.id)).toEqual(['out']);
    });

    it('returns nothing for groups and comments', () => {
        const group = createNode('g', 'group', { type: 'group' as NodeType });
        const comment = createNode('c', 'utils/comment');
        expect(getConnectableInputHandles(group, makeCtx([group]))).toEqual([]);
        expect(getConnectableOutputHandles(comment, makeCtx([comment]))).toEqual([]);
    });
});

describe('getConnectableOutputHandles', () => {
    it('types global/ref output from the bound global', () => {
        const node = createNode('gref', 'global/ref', { values: { globalId: 'g1' } });
        const ctx = makeCtx([node], [], {
            globals: [
                { id: 'g1', name: 'Time', kind: 'uniform', type: 'float', defaultValue: 0 },
            ],
        });
        expect(getConnectableOutputHandles(node, ctx)).toEqual([
            { id: 'out', label: 'Time', type: 'float' },
        ]);
    });

    it('resolves declared-any outputs through the graph', () => {
        const floatNode = createNode('f', 'const/float');
        const addNode = createNode('add', 'math/add');
        const edges: Edge[] = [
            { id: 'e1', source: 'f', target: 'add', sourceHandle: 'out', targetHandle: 'a' },
        ];
        const ctx = makeCtx([floatNode, addNode], edges);
        const handles = getConnectableOutputHandles(addNode, ctx);
        const out = handles.find((h) => h.id === 'out');
        expect(out?.type).toBe('float');
    });
});

describe('resolveInputHandleType', () => {
    it('resolves registry input types', () => {
        const node = createNode('mix', 'math/mix');
        expect(resolveInputHandleType(node, 't', makeCtx([node]))).toBe('float');
        expect(resolveInputHandleType(node, 'a', makeCtx([node]))).toBe('any');
    });

    it('resolves multiOp param types', () => {
        const node = createNode('m', 'math/multiOp', {
            operations: [{ id: 'op1', op: 'add' }],
        });
        const ctx = makeCtx([node]);
        const handles = getConnectableInputHandles(node, ctx);
        expect(handles.length).toBeGreaterThan(0);
        expect(resolveInputHandleType(node, handles[0].id, ctx)).toBe(handles[0].type);
    });

    it('resolves subgraph and dynamic ports, falling back to any', () => {
        const sub = createNode('sub', 'custom/blur-1');
        const ctx = makeCtx([sub], [], {
            subgraphs: {
                'custom/blur-1': {
                    id: 'custom/blur-1',
                    name: 'Blur',
                    inputs: [{ id: 'in_strength', label: 'Strength', type: 'float' }],
                    outputs: [],
                    nodes: [],
                    edges: [],
                    createdAt: 0,
                    updatedAt: 0,
                },
            },
        });
        expect(resolveInputHandleType(sub, 'in_strength', ctx)).toBe('float');
        expect(resolveInputHandleType(sub, 'nope', ctx)).toBe('any');

        const code = createNode('code', 'code/fx-1', {
            dynamicPorts: [{ id: 'in_amount', label: 'Amount', type: 'vec2' }],
        });
        expect(resolveInputHandleType(code, 'in_amount', makeCtx([code]))).toBe('vec2');
    });
});
