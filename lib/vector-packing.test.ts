import { describe, expect, it } from 'vitest';
import {
    computeChannelOccupancy,
    decidePacking,
    getChannelIndex,
    getChannelRangeLabel,
    getConstructorComponentCount,
    getPackedChannelVisuals,
    getPackingCapacityTooltip,
    getPackingSourceWidth,
    isPackingAnchorCompatible,
    isPackingEnabled,
} from './vector-packing';

const incoming = (...entries: Array<[string, string, number]>) =>
    entries.map(([edgeId, targetHandle, width]) => ({ edgeId, targetHandle, width }));

describe('vector packing type widths', () => {
    it('maps float-family vectors to component counts', () => {
        expect(getPackingSourceWidth('float')).toBe(1);
        expect(getPackingSourceWidth('int')).toBe(1);
        expect(getPackingSourceWidth('vec2')).toBe(2);
        expect(getPackingSourceWidth('vec3')).toBe(3);
        expect(getPackingSourceWidth('vec4')).toBe(4);
    });

    it('leaves color and integer vectors as single channels', () => {
        expect(getPackingSourceWidth('color')).toBe(1);
        expect(getPackingSourceWidth('ivec2')).toBe(1);
        expect(getPackingSourceWidth('uvec3')).toBe(1);
        expect(getPackingSourceWidth('any')).toBe(1);
        expect(getPackingSourceWidth(null)).toBe(1);
    });

    it('reports constructor sizes and phase gating', () => {
        expect(getConstructorComponentCount('const/vec2')).toBe(2);
        expect(getConstructorComponentCount('const/vec3')).toBe(3);
        expect(getConstructorComponentCount('const/vec4')).toBe(4);
        expect(getConstructorComponentCount('math/add')).toBe(0);

        expect(isPackingEnabled('const/vec2')).toBe(true);
        expect(isPackingEnabled('const/vec3')).toBe(true);
        expect(isPackingEnabled('const/vec4')).toBe(true);
        expect(isPackingEnabled('math/add')).toBe(false);
    });

    it('maps handles to component indexes and labels', () => {
        expect(getChannelIndex('x')).toBe(0);
        expect(getChannelIndex('z')).toBe(2);
        expect(getChannelIndex('out')).toBe(-1);
        expect(getChannelIndex(null)).toBe(-1);
        expect(getChannelRangeLabel(0, 2)).toBe('XY');
        expect(getChannelRangeLabel(1, 2)).toBe('YZ');
        expect(getChannelRangeLabel(0, 3)).toBe('XYZ');
    });
});

describe('channel occupancy', () => {
    it('marks every consecutive channel a vector occupies', () => {
        const occupancy = computeChannelOccupancy(3, incoming(['a', 'x', 2]));
        expect(occupancy.ownerByChannel.get(0)?.edgeId).toBe('a');
        expect(occupancy.ownerByChannel.get(1)?.edgeId).toBe('a');
        expect(occupancy.ownerByChannel.has(2)).toBe(false);
        expect(occupancy.overflowEdgeIds.size).toBe(0);
    });

    it('flags edges that do not fit', () => {
        const occupancy = computeChannelOccupancy(3, incoming(['a', 'z', 2], ['b', 'y', 3], ['c', 'x', 4]));
        expect(occupancy.overflowEdgeIds.has('a')).toBe(true);
        expect(occupancy.overflowEdgeIds.has('b')).toBe(true);
        expect(occupancy.overflowEdgeIds.has('c')).toBe(true);
    });

    it('ignores non-component handles', () => {
        const occupancy = computeChannelOccupancy(3, incoming(['a', 'value', 2], ['b', 'out', 2]));
        expect(occupancy.owners).toHaveLength(0);
    });

    it('flags overlapping edges as an invalid state', () => {
        const occupancy = computeChannelOccupancy(3, incoming(['vec2', 'x', 2], ['floatY', 'y', 1]));
        expect(occupancy.overlapEdgeIds.has('floatY')).toBe(true);
        expect(occupancy.overlapEdgeIds.has('vec2')).toBe(false);
    });
});

describe('packing decisions on Vec3', () => {
    it('packs vec2 into X and Y', () => {
        const decision = decidePacking({
            nodeType: 'const/vec3',
            anchorHandle: 'x',
            sourceWidth: 2,
            occupancy: computeChannelOccupancy(3, []),
        });
        expect(decision).toMatchObject({
            kind: 'pack',
            anchorIndex: 0,
            width: 2,
            range: [0, 1],
            conflictEdgeIds: [],
            label: 'XY',
            sourceType: 'vec2',
        });
    });

    it('packs vec2 into Y and Z', () => {
        const decision = decidePacking({
            nodeType: 'const/vec3',
            anchorHandle: 'y',
            sourceWidth: 2,
            occupancy: computeChannelOccupancy(3, []),
        });
        expect(decision).toMatchObject({ kind: 'pack', anchorIndex: 1, range: [1, 2], label: 'YZ' });
    });

    it('packs vec3 into all channels', () => {
        const decision = decidePacking({
            nodeType: 'const/vec3',
            anchorHandle: 'x',
            sourceWidth: 3,
            occupancy: computeChannelOccupancy(3, []),
        });
        expect(decision).toMatchObject({ kind: 'pack', range: [0, 1, 2], label: 'XYZ', sourceType: 'vec3' });
    });

    it('leaves floats as single-channel connections', () => {
        const decision = decidePacking({
            nodeType: 'const/vec3',
            anchorHandle: 'x',
            sourceWidth: 1,
            occupancy: computeChannelOccupancy(3, []),
        });
        expect(decision.kind).toBe('none');
    });

    it('rejects vectors that overflow the remaining channels', () => {
        for (const [anchorHandle, sourceWidth] of [['z', 2], ['y', 3], ['x', 4]] as const) {
            const decision = decidePacking({
                nodeType: 'const/vec3',
                anchorHandle,
                sourceWidth,
                occupancy: computeChannelOccupancy(3, []),
            });
            expect(decision.kind).toBe('reject');
            if (decision.kind === 'reject') expect(decision.reason).toBe('overflow');
        }
    });

    it('rejects drops on a channel consumed by an earlier anchor', () => {
        const occupancy = computeChannelOccupancy(3, incoming(['a', 'x', 2]));
        const decision = decidePacking({
            nodeType: 'const/vec3',
            anchorHandle: 'y',
            sourceWidth: 1,
            occupancy,
        });
        expect(decision.kind).toBe('reject');
        if (decision.kind === 'reject') {
            expect(decision.reason).toBe('consumed');
            expect(decision.message).toContain('XY');
        }
    });

    it('reports whole owning edges as conflicts, excluding the replaced anchor edge', () => {
        const occupancy = computeChannelOccupancy(3, incoming(['anchor', 'x', 2], ['floatY', 'y', 1]));
        const decision = decidePacking({
            nodeType: 'const/vec3',
            anchorHandle: 'x',
            sourceWidth: 2,
            occupancy,
        });
        expect(decision.kind).toBe('pack');
        if (decision.kind === 'pack') {
            expect(decision.conflictEdgeIds).toEqual(['floatY']);
        }
    });

    it('treats replacing a packed anchor as a plain replacement', () => {
        const occupancy = computeChannelOccupancy(3, incoming(['anchor', 'x', 2]));
        const decision = decidePacking({
            nodeType: 'const/vec3',
            anchorHandle: 'x',
            sourceWidth: 3,
            occupancy,
        });
        expect(decision.kind).toBe('pack');
        if (decision.kind === 'pack') expect(decision.conflictEdgeIds).toEqual([]);
    });

    it('does nothing for nodes that are not constructors', () => {
        const decision = decidePacking({
            nodeType: 'math/add',
            anchorHandle: 'x',
            sourceWidth: 2,
            occupancy: computeChannelOccupancy(4, []),
        });
        expect(decision.kind).toBe('none');
    });
});

describe('packing decisions on Vec4', () => {
    it('packs vec2 into Z and W', () => {
        const decision = decidePacking({
            nodeType: 'const/vec4',
            anchorHandle: 'z',
            sourceWidth: 2,
            occupancy: computeChannelOccupancy(4, []),
        });
        expect(decision).toMatchObject({ kind: 'pack', range: [2, 3], label: 'ZW' });
    });

    it('packs vec3 into Y, Z and W', () => {
        const decision = decidePacking({
            nodeType: 'const/vec4',
            anchorHandle: 'y',
            sourceWidth: 3,
            occupancy: computeChannelOccupancy(4, []),
        });
        expect(decision).toMatchObject({ kind: 'pack', range: [1, 2, 3], label: 'YZW' });
    });

    it('packs vec4 across every channel', () => {
        const decision = decidePacking({
            nodeType: 'const/vec4',
            anchorHandle: 'x',
            sourceWidth: 4,
            occupancy: computeChannelOccupancy(4, []),
        });
        expect(decision).toMatchObject({ kind: 'pack', range: [0, 1, 2, 3], label: 'XYZW' });
    });

    it('rejects a vec3 anchored at Z', () => {
        const decision = decidePacking({
            nodeType: 'const/vec4',
            anchorHandle: 'z',
            sourceWidth: 3,
            occupancy: computeChannelOccupancy(4, []),
        });
        expect(decision.kind).toBe('reject');
    });
});

describe('packed channel visuals', () => {
    it('derives anchor and consumed channels from incoming edges', () => {
        const visuals = getPackedChannelVisuals('const/vec3', incoming(['a', 'x', 2]));
        expect(visuals.get('x')).toMatchObject({ kind: 'anchor', ownerLabel: 'XY', ownerHandle: 'x' });
        expect(visuals.get('y')).toMatchObject({ kind: 'consumed', ownerLabel: 'XY', ownerHandle: 'x' });
        expect(visuals.has('z')).toBe(false);
    });

    it('ignores single-channel and overflowing edges', () => {
        const visuals = getPackedChannelVisuals('const/vec3', incoming(['a', 'y', 1], ['b', 'x', 4]));
        expect(visuals.size).toBe(0);
    });

    it('hides packed visuals while overlapping edges exist', () => {
        const visuals = getPackedChannelVisuals('const/vec3', incoming(['vec2', 'x', 2], ['floatY', 'y', 1]));
        expect(visuals.size).toBe(0);
    });

    it('renders nothing when packing is not enabled for the node type', () => {
        expect(getPackedChannelVisuals('math/add', incoming(['a', 'x', 2])).size).toBe(0);
    });

    it('derives ZW and YZW ranges on Vec4', () => {
        const visuals = getPackedChannelVisuals('const/vec4', incoming(['a', 'z', 2]));
        expect(visuals.get('z')).toMatchObject({ kind: 'anchor', ownerLabel: 'ZW' });
        expect(visuals.get('w')).toMatchObject({ kind: 'consumed', ownerLabel: 'ZW' });
        expect(visuals.has('x')).toBe(false);
    });
});

describe('packing capacity tooltips', () => {
    it('advertises remaining capacity per channel', () => {
        expect(getPackingCapacityTooltip('const/vec2', 'x')).toBe('Accepts float, Vec2.');
        expect(getPackingCapacityTooltip('const/vec3', 'x')).toBe('Accepts float, Vec2, Vec3.');
        expect(getPackingCapacityTooltip('const/vec3', 'y')).toBe('Accepts float, Vec2.');
        expect(getPackingCapacityTooltip('const/vec3', 'z')).toBe('Accepts float.');
        expect(getPackingCapacityTooltip('const/vec4', 'x')).toBe('Accepts float, Vec2, Vec3, Vec4.');
        expect(getPackingCapacityTooltip('const/vec4', 'w')).toBe('Accepts float.');
        expect(getPackingCapacityTooltip('const/vec3', 'out')).toBeNull();
        expect(getPackingCapacityTooltip('math/add', 'x')).toBeNull();
    });
});

describe('packing anchor compatibility', () => {
    it('accepts anchors where the source vector fits', () => {
        expect(isPackingAnchorCompatible('const/vec3', 'x', 'vec2')).toBe(true);
        expect(isPackingAnchorCompatible('const/vec3', 'y', 'vec2')).toBe(true);
        expect(isPackingAnchorCompatible('const/vec3', 'x', 'vec3')).toBe(true);
        expect(isPackingAnchorCompatible('const/vec4', 'z', 'vec2')).toBe(true);
        expect(isPackingAnchorCompatible('const/vec4', 'y', 'vec3')).toBe(true);
        expect(isPackingAnchorCompatible('const/vec4', 'x', 'vec4')).toBe(true);
    });

    it('rejects anchors that overflow, scalars, and non-constructors', () => {
        expect(isPackingAnchorCompatible('const/vec3', 'z', 'vec2')).toBe(false);
        expect(isPackingAnchorCompatible('const/vec3', 'y', 'vec3')).toBe(false);
        expect(isPackingAnchorCompatible('const/vec4', 'z', 'vec3')).toBe(false);
        expect(isPackingAnchorCompatible('const/vec3', 'x', 'float')).toBe(false);
        expect(isPackingAnchorCompatible('const/vec3', 'x', '')).toBe(false);
        expect(isPackingAnchorCompatible('math/add', 'x', 'vec2')).toBe(false);
    });
});
