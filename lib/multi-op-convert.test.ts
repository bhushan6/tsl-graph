import { describe, it, expect, beforeAll } from 'vitest';
import { Node, Edge } from '@xyflow/react';
import { TSLNodeData, NodeType, NodeDef } from '@/lib/types';
import { registry } from '@/lib/registry';
import { detectConvertibleChain, buildMultiOpFromChain, buildChainFromMultiOp } from './multi-op-convert';
import type { MultiOp } from './multi-op';

// Register the math nodes we need for testing
const testDefs: NodeDef[] = [
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
    {
        type: 'math/mul' as NodeType,
        label: 'Multiply',
        category: 'Math',
        tsl: 'mul',
        inputs: {
            a: { type: 'any', default: 1, label: 'A' },
            b: { type: 'any', default: 1, label: 'B' },
        },
        outputs: { out: { type: 'any', label: 'Out' } },
    },
    {
        type: 'math/sub' as NodeType,
        label: 'Subtract',
        category: 'Math',
        tsl: 'sub',
        inputs: {
            a: { type: 'any', default: 0, label: 'A' },
            b: { type: 'any', default: 0, label: 'B' },
        },
        outputs: { out: { type: 'any', label: 'Out' } },
    },
    {
        type: 'math/sin' as NodeType,
        label: 'Sin',
        category: 'Math',
        tsl: 'sin',
        inputs: { x: { type: 'any', default: 0, label: 'X' } },
        outputs: { out: { type: 'any', label: 'Out' } },
    },
    {
        type: 'math/clamp' as NodeType,
        label: 'Clamp',
        category: 'Math',
        tsl: 'clamp',
        inputs: {
            x: { type: 'any', default: 0, label: 'X' },
            min: { type: 'any', default: 0, label: 'Min' },
            max: { type: 'any', default: 1, label: 'Max' },
        },
        outputs: { out: { type: 'any', label: 'Out' } },
    },
    {
        type: 'math/split' as NodeType,
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
        type: 'const/float' as NodeType,
        label: 'Float',
        category: 'Constants',
        tsl: 'float',
        inputs: { value: { type: 'float', default: 0, label: 'Value' } },
        outputs: { out: { type: 'float', label: 'Out' } },
    },
    {
        type: 'math/multiOp' as NodeType,
        label: 'Multi-op',
        category: 'Math',
        tsl: 'multiOp',
        inputs: {},
        outputs: { out: { type: 'any', label: 'Out' } },
    },
];

beforeAll(() => {
    registry.registerMany(testDefs);
});

const createNode = (
    id: string,
    type: string,
    data: Partial<TSLNodeData> = {},
    position = { x: 0, y: 0 }
): Node<TSLNodeData> => ({
    id,
    type,
    position,
    data: {
        type: type as NodeType,
        values: {},
        connected: {},
        ...data,
    },
});

const createEdge = (
    source: string,
    sourceHandle: string,
    target: string,
    targetHandle: string
): Edge => ({
    id: `e-${source}-${sourceHandle}-${target}-${targetHandle}`,
    source,
    sourceHandle,
    target,
    targetHandle,
});

// ── detectConvertibleChain ──────────────────────────────────────────

describe('detectConvertibleChain', () => {
    it('should detect a valid 2-node chain (add → mul)', () => {
        const nodes = [
            createNode('n1', 'math/add', { values: { a: 1, b: 2 } }),
            createNode('n2', 'math/mul', { values: { b: 3 } }),
        ];
        const edges = [createEdge('n1', 'out', 'n2', 'a')];

        const result = detectConvertibleChain(['n1', 'n2'], nodes, edges);

        expect(result.valid).toBe(true);
        expect(result.orderedNodeIds).toEqual(['n1', 'n2']);
    });

    it('should detect a valid 3-node chain (add → sin → mul)', () => {
        const nodes = [
            createNode('n1', 'math/add', { values: { a: 1, b: 2 } }),
            createNode('n2', 'math/sin'),
            createNode('n3', 'math/mul', { values: { b: 5 } }),
        ];
        const edges = [
            createEdge('n1', 'out', 'n2', 'x'),
            createEdge('n2', 'out', 'n3', 'a'),
        ];

        const result = detectConvertibleChain(['n1', 'n2', 'n3'], nodes, edges);

        expect(result.valid).toBe(true);
        expect(result.orderedNodeIds).toEqual(['n1', 'n2', 'n3']);
    });

    it('should detect a 4-node chain with clamp (add → mul → sub → clamp)', () => {
        const nodes = [
            createNode('n1', 'math/add', { values: { a: 1, b: 2 } }),
            createNode('n2', 'math/mul', { values: { b: 3 } }),
            createNode('n3', 'math/sub', { values: { b: 10 } }),
            createNode('n4', 'math/clamp', { values: { min: 0, max: 1 } }),
        ];
        const edges = [
            createEdge('n1', 'out', 'n2', 'a'),
            createEdge('n2', 'out', 'n3', 'a'),
            createEdge('n3', 'out', 'n4', 'x'),
        ];

        const result = detectConvertibleChain(
            ['n1', 'n2', 'n3', 'n4'],
            nodes,
            edges
        );

        expect(result.valid).toBe(true);
        expect(result.orderedNodeIds).toEqual(['n1', 'n2', 'n3', 'n4']);
    });

    it('should handle unordered selection IDs', () => {
        const nodes = [
            createNode('n1', 'math/add', { values: { a: 1, b: 2 } }),
            createNode('n2', 'math/mul', { values: { b: 3 } }),
            createNode('n3', 'math/sin'),
        ];
        const edges = [
            createEdge('n1', 'out', 'n2', 'a'),
            createEdge('n2', 'out', 'n3', 'x'),
        ];

        // Selection in reverse order
        const result = detectConvertibleChain(['n3', 'n1', 'n2'], nodes, edges);

        expect(result.valid).toBe(true);
        expect(result.orderedNodeIds).toEqual(['n1', 'n2', 'n3']);
    });

    it('should reject single node', () => {
        const nodes = [createNode('n1', 'math/add')];
        const result = detectConvertibleChain(['n1'], nodes, []);

        expect(result.valid).toBe(false);
        expect(result.reason).toContain('at least 2');
    });

    it('should reject empty selection', () => {
        const result = detectConvertibleChain([], [], []);

        expect(result.valid).toBe(false);
        expect(result.reason).toContain('at least 2');
    });

    it('should reject non-math node in selection (const/float)', () => {
        const nodes = [
            createNode('n1', 'const/float', { values: { value: 5 } }),
            createNode('n2', 'math/add', { values: { b: 2 } }),
        ];
        const edges = [createEdge('n1', 'out', 'n2', 'a')];

        const result = detectConvertibleChain(['n1', 'n2'], nodes, edges);

        expect(result.valid).toBe(false);
        expect(result.reason).toContain('not a valid Multi-op');
    });

    it('should reject node with multiple outputs (math/split)', () => {
        const nodes = [
            createNode('n1', 'math/add'),
            createNode('n2', 'math/split'),
        ];
        const edges = [createEdge('n1', 'out', 'n2', 'in')];

        const result = detectConvertibleChain(['n1', 'n2'], nodes, edges);

        expect(result.valid).toBe(false);
        expect(result.reason).toContain('not a valid Multi-op');
    });

    it('should reject disconnected nodes', () => {
        const nodes = [
            createNode('n1', 'math/add', { values: { a: 1, b: 2 } }),
            createNode('n2', 'math/mul', { values: { a: 3, b: 4 } }),
        ];
        // No edges connecting them
        const result = detectConvertibleChain(['n1', 'n2'], nodes, []);

        expect(result.valid).toBe(false);
        expect(result.reason).toContain('multiple starting points');
    });

    it('should reject branching chain (one node feeds two selected nodes)', () => {
        const nodes = [
            createNode('n1', 'math/add'),
            createNode('n2', 'math/mul'),
            createNode('n3', 'math/sin'),
        ];
        const edges = [
            createEdge('n1', 'out', 'n2', 'a'),
            createEdge('n1', 'out', 'n3', 'x'),
        ];

        const result = detectConvertibleChain(['n1', 'n2', 'n3'], nodes, edges);

        expect(result.valid).toBe(false);
        expect(result.reason).toContain('branching');
    });

    it('should reject nodes connected only via non-chain input', () => {
        const nodes = [
            createNode('n1', 'math/add', { values: { a: 1, b: 2 } }),
            createNode('n2', 'math/mul'),
        ];
        // Connected to 'b' instead of 'a' (chainKey) — this is a non-chain edge
        const edges = [createEdge('n1', 'out', 'n2', 'b')];

        const result = detectConvertibleChain(['n1', 'n2'], nodes, edges);

        expect(result.valid).toBe(false);
        // Both nodes appear as heads since b is not the chainKey, so they can't form a single chain
        expect(result.reason).toBeDefined();
    });

    it('should reject multiOp node in selection', () => {
        const nodes = [
            createNode('n1', 'math/add'),
            createNode('n2', 'math/multiOp'),
        ];
        const edges = [createEdge('n1', 'out', 'n2', 'some-handle')];

        const result = detectConvertibleChain(['n1', 'n2'], nodes, edges);

        expect(result.valid).toBe(false);
        expect(result.reason).toContain('not a valid Multi-op');
    });

    it('should allow chain with external connections (non-selected nodes)', () => {
        const nodes = [
            createNode('external1', 'const/float', { values: { value: 5 } }),
            createNode('n1', 'math/add', { values: { b: 2 } }),
            createNode('n2', 'math/mul', { values: { b: 3 } }),
            createNode('external2', 'math/sin'),
        ];
        const edges = [
            createEdge('external1', 'out', 'n1', 'a'), // external → chain
            createEdge('n1', 'out', 'n2', 'a'), // chain internal
            createEdge('n2', 'out', 'external2', 'x'), // chain → external
        ];

        // Only select n1 and n2
        const result = detectConvertibleChain(['n1', 'n2'], nodes, edges);

        expect(result.valid).toBe(true);
        expect(result.orderedNodeIds).toEqual(['n1', 'n2']);
    });
});

// ── buildMultiOpFromChain ────────────────────────────────────────────

describe('buildMultiOpFromChain', () => {
    it('should build operations for a 2-node chain (add → mul)', () => {
        const nodes = [
            createNode('n1', 'math/add', { values: { a: 1, b: 2 } }),
            createNode('n2', 'math/mul', { values: { b: 3 } }),
        ];
        const edges = [createEdge('n1', 'out', 'n2', 'a')];

        const result = buildMultiOpFromChain(['n1', 'n2'], nodes, edges);

        expect(result.operations).toHaveLength(2);
        expect(result.operations[0].op).toBe('add');
        expect(result.operations[1].op).toBe('mul');
    });

    it('should build operations for a 3-node chain (add → sin → clamp)', () => {
        const nodes = [
            createNode('n1', 'math/add', { values: { a: 1, b: 2 } }),
            createNode('n2', 'math/sin'),
            createNode('n3', 'math/clamp', { values: { min: 0, max: 1 } }),
        ];
        const edges = [
            createEdge('n1', 'out', 'n2', 'x'),
            createEdge('n2', 'out', 'n3', 'x'),
        ];

        const result = buildMultiOpFromChain(['n1', 'n2', 'n3'], nodes, edges);

        expect(result.operations).toHaveLength(3);
        expect(result.operations[0].op).toBe('add');
        expect(result.operations[1].op).toBe('sin');
        expect(result.operations[2].op).toBe('clamp');
    });

    it('should transfer literal values to multiOp handles', () => {
        const nodes = [
            createNode('n1', 'math/add', { values: { a: 10, b: 20 } }),
            createNode('n2', 'math/mul', { values: { b: 5 } }),
        ];
        const edges = [createEdge('n1', 'out', 'n2', 'a')];

        const result = buildMultiOpFromChain(['n1', 'n2'], nodes, edges);
        const op1 = result.operations[0];
        const op2 = result.operations[1];

        // First op keeps both params (a and b)
        const op1HandleA = `op_${op1.id}_a`;
        const op1HandleB = `op_${op1.id}_b`;
        expect(result.values[op1HandleA]).toBe(10);
        expect(result.values[op1HandleB]).toBe(20);

        // Second op: chainKey 'a' is excluded (comes from chain), only 'b' remains
        const op2HandleB = `op_${op2.id}_b`;
        expect(result.values[op2HandleB]).toBe(5);
    });

    it('should rewire external incoming edges', () => {
        const nodes = [
            createNode('ext', 'const/float', { values: { value: 5 } }),
            createNode('n1', 'math/add', { values: { b: 2 } }),
            createNode('n2', 'math/mul', { values: { b: 3 } }),
        ];
        const edges = [
            createEdge('ext', 'out', 'n1', 'a'), // external → chain head
            createEdge('n1', 'out', 'n2', 'a'), // chain internal
        ];

        const result = buildMultiOpFromChain(['n1', 'n2'], nodes, edges);
        const op1 = result.operations[0];

        expect(result.incomingEdges).toHaveLength(1);
        expect(result.incomingEdges[0].originalEdge.source).toBe('ext');
        expect(result.incomingEdges[0].newTargetHandle).toBe(`op_${op1.id}_a`);
    });

    it('should rewire external incoming edges to non-chain inputs', () => {
        const nodes = [
            createNode('ext', 'const/float', { values: { value: 5 } }),
            createNode('n1', 'math/add', { values: { a: 1 } }),
            createNode('n2', 'math/mul'),
        ];
        const edges = [
            createEdge('ext', 'out', 'n2', 'b'), // external → second node's non-chain input
            createEdge('n1', 'out', 'n2', 'a'), // chain internal
        ];

        const result = buildMultiOpFromChain(['n1', 'n2'], nodes, edges);
        const op2 = result.operations[1];

        expect(result.incomingEdges).toHaveLength(1);
        expect(result.incomingEdges[0].originalEdge.source).toBe('ext');
        expect(result.incomingEdges[0].newTargetHandle).toBe(`op_${op2.id}_b`);
    });

    it('should rewire outgoing edges from last node', () => {
        const nodes = [
            createNode('n1', 'math/add', { values: { a: 1, b: 2 } }),
            createNode('n2', 'math/mul', { values: { b: 3 } }),
            createNode('ext', 'math/sin'),
        ];
        const edges = [
            createEdge('n1', 'out', 'n2', 'a'), // chain internal
            createEdge('n2', 'out', 'ext', 'x'), // chain → external
        ];

        const result = buildMultiOpFromChain(['n1', 'n2'], nodes, edges);

        expect(result.outgoingEdges).toHaveLength(1);
        expect(result.outgoingEdges[0].originalEdge.target).toBe('ext');
        expect(result.outgoingEdges[0].newSourceHandle).toBe('out');
    });

    it('should handle chain with no external connections', () => {
        const nodes = [
            createNode('n1', 'math/add', { values: { a: 1, b: 2 } }),
            createNode('n2', 'math/mul', { values: { b: 3 } }),
        ];
        const edges = [createEdge('n1', 'out', 'n2', 'a')];

        const result = buildMultiOpFromChain(['n1', 'n2'], nodes, edges);

        expect(result.incomingEdges).toHaveLength(0);
        expect(result.outgoingEdges).toHaveLength(0);
    });

    it('should handle sin node (single param) in chain', () => {
        const nodes = [
            createNode('n1', 'math/add', { values: { a: 1, b: 2 } }),
            createNode('n2', 'math/sin'),
        ];
        const edges = [createEdge('n1', 'out', 'n2', 'x')];

        const result = buildMultiOpFromChain(['n1', 'n2'], nodes, edges);

        expect(result.operations).toHaveLength(2);
        expect(result.operations[0].op).toBe('add');
        expect(result.operations[1].op).toBe('sin');

        // Sin in non-first position has no params (only chainKey 'x', which is excluded)
        // So no values for op2
        const op2 = result.operations[1];
        const op2Keys = Object.keys(result.values).filter((k) =>
            k.startsWith(`op_${op2.id}_`)
        );
        expect(op2Keys).toHaveLength(0);
    });

    it('should handle clamp node (multi-param) preserving min/max values', () => {
        const nodes = [
            createNode('n1', 'math/add', { values: { a: 1, b: 2 } }),
            createNode('n2', 'math/clamp', { values: { min: -1, max: 1 } }),
        ];
        const edges = [createEdge('n1', 'out', 'n2', 'x')];

        const result = buildMultiOpFromChain(['n1', 'n2'], nodes, edges);

        const op2 = result.operations[1];
        // Clamp in non-first position: chainKey 'x' excluded, 'min' and 'max' remain
        expect(result.values[`op_${op2.id}_min`]).toBe(-1);
        expect(result.values[`op_${op2.id}_max`]).toBe(1);
    });
});

// ── buildChainFromMultiOp ────────────────────────────────────────────

const createMultiOpNode = (
    id: string,
    operations: MultiOp[],
    values: Record<string, unknown> = {}
): Node<TSLNodeData> =>
    createNode(id, 'math/multiOp', {
        operations,
        values: values as TSLNodeData['values'],
    });

describe('buildChainFromMultiOp', () => {
    it('should reject a multiOp node with no operations', () => {
        const node = createMultiOpNode('m1', []);
        const result = buildChainFromMultiOp(node, []);

        expect(result.valid).toBe(false);
        expect(result.reason).toContain('no operations');
    });

    it('should expand a 2-op chain (add → mul) to node types', () => {
        const operations: MultiOp[] = [
            { id: 'a', op: 'add' },
            { id: 'b', op: 'mul' },
        ];
        const node = createMultiOpNode('m1', operations, {
            op_a_a: 10,
            op_a_b: 20,
            op_b_b: 5,
        });

        const result = buildChainFromMultiOp(node, []);

        expect(result.valid).toBe(true);
        expect(result.ops).toHaveLength(2);
        expect(result.ops[0].nodeType).toBe('math/add');
        expect(result.ops[1].nodeType).toBe('math/mul');
        // First op keeps both params
        expect(result.ops[0].values.a).toBe(10);
        expect(result.ops[0].values.b).toBe(20);
        // Second op: chainKey 'a' excluded, only 'b'
        expect(result.ops[1].values.b).toBe(5);
        expect(result.ops[1].chainKey).toBe('a');
    });

    it('should fall back to param defaults for missing values', () => {
        const operations: MultiOp[] = [{ id: 'a', op: 'add' }];
        const node = createMultiOpNode('m1', operations, {}); // no stored values

        const result = buildChainFromMultiOp(node, []);

        expect(result.valid).toBe(true);
        // add defaults are 0 for both a and b
        expect(result.ops[0].values.a).toBe(0);
        expect(result.ops[0].values.b).toBe(0);
    });

    it('should route external incoming edges to the owning op', () => {
        const operations: MultiOp[] = [
            { id: 'a', op: 'add' },
            { id: 'b', op: 'mul' },
        ];
        const node = createMultiOpNode('m1', operations);
        // External source feeds the first op's 'a' input handle
        const edges = [createEdge('ext', 'out', 'm1', 'op_a_a')];

        const result = buildChainFromMultiOp(node, edges);

        expect(result.incomingEdges).toHaveLength(1);
        expect(result.incomingEdges[0].opIndex).toBe(0);
        expect(result.incomingEdges[0].targetHandle).toBe('a');
    });

    it('should route incoming edges to a non-first op non-chain input', () => {
        const operations: MultiOp[] = [
            { id: 'a', op: 'add' },
            { id: 'b', op: 'mul' },
        ];
        const node = createMultiOpNode('m1', operations);
        const edges = [createEdge('ext', 'out', 'm1', 'op_b_b')];

        const result = buildChainFromMultiOp(node, edges);

        expect(result.incomingEdges).toHaveLength(1);
        expect(result.incomingEdges[0].opIndex).toBe(1);
        expect(result.incomingEdges[0].targetHandle).toBe('b');
    });

    it('should capture outgoing edges from the out handle', () => {
        const operations: MultiOp[] = [
            { id: 'a', op: 'add' },
            { id: 'b', op: 'mul' },
        ];
        const node = createMultiOpNode('m1', operations);
        const edges = [createEdge('m1', 'out', 'ext', 'x')];

        const result = buildChainFromMultiOp(node, edges);

        expect(result.outgoingEdges).toHaveLength(1);
        expect(result.outgoingEdges[0].originalEdge.target).toBe('ext');
    });

    it('should round-trip: chain → multiOp → chain preserves types and values', () => {
        const nodes = [
            createNode('n1', 'math/add', { values: { a: 1, b: 2 } }),
            createNode('n2', 'math/mul', { values: { b: 3 } }),
            createNode('n3', 'math/clamp', { values: { min: 0, max: 1 } }),
        ];
        const edges = [
            createEdge('n1', 'out', 'n2', 'a'),
            createEdge('n2', 'out', 'n3', 'x'),
        ];

        const forward = buildMultiOpFromChain(['n1', 'n2', 'n3'], nodes, edges);
        const multiOpNode = createMultiOpNode('m1', forward.operations, forward.values);

        const back = buildChainFromMultiOp(multiOpNode, []);

        expect(back.valid).toBe(true);
        expect(back.ops.map((o) => o.nodeType)).toEqual([
            'math/add',
            'math/mul',
            'math/clamp',
        ]);
        expect(back.ops[0].values.a).toBe(1);
        expect(back.ops[0].values.b).toBe(2);
        expect(back.ops[1].values.b).toBe(3);
        expect(back.ops[2].values.min).toBe(0);
        expect(back.ops[2].values.max).toBe(1);
    });
});
