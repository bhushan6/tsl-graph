
import { describe, it, expect } from 'vitest';
import { topologicalSort, hasCycle, getParentedPositionForNewNode } from './graph-utils';
import { Node, Edge } from '@xyflow/react';
import { TSLNodeData } from '@/lib/types';

// Mock TSLNodeData since we just need the structure for sorting
const createNode = (id: string): Node<TSLNodeData> => ({
    id,
    position: { x: 0, y: 0 },
    data: { type: 'math/add', values: {}, connected: {} }
});

describe('topologicalSort', () => {
    it('should sort a simple dependency chain A -> B', () => {
        const nodes = [createNode('A'), createNode('B')];
        const edges: Edge[] = [
            { id: 'e1', source: 'A', target: 'B' }
        ];

        const sorted = topologicalSort(nodes, edges);
        // B depends on A, so A should come before B
        expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('B'));
        expect(sorted).toHaveLength(2);
    });

    it('should sort a diamond dependency A -> B, A -> C, B -> D, C -> D', () => {
        const nodes = [createNode('A'), createNode('B'), createNode('C'), createNode('D')];
        const edges: Edge[] = [
            { id: '1', source: 'A', target: 'B' },
            { id: '2', source: 'A', target: 'C' },
            { id: '3', source: 'B', target: 'D' },
            { id: '4', source: 'C', target: 'D' },
        ];

        const sorted = topologicalSort(nodes, edges);

        expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('B'));
        expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('C'));
        expect(sorted.indexOf('B')).toBeLessThan(sorted.indexOf('D'));
        expect(sorted.indexOf('C')).toBeLessThan(sorted.indexOf('D'));
        expect(sorted).toHaveLength(4);
    });

    it('should handle disconnected graphs', () => {
        // A -> B   C -> D
        const nodes = [createNode('A'), createNode('B'), createNode('C'), createNode('D')];
        const edges: Edge[] = [
            { id: '1', source: 'A', target: 'B' },
            { id: '2', source: 'C', target: 'D' },
        ];

        const sorted = topologicalSort(nodes, edges);

        expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('B'));
        expect(sorted.indexOf('C')).toBeLessThan(sorted.indexOf('D'));
        expect(sorted).toHaveLength(4);
    });

    it('should handle single nodes without edges', () => {
        const nodes = [createNode('A'), createNode('B')];
        const edges: Edge[] = [];

        const sorted = topologicalSort(nodes, edges);
        expect(sorted).toHaveLength(2);
        expect(sorted).toContain('A');
        expect(sorted).toContain('B');
    });
});

describe('hasCycle', () => {
    it('should detect a direct cycle (back edge)', () => {
        const nodes = [createNode('A'), createNode('B')];
        const edges: Edge[] = [
            { id: '1', source: 'A', target: 'B' }
        ];

        // Try to connect B -> A (Source: B, Target: A)
        // Check if A reaches B
        // hasCycle(Target, Source)
        expect(hasCycle(createNode('A'), createNode('B'), nodes, edges)).toBe(true);
    });

    it('should detect an indirect cycle', () => {
        const nodes = [createNode('A'), createNode('B'), createNode('C')];
        const edges: Edge[] = [
            { id: '1', source: 'A', target: 'B' },
            { id: '2', source: 'B', target: 'C' }
        ];

        // Try to connect C -> A (Source: C, Target: A)
        // Check if A reaches C
        // hasCycle(Target, Source)
        expect(hasCycle(createNode('A'), createNode('C'), nodes, edges)).toBe(true);
    });

    it('should allow non-cyclic connections', () => {
        const nodes = [createNode('A'), createNode('B'), createNode('C')];
        const edges: Edge[] = [
            { id: '1', source: 'A', target: 'B' }
        ];

        // Try to connect B -> C (Source: B, Target: C)
        // Check if C reaches B
        // hasCycle(Target, Source) => hasCycle(C, B)
        expect(hasCycle(createNode('C'), createNode('B'), nodes, edges)).toBe(false);
    });

    it('should detect self-loops', () => {
        const nodes = [createNode('A')];
        const edges: Edge[] = [];

        // Try to connect A -> A
        expect(hasCycle(createNode('A'), createNode('A'), nodes, edges)).toBe(true);
    });
});

describe('getParentedPositionForNewNode', () => {
    it('should return null when source has no parent', () => {
        const nodes = [createNode('A')];
        const result = getParentedPositionForNewNode(nodes, 'A', { x: 100, y: 100 });
        expect(result).toBeNull();
    });

    it('should return relative position for parented source', () => {
        const parent = {
            id: 'group1',
            type: 'group',
            position: { x: 50, y: 75 },
            data: { type: 'group', values: {}, connected: {} },
        } as Node<TSLNodeData>;
        const child = {
            id: 'child1',
            position: { x: 10, y: 20 },
            parentId: 'group1',
            data: { type: 'math/add', values: {}, connected: {} },
        } as Node<TSLNodeData>;
        const nodes = [parent, child];

        const result = getParentedPositionForNewNode(nodes, 'child1', { x: 120, y: 130 });

        expect(result).toEqual({
            parentId: 'group1',
            extent: 'parent',
            position: { x: 70, y: 55 },
        });
    });
});
