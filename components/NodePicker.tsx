'use client';

import { useCallback, useMemo } from 'react';
import { useReactFlow } from '@xyflow/react';
import { registry } from '@/lib/registry';
import { useEditorStore } from '@/store/editor';
import { cn } from '@/lib/utils';
import { NodeType, TSLNodeData } from '@/lib/types';
import { Node } from '@xyflow/react';

// Anchor node types that need special handling
const ANCHOR_NODE_TYPES = ['subgraph/input', 'subgraph/output'] as const;

export function NodePicker() {
    const addNode = useEditorStore((s) => s.addNode);
    const subgraphs = useEditorStore((s) => s.subgraphs);
    const editorMode = useEditorStore((s) => s.editorMode);
    const editingSubgraphId = useEditorStore((s) => s.editingSubgraphId);
    const nodes = useEditorStore((s) => s.nodes);
    const { screenToFlowPosition } = useReactFlow();
    const nodesByCategory = registry.byCategory();
    const setNodes = useEditorStore.setState;

    // Check which anchor nodes are present in the current graph
    const hasInputAnchor = useMemo(() =>
        nodes.some(n => n.data.type === 'subgraph/input'), [nodes]);
    const hasOutputAnchor = useMemo(() =>
        nodes.some(n => n.data.type === 'subgraph/output'), [nodes]);

    // Build custom nodes from subgraphs, excluding currently-edited subgraph
    const customNodes = useMemo(() => {
        return Object.values(subgraphs)
            .filter(sg => sg.id !== editingSubgraphId) // Exclude self-reference
            .map(sg => ({
                type: sg.id as NodeType,
                label: sg.name,
                category: 'Custom',
                inputs: sg.inputs,
                outputs: sg.outputs,
            }));
    }, [subgraphs, editingSubgraphId]);

    const handleAddNode = useCallback(
        (type: NodeType) => {
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

    // Add subgraph instance (special handler for custom nodes)
    const handleAddSubgraphInstance = useCallback(
        (subgraphId: string) => {
            const subgraph = subgraphs[subgraphId];
            if (!subgraph) return;

            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;

            const position = screenToFlowPosition({
                x: centerX,
                y: centerY,
            });

            position.x += (Math.random() - 0.5) * 100;
            position.y += (Math.random() - 0.5) * 100;

            const instanceId = `${subgraphId}-instance-${Date.now()}`;
            const instanceNode: Node<TSLNodeData> = {
                id: instanceId,
                type: subgraphId,
                position,
                data: {
                    type: subgraphId as NodeType,
                    values: {},
                    connected: {},
                    dynamicPorts: [...subgraph.inputs, ...subgraph.outputs],
                },
            };

            useEditorStore.setState((state) => ({
                nodes: [...state.nodes, instanceNode],
            }));
        },
        [subgraphs, screenToFlowPosition]
    );

    // Show custom nodes in both main and subgraph edit modes (self-reference already filtered)
    const showCustomNodes = customNodes.length > 0;

    // Filter nodes by category, handling anchor nodes and material nodes specially
    const filteredNodesByCategory = useMemo(() => {
        const result: Record<string, typeof nodesByCategory[string]> = {};

        for (const [category, categoryNodes] of Object.entries(nodesByCategory)) {
            // In subgraph mode: skip entire Material category
            if (editorMode === 'subgraph' && category === 'Material') {
                continue;
            }

            const filtered = categoryNodes.filter(node => {
                const isAnchorNode = ANCHOR_NODE_TYPES.includes(node.type as typeof ANCHOR_NODE_TYPES[number]);

                if (isAnchorNode) {
                    // In main editor: never show anchor nodes
                    if (editorMode === 'main') return false;

                    // In subgraph edit mode: only show if that anchor is missing
                    if (node.type === 'subgraph/input' && hasInputAnchor) return false;
                    if (node.type === 'subgraph/output' && hasOutputAnchor) return false;
                }

                return true;
            });

            if (filtered.length > 0) {
                result[category] = filtered;
            }
        }

        return result;
    }, [nodesByCategory, editorMode, hasInputAnchor, hasOutputAnchor]);

    return (
        <div className="pointer-events-auto nowheel bg-card/95 backdrop-blur-sm border border-border rounded-xl shadow-lg w-48 max-h-[calc(100vh-8rem)] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-3 py-2 border-b border-border shrink-0">
                <h2 className="text-sm font-semibold">Nodes</h2>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-2">
                <div className="flex flex-col gap-3">
                    {Object.entries(filteredNodesByCategory).map(([category, categoryNodes]) => (
                        <div key={category}>
                            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">
                                {category}
                            </div>
                            <div className="flex flex-col gap-0.5">
                                {categoryNodes.map((node) => (
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

                    {/* Custom Subgraphs */}
                    {showCustomNodes && (
                        <div>
                            <div className="text-[10px] font-medium text-primary uppercase tracking-wider px-2 mb-1">
                                Custom
                            </div>
                            <div className="flex flex-col gap-0.5">
                                {customNodes.map((node) => (
                                    <button
                                        key={node.type}
                                        onClick={() => handleAddSubgraphInstance(node.type)}
                                        className={cn(
                                            'text-left px-2 py-1.5 text-sm rounded-md transition-colors',
                                            'hover:bg-primary/10 text-primary/80 hover:text-primary'
                                        )}
                                    >
                                        {node.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

