import { describe, expect, it } from 'vitest';
import {
    inlineCustomTslImports,
    inlineTslUtilsImports,
    TSL_EASINGS_IMPORT_SOURCE,
    TSL_UTILS_IMPORT_SOURCE,
} from './tsl-utils-inline';
import type { ImportGroup } from '@/lib/compiler';

describe('inlineTslUtilsImports', () => {
    it('returns inputs unchanged when no tsl-utils imports are present', () => {
        const input: ImportGroup[] = [
            { from: 'three/tsl', imports: ['uniform', 'positionWorld'] },
        ];

        const result = inlineTslUtilsImports(input);

        expect(result.helperCode).toBeNull();
        expect(result.inlinedHelpers).toEqual([]);
        expect(result.imports).toEqual([
            { from: 'three/tsl', imports: ['positionWorld', 'uniform'] },
        ]);
    });

    it('inlines known helpers and removes tsl-utils import group', () => {
        const result = inlineTslUtilsImports([
            { from: TSL_UTILS_IMPORT_SOURCE, imports: ['rotation3d'] },
            { from: 'three/tsl', imports: ['uniform'] },
        ]);

        expect(result.inlinedHelpers).toEqual(['rotation3d']);
        expect(result.helperCode).toContain('const rotation3d = Fn');
        expect(result.imports.some((group) => group.from === TSL_UTILS_IMPORT_SOURCE)).toBe(false);

        const threeGroup = result.imports.find((group) => group.from === 'three/tsl');
        expect(threeGroup).toBeDefined();
        expect(threeGroup?.imports).toContain('uniform');
        expect(threeGroup?.imports).toContain('Fn');
    });

    it('inlines helper dependencies in order', () => {
        const result = inlineTslUtilsImports([
            { from: TSL_UTILS_IMPORT_SOURCE, imports: ['blendHardLight'] },
        ]);

        expect(result.inlinedHelpers).toEqual(['blendOverlay', 'blendHardLight']);
        expect(result.helperCode?.indexOf('const blendOverlay = Fn')).toBeLessThan(
            result.helperCode?.indexOf('const blendHardLight = Fn') ?? -1
        );
    });

    it('keeps unknown helpers imported from tsl-utils', () => {
        const result = inlineTslUtilsImports([
            { from: TSL_UTILS_IMPORT_SOURCE, imports: ['unknownHelper', 'rotation3d'] },
        ]);

        const helperGroup = result.imports.find((group) => group.from === TSL_UTILS_IMPORT_SOURCE);
        expect(helperGroup?.imports).toEqual(['unknownHelper']);
        expect(result.inlinedHelpers).toEqual(['rotation3d']);
        expect(result.helperCode).toContain('const rotation3d = Fn');
    });

    it('inlines easing helpers and removes tsl-easings imports', () => {
        const result = inlineCustomTslImports([
            { from: TSL_EASINGS_IMPORT_SOURCE, imports: ['easeInOutBounce'] },
        ]);

        expect(result.imports.some((group) => group.from === TSL_EASINGS_IMPORT_SOURCE)).toBe(false);
        expect(result.inlinedHelpers).toEqual(['easeOutBounce', 'easeInOutBounce']);
        expect(result.helperCode).toContain('const easeOutBounce = Fn');
        expect(result.helperCode).toContain('const easeInOutBounce = Fn');

        const threeGroup = result.imports.find((group) => group.from === 'three/tsl');
        expect(threeGroup?.imports).toContain('select');
        expect(threeGroup?.imports).toContain('step');
    });

    it('merges inline helper imports across utils and easings', () => {
        const result = inlineCustomTslImports([
            { from: TSL_UTILS_IMPORT_SOURCE, imports: ['blendHardLight'] },
            { from: TSL_EASINGS_IMPORT_SOURCE, imports: ['easeOutCircular'] },
            { from: 'three/tsl', imports: ['uniform'] },
        ]);

        expect(result.imports.some((group) => group.from === TSL_UTILS_IMPORT_SOURCE)).toBe(false);
        expect(result.imports.some((group) => group.from === TSL_EASINGS_IMPORT_SOURCE)).toBe(false);
        expect(result.helperCode).toContain('// Inline TSL Utils');
        expect(result.helperCode).toContain('// Easing helpers adapted from tsl-easings by Yuri Artiukh (akella)');
        expect(result.helperCode).toContain('const blendOverlay = Fn');
        expect(result.helperCode).toContain('const easeOutCircular = Fn');

        const threeGroup = result.imports.find((group) => group.from === 'three/tsl');
        expect(threeGroup?.imports).toContain('uniform');
        expect(threeGroup?.imports).toContain('Fn');
        expect(threeGroup?.imports).toContain('sqrt');
    });
});
