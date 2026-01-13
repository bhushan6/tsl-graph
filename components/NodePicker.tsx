'use client';

import { useCallback, useMemo, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { registry } from '@/lib/registry';
import { useEditorStore } from '@/store/editor';
import { cn } from '@/lib/utils';
import { NodeType, TSLNodeData } from '@/lib/types';
import { Node } from '@xyflow/react';
import { X, ChevronDown, Search, Code, Plus, Layers } from 'lucide-react';
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuItem,
    SidebarInput,
} from '@/components/ui/sidebar';

// Anchor node types that need special handling
const ANCHOR_NODE_TYPES = ['subgraph/input', 'subgraph/output'] as const;

interface CategoryGroupProps {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
    forceOpen?: boolean;
}

function CategoryGroup({ title, children, defaultOpen = true, forceOpen = false }: CategoryGroupProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const show = forceOpen || isOpen;

    return (
        <SidebarGroup className="py-0">
            <SidebarGroupLabel
                className="w-full justify-between hover:bg-sidebar-accent/50 cursor-pointer h-8 group/label"
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className="text-xs font-medium text-sidebar-foreground/70 group-hover/label:text-sidebar-foreground transition-colors">{title}</span>
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform text-muted-foreground/70", !show && "-rotate-90")} />
            </SidebarGroupLabel>
            {show && (
                <SidebarGroupContent className="pt-0.5 pb-2">
                    <div className="pl-3 border-l border-sidebar-border/50 ml-2">
                        {children}
                    </div>
                </SidebarGroupContent>
            )}
        </SidebarGroup>
    );
}

interface NodePickerProps {
    onClose?: () => void;
    onOpenCodeNodeDialog?: () => void;
}

export function NodePicker({ onClose, onOpenCodeNodeDialog }: NodePickerProps) {
    const addNode = useEditorStore((s) => s.addNode);
    const subgraphs = useEditorStore((s) => s.subgraphs);
    const codeNodes = useEditorStore((s) => s.codeNodes);
    const editorMode = useEditorStore((s) => s.editorMode);
    const editingSubgraphId = useEditorStore((s) => s.editingSubgraphId);
    const nodes = useEditorStore((s) => s.nodes);
    const { screenToFlowPosition } = useReactFlow();
    const nodesByCategory = registry.byCategory();
    const [searchQuery, setSearchQuery] = useState('');

    // Check which anchor nodes are present in the current graph
    const hasInputAnchor = useMemo(() =>
        nodes.some(n => n.data.type === 'subgraph/input'), [nodes]);
    const hasOutputAnchor = useMemo(() =>
        nodes.some(n => n.data.type === 'subgraph/output'), [nodes]);

    // Build custom nodes from subgraphs, excluding currently-edited subgraph
    const customNodes = useMemo(() => {
        const query = searchQuery.toLowerCase();
        return Object.values(subgraphs)
            .filter(sg => sg.id !== editingSubgraphId) // Exclude self-reference
            .filter(sg => !query || sg.name.toLowerCase().includes(query)) // Search filter
            .map(sg => ({
                type: sg.id as NodeType,
                label: sg.name,
                category: 'Custom',
                isSubgraph: true,
                inputs: sg.inputs,
                outputs: sg.outputs,
            }));
    }, [subgraphs, editingSubgraphId, searchQuery]);

    // Build code nodes list
    const codeNodesList = useMemo(() => {
        const query = searchQuery.toLowerCase();
        return Object.values(codeNodes)
            .filter(cn => !query || cn.name.toLowerCase().includes(query))
            .map(cn => ({
                type: cn.id as NodeType,
                label: cn.name,
                category: 'Custom',
                isCodeNode: true,
                inputs: cn.inputs,
                output: cn.output,
            }));
    }, [codeNodes, searchQuery]);

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

    // Add code node instance
    const handleAddCodeNodeInstance = useCallback(
        (codeNodeId: string) => {
            const codeNode = codeNodes[codeNodeId];
            if (!codeNode) return;

            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;

            const position = screenToFlowPosition({
                x: centerX,
                y: centerY,
            });

            position.x += (Math.random() - 0.5) * 100;
            position.y += (Math.random() - 0.5) * 100;

            const instanceId = `${codeNodeId}-instance-${Date.now()}`;
            const instanceNode: Node<TSLNodeData> = {
                id: instanceId,
                type: codeNodeId,
                position,
                data: {
                    type: codeNodeId as NodeType,
                    values: {},
                    connected: {},
                    dynamicPorts: [...codeNode.inputs, codeNode.output],
                },
            };

            useEditorStore.setState((state) => ({
                nodes: [...state.nodes, instanceNode],
            }));
        },
        [codeNodes, screenToFlowPosition]
    );

    // Show custom section if we have subgraphs or code nodes
    const showCustomSection = customNodes.length > 0 || codeNodesList.length > 0 || !!onOpenCodeNodeDialog;

    // Filter nodes by category, handling anchor nodes and material nodes specially
    const filteredNodesByCategory = useMemo(() => {
        const result: Record<string, typeof nodesByCategory[string]> = {};
        const query = searchQuery.toLowerCase();

        for (const [category, categoryNodes] of Object.entries(nodesByCategory)) {
            // In subgraph mode: skip entire Material category
            if (editorMode === 'subgraph' && category === 'Material') {
                continue;
            }

            const filtered = categoryNodes.filter(node => {
                // Search filter
                if (query && !node.label.toLowerCase().includes(query)) {
                    return false;
                }

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
    }, [nodesByCategory, editorMode, hasInputAnchor, hasOutputAnchor, searchQuery]);

    // Menu button styles matching shadcn SidebarMenuButton
    const menuButtonStyles = cn(
        'flex w-full items-center gap-2 overflow-hidden rounded-sm px-2 py-1.5 text-left text-xs outline-none',
        'ring-sidebar-ring transition-colors',
        'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        'focus-visible:ring-2',
        'text-sidebar-foreground/80'
    );

    return (
        <div className="pointer-events-auto nowheel bg-sidebar text-sidebar-foreground border border-sidebar-border rounded-xl shadow-lg w-52 h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-3 py-2 border-b border-sidebar-border shrink-0 space-y-2">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold">Nodes</h2>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="text-muted-foreground hover:text-foreground p-0.5 rounded-sm hover:bg-sidebar-accent transition-colors"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
                <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground/70" />
                    <SidebarInput
                        placeholder="Search..."
                        className="pl-7 h-8 text-xs bg-sidebar-accent/30 focus:bg-sidebar-accent/50 transition-colors"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {Object.entries(filteredNodesByCategory).map(([category, categoryNodes]) => (
                    <CategoryGroup key={category} title={category} forceOpen={!!searchQuery}>
                        <SidebarMenu>
                            {categoryNodes.map((node) => (
                                <SidebarMenuItem key={node.type}>
                                    <button
                                        onClick={() => handleAddNode(node.type)}
                                        className={menuButtonStyles}
                                    >
                                        {node.label}
                                    </button>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </CategoryGroup>
                ))}

                {/* Custom Section - Subgraphs and Code Nodes */}
                {showCustomSection && (
                    <CategoryGroup title="Custom" forceOpen={!!searchQuery}>
                        <SidebarMenu>
                            {/* Create Node from Code button */}
                            {onOpenCodeNodeDialog && (
                                <SidebarMenuItem>
                                    <button
                                        onClick={onOpenCodeNodeDialog}
                                        className={cn(
                                            menuButtonStyles,
                                            'border border-dashed border-primary/30 hover:border-primary/50 hover:bg-primary/5 text-primary/70 hover:text-primary gap-2'
                                        )}
                                    >
                                        <Plus className="w-3 h-3" />
                                        <Code className="w-3 h-3" />
                                        Create from Code...
                                    </button>
                                </SidebarMenuItem>
                            )}

                            {/* Subgraph nodes */}
                            {customNodes.map((node) => (
                                <SidebarMenuItem key={node.type}>
                                    <button
                                        onClick={() => handleAddSubgraphInstance(node.type)}
                                        className={cn(
                                            menuButtonStyles,
                                            'hover:bg-primary/10 text-primary/80 hover:text-primary gap-2'
                                        )}
                                    >
                                        <Layers className="w-3 h-3" />
                                        {node.label}
                                    </button>
                                </SidebarMenuItem>
                            ))}

                            {/* Code nodes */}
                            {codeNodesList.map((node) => (
                                <SidebarMenuItem key={node.type}>
                                    <button
                                        onClick={() => handleAddCodeNodeInstance(node.type)}
                                        className={cn(
                                            menuButtonStyles,
                                            'hover:bg-primary/10 text-primary/80 hover:text-primary gap-2'
                                        )}
                                    >
                                        <Code className="w-3 h-3" />
                                        {node.label}
                                    </button>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </CategoryGroup>
                )}
            </div>
        </div>
    );
}
