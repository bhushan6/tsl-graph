import { beforeAll, describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import { initializeNodes } from '@/lib/nodes';
import type { NodeType, TSLNodeData } from '@/lib/types';
import {
    getCanvasRelativeDebugPreviewRect,
    getDebugPreviewStatus,
} from './debug-preview';

function createNode(
    id: string,
    type: string,
    overrides: Partial<Node<TSLNodeData>> = {}
): Node<TSLNodeData> {
    return {
        id,
        type: overrides.type ?? 'default',
        position: { x: 0, y: 0 },
        data: {
            type: type as NodeType,
            values: {},
            connected: {},
        },
        ...overrides,
    };
}

describe('debug preview helpers', () => {
    beforeAll(() => {
        initializeNodes();
    });

    it('supports regular nodes with outputs', () => {
        const status = getDebugPreviewStatus(createNode('float-1', 'const/float'));

        expect(status.supported).toBe(true);
    });

    it('rejects material and anchor nodes', () => {
        expect(getDebugPreviewStatus(createNode('mat-1', 'material/standard')).supported).toBe(false);
        expect(getDebugPreviewStatus(createNode('post-input', 'post/input')).supported).toBe(false);
        expect(getDebugPreviewStatus(createNode('subgraph-input', 'subgraph/input')).supported).toBe(false);
    });

    it('requires dynamic custom nodes to expose an output port', () => {
        expect(
            getDebugPreviewStatus(createNode('custom-1', 'custom/test', {
                data: {
                    type: 'custom/test' as NodeType,
                    values: {},
                    connected: {},
                    dynamicPorts: [{ id: 'in_value', label: 'Value', type: 'float' }],
                },
            })).supported
        ).toBe(false);

        expect(
            getDebugPreviewStatus(createNode('custom-2', 'custom/test', {
                data: {
                    type: 'custom/test' as NodeType,
                    values: {},
                    connected: {},
                    dynamicPorts: [{ id: 'out', label: 'Out', type: 'float' }],
                },
            })).supported
        ).toBe(true);
    });

    it('clips preview slots to the canvas rect using CSS pixel coordinates', () => {
        expect(getCanvasRelativeDebugPreviewRect(
            { x: 110, y: 60, width: 50, height: 40 },
            { x: 100, y: 50, width: 200, height: 100 }
        )).toEqual({ x: 10, y: 10, width: 50, height: 40 });

        expect(getCanvasRelativeDebugPreviewRect(
            { x: 80, y: 40, width: 50, height: 30 },
            { x: 100, y: 50, width: 200, height: 100 }
        )).toEqual({ x: 0, y: 0, width: 30, height: 20 });

        expect(getCanvasRelativeDebugPreviewRect(
            { x: 20, y: 20, width: 20, height: 20 },
            { x: 100, y: 50, width: 200, height: 100 }
        )).toBeNull();
    });
});
