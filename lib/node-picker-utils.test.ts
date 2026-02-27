import { describe, expect, it } from 'vitest';
import type { Port } from './types';
import {
    buildLocalGetQuickCreateEntries,
    getHandleDisplayLabel,
    getTypeMatchRank,
    getVisibleInputHandles,
    getVisibleOutputHandles,
    isTypeMatch,
} from './node-picker-utils';

describe('node-picker-utils edge-drop helpers', () => {
    it('includes all visible handles even when types do not match', () => {
        const inputs: Record<string, Port> = {
            a: { label: 'A', type: 'float' },
            b: { label: 'B', type: 'vec3' },
        };

        const handles = getVisibleInputHandles(inputs);
        const ids = handles.map((handle) => handle.id);

        expect(ids).toEqual(['a', 'b']);
        expect(isTypeMatch('float', 'vec3')).toBe(false);
        expect(getTypeMatchRank('float', 'vec3')).toBe(1);
    });

    it('supports match-first ordering by rank', () => {
        const sourceType = 'float';
        const rows = [
            { label: 'Node.B', rank: getTypeMatchRank('vec3', sourceType) },
            { label: 'Node.A', rank: getTypeMatchRank('float', sourceType) },
            { label: 'Node.C', rank: getTypeMatchRank('any', sourceType) },
        ];

        rows.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label));

        expect(rows.map((row) => row.label)).toEqual(['Node.A', 'Node.C', 'Node.B']);
    });

    it('excludes hidden and property-only handles', () => {
        const inputs: Record<string, Port> = {
            visibleIn: { label: 'Visible In', type: 'float' },
            hiddenIn: { label: 'Hidden In', type: 'float', hidden: true },
            propOnlyIn: { label: 'Property Only In', type: 'float', propertyOnly: true },
        };
        const outputs: Record<string, Port> = {
            visibleOut: { label: 'Visible Out', type: 'float' },
            hiddenOut: { label: 'Hidden Out', type: 'float', hidden: true },
        };

        expect(getVisibleInputHandles(inputs).map((handle) => handle.id)).toEqual(['visibleIn']);
        expect(getVisibleOutputHandles(outputs).map((handle) => handle.id)).toEqual(['visibleOut']);
    });

    it('uses plain label for single handle and Node.Handle for multi-handle nodes', () => {
        expect(getHandleDisplayLabel('Sin', 'X', 1)).toBe('Sin');
        expect(getHandleDisplayLabel('Add', 'B', 2)).toBe('Add.B');
    });

    it('builds per-local quick-create entries with binding payload', () => {
        const rows = buildLocalGetQuickCreateEntries([
            { id: 'set-b', name: 'Lighting', outputType: 'vec3' },
            { id: 'set-a', name: 'Albedo', outputType: 'color' },
        ]);

        expect(rows).toEqual([
            {
                key: 'local/get:set-a',
                label: 'Get Albedo',
                nodeType: 'local/get',
                handleId: 'out',
                localSourceId: 'set-a',
                outputType: 'color',
            },
            {
                key: 'local/get:set-b',
                label: 'Get Lighting',
                nodeType: 'local/get',
                handleId: 'out',
                localSourceId: 'set-b',
                outputType: 'vec3',
            },
        ]);
    });
});
