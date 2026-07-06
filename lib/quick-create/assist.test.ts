import { beforeAll, describe, expect, it } from 'vitest';
import { initializeNodes } from '../nodes';
import { getQuickCreateNameCompletions, getQuickCreateRepairCandidates } from './assist';
import { getQuickCreateExpressionSuggestions } from './index';

beforeAll(() => {
    initializeNodes();
});

describe('getQuickCreateRepairCandidates', () => {
    it('closes unbalanced parentheses', () => {
        expect(getQuickCreateRepairCandidates('sin(time')).toContain('sin(time)');
        expect(getQuickCreateRepairCandidates('mix(vec2(1, 2')).toContain('mix(vec2(1, 2))');
    });

    it('strips dangling trailing tokens before closing', () => {
        expect(getQuickCreateRepairCandidates('mix(red,')).toContain('mix(red)');
        expect(getQuickCreateRepairCandidates('sin(time) *')).toContain('sin(time)');
        expect(getQuickCreateRepairCandidates('uv().mul(2).')).toContain('uv().mul(2)');
    });

    it('never returns the input itself and handles garbage', () => {
        expect(getQuickCreateRepairCandidates('sin(time)')).not.toContain('sin(time)');
        expect(getQuickCreateRepairCandidates('')).toEqual([]);
        expect(getQuickCreateRepairCandidates('@#')).toEqual([]);
    });
});

describe('tolerant expression suggestions', () => {
    it('suggests the repaired expression while typing', () => {
        expect(getQuickCreateExpressionSuggestions('sin(time * 2')).toMatchObject([
            { expression: 'sin(time * 2)' },
        ]);
        expect(getQuickCreateExpressionSuggestions('mix(red, blue,')).toMatchObject([
            { expression: 'mix(red, blue)' },
        ]);
        // Trailing operator falls back to the left operand expression
        expect(getQuickCreateExpressionSuggestions('time * 2 +')).toMatchObject([
            { expression: 'time * 2' },
        ]);
        // Trailing whitespace must not change the suggestion
        expect(getQuickCreateExpressionSuggestions('mix(blue, yellow, ')).toMatchObject([
            { expression: 'mix(blue, yellow)' },
        ]);
    });

    it('still yields nothing when the repair collapses to a single node', () => {
        // "2 *" repairs to the bare constant "2", which the constants path owns
        expect(getQuickCreateExpressionSuggestions('2 *')).toEqual([]);
        expect(getQuickCreateExpressionSuggestions('time >')).toEqual([]);
    });
});

describe('getQuickCreateNameCompletions', () => {
    it('completes partial function and identifier names in expression context', () => {
        expect(getQuickCreateNameCompletions('time * smoo')).toMatchObject([
            { name: 'smoothstep', kind: 'function', completedQuery: 'time * smoothstep(' },
        ]);
        expect(getQuickCreateNameCompletions('sin(ti')).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: 'time', kind: 'identifier', completedQuery: 'sin(time' }),
        ]));
    });

    it('only offers functions after a dot', () => {
        const completions = getQuickCreateNameCompletions('uv().mu');
        expect(completions.length).toBeGreaterThan(0);
        expect(completions.every((completion) => completion.kind === 'function')).toBe(true);
        expect(completions[0]).toMatchObject({ completedQuery: 'uv().mul(' });
    });

    it('stays quiet for bare words and finished input', () => {
        // Bare words belong to the regular node search
        expect(getQuickCreateNameCompletions('smoo')).toEqual([]);
        // Trailing space means the word is finished
        expect(getQuickCreateNameCompletions('time * smoo ')).toEqual([]);
        // No completions directly after an atom
        expect(getQuickCreateNameCompletions('uv() smoo')).toEqual([]);
        // Single characters are too noisy
        expect(getQuickCreateNameCompletions('time * s')).toEqual([]);
    });

    it('skips alias keys so canonical names win', () => {
        const completions = getQuickCreateNameCompletions('time * ler');
        expect(completions.every((completion) => completion.name !== 'mix')).toBe(true);
    });
});
