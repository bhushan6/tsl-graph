import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as TSL from 'three/tsl';
import { Color, Vector2, Vector3 } from 'three';
import { TSL_TEXTURES_INLINE_MODULE, TSL_TEXTURES_VERSION } from './tsl-textures-inline.generated';
import { inlineCustomTslImports, TSL_TEXTURES_IMPORT_SOURCE } from './tsl-utils-inline';
import { tslTextureNodes } from '@/lib/nodes/tsl-textures';

const helperNames = Object.keys(TSL_TEXTURES_INLINE_MODULE.helpers);

/**
 * Execute helper code the way an inspector host sandbox would: no module
 * imports, only scope-provided bindings for three/tsl and bare three names.
 */
const executeHelper = (name: string): ((params?: object) => unknown) & { normal?: unknown; opacity?: unknown; roughness?: unknown } => {
    const scope: Record<string, unknown> = {};
    for (const importName of TSL_TEXTURES_INLINE_MODULE.sharedImports) {
        scope[importName] = (TSL as Record<string, unknown>)[importName];
    }
    scope.Color = Color;
    scope.Vector2 = Vector2;
    scope.Vector3 = Vector3;

    const helper = TSL_TEXTURES_INLINE_MODULE.helpers[name];
    const factory = new Function(...Object.keys(scope), `${helper.code}\nreturn ${name};`);
    return factory(...Object.values(scope));
};

describe('tsl-textures inline module', () => {
    it('has a helper for every registered tsl-textures node', () => {
        const nodeFunctionNames = new Set(tslTextureNodes.map((def) => def.tsl));
        for (const name of nodeFunctionNames) {
            expect(helperNames, `missing inline helper for ${name}`).toContain(name);
        }
    });

    it('matches the installed tsl-textures version', () => {
        const pkg = JSON.parse(
            readFileSync(path.join(process.cwd(), 'node_modules', 'tsl-textures', 'package.json'), 'utf8')
        );
        expect(TSL_TEXTURES_VERSION).toBe(pkg.version);
    });

    it('provides all shared three/tsl imports from the installed three version', () => {
        for (const name of TSL_TEXTURES_INLINE_MODULE.sharedImports) {
            expect((TSL as Record<string, unknown>)[name], `three/tsl does not export ${name}`).toBeDefined();
        }
    });

    it('declares bare three imports as a shared import group', () => {
        expect(TSL_TEXTURES_INLINE_MODULE.sharedImportGroups).toEqual([
            { from: 'three', imports: ['Color', 'Vector3'] },
        ]);
    });

    it('inlines used helpers and removes the tsl-textures import group', () => {
        const result = inlineCustomTslImports([
            { from: TSL_TEXTURES_IMPORT_SOURCE, imports: ['marble'] },
            { from: 'three/tsl', imports: ['uniform'] },
        ]);

        expect(result.inlinedHelpers).toEqual(['marble']);
        expect(result.helperCode).toContain('const marble = (() => {');
        expect(result.imports.some((group) => group.from === TSL_TEXTURES_IMPORT_SOURCE)).toBe(false);

        const byModule = new Map(result.imports.map((group) => [group.from, group.imports]));
        expect(byModule.get('three')).toEqual(['Color', 'Vector3']);
        expect(byModule.get('three/tsl')).toContain('uniform');
        expect(byModule.get('three/tsl')).toContain('positionGeometry');
    });

    it('contains no residual module syntax in helper code', () => {
        for (const name of helperNames) {
            const code = TSL_TEXTURES_INLINE_MODULE.helpers[name].code;
            expect(code, `${name} contains an import statement`).not.toMatch(/^\s*import[\s{]/m);
            expect(code, `${name} contains an export statement`).not.toMatch(/^\s*export[\s{]/m);
        }
    });

    describe('sandbox execution (host-like, no module imports)', () => {
        it.each(helperNames)('%s builds a TSL node from inlined code', (name) => {
            const fn = executeHelper(name);
            expect(typeof fn).toBe('function');

            const node = fn({});
            expect(node).toBeTruthy();
            expect(typeof node).toBe('object');
        });

        it.each([
            ['clouds', 'opacity'],
            ['brain', 'normal'],
            ['runnyEggs', 'normal'],
            ['runnyEggs', 'roughness'],
            ['rust', 'opacity'],
            ['waves', 'opacity'],
        ])('exposes the %s.%s member output', (name, member) => {
            const fn = executeHelper(name) as unknown as Record<string, unknown>;
            expect(typeof fn[member]).toBe('function');
            const node = (fn[member] as (params?: object) => unknown)({});
            expect(node).toBeTruthy();
        });
    });
});
