import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Node } from '@xyflow/react';
import type { NodeType, TSLNodeData } from '@/lib/types';
import { useEditorStore } from './editor';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
    },
}));

const createUniformNode = (
    id: string,
    values: TSLNodeData['values'] = {}
): Node<TSLNodeData> => ({
    id,
    type: 'const/uniform',
    position: { x: 0, y: 0 },
    data: {
        type: 'const/uniform' as NodeType,
        values: { uniformType: 'float', value: 0, ...values },
        connected: {},
    },
});

describe('Uniform range + gesture store actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useEditorStore.getState().resetEditor();
    });

    it('takes one snapshot per live gesture and never bumps graphStructureVersion', () => {
        useEditorStore.setState({ nodes: [createUniformNode('u1')] });
        const versionBefore = useEditorStore.getState().graphStructureVersion;
        const historyBefore = useEditorStore.getState().history.past.length;

        const store = useEditorStore.getState();
        store.updateUniformNodeValueLive('u1', 0.2);
        store.updateUniformNodeValueLive('u1', 0.4);
        store.updateUniformNodeValueLive('u1', 0.6);

        const state = useEditorStore.getState();
        expect(state.history.past.length).toBe(historyBefore + 1);
        expect(state.graphStructureVersion).toBe(versionBefore);
        expect(state.nodes[0].data.values.value).toBe(0.6);

        // Commit ends the gesture; the next live edit takes a fresh snapshot
        state.commitUniformGesture('node:u1');
        useEditorStore.getState().updateUniformNodeValueLive('u1', 0.8);
        expect(useEditorStore.getState().history.past.length).toBe(historyBefore + 2);
    });

    it('clamps live values to the configured range', () => {
        useEditorStore.setState({ nodes: [createUniformNode('u1', { min: 0, max: 1 })] });
        useEditorStore.getState().updateUniformNodeValueLive('u1', 5);
        expect(useEditorStore.getState().nodes[0].data.values.value).toBe(1);
    });

    it('updateUniformRange sanitizes, clamps the value, and does not bump the version', () => {
        useEditorStore.setState({ nodes: [createUniformNode('u1', { value: 8 })] });
        const versionBefore = useEditorStore.getState().graphStructureVersion;

        useEditorStore.getState().updateUniformRange('u1', { min: 0, max: 2, step: 0.5 });

        const values = useEditorStore.getState().nodes[0].data.values;
        expect(values.min).toBe(0);
        expect(values.max).toBe(2);
        expect(values.step).toBe(0.5);
        expect(values.value).toBe(2);
        expect(useEditorStore.getState().graphStructureVersion).toBe(versionBefore);
    });

    it('updateUniformRange drops an inverted min/max pair', () => {
        useEditorStore.setState({ nodes: [createUniformNode('u1')] });
        useEditorStore.getState().updateUniformRange('u1', { min: 5, max: 1 });
        const values = useEditorStore.getState().nodes[0].data.values;
        expect(values.min).toBeUndefined();
        expect(values.max).toBeUndefined();
    });

    it('clearing a range field removes it', () => {
        useEditorStore.setState({ nodes: [createUniformNode('u1', { min: 0, max: 1 })] });
        useEditorStore.getState().updateUniformRange('u1', { max: undefined });
        const values = useEditorStore.getState().nodes[0].data.values;
        expect(values.min).toBe(0);
        expect(values.max).toBeUndefined();
    });

    it('setUniformType strips range fields when switching to bool', () => {
        useEditorStore.setState({ nodes: [createUniformNode('u1', { min: 0, max: 1, step: 0.1 })] });
        useEditorStore.getState().setUniformType('u1', 'bool');
        const values = useEditorStore.getState().nodes[0].data.values;
        expect(values.uniformType).toBe('bool');
        expect(values.min).toBeUndefined();
        expect(values.max).toBeUndefined();
        expect(values.step).toBeUndefined();
    });

    it('setUniformType re-sanitizes the range when switching to int', () => {
        useEditorStore.setState({ nodes: [createUniformNode('u1', { min: 0.4, max: 9.6, step: 0.2 })] });
        useEditorStore.getState().setUniformType('u1', 'int');
        const values = useEditorStore.getState().nodes[0].data.values;
        expect(values.min).toBe(0);
        expect(values.max).toBe(10);
        expect(values.step).toBe(1);
    });

    it('rejects empty and duplicate uniform names', () => {
        useEditorStore.setState({
            nodes: [
                createUniformNode('u1', { localName: 'speed' }),
                createUniformNode('u2', { localName: 'scale' }),
            ],
        });

        const store = useEditorStore.getState();
        store.updateNodeValue('u2', 'localName', '   ');
        expect(toast.error).toHaveBeenCalledWith('Uniform name cannot be empty.');
        expect(useEditorStore.getState().nodes[1].data.values.localName).toBe('scale');

        store.updateNodeValue('u2', 'localName', 'Speed');
        expect(toast.error).toHaveBeenCalledWith('Uniform name "Speed" already exists.');
        expect(useEditorStore.getState().nodes[1].data.values.localName).toBe('scale');

        store.updateNodeValue('u2', 'localName', 'rate');
        expect(useEditorStore.getState().nodes[1].data.values.localName).toBe('rate');
    });

    it('addNode uniquifies uniform names and sanitizes provided range', () => {
        const store = useEditorStore.getState();
        store.addNode('const/uniform', { x: 0, y: 0 }, {
            values: { uniformType: 'float', value: 3, localName: 'speed', min: 0, max: 1 },
        });
        store.addNode('const/uniform', { x: 50, y: 0 }, {
            values: { uniformType: 'float', value: 0, localName: 'speed' },
        });

        const uniforms = useEditorStore
            .getState()
            .nodes.filter((n) => n.data.type === 'const/uniform');
        expect(uniforms.map((n) => n.data.values.localName)).toEqual(['speed', 'speed_1']);
        // Provided value was clamped into the provided range
        expect(uniforms[0].data.values.value).toBe(1);
        expect(uniforms[0].data.values.min).toBe(0);
        expect(uniforms[0].data.values.max).toBe(1);
    });

    it('updateGlobalUniformValueLive updates without a version bump, unlike updateGlobal', () => {
        const store = useEditorStore.getState();
        const id = store.addGlobal({ name: 'uSpeed', kind: 'uniform', type: 'float', defaultValue: 0 });
        expect(id).toBeTruthy();

        const versionBefore = useEditorStore.getState().graphStructureVersion;
        const historyBefore = useEditorStore.getState().history.past.length;

        useEditorStore.getState().updateGlobalUniformValueLive(id!, 0.3);
        useEditorStore.getState().updateGlobalUniformValueLive(id!, 0.7);

        let state = useEditorStore.getState();
        expect(state.graphStructureVersion).toBe(versionBefore);
        expect(state.history.past.length).toBe(historyBefore + 1);
        expect(state.globals.find((g) => g.id === id)?.defaultValue).toBe(0.7);

        state.updateGlobal(id!, { name: 'uSpeed2' });
        state = useEditorStore.getState();
        expect(state.graphStructureVersion).toBe(versionBefore + 1);
    });

    it('updateGlobalUniformRange stores and clamps on global entries', () => {
        const store = useEditorStore.getState();
        const id = store.addGlobal({ name: 'uAmount', kind: 'uniform', type: 'float', defaultValue: 9 });
        const versionBefore = useEditorStore.getState().graphStructureVersion;

        useEditorStore.getState().updateGlobalUniformRange(id!, { min: 0, max: 2 });

        const entry = useEditorStore.getState().globals.find((g) => g.id === id)!;
        expect(entry.min).toBe(0);
        expect(entry.max).toBe(2);
        expect(entry.defaultValue).toBe(2);
        expect(useEditorStore.getState().graphStructureVersion).toBe(versionBefore);
    });

    it('updateGlobal strips range fields when the type becomes non-numeric', () => {
        const store = useEditorStore.getState();
        const id = store.addGlobal({ name: 'uTint', kind: 'uniform', type: 'float', defaultValue: 0 });
        useEditorStore.getState().updateGlobalUniformRange(id!, { min: 0, max: 1 });
        useEditorStore.getState().updateGlobal(id!, { type: 'color' });

        const entry = useEditorStore.getState().globals.find((g) => g.id === id)!;
        expect(entry.min).toBeUndefined();
        expect(entry.max).toBeUndefined();
    });
});
