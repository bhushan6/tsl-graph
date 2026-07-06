import { beforeAll, describe, expect, it } from 'vitest';
import { initializeNodes } from '../nodes';
import { registry } from '../registry';
import { getQuickCreateCatalog } from './catalog';

beforeAll(() => {
    initializeNodes();
});

describe('quick-create catalog', () => {
    it('resolves every function entry against the registry', () => {
        const { functions } = getQuickCreateCatalog();
        expect(functions.size).toBeGreaterThan(50);

        for (const entry of functions.values()) {
            const def = registry.get(entry.nodeType);
            expect(def, `missing registry def for ${entry.nodeType}`).toBeDefined();
            expect(def?.outputs?.out, `${entry.nodeType} has no out output`).toBeDefined();
            expect(entry.inputHandles.length).toBeGreaterThan(0);
            for (const handle of entry.inputHandles) {
                const port = def?.inputs?.[handle];
                expect(port, `${entry.nodeType} is missing input handle ${handle}`).toBeDefined();
                expect(port?.propertyOnly ?? false).toBe(false);
                expect(port?.hidden ?? false).toBe(false);
            }
        }
    });

    it('resolves every identifier entry against the registry', () => {
        const { identifiers } = getQuickCreateCatalog();
        expect(identifiers.size).toBeGreaterThan(10);

        for (const entry of identifiers.values()) {
            const def = registry.get(entry.nodeType);
            expect(def, `missing registry def for ${entry.nodeType}`).toBeDefined();
            expect(def?.pure).toBe(true);
            expect(def?.outputs?.out).toBeDefined();
        }
    });

    it('exposes the expected common names', () => {
        const { functions, identifiers } = getQuickCreateCatalog();

        for (const name of ['sin', 'cos', 'mix', 'clamp', 'smoothstep', 'step', 'fract', 'pow', 'vec3', 'select', 'easeinoutcubic']) {
            expect(functions.has(name), `function ${name} missing`).toBe(true);
        }
        // Aliases
        expect(functions.get('lerp')?.nodeType).toBe('math/mix');
        expect(functions.get('frac')?.nodeType).toBe('math/fract');
        expect(functions.get('atan2')?.nodeType).toBe('math/atan');

        for (const name of ['time', 'uv', 'positionlocal', 'normalworld', 'pi', 'epsilon']) {
            expect(identifiers.has(name), `identifier ${name} missing`).toBe(true);
        }
    });

    it('excludes nodes that need canvas context', () => {
        const { functions, identifiers } = getQuickCreateCatalog();
        const allNodeTypes = new Set([
            ...[...functions.values()].map((entry) => entry.nodeType),
            ...[...identifiers.values()].map((entry) => entry.nodeType),
        ]);

        for (const nodeType of allNodeTypes) {
            expect(nodeType).not.toMatch(/^(texture|material|output|post|loop|subgraph|assign|global|local|code|custom)\//);
        }
        expect(functions.has('multiop')).toBe(false);
        expect(allNodeTypes.has('math/split')).toBe(false);
        expect(allNodeTypes.has('logic/discard')).toBe(false);
    });
});
