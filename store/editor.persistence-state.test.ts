import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './editor';

describe('Editor persistence state', () => {
    beforeEach(() => {
        useEditorStore.getState().resetEditor();
    });

    it('tracks dirty and saving flags without store-owned transport callbacks', () => {
        const store = useEditorStore.getState() as unknown as {
            setAutoSaveCallback?: unknown;
            triggerAutoSave?: unknown;
        };

        expect(store.setAutoSaveCallback).toBeUndefined();
        expect(store.triggerAutoSave).toBeUndefined();

        useEditorStore.getState().markDirty();
        expect(useEditorStore.getState().isDirty).toBe(true);

        useEditorStore.getState().setSaving(true);
        expect(useEditorStore.getState().isSaving).toBe(true);

        useEditorStore.getState().markSaved();
        expect(useEditorStore.getState().isDirty).toBe(false);

        useEditorStore.getState().setSaving(false);
        expect(useEditorStore.getState().isSaving).toBe(false);
    });

    it('resetEditor clears persistence integration state', () => {
        useEditorStore.getState().setProjectId('project-123');
        useEditorStore.getState().setTemplateCallbacks({
            onSubgraphTemplateCreate: async () => ({ templateId: 'subgraph', version: 1 }),
            onSubgraphTemplateUpdate: async () => ({ version: 2 }),
            onCodeNodeTemplateCreate: async () => ({ templateId: 'code', version: 1 }),
            onCodeNodeTemplateUpdate: async () => ({ version: 2 }),
        });
        useEditorStore.getState().markDirty();
        useEditorStore.getState().setSaving(true);

        useEditorStore.getState().resetEditor();

        const state = useEditorStore.getState();
        expect(state.projectId).toBeNull();
        expect(state.onSubgraphTemplateCreate).toBeNull();
        expect(state.onSubgraphTemplateUpdate).toBeNull();
        expect(state.onCodeNodeTemplateCreate).toBeNull();
        expect(state.onCodeNodeTemplateUpdate).toBeNull();
        expect(state.isDirty).toBe(false);
        expect(state.isSaving).toBe(false);
    });
});
