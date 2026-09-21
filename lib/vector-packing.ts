import type { TSLType } from './types';

export const CONSTRUCTOR_COMPONENT_HANDLES = ['x', 'y', 'z', 'w'] as const;

const CONSTRUCTOR_COMPONENT_COUNTS: Record<string, number> = {
    'const/vec2': 2,
    'const/vec3': 3,
    'const/vec4': 4,
};

// Phase 1 ships the packing interaction for Vec3 only. The rules below are
// already constructor-generic; widening support is adding type names here.
const PACKING_ENABLED_CONSTRUCTORS: ReadonlySet<string> = new Set(['const/vec3']);

const PACKING_WIDTH_BY_TYPE: Partial<Record<TSLType, number>> = {
    vec2: 2,
    vec3: 3,
    vec4: 4,
};

const PACKING_TYPE_BY_WIDTH: Partial<Record<number, TSLType>> = {
    2: 'vec2',
    3: 'vec3',
    4: 'vec4',
};

export function isPackingEnabled(nodeType: string): boolean {
    return PACKING_ENABLED_CONSTRUCTORS.has(nodeType);
}

export function getConstructorComponentCount(nodeType: string): number {
    return CONSTRUCTOR_COMPONENT_COUNTS[nodeType] ?? 0;
}

export function getChannelIndex(handleId: string | null | undefined): number {
    if (!handleId) return -1;
    return (CONSTRUCTOR_COMPONENT_HANDLES as readonly string[]).indexOf(handleId);
}

export function getChannelLabel(index: number): string {
    return CONSTRUCTOR_COMPONENT_HANDLES[index]?.toUpperCase() ?? '';
}

export function getChannelRangeLabel(anchorIndex: number, width: number): string {
    return CONSTRUCTOR_COMPONENT_HANDLES.slice(anchorIndex, anchorIndex + width)
        .join('')
        .toUpperCase();
}

/**
 * Component count a source contributes when packed into a constructor.
 * Only float-family vectors pack; every other type stays a single channel.
 */
export function getPackingSourceWidth(type: TSLType | null | undefined): number {
    if (!type) return 1;
    return PACKING_WIDTH_BY_TYPE[type] ?? 1;
}

export function getPackingVectorType(width: number): TSLType | null {
    return PACKING_TYPE_BY_WIDTH[width] ?? null;
}

export function getPackingWidthLabel(width: number): string {
    const type = getPackingVectorType(width);
    return type ? `Vec${width}` : 'Float';
}

export function isPackingAnchorCompatible(
    nodeType: string,
    handleId: string | null | undefined,
    sourceType: TSLType | '' | null | undefined,
): boolean {
    if (!isPackingEnabled(nodeType)) return false;
    const width = getPackingSourceWidth((sourceType || null) as TSLType | null);
    if (width < 2) return false;

    const componentCount = getConstructorComponentCount(nodeType);
    const index = getChannelIndex(handleId);
    return index >= 0 && index + width <= componentCount;
}

export function getPackingCapacityTooltip(nodeType: string, handleId: string | null | undefined): string | null {
    if (!isPackingEnabled(nodeType)) return null;
    const componentCount = getConstructorComponentCount(nodeType);
    const index = getChannelIndex(handleId);
    if (index < 0 || index >= componentCount) return null;

    const remaining = componentCount - index;
    const options = ['float'];
    for (let width = 2; width <= remaining; width++) {
        options.push(`Vec${width}`);
    }
    return `Accepts ${options.join(', ')}.`;
}

export interface IncomingChannelEdge {
    edgeId: string;
    targetHandle: string | null | undefined;
    width: number;
}

export interface ChannelOwner {
    edgeId: string;
    anchorIndex: number;
    width: number;
    targetHandle: string;
}

export interface ChannelOccupancy {
    owners: ChannelOwner[];
    ownerByChannel: Map<number, ChannelOwner>;
    overflowEdgeIds: Set<string>;
    overlapEdgeIds: Set<string>;
}

export function computeChannelOccupancy(
    componentCount: number,
    incoming: readonly IncomingChannelEdge[],
): ChannelOccupancy {
    const owners: ChannelOwner[] = [];
    const ownerByChannel = new Map<number, ChannelOwner>();
    const overflowEdgeIds = new Set<string>();
    const overlapEdgeIds = new Set<string>();

    for (const entry of incoming) {
        const anchorIndex = getChannelIndex(entry.targetHandle);
        if (anchorIndex < 0 || anchorIndex >= componentCount) continue;

        const width = Math.max(1, Math.floor(entry.width));
        const owner: ChannelOwner = {
            edgeId: entry.edgeId,
            anchorIndex,
            width,
            targetHandle: entry.targetHandle ?? CONSTRUCTOR_COMPONENT_HANDLES[anchorIndex],
        };
        owners.push(owner);

        if (anchorIndex + width > componentCount) {
            overflowEdgeIds.add(entry.edgeId);
        }

        const end = Math.min(anchorIndex + width, componentCount);
        for (let index = anchorIndex; index < end; index++) {
            const existing = ownerByChannel.get(index);
            if (!existing) {
                ownerByChannel.set(index, owner);
            } else if (existing.edgeId !== entry.edgeId) {
                overlapEdgeIds.add(entry.edgeId);
            }
        }
    }

    return { owners, ownerByChannel, overflowEdgeIds, overlapEdgeIds };
}

export function isConsumedChannel(occupancy: ChannelOccupancy, index: number): boolean {
    const owner = occupancy.ownerByChannel.get(index);
    return !!owner && owner.anchorIndex !== index;
}

export type PackingRejectReason = 'overflow' | 'consumed';

export type PackingDecision =
    | { kind: 'none' }
    | { kind: 'reject'; reason: PackingRejectReason; message: string }
    | {
        kind: 'pack';
        anchorIndex: number;
        width: number;
        range: number[];
        conflictEdgeIds: string[];
        label: string;
        sourceType: TSLType | null;
    };

export function decidePacking(params: {
    nodeType: string;
    anchorHandle: string | null | undefined;
    sourceWidth: number;
    occupancy: ChannelOccupancy;
}): PackingDecision {
    const { nodeType, anchorHandle, sourceWidth, occupancy } = params;
    if (!isPackingEnabled(nodeType)) return { kind: 'none' };

    const componentCount = getConstructorComponentCount(nodeType);
    const anchorIndex = getChannelIndex(anchorHandle);
    if (componentCount === 0 || anchorIndex < 0 || anchorIndex >= componentCount) {
        return { kind: 'none' };
    }

    const width = Math.max(1, Math.floor(sourceWidth));
    const anchorLabel = getChannelLabel(anchorIndex);
    const anchorOwner = occupancy.ownerByChannel.get(anchorIndex);

    if (anchorOwner && anchorOwner.targetHandle !== anchorHandle) {
        const ownerLabel = getChannelRangeLabel(anchorOwner.anchorIndex, anchorOwner.width);
        return {
            kind: 'reject',
            reason: 'consumed',
            message: `${anchorLabel} is supplied by the ${ownerLabel} connection. Disconnect it to use ${anchorLabel} separately.`,
        };
    }

    if (width < 2) return { kind: 'none' };

    if (anchorIndex + width > componentCount) {
        const available = componentCount - anchorIndex;
        return {
            kind: 'reject',
            reason: 'overflow',
            message: `${getPackingWidthLabel(width)} needs ${width} consecutive channels, but ${anchorLabel} has only ${available}.`,
        };
    }

    const range: number[] = [];
    for (let index = anchorIndex; index < anchorIndex + width; index++) {
        range.push(index);
    }

    const rangeEnd = anchorIndex + width;
    const conflictEdgeIds: string[] = [];
    for (const owner of occupancy.owners) {
        if (owner.edgeId === anchorOwner?.edgeId) continue;
        const overlaps = owner.anchorIndex < rangeEnd && owner.anchorIndex + owner.width > anchorIndex;
        if (overlaps && !conflictEdgeIds.includes(owner.edgeId)) {
            conflictEdgeIds.push(owner.edgeId);
        }
    }

    return {
        kind: 'pack',
        anchorIndex,
        width,
        range,
        conflictEdgeIds,
        label: getChannelRangeLabel(anchorIndex, width),
        sourceType: getPackingVectorType(width),
    };
}

export interface PackedChannelVisual {
    kind: 'anchor' | 'consumed';
    ownerHandle: string;
    ownerLabel: string;
    width: number;
    sourceType: TSLType | null;
}

/**
 * Input-side visual state derived from the incoming edges: which channel is
 * the packed anchor and which channels it consumes. Overflowing legacy edges
 * stay untouched.
 */
export function getPackedChannelVisuals(
    nodeType: string,
    incoming: readonly IncomingChannelEdge[],
): Map<string, PackedChannelVisual> {
    const visuals = new Map<string, PackedChannelVisual>();
    if (!isPackingEnabled(nodeType)) return visuals;

    const componentCount = getConstructorComponentCount(nodeType);
    if (componentCount === 0) return visuals;

    const occupancy = computeChannelOccupancy(componentCount, incoming);
    if (occupancy.overlapEdgeIds.size > 0) return visuals;

    for (let index = 0; index < componentCount; index++) {
        const owner = occupancy.ownerByChannel.get(index);
        if (!owner || owner.width < 2 || occupancy.overflowEdgeIds.has(owner.edgeId)) continue;

        const handle = CONSTRUCTOR_COMPONENT_HANDLES[index];
        visuals.set(handle, {
            kind: index === owner.anchorIndex ? 'anchor' : 'consumed',
            ownerHandle: owner.targetHandle,
            ownerLabel: getChannelRangeLabel(owner.anchorIndex, owner.width),
            width: owner.width,
            sourceType: getPackingVectorType(owner.width),
        });
    }

    return visuals;
}
