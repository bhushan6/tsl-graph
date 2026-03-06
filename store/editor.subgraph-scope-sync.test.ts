import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubgraphDefinition } from '@/lib/types';
import { useEditorStore } from './editor';

const SUBGRAPH_ID = 'custom/test-subgraph';

function createSubgraph(overrides: Partial<SubgraphDefinition> = {}): SubgraphDefinition {
    return {
        id: SUBGRAPH_ID,
        name: 'Test Subgraph',
        scope: 'project',
        inputs: [{ id: 'in_0', label: 'Input 1', type: 'any' }],
        outputs: [{ id: 'out_0', label: 'Output 1', type: 'any' }],
        nodes: [],
        edges: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...overrides,
    };
}

describe('Subgraph scope sync', () => {
    beforeEach(() => {
        useEditorStore.getState().resetEditor();
        useEditorStore.setState((state) => ({
            ...state,
            subgraphs: {
                ...state.subgraphs,
                [SUBGRAPH_ID]: createSubgraph(),
            },
        }));
    });

    it('does not mutate subgraph scope/template when library sync fails', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            useEditorStore.getState().setTemplateCallbacks({
                onSubgraphTemplateCreate: async () => {
                    throw new Error('Library sync unsupported');
                },
            });

            expect(useEditorStore.getState().enterSubgraphEditor(SUBGRAPH_ID)).toBe(true);
            useEditorStore.getState().setEditingSubgraphScopeDraft('library');

            await useEditorStore.getState().exitSubgraphEditor(true);

            const state = useEditorStore.getState();
            expect(state.editorMode).toBe('subgraph');
            expect(state.editingSubgraphId).toBe(SUBGRAPH_ID);
            expect(state.subgraphs[SUBGRAPH_ID].scope).toBe('project');
            expect(state.subgraphs[SUBGRAPH_ID].templateId).toBeUndefined();
            expect(state.subgraphs[SUBGRAPH_ID].templateVersion).toBeUndefined();
        } finally {
            warnSpy.mockRestore();
            errorSpy.mockRestore();
        }
    });

    it('commits scope/template only after successful adapter sync', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
            useEditorStore.getState().setTemplateCallbacks({
                onSubgraphTemplateCreate: async () => ({ templateId: 'template-1', version: 1 }),
            });

            expect(useEditorStore.getState().enterSubgraphEditor(SUBGRAPH_ID)).toBe(true);
            useEditorStore.getState().setEditingSubgraphScopeDraft('library');

            await useEditorStore.getState().exitSubgraphEditor(true);
            await new Promise((resolve) => setTimeout(resolve, 0));

            const state = useEditorStore.getState();
            expect(state.editorMode).toBe('main');
            expect(state.editingSubgraphId).toBeNull();
            expect(state.subgraphs[SUBGRAPH_ID].scope).toBe('library');
            expect(state.subgraphs[SUBGRAPH_ID].templateId).toBe('template-1');
            expect(state.subgraphs[SUBGRAPH_ID].templateVersion).toBe(1);
            expect(state.isDirty).toBe(true);
        } finally {
            warnSpy.mockRestore();
        }
    });
});
