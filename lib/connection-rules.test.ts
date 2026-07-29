import { describe, it, expect } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import type { NodeType, TSLNodeData } from '@/lib/types';
import { isConnectionAllowed } from './connection-rules';

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

const edge = (source: string, target: string, targetHandle = 'in'): Edge => ({
    id: `edge-${source}-${target}`,
    source,
    target,
    sourceHandle: 'out',
    targetHandle,
});

describe('isConnectionAllowed', () => {
    it('allows a plain connection between two nodes', () => {
        const nodes = [createNode('a', 'const/float'), createNode('b', 'math/sin')];
        expect(isConnectionAllowed({ source: 'a', target: 'b' }, nodes, [])).toBe(true);
    });

    it('rejects missing endpoints', () => {
        const nodes = [createNode('a', 'const/float')];
        expect(isConnectionAllowed({ source: 'a', target: 'missing' }, nodes, [])).toBe(false);
        expect(isConnectionAllowed({ source: 'missing', target: 'a' }, nodes, [])).toBe(false);
    });

    it('rejects self-connections and cycles', () => {
        const nodes = [createNode('a', 'math/sin'), createNode('b', 'math/cos')];
        const edges = [edge('a', 'b')];
        expect(isConnectionAllowed({ source: 'a', target: 'a' }, nodes, [])).toBe(false);
        expect(isConnectionAllowed({ source: 'b', target: 'a' }, nodes, edges)).toBe(false);
    });

    it('rejects connections across different loops', () => {
        const nodes = [
            createNode('loopA', 'loop', { type: 'loop' as NodeType }),
            createNode('loopB', 'loop', { type: 'loop' as NodeType }),
            createNode('a', 'math/sin', {}, { parentId: 'loopA' }),
            createNode('b', 'math/cos', {}, { parentId: 'loopB' }),
        ];
        expect(isConnectionAllowed({ source: 'a', target: 'b' }, nodes, [])).toBe(false);
    });

    it('allows inside->outside only from loop/output', () => {
        const nodes = [
            createNode('loopA', 'loop', { type: 'loop' as NodeType }),
            createNode('inner', 'math/sin', {}, { parentId: 'loopA' }),
            createNode('loopOut', 'loop/output', {}, { parentId: 'loopA' }),
            createNode('outside', 'math/cos'),
        ];
        expect(isConnectionAllowed({ source: 'inner', target: 'outside' }, nodes, [])).toBe(false);
        expect(isConnectionAllowed({ source: 'loopOut', target: 'outside' }, nodes, [])).toBe(true);
    });

    it('rejects outside->inside into loop/output', () => {
        const nodes = [
            createNode('loopA', 'loop', { type: 'loop' as NodeType }),
            createNode('loopOut', 'loop/output', {}, { parentId: 'loopA' }),
            createNode('inner', 'math/sin', {}, { parentId: 'loopA' }),
            createNode('outside', 'math/cos'),
        ];
        expect(isConnectionAllowed({ source: 'outside', target: 'loopOut' }, nodes, [])).toBe(false);
        expect(isConnectionAllowed({ source: 'outside', target: 'inner' }, nodes, [])).toBe(true);
    });

    it('rejects a local/get source with a missing or out-of-scope binding', () => {
        const nodes = [
            createNode('loopA', 'loop', { type: 'loop' as NodeType }),
            createNode('set', 'local/set', {}, { parentId: 'loopA' }),
            createNode('getUnbound', 'local/get'),
            createNode('getOutside', 'local/get', { values: { localSourceId: 'set' } }),
            createNode('sink', 'math/sin'),
        ];
        expect(isConnectionAllowed({ source: 'getUnbound', target: 'sink' }, nodes, [])).toBe(false);
        expect(isConnectionAllowed({ source: 'getOutside', target: 'sink' }, nodes, [])).toBe(false);
    });

    it('allows a local/get source with an in-scope binding', () => {
        const nodes = [
            createNode('set', 'local/set'),
            createNode('get', 'local/get', { values: { localSourceId: 'set' } }),
            createNode('sink', 'math/sin'),
        ];
        expect(isConnectionAllowed({ source: 'get', target: 'sink' }, nodes, [])).toBe(true);
    });
});
