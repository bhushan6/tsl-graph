import { beforeEach, describe, expect, it } from 'vitest';
import { initializeNodes } from '@/lib/nodes';
import { useEditorStore } from './editor';

describe('Editor connection cardinality', () => {
    beforeEach(() => {
        initializeNodes();
        useEditorStore.getState().resetEditor();
    });

    it('allows one output to fan out to multiple input handles', () => {
        const store = useEditorStore.getState();
        store.addNode('const/float', { x: 0, y: 0 });
        store.addNode('math/sin', { x: 200, y: 0 });
        store.addNode('math/sin', { x: 200, y: 100 });

        const state = useEditorStore.getState();
        const source = state.nodes.find((node) => node.data.type === 'const/float')!;
        const targets = state.nodes.filter((node) => node.data.type === 'math/sin');

        store.onConnect({ source: source.id, sourceHandle: 'out', target: targets[0].id, targetHandle: 'x' });
        store.onConnect({ source: source.id, sourceHandle: 'out', target: targets[1].id, targetHandle: 'x' });

        const outgoing = useEditorStore.getState().edges.filter(
            (edge) => edge.source === source.id && edge.sourceHandle === 'out'
        );
        expect(outgoing).toHaveLength(2);
    });

    it('keeps only one incoming edge per input handle by replacing the old edge', () => {
        const store = useEditorStore.getState();
        store.addNode('const/float', { x: 0, y: 0 });
        store.addNode('const/float', { x: 0, y: 100 });
        store.addNode('math/sin', { x: 200, y: 0 });

        const state = useEditorStore.getState();
        const sources = state.nodes.filter((node) => node.data.type === 'const/float');
        const target = state.nodes.find((node) => node.data.type === 'math/sin')!;

        store.onConnect({ source: sources[0].id, sourceHandle: 'out', target: target.id, targetHandle: 'x' });
        store.onConnect({ source: sources[1].id, sourceHandle: 'out', target: target.id, targetHandle: 'x' });

        const incoming = useEditorStore.getState().edges.filter(
            (edge) => edge.target === target.id && edge.targetHandle === 'x'
        );
        expect(incoming).toHaveLength(1);
        expect(incoming[0].source).toBe(sources[1].id);
    });
});
