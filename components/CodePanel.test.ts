import { describe, it, expect } from 'vitest';
import { mergeImportGroups, needsThreeNamespaceImport } from './CodePanel';

describe('CodePanel import grouping', () => {
    it('merges groups by module and deduplicates imports', () => {
        const groups = mergeImportGroups([
            { from: 'three/tsl', imports: ['mul', 'add'] },
            { from: 'three/addons/tsl/display/BloomNode.js', imports: ['bloom'] },
            { from: 'three/tsl', imports: ['add', 'sin'] },
        ]);

        expect(groups).toEqual([
            { from: 'three/addons/tsl/display/BloomNode.js', imports: ['bloom'] },
            { from: 'three/tsl', imports: ['add', 'mul', 'sin'] },
        ]);
    });
});

describe('CodePanel runtime imports', () => {
    it('detects generated code that uses the THREE namespace', () => {
        expect(needsThreeNamespaceImport('new THREE.TextureLoader()')).toBe(true);
        expect(needsThreeNamespaceImport('new MeshStandardNodeMaterial()')).toBe(false);
    });
});
