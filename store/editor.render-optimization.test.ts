import { beforeEach, describe, expect, it } from 'vitest';

import { useEditorStore } from './editor';

describe('Editor store render guards', () => {
    beforeEach(() => {
        useEditorStore.getState().resetEditor();
    });

    it('does not notify subscribers for repeated hover and selection values', () => {
        let notifications = 0;
        const unsubscribe = useEditorStore.subscribe(() => {
            notifications += 1;
        });
        const store = useEditorStore.getState();

        store.setHoveredGroupId(null);
        store.setSelectedNode(null);
        store.setSelectedNodes([]);
        expect(notifications).toBe(0);

        store.setHoveredGroupId('group-1');
        expect(notifications).toBe(1);
        useEditorStore.getState().setHoveredGroupId('group-1');
        expect(notifications).toBe(1);

        useEditorStore.getState().setSelectedNodes(['node-1']);
        expect(notifications).toBe(2);
        useEditorStore.getState().setSelectedNode('node-1');
        useEditorStore.getState().setSelectedNodes(['node-1']);
        expect(notifications).toBe(2);

        useEditorStore.getState().setSelectedNodes(['node-1', 'node-2']);
        expect(notifications).toBe(3);
        const multiSelection = useEditorStore.getState().selectedNodeIds;
        useEditorStore.getState().setSelectedNodes(['node-2', 'node-1']);
        expect(notifications).toBe(3);
        expect(useEditorStore.getState().selectedNodeIds).toBe(multiSelection);

        unsubscribe();
    });
});
