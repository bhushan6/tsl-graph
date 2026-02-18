import { describe, it, expect } from 'vitest';
import { mergeImportGroups } from './CodePanel';

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
