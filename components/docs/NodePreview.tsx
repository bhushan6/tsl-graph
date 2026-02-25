'use client';

import { useMemo } from 'react';
import { ReactFlow, type Node, type NodeTypes } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { TSLNode } from '@/components/TSLNode';
import { initializeNodes } from '@/lib/nodes';
import type { NodeDoc } from '@/lib/docs/nodes';
import type { TSLNodeData, NodeType } from '@/lib/types';

initializeNodes();

export default function NodePreview({ node }: { node: NodeDoc }) {
    const nodes = useMemo<Node<TSLNodeData>[]>(() => {
        return [
            {
                id: 'preview-node',
                type: node.type,
                position: { x: 0, y: 0 },
                data: {
                    type: node.type as NodeType,
                    values: {},
                    connected: {},
                },
            },
        ];
    }, [node.type]);

    const nodeTypes = useMemo<NodeTypes>(() => {
        return { [node.type]: TSLNode };
    }, [node.type]);

    return (
        <div className="rounded-xl border border-border bg-muted/10 p-2">
            <div className="h-[320px] w-full">
                <ReactFlow
                    nodes={nodes}
                    edges={[]}
                    nodeTypes={nodeTypes}
                    fitView
                    fitViewOptions={{ padding: 0.4 }}
                    nodesDraggable={false}
                    nodesConnectable={false}
                    elementsSelectable={false}
                    panOnDrag={false}
                    panOnScroll={false}
                    zoomOnScroll={false}
                    zoomOnPinch={false}
                    zoomOnDoubleClick={false}
                    proOptions={{ hideAttribution: true }}
                    className="pointer-events-none"
                />
            </div>
        </div>
    );
}
