import { describe, expect, it } from 'vitest';
import type { GlobalContextEntry } from './types';
import { buildGlobalPickerEntries, formatGlobalPickerLabel } from './global-picker-utils';

describe('global-picker-utils', () => {
    const globals: GlobalContextEntry[] = [
        { id: 'global-2', name: 'zTint', kind: 'const', type: 'color', defaultValue: '#ffffff' },
        { id: 'global-1', name: 'aTime', kind: 'uniform', type: 'float', defaultValue: 0 },
        { id: 'global-3', name: 'mNormal', kind: 'varying', type: 'vec3', defaultValue: [0, 0, 0] },
    ];

    it('sorts entries alphabetically by global name', () => {
        const entries = buildGlobalPickerEntries(globals);
        expect(entries.map((entry) => entry.globalId)).toEqual(['global-1', 'global-3', 'global-2']);
    });

    it('formats labels as "name · kind type"', () => {
        expect(formatGlobalPickerLabel(globals[0])).toBe('zTint · const color');
        expect(buildGlobalPickerEntries(globals).map((entry) => entry.label)).toEqual([
            'aTime · uniform float',
            'mNormal · varying vec3',
            'zTint · const color',
        ]);
    });

    it('builds stable picker keys and node type for each global', () => {
        const entries = buildGlobalPickerEntries(globals);
        expect(entries.map((entry) => entry.pickerKey)).toEqual([
            'global/ref:global-1',
            'global/ref:global-3',
            'global/ref:global-2',
        ]);
        expect(entries.every((entry) => entry.nodeType === 'global/ref')).toBe(true);
    });

    it('maps output type directly from the global type', () => {
        const entries = buildGlobalPickerEntries(globals);
        expect(entries.map((entry) => entry.outputType)).toEqual(['float', 'vec3', 'color']);
    });
});
