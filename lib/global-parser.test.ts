import { describe, it, expect } from 'vitest';
import { parseGlobalDeclarations } from './global-parser';

describe('parseGlobalDeclarations', () => {
    it('parses uniform declarations from a snippet', () => {
        const code = `
            const noiseIterations = uniform( 3 );
            const positionFrequency = uniform( 0.175 );
            const warpFrequency = uniform( 6 );
            const warpStrength = uniform( 1 );
            const strength = uniform( 10 );
            const offset = uniform( vec2( 0, 0 ) );
            const normalLookUpShift = uniform( 0.01 );
            const colorSand = uniform( color( '#ffe894' ) );
            const colorGrass = uniform( color( '#85d534' ) );
            const colorSnow = uniform( color( '#ffffff' ) );
            const colorRock = uniform( color( '#bfbd8d' ) );
        `;

        const result = parseGlobalDeclarations(code);
        expect(result.errors).toEqual([]);
        expect(result.entries).toHaveLength(11);

        const offset = result.entries.find((e) => e.name === 'offset');
        expect(offset).toEqual({
            name: 'offset',
            kind: 'uniform',
            type: 'vec2',
            defaultValue: [0, 0],
        });

        const colorSand = result.entries.find((e) => e.name === 'colorSand');
        expect(colorSand).toEqual({
            name: 'colorSand',
            kind: 'uniform',
            type: 'color',
            defaultValue: '#ffe894',
        });
    });

    it('parses const declarations with vector initializers', () => {
        const code = `
            const someVec = vec3(1, 2, 3);
            const flag = bool(true);
        `;

        const result = parseGlobalDeclarations(code);
        expect(result.errors).toEqual([]);
        expect(result.entries).toEqual([
            { name: 'someVec', kind: 'const', type: 'vec3', defaultValue: [1, 2, 3] },
            { name: 'flag', kind: 'const', type: 'bool', defaultValue: true },
        ]);
    });
});
