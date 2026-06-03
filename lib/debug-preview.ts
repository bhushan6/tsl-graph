import type { AppNode } from '@/lib/types';
import { MATERIAL_NODE_TYPES, POST_ANCHOR_NODE_TYPES } from '@/lib/nodes';
import { registry } from '@/lib/registry';

export type DebugPreviewStatus =
    | { supported: true }
    | { supported: false; reason: string };

export interface DebugPreviewRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

const UNSUPPORTED_NODE_TYPES = new Set([
    'utils/comment',
    'subgraph/input',
    'subgraph/output',
    'post/input',
    'post/output',
]);

export function getDebugPreviewStatus(node: AppNode): DebugPreviewStatus {
    const nodeType = node.data.type;

    if (node.type === 'group' || node.type === 'loop' || nodeType === 'loop') {
        return { supported: false, reason: 'Group nodes do not have a preview output.' };
    }

    if (nodeType.startsWith('loop/')) {
        return { supported: false, reason: 'Loop control nodes do not have a preview output.' };
    }

    if ((MATERIAL_NODE_TYPES as readonly string[]).includes(nodeType)) {
        return { supported: false, reason: 'Material output nodes are previewed in the main viewport.' };
    }

    if ((POST_ANCHOR_NODE_TYPES as readonly string[]).includes(nodeType) || UNSUPPORTED_NODE_TYPES.has(nodeType)) {
        return { supported: false, reason: 'Anchor nodes do not have a standalone preview output.' };
    }

    const outputs = getDebugPreviewOutputCount(node);
    if (outputs === 0) {
        return { supported: false, reason: 'This node has no renderable output.' };
    }

    return { supported: true };
}

export function isDebugPreviewSupported(node: AppNode): boolean {
    return getDebugPreviewStatus(node).supported;
}

export function getDebugPreviewOutputCount(node: AppNode): number {
    const nodeType = node.data.type;

    if (nodeType.startsWith('custom/') || nodeType.startsWith('code/')) {
        return (node.data.dynamicPorts ?? []).filter((port) => (
            port.id === 'out' || port.id.startsWith('out_')
        )).length;
    }

    const def = registry.get(nodeType);
    return Object.keys(def?.outputs ?? {}).length;
}

export function getCanvasRelativeDebugPreviewRect(
    slotRect: DebugPreviewRect,
    canvasRect: DebugPreviewRect
): DebugPreviewRect | null {
    const left = Math.max(slotRect.x, canvasRect.x);
    const top = Math.max(slotRect.y, canvasRect.y);
    const right = Math.min(slotRect.x + slotRect.width, canvasRect.x + canvasRect.width);
    const bottom = Math.min(slotRect.y + slotRect.height, canvasRect.y + canvasRect.height);

    const width = right - left;
    const height = bottom - top;
    if (width <= 0 || height <= 0) return null;

    return {
        x: left - canvasRect.x,
        y: top - canvasRect.y,
        width,
        height,
    };
}
