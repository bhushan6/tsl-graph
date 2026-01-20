
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
            instanceCount: 42
        };

        store.updatePreviewSettings(newSettings);

        // Verify state is updated (shallow merge preserves config)
        const updatedSettings = useEditorStore.getState().previewSettings;
        expect(updatedSettings.mesh).toBe(newSettings.mesh);
        expect(updatedSettings.isInstanced).toBe(newSettings.isInstanced);
        expect(updatedSettings.instanceCount).toBe(newSettings.instanceCount);

        // 2. Save to JSON
        const json = store.saveToJSON();
        const data = JSON.parse(json);

        // Verify JSON content
        expect(data.previewSettings).toBeDefined();
        expect(data.previewSettings.mesh).toBe(newSettings.mesh);
        expect(data.previewSettings.isInstanced).toBe(newSettings.isInstanced);
        expect(data.previewSettings.instanceCount).toBe(newSettings.instanceCount);
        expect(data.previewSettings.config).toBeDefined();

        // 3. Reset store to defaults
        store.resetEditor();
        expect(useEditorStore.getState().previewSettings.mesh).toBe('sphere'); // Default

        // 4. Load from JSON
        const success = store.loadFromJSON(json);
        expect(success).toBe(true);

        // 5. Verify settings are restored
        const restoredSettings = useEditorStore.getState().previewSettings;
        expect(restoredSettings.mesh).toBe(newSettings.mesh);
        expect(restoredSettings.isInstanced).toBe(newSettings.isInstanced);
        expect(restoredSettings.instanceCount).toBe(newSettings.instanceCount);
        // Config should be preserved from defaults
        expect(restoredSettings.config).toBeDefined();
    });

    it('should use default settings if missing in JSON', () => {
        const store = useEditorStore.getState();

        // Create JSON without previewSettings
        const data = {
            version: 1,
            nodes: [],
            edges: [],
            subgraphs: {},
            codeNodes: {}
        };
        const json = JSON.stringify(data);

        // Load
        store.loadFromJSON(json);

        // Verify defaults
        const currentSettings = useEditorStore.getState().previewSettings;
        expect(currentSettings.mesh).toBe('sphere');
        expect(currentSettings.isInstanced).toBe(false);
        expect(currentSettings.instanceCount).toBe(100);
    });
});
