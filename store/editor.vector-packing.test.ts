import { beforeEach, describe, expect, it } from 'vitest';
import { initializeNodes } from '@/lib/nodes';
import { getPackedChannelVisuals } from '@/lib/vector-packing';
import { useEditorStore } from './editor';

function incomingEdges(nodeId: string) {
    return useEditorStore.getState().edges.filter((edge) => edge.target === nodeId);
}

function addConstructorVec3() {
    const store = useEditorStore.getState();
    store.addNode('const/vec3', { x: 400, y: 0 });
    return useEditorStore.getState().nodes.find((node) => node.data.type === 'const/vec3')!;
}

function addSource(type: 'const/float' | 'const/vec2' | 'const/vec3', y: number) {
    const store = useEditorStore.getState();
    store.addNode(type, { x: 0, y });
    return useEditorStore.getState().nodes.find((node) => node.data.type === type)!;
}

describe('Editor vector packing', () => {
    beforeEach(() => {
        initializeNodes();
        useEditorStore.getState().resetEditor();
    });

    it('connects a vec2 to X with a single edge and derives Y as consumed', () => {
        const vec3 = addConstructorVec3();
        const vec2 = addSource('const/vec2', 0);

        useEditorStore.getState().onConnect({
            source: vec2.id,
            sourceHandle: 'out',
            target: vec3.id,
            targetHandle: 'x',
        });

        const incoming = incomingEdges(vec3.id);
        expect(incoming).toHaveLength(1);
        expect(incoming[0].targetHandle).toBe('x');

        const visuals = getPackedChannelVisuals(
            'const/vec3',
            incoming.map((edge) => ({ edgeId: edge.id, targetHandle: edge.targetHandle, width: 2 })),
        );
        expect(visuals.get('x')?.kind).toBe('anchor');
        expect(visuals.get('y')?.kind).toBe('consumed');
    });

    it('packs a vec2 anchored at Y into Y and Z', () => {
        const vec3 = addConstructorVec3();
        const vec2 = addSource('const/vec2', 0);

        useEditorStore.getState().onConnect({
            source: vec2.id,
            sourceHandle: 'out',
            target: vec3.id,
            targetHandle: 'y',
        });

        const incoming = incomingEdges(vec3.id);
        expect(incoming).toHaveLength(1);
        expect(incoming[0].targetHandle).toBe('y');
    });

    it('rejects a vec2 that overflows the remaining channels', () => {
        const vec3 = addConstructorVec3();
        const vec2 = addSource('const/vec2', 0);
        const historyBefore = useEditorStore.getState().history.past.length;

        useEditorStore.getState().onConnect({
            source: vec2.id,
            sourceHandle: 'out',
            target: vec3.id,
            targetHandle: 'z',
        });

        expect(incomingEdges(vec3.id)).toHaveLength(0);
        expect(useEditorStore.getState().history.past.length).toBe(historyBefore);
    });

    it('rejects connecting to a channel consumed by an earlier anchor', () => {
        const vec3 = addConstructorVec3();
        const vec2 = addSource('const/vec2', 0);
        const float = addSource('const/float', 100);

        const store = useEditorStore.getState();
        store.onConnect({ source: vec2.id, sourceHandle: 'out', target: vec3.id, targetHandle: 'x' });
        store.onConnect({ source: float.id, sourceHandle: 'out', target: vec3.id, targetHandle: 'y' });

        const incoming = incomingEdges(vec3.id);
        expect(incoming).toHaveLength(1);
        expect(incoming[0].source).toBe(vec2.id);
    });

    it('evicts whole conflicting edges and connects in one undoable step', () => {
        const vec3 = addConstructorVec3();
        const vec2 = addSource('const/vec2', 0);
        const float = addSource('const/float', 100);

        const store = useEditorStore.getState();
        store.onConnect({ source: float.id, sourceHandle: 'out', target: vec3.id, targetHandle: 'y' });
        const originalEdgeId = incomingEdges(vec3.id)[0].id;
        expect(incomingEdges(vec3.id)).toHaveLength(1);

        store.onConnect({ source: vec2.id, sourceHandle: 'out', target: vec3.id, targetHandle: 'x' });

        const incoming = incomingEdges(vec3.id);
        expect(incoming).toHaveLength(1);
        expect(incoming[0].source).toBe(vec2.id);
        expect(incoming[0].targetHandle).toBe('x');

        useEditorStore.getState().undo();

        const restored = incomingEdges(vec3.id);
        expect(restored).toHaveLength(1);
        expect(restored[0].id).toBe(originalEdgeId);
        expect(restored[0].source).toBe(float.id);
        expect(restored[0].targetHandle).toBe('y');
    });

    it('frees consumed channels when a float replaces the packed anchor', () => {
        const vec3 = addConstructorVec3();
        const vec2 = addSource('const/vec2', 0);
        const float = addSource('const/float', 100);

        const store = useEditorStore.getState();
        store.onConnect({ source: vec2.id, sourceHandle: 'out', target: vec3.id, targetHandle: 'x' });
        store.onConnect({ source: float.id, sourceHandle: 'out', target: vec3.id, targetHandle: 'x' });

        const incoming = incomingEdges(vec3.id);
        expect(incoming).toHaveLength(1);
        expect(incoming[0].source).toBe(float.id);
        expect(incoming[0].targetHandle).toBe('x');
    });

    it('leaves non-constructor targets on the regular single-edge path', () => {
        const store = useEditorStore.getState();
        store.addNode('math/sin', { x: 400, y: 0 });
        const sin = useEditorStore.getState().nodes.find((node) => node.data.type === 'math/sin')!;
        const vec2 = addSource('const/vec2', 0);

        store.onConnect({ source: vec2.id, sourceHandle: 'out', target: sin.id, targetHandle: 'x' });

        expect(incomingEdges(sin.id)).toHaveLength(1);
    });
});
