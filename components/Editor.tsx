'use client';

import { useMemo, useEffect, useRef, useCallback, useState } from 'react';
import {
    ReactFlow,
    Background,
    BackgroundVariant,
    ReactFlowProvider,
    type NodeTypes,
    type OnSelectionChangeParams,
    useReactFlow,
    type Connection,
    type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useEditorStore } from '@/store/editor';
import { hasCycle } from '@/lib/graph-utils';
import { TSLNode } from './TSLNode';
import GroupNode from './GroupNode';
import { NodePicker } from './NodePicker';
import { Navbar } from '@/components/Navbar';
import { registry } from '@/lib/registry';
import { initializeNodes } from '@/lib/nodes';
import { UILayer } from './UILayer';
import { Preview } from './Preview';
import { Toolbar } from './Toolbar';
import { PropertiesPanel } from './PropertiesPanel';
import { CodePanel } from './CodePanel';
import { Button } from '@/components/ui/button';
import { PanelLeft } from 'lucide-react';

// Initialize nodes on module load
initializeNodes();

function EditorCanvas() {
    const {
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        onConnect,
        loadFromLocalStorage,
        saveToLocalStorage,
        setSelectedNode,
        setSelectedNodes,
        editorMode,
        undo,
        redo,
        takeSnapshot,
        canvasMode, // Add this
    } = useEditorStore();

    const isInitialized = useRef(false);
    const [isCodePanelOpen, setIsCodePanelOpen] = useState(false);
    const [isNodePickerOpen, setIsNodePickerOpen] = useState(true);

    // Load from localStorage on mount
    useEffect(() => {
        if (!isInitialized.current) {
            isInitialized.current = true;
            loadFromLocalStorage();
        }
    }, [loadFromLocalStorage]);

    // Auto-save to localStorage on changes (debounced)
    useEffect(() => {
        if (!isInitialized.current) return;

        const timeoutId = setTimeout(() => {
            saveToLocalStorage();
        }, 500); // Debounce 500ms

        return () => clearTimeout(timeoutId);
    }, [nodes, edges, saveToLocalStorage]);

    // Keyboard shortcuts for Undo/Redo
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Ignore if focus is in an input or textarea
            if (
                event.target instanceof HTMLInputElement ||
                event.target instanceof HTMLTextAreaElement ||
                (event.target as HTMLElement).isContentEditable
            ) {
                return;
            }

            const isMod = event.ctrlKey || event.metaKey;
            const key = event.key.toLowerCase();

            if (isMod && key === "z") {
                event.preventDefault();
                if (event.shiftKey) {
                    redo();
                } else {
                    undo();
                }
            }

            if (isMod && key === "y") {
                event.preventDefault();
                redo();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [undo, redo]);

    // Snapshot triggers for ReactFlow events

    // 1. Dragging: Snapshot when drag starts to capture original position
    const onNodeDragStart = useCallback(() => {
        takeSnapshot();
    }, [takeSnapshot]);

    // 2. Nodes Change: Snapshot only on Add/Remove
    const handleNodesChange = useCallback((changes: Parameters<typeof onNodesChange>[0]) => {
        const hasStructuralChange = changes.some(
            (c) => c.type === 'add' || c.type === 'remove'
        );
        if (hasStructuralChange) {
            takeSnapshot();
        }
        onNodesChange(changes);
    }, [onNodesChange, takeSnapshot]);

    // 3. Edges Change: Snapshot only on Add/Remove
    const handleEdgesChange = useCallback((changes: Parameters<typeof onEdgesChange>[0]) => {
        const hasStructuralChange = changes.some(
            (c) => c.type === 'add' || c.type === 'remove'
        );
        if (hasStructuralChange) {
            takeSnapshot();
        }
        onEdgesChange(changes);
    }, [onEdgesChange, takeSnapshot]);

    // Handle selection change
    const onSelectionChange = useCallback(
        ({ nodes: selectedNodes }: OnSelectionChangeParams) => {
            // Track multi-selection for subgraph creation
            setSelectedNodes(selectedNodes.map(n => n.id));

            // Also track single selection for properties panel
            if (selectedNodes.length === 1) {
                setSelectedNode(selectedNodes[0].id);
            } else {
                setSelectedNode(null);
            }
        },
        [setSelectedNode, setSelectedNodes]
    );

    // Get subgraph types from store
    const subgraphs = useEditorStore((s) => s.subgraphs);

    // Generate node types from registry + subgraphs - all use the same TSLNode component
    const nodeTypes: NodeTypes = useMemo(() => {
        const types: NodeTypes = {
            group: GroupNode as any,
        };
        // Add registry types
        for (const def of registry.all()) {
            types[def.type] = TSLNode;
        }
        // Add subgraph types
        for (const subgraphId of Object.keys(subgraphs)) {
            types[subgraphId] = TSLNode;
        }
        return types;
    }, [subgraphs]);

    const { getNodes, getEdges } = useReactFlow();

    const isValidConnection = useCallback(
        (connection: Connection | Edge) => {
            const nodes = getNodes();
            const edges = getEdges();
            const target = nodes.find((node) => node.id === connection.target);
            const source = nodes.find((node) => node.id === connection.source);

            if (!target || !source) {
                return false;
            }

            // Cycle check
            // We want to check if connecting source -> target creates a cycle.
            // This happens if target can reach source (target -> ... -> source).
            // Pass target first, then source to check if path target->source exists.
            return !hasCycle(target, source, nodes, edges);
        },
        [getNodes, getEdges]
    );

    return (
        <>
            {/* Canvas Layer */}
            <div className="absolute inset-0">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={handleNodesChange}
                    onEdgesChange={handleEdgesChange}
                    onConnect={onConnect}
                    onNodeDragStart={onNodeDragStart}
                    onSelectionChange={onSelectionChange}
                    nodeTypes={nodeTypes}
                    isValidConnection={isValidConnection}
                    fitView
                    className="bg-background"
                    defaultEdgeOptions={{
                        type: 'smoothstep',
                    }}
                    panOnDrag={canvasMode === 'pan'}
                    selectionOnDrag={canvasMode === 'select'}
                    selectionKeyCode={null} // Disable keyboard shortcut so it's mode-only (optional, but good UX if we have explicit modes)
                    multiSelectionKeyCode="Shift" // Keep Shift for multi-selection additions
                >
                    <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
                    {/* <Controls /> */}
                    {/* <MiniMap
                        className="!bg-card !border-border"
                        nodeColor="#525252"
                    /> */}
                </ReactFlow>
            </div >

            {/* UI Layer */}
            < UILayer >
                <UILayer.TopBar>
                    <Navbar />
                </UILayer.TopBar>

                <UILayer.LeftPanel>
                    {isNodePickerOpen ? (
                        <NodePicker onClose={() => setIsNodePickerOpen(false)} />
                    ) : (
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setIsNodePickerOpen(true)}
                            className="bg-background/95 backdrop-blur shadow-sm border-sidebar-border h-10 w-10 pointer-events-auto"
                            title="Open Node Picker"
                        >
                            <PanelLeft className="h-4 w-4" />
                        </Button>
                    )}
                </UILayer.LeftPanel>

                <UILayer.RightPanel>
                    {editorMode === 'main' && <Preview />}
                    <PropertiesPanel />
                </UILayer.RightPanel>

                <UILayer.BottomBar>
                    <Toolbar
                        onOpenCodePanel={() => setIsCodePanelOpen(true)}
                    />
                </UILayer.BottomBar>
            </UILayer >

            {/* Code Panel Modal */}
            < CodePanel
                isOpen={isCodePanelOpen}
                onClose={() => setIsCodePanelOpen(false)
                }
            />
        </>
    );
}

export function Editor() {
    return (
        <div className="w-full h-full relative">
            <ReactFlowProvider>
                <EditorCanvas />
            </ReactFlowProvider>
        </div>
    );
}
