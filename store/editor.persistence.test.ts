
import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from './editor';

describe('Editor Store Persistence', () => {
    beforeEach(() => {
        useEditorStore.getState().resetEditor();
    });

    it('should save and load preview settings correctly', () => {
        const store = useEditorStore.getState();

        // 1. Modify preview settings
        const newSettings = {
            mesh: 'torus' as const,
            isInstanced: true,
            instanceCount: 42,
            postEnabled: false,
        };

        store.updatePreviewSettings(newSettings);

        // Verify state is updated
        expect(useEditorStore.getState().previewSettings).toEqual(expect.objectContaining(newSettings));
        expect(useEditorStore.getState().previewSettings.config).toBeDefined();

        // 2. Save to JSON
        const json = store.saveToJSON();
        const data = JSON.parse(json);

        // Verify JSON content
        expect(data.previewSettings).toBeDefined();
        expect(data.previewSettings).toEqual(expect.objectContaining(newSettings));
        expect(data.previewSettings.config).toBeDefined();

        // 3. Reset store to defaults
        store.resetEditor();
        expect(useEditorStore.getState().previewSettings.mesh).toBe('sphere'); // Default

        // 4. Load from JSON
        const success = store.loadFromJSON(json);
        expect(success).toBe(true);

        // 5. Verify settings are restored
        const restoredSettings = useEditorStore.getState().previewSettings;
        expect(restoredSettings).toEqual(expect.objectContaining(newSettings));
        expect(restoredSettings.config).toBeDefined();
    });

    it('should migrate v1 data by creating post anchors and material root mode', () => {
        const store = useEditorStore.getState();

        // Create JSON without previewSettings
        const data = {
            version: 1,
            nodes: [],
            edges: [],
            subgraphs: {},
            codeNodes: {},
        };
        const json = JSON.stringify(data);

        // Load
        const success = store.loadFromJSON(json);
        expect(success).toBe(true);

        const state = useEditorStore.getState();
        const postGraph = state.getRootGraph('post');

        expect(state.activeRootGraph).toBe('material');
        expect(postGraph.nodes.some((node) => node.id === 'post-input')).toBe(true);
        expect(postGraph.nodes.some((node) => node.id === 'post-output')).toBe(true);
    });

    it('should save and load v2 root graphs and active mode', () => {
        const store = useEditorStore.getState();

        // Material root content
        store.addNode('math/add', { x: 0, y: 0 });
        const materialGraphBefore = store.getRootGraph('material');
        expect(materialGraphBefore.nodes.length).toBeGreaterThan(0);

        // Post root content
        store.setActiveRootGraph('post');
        store.addNode('math/mul', { x: 120, y: 0 });
        store.updatePreviewSettings({ postEnabled: false });

        const postGraphBefore = store.getRootGraph('post');
        expect(postGraphBefore.nodes.some((node) => node.data.type === 'math/mul')).toBe(true);

        const json = store.saveToJSON();
        const parsed = JSON.parse(json);
        expect(parsed.version).toBe(2);
        expect(parsed.activeRootGraph).toBe('post');
        expect(Array.isArray(parsed.postNodes)).toBe(true);
        expect(Array.isArray(parsed.postEdges)).toBe(true);
        expect(parsed.previewSettings.postEnabled).toBe(false);

        store.resetEditor();
        const success = store.loadFromJSON(json);
        expect(success).toBe(true);

        const restored = useEditorStore.getState();
        expect(restored.activeRootGraph).toBe('post');
        expect(restored.previewSettings.postEnabled).toBe(false);
        expect(restored.getRootGraph('material').nodes.length).toBe(materialGraphBefore.nodes.length);
        expect(
            restored.getRootGraph('post').nodes.some((node) => node.data.type === 'math/mul')
        ).toBe(true);
    });
});
