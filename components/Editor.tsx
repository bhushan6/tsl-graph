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
import { NodePicker } from './NodePicker';
import { registry } from '@/lib/registry';
import { initializeNodes } from '@/lib/nodes';
import { UILayer } from './UILayer';
import { Preview } from './Preview';
import { Toolbar } from './Toolbar';
import { PropertiesPanel } from './PropertiesPanel';
import { CodePanel } from './CodePanel';

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
    } = useEditorStore();

    const isInitialized = useRef(false);
    const [isCodePanelOpen, setIsCodePanelOpen] = useState(false);

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

    // Handle selection change
    const onSelectionChange = useCallback(
        ({ nodes: selectedNodes }: OnSelectionChangeParams) => {
            if (selectedNodes.length === 1) {
                setSelectedNode(selectedNodes[0].id);
            } else {
                setSelectedNode(null);
            }
        },
        [setSelectedNode]
    );

    // Generate node types from registry - all use the same TSLNode component
    const nodeTypes: NodeTypes = useMemo(() => {
        const types: NodeTypes = {};
        for (const def of registry.all()) {
            types[def.type] = TSLNode;
        }
        return types;
    }, []);

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
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onSelectionChange={onSelectionChange}
                    nodeTypes={nodeTypes}
                    isValidConnection={isValidConnection}
                    fitView
                    className="bg-background"
                    defaultEdgeOptions={{
                        type: 'smoothstep',
                    }}
                >
                    <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
                    {/* <Controls /> */}
                    {/* <MiniMap
                        className="!bg-card !border-border"
                        nodeColor="#525252"
                    /> */}
                </ReactFlow>
            </div>

            {/* UI Layer */}
            <UILayer>
                <UILayer.LeftPanel>
                    <NodePicker />
                </UILayer.LeftPanel>

                <UILayer.RightPanel>
                    <Preview />
                    <PropertiesPanel />
                </UILayer.RightPanel>

                <UILayer.BottomBar>
                    <Toolbar onOpenCodePanel={() => setIsCodePanelOpen(true)} />
                </UILayer.BottomBar>
            </UILayer>

            {/* Code Panel Modal */}
            <CodePanel
                isOpen={isCodePanelOpen}
                onClose={() => setIsCodePanelOpen(false)}
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
