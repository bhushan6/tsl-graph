'use client';

import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { registry } from '@/lib/registry';
import { useEditorStore } from '@/store/editor';
import { cn } from '@/lib/utils';

export function NodePicker() {
    const addNode = useEditorStore((s) => s.addNode);
    const { screenToFlowPosition } = useReactFlow();
    const nodesByCategory = registry.byCategory();

    const handleAddNode = useCallback(
        (type: string) => {
            // Add node at center of current viewport
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;

            const position = screenToFlowPosition({
                x: centerX,
                y: centerY,
            });

            // Add some randomness to avoid stacking
            position.x += (Math.random() - 0.5) * 100;
            position.y += (Math.random() - 0.5) * 100;

            addNode(type, position);
        },
        [addNode, screenToFlowPosition]
    );

    return (
        <div className="pointer-events-auto nowheel bg-card/95 backdrop-blur-sm border border-border rounded-xl shadow-lg w-48 max-h-[calc(100vh-8rem)] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-3 py-2 border-b border-border shrink-0">
                <h2 className="text-sm font-semibold">Nodes</h2>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-2">
                <div className="flex flex-col gap-3">
                    {Object.entries(nodesByCategory).map(([category, nodes]) => (
                        <div key={category}>
                            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">
                                {category}
                            </div>
                            <div className="flex flex-col gap-0.5">
                                {nodes.map((node) => (
                                    <button
                                        key={node.type}
                                        onClick={() => handleAddNode(node.type)}
                                        className={cn(
                                            'text-left px-2 py-1.5 text-sm rounded-md transition-colors',
                                            'hover:bg-muted text-foreground/80 hover:text-foreground'
                                        )}
                                    >
                                        {node.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
