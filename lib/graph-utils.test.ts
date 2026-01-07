
import { describe, it, expect } from 'vitest';
import { topologicalSort } from './graph-utils';
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
