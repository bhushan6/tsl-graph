import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const createNode = (
    id: string,
    type: NodeType,
    values: TSLNodeData['values'] = {},
): Node<TSLNodeData> => ({
    id,
    type,
    position: { x: 0, y: 0 },
    data: {
        type,
        values,
        connected: {},
    },
});

describe('optional node local names', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useEditorStore.getState().resetEditor();
    });

    it('removes an optional localName when it is cleared and keeps the change undoable', () => {
        useEditorStore.setState({
            nodes: [createNode('add-1', 'math/add', { localName: 'sum' })],
        });
        useEditorStore.getState().markSaved();

        const historyBefore = useEditorStore.getState().history.past.length;
        useEditorStore.getState().updateNodeValue('add-1', 'localName', '   ');

        const clearedNode = useEditorStore.getState().nodes[0];
        expect(clearedNode.data.values.localName).toBeUndefined();
        expect(Object.prototype.hasOwnProperty.call(clearedNode.data.values, 'localName')).toBe(false);
        expect(useEditorStore.getState().history.past.length).toBe(historyBefore + 1);
        expect(useEditorStore.getState().isDirty).toBe(true);

        useEditorStore.getState().undo();
        expect(useEditorStore.getState().nodes[0].data.values.localName).toBe('sum');
    });

    it('keeps required uniform and local names when an empty value is submitted', () => {
        useEditorStore.setState({
            nodes: [
                createNode('uniform-1', 'const/uniform', { uniformType: 'float', value: 0, localName: 'amount' }),
                createNode('set-1', 'local/set', { localName: 'saved' }),
            ],
        });
        const historyBefore = useEditorStore.getState().history.past.length;

        useEditorStore.getState().updateNodeValue('uniform-1', 'localName', '');
        useEditorStore.getState().updateNodeValue('set-1', 'localName', '');

        const state = useEditorStore.getState();
        expect(state.nodes[0].data.values.localName).toBe('amount');
        expect(state.nodes[1].data.values.localName).toBe('saved');
        expect(state.history.past.length).toBe(historyBefore);
        expect(toast.error).toHaveBeenCalledWith('Uniform name cannot be empty.');
        expect(toast.error).toHaveBeenCalledWith('Local name cannot be empty.');
    });
});
