import { describe, expect, it, beforeAll } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import * as THREE from 'three/webgpu';
import { buildNodePreviewMaterial } from './tsl-builder';
import type { TSLNodeData } from '@/lib/types';
import { initializeNodes } from './nodes';

function createNode(
    id: string,
    type: string,
    values: Record<string, unknown> = {}
): Node<TSLNodeData> {
    return {
        id,
        type: 'default',
        position: { x: 0, y: 0 },
        data: {
            type,
            values,
            localName: typeof values.localName === 'string' ? values.localName : undefined,
        } as TSLNodeData,
    };
}

describe('buildNodePreviewMaterial', () => {
    beforeAll(() => {
        initializeNodes();
    });

    it('builds preview for local/get nodes using node material fragment output', () => {
        const nodes: Node<TSLNodeData>[] = [
            createNode('const-1', 'const/float', { value: 0.25 }),
            createNode('set-1', 'local/set', { localName: 'foo' }),
            createNode('get-1', 'local/get', { localSourceId: 'set-1' }),
        ];

        const edges: Edge[] = [
            {
                id: 'edge-1',
                source: 'const-1',
                sourceHandle: 'out',
                target: 'set-1',
                targetHandle: 'value',
            },
        ];

        const material = buildNodePreviewMaterial('get-1', nodes, edges);

        expect(material).toBeInstanceOf(THREE.NodeMaterial);
        expect((material as THREE.NodeMaterial).fragmentNode).toBeTruthy();
    });
});
