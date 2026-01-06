'use client';

import { useMemo, useEffect, useRef } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    BackgroundVariant,
    ReactFlowProvider,
    type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useEditorStore } from '@/store/editor';
import { TSLNode } from './TSLNode';
import { NodePicker } from './NodePicker';
import { registry } from '@/lib/registry';
import { initializeNodes } from '@/lib/nodes';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { CodePanel } from './CodePanel';
import { Preview } from './Preview';
import { Toolbar } from './Toolbar';

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
    } = useEditorStore();

    const isInitialized = useRef(false);

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

    // Generate node types from registry - all use the same TSLNode component
    const nodeTypes: NodeTypes = useMemo(() => {
        const types: NodeTypes = {};
        for (const def of registry.all()) {
            types[def.type] = TSLNode;
        }
        return types;
    }, []);

    return (
        <div className="flex h-full w-full">
            <NodePicker />
            <SidebarInset className="flex-1 relative">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    nodeTypes={nodeTypes}
                    fitView
                    className="bg-background"
                    defaultEdgeOptions={{
                        type: 'smoothstep',
                    }}
                >
                    <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
                    <Controls />
                    <MiniMap
                        className="!bg-card !border-border"
                        nodeColor="#525252"
                    />
                </ReactFlow>
                <Toolbar />
                <Preview />
                <CodePanel />
            </SidebarInset>
        </div>
    );
}

export function Editor() {
    return (
        <div className="w-full h-full">
            <SidebarProvider defaultOpen={true}>
                <ReactFlowProvider>
                    <EditorCanvas />
                </ReactFlowProvider>
            </SidebarProvider>
        </div>
    );
}
