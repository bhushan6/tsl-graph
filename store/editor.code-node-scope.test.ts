import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from './editor';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
    },
}));

const OUTPUT_PORT = { id: 'out', label: 'Result', type: 'any' as const };

describe('Code node scope behavior', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useEditorStore.getState().resetEditor();
    });

    it('creates project-scoped code nodes without template sync', async () => {
        const onCodeNodeTemplateCreate = vi.fn(async () => ({ templateId: 'template-1', version: 1 }));
        useEditorStore.getState().setTemplateCallbacks({ onCodeNodeTemplateCreate });

        const id = await useEditorStore.getState().createCodeNode(
            'Local Code',
            'Fn(([a]) => a)',
            [{ id: 'in_0', label: 'a', type: 'any' }],
            OUTPUT_PORT,
            'tsl',
            'project'
        );

        expect(id).toBeTruthy();
        expect(onCodeNodeTemplateCreate).not.toHaveBeenCalled();

        const state = useEditorStore.getState();
        const codeNode = state.codeNodes[id!];
        expect(codeNode.scope).toBe('project');
        expect(codeNode.templateId).toBeUndefined();
        expect(codeNode.templateVersion).toBeUndefined();
    });

    it('creates library-scoped code nodes and attaches template metadata', async () => {
        const onCodeNodeTemplateCreate = vi.fn(async () => ({ templateId: 'template-2', version: 3 }));
        useEditorStore.getState().setTemplateCallbacks({ onCodeNodeTemplateCreate });

        const id = await useEditorStore.getState().createCodeNode(
            'Library Code',
            'Fn(([a]) => a)',
            [{ id: 'in_0', label: 'a', type: 'any' }],
            OUTPUT_PORT,
            'tsl',
            'library'
        );

        expect(id).toBeTruthy();
        expect(onCodeNodeTemplateCreate).toHaveBeenCalledTimes(1);

        const codeNode = useEditorStore.getState().codeNodes[id!];
        expect(codeNode.scope).toBe('library');
        expect(codeNode.templateId).toBe('template-2');
        expect(codeNode.templateVersion).toBe(3);
    });

    it('falls back to project scope when creating library code node without template service', async () => {
        const id = await useEditorStore.getState().createCodeNode(
            'Fallback Code',
            'Fn(([a]) => a)',
            [{ id: 'in_0', label: 'a', type: 'any' }],
            OUTPUT_PORT,
            'tsl',
            'library'
        );

        expect(id).toBeTruthy();
        const codeNode = useEditorStore.getState().codeNodes[id!];
        expect(codeNode.scope).toBe('project');
        expect(codeNode.templateId).toBeUndefined();
        expect(toast.warning).toHaveBeenCalled();
    });

    it('syncs template updates only for library-scoped code nodes', async () => {
        const codeNodeId = 'code/scope-test';
        const onCodeNodeTemplateUpdate = vi.fn(async () => ({ version: 2 }));
        useEditorStore.getState().setTemplateCallbacks({ onCodeNodeTemplateUpdate });

        useEditorStore.setState((state) => ({
            ...state,
            codeNodes: {
                ...state.codeNodes,
                [codeNodeId]: {
                    id: codeNodeId,
                    name: 'Scope Test',
                    scope: 'project',
                    templateId: 'template-3',
                    templateVersion: 1,
                    language: 'tsl',
                    code: 'Fn(([a]) => a)',
                    inputs: [{ id: 'in_0', label: 'a', type: 'any' }],
                    output: OUTPUT_PORT,
                    createdAt: 1,
                    updatedAt: 1,
                },
            },
        }));

        useEditorStore.getState().updateCodeNode(codeNodeId, { code: 'Fn(([a]) => a.add(1))' });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(onCodeNodeTemplateUpdate).not.toHaveBeenCalled();

        useEditorStore.setState((state) => ({
            ...state,
            codeNodes: {
                ...state.codeNodes,
                [codeNodeId]: {
                    ...state.codeNodes[codeNodeId],
                    scope: 'library',
                },
            },
        }));

        useEditorStore.getState().updateCodeNode(codeNodeId, { code: 'Fn(([a]) => a.add(2))' });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(onCodeNodeTemplateUpdate).toHaveBeenCalledTimes(1);
    });

    it('keeps valid component edges when a code node output type changes', () => {
        const codeNodeId = 'code/vector-output';
        useEditorStore.setState((state) => ({
            ...state,
            codeNodes: {
                ...state.codeNodes,
                [codeNodeId]: {
                    id: codeNodeId,
                    name: 'Vector Output',
                    scope: 'project',
                    language: 'tsl',
                    code: 'Fn(() => vec3(1, 2, 3))',
                    inputs: [],
                    output: { id: 'out', label: 'Result', type: 'vec3' },
                    createdAt: 1,
                    updatedAt: 1,
                },
            },
            nodes: [
                {
                    id: 'code-instance',
                    type: codeNodeId,
                    position: { x: 0, y: 0 },
                    data: {
                        type: codeNodeId,
                        values: {},
                        connected: {},
                        dynamicPorts: [{ id: 'out', label: 'Result', type: 'vec3' }],
                    },
                },
            ],
            edges: [
                { id: 'edge-x', source: 'code-instance', sourceHandle: 'x', target: 'target-x', targetHandle: 'value' },
                { id: 'edge-z', source: 'code-instance', sourceHandle: 'z', target: 'target-z', targetHandle: 'value' },
            ],
        }));

        useEditorStore.getState().updateCodeNode(codeNodeId, {
            output: { id: 'out', label: 'Result', type: 'vec2' },
        });

        expect(useEditorStore.getState().edges.map((edge) => edge.id)).toEqual(['edge-x']);
    });

    it('detaches template metadata when switching code node scope from library to project', async () => {
        const codeNodeId = 'code/library-node';
        useEditorStore.setState((state) => ({
            ...state,
            codeNodes: {
                ...state.codeNodes,
                [codeNodeId]: {
                    id: codeNodeId,
                    name: 'Library Node',
                    scope: 'library',
                    templateId: 'template-4',
                    templateVersion: 7,
                    language: 'tsl',
                    code: 'Fn(([a]) => a)',
                    inputs: [{ id: 'in_0', label: 'a', type: 'any' }],
                    output: OUTPUT_PORT,
                    createdAt: 1,
                    updatedAt: 1,
                },
            },
        }));

        const changed = await useEditorStore.getState().setCodeNodeScope(codeNodeId, 'project');
        expect(changed).toBe(true);

        const codeNode = useEditorStore.getState().codeNodes[codeNodeId];
        expect(codeNode.scope).toBe('project');
        expect(codeNode.templateId).toBeUndefined();
        expect(codeNode.templateVersion).toBeUndefined();
    });

    it('attaches template metadata when switching code node scope from project to library', async () => {
        const codeNodeId = 'code/project-node';
        const onCodeNodeTemplateCreate = vi.fn(async () => ({ templateId: 'template-5', version: 1 }));
        useEditorStore.getState().setTemplateCallbacks({ onCodeNodeTemplateCreate });

        useEditorStore.setState((state) => ({
            ...state,
            codeNodes: {
                ...state.codeNodes,
                [codeNodeId]: {
                    id: codeNodeId,
                    name: 'Project Node',
                    scope: 'project',
                    language: 'tsl',
                    code: 'Fn(([a]) => a)',
                    inputs: [{ id: 'in_0', label: 'a', type: 'any' }],
                    output: OUTPUT_PORT,
                    createdAt: 1,
                    updatedAt: 1,
                },
            },
        }));

        const changed = await useEditorStore.getState().setCodeNodeScope(codeNodeId, 'library');
        expect(changed).toBe(true);
        expect(onCodeNodeTemplateCreate).toHaveBeenCalledTimes(1);

        const codeNode = useEditorStore.getState().codeNodes[codeNodeId];
        expect(codeNode.scope).toBe('library');
        expect(codeNode.templateId).toBe('template-5');
        expect(codeNode.templateVersion).toBe(1);
    });

    it('normalizes legacy code node scope during JSON load', () => {
        const loaded = useEditorStore.getState().loadFromJSON(JSON.stringify({
            version: 2,
            nodes: [],
            edges: [],
            subgraphs: {},
            codeNodes: {
                'code/legacy-library': {
                    id: 'code/legacy-library',
                    name: 'Legacy Library',
                    templateId: 'template-legacy',
                    templateVersion: 9,
                    language: 'tsl',
                    code: 'Fn(([a]) => a)',
                    inputs: [{ id: 'in_0', label: 'a', type: 'any' }],
                    output: OUTPUT_PORT,
                    createdAt: 1,
                    updatedAt: 1,
                },
                'code/legacy-project': {
                    id: 'code/legacy-project',
                    name: 'Legacy Project',
                    language: 'tsl',
                    code: 'Fn(([a]) => a)',
                    inputs: [{ id: 'in_0', label: 'a', type: 'any' }],
                    output: OUTPUT_PORT,
                    createdAt: 1,
                    updatedAt: 1,
                },
            },
        }));

        expect(loaded).toBe(true);
        const state = useEditorStore.getState();
        expect(state.codeNodes['code/legacy-library'].scope).toBe('library');
        expect(state.codeNodes['code/legacy-project'].scope).toBe('project');
    });
});
