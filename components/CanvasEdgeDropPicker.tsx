'use client';

import { memo, useCallback } from "react";
import { addEdge, useReactFlow, Edge } from "@xyflow/react";
import { EdgeDropNodePicker } from "./EdgeDropNodePicker";
import { registry } from "@/lib/registry";
import { MATERIAL_NODE_TYPES } from "@/lib/nodes";
import { useEdgeDropPickerStore } from "@/store/edge-drop-picker";
import { useEditorStore } from "@/store/editor";
import { NodeType, AppNode, TSLNodeData } from "@/lib/types";

export const CanvasEdgeDropPicker = memo(function CanvasEdgeDropPicker() {

    const { addNodes, setNodes, setEdges } = useReactFlow<AppNode>();

    const isOpen = useEdgeDropPickerStore(state => state.isOpen);
    const screenPosition = useEdgeDropPickerStore(state => state.screenPosition);
    const flowPosition = useEdgeDropPickerStore(state => state.flowPosition);
    const sourceDataType = useEdgeDropPickerStore(state => state.sourceDataType);
    const sourceNodeId = useEdgeDropPickerStore(state => state.sourceNodeId);
    const sourceHandleId = useEdgeDropPickerStore(state => state.sourceHandleId);
    const handleDirection = useEdgeDropPickerStore(state => state.handleDirection);
    const close = useEdgeDropPickerStore(state => state.close);

    const handleNodeSelect = useCallback(
        (nodeType: NodeType) => {
            const definition = registry.get(nodeType);
            const isCodeNode = nodeType.startsWith('code/');
            const codeNodes = useEditorStore.getState().codeNodes;
            const codeNode = isCodeNode ? codeNodes[nodeType] : null;

            // Must have either a registry definition or be a valid code node
            if (!definition && !codeNode) return;

            // Build default values from definition
            // Note: definition.inputs is a Record<string, Port>
            const defaultValues: Record<string, any> = {};
            if (definition?.inputs) {
                Object.entries(definition.inputs).forEach(([key, input]) => {
                    // Use 'defaultValue' if you have it in your Port definition?
                    // Current Port def: readonly default?: number | ...
                    if (input.default !== undefined) {
                        defaultValues[key] = input.default;
                    }
                });
            }

            const newNodeId = `${nodeType}-${Date.now()}`;
            useEditorStore.getState().takeSnapshot();

            // Validation: Only one material node allowed
            const isMaterialNode = (MATERIAL_NODE_TYPES as readonly string[]).includes(nodeType);
            const { nodes, edges } = useEditorStore.getState();

            if (isMaterialNode) {
                const existingMaterial = nodes.find(n =>
                    (MATERIAL_NODE_TYPES as readonly string[]).includes(n.data.type)
                );

                if (existingMaterial) {
                    // Prevent if we are connecting FROM the existing material node
                    // Paradox: replacing the source node of the new connection
                    if (existingMaterial.id === sourceNodeId) {
                        // We could warn or just return
                        // For now, simple return effectively cancels the action
                        console.warn("Cannot replace material node when extending from it.");
                        return;
                    }

                    // Remove existing material node and its edges via ReactFlow
                    // We need to use store actions or setNodes/setEdges locally?
                    // CanvasEdgeDropPicker uses ReactFlow helpers which trigger store updates via onNodesChange.
                    // But deleting a node via setNodes is state replacement.

                    // We can use the store's deleteNode, but that might interfere with our local addNodes
                    // if we do them in sequence.
                    // The cleanest way is to use store actions for everything if we want consistency,
                    // but we are using useReactFlow hooks here.

                    // Let's filter manually and update via setNodes/setEdges from useReactFlow

                    // Note: We need to filter based on current ReactFlow state which might be slightly different 
                    // from store if not synced yet, but usually they are 1:1 in this setup.
                    // However, we accessed `nodes` from store.

                    // Let's use useReactFlow methods for consistency within this component
                    // But we need the ID of the existing one.

                    const existingId = existingMaterial.id;

                    // Remove node
                    setNodes((nds) => nds.filter((n) => n.id !== existingId));
                    // Remove connected edges
                    setEdges((eds) => eds.filter(
                        (e) => e.source !== existingId && e.target !== existingId
                    ));
                }
            }

            // Create the new node - handle code nodes specially
            let newNode: AppNode;

            if (isCodeNode && codeNode) {
                // Code node instance
                newNode = {
                    id: newNodeId,
                    type: nodeType,
                    position: flowPosition,
                    selected: true,
                    data: {
                        type: nodeType,
                        values: {},
                        connected: {},
                        dynamicPorts: [...codeNode.inputs, codeNode.output],
                    } as TSLNodeData,
                };
            } else {
                // Regular node from registry
                newNode = {
                    id: newNodeId,
                    type: nodeType, // This assumes 'nodeType' is valid for TSLNode (AppNode includes GroupNode | TSLNode)
                    position: flowPosition,
                    selected: true,
                    data: {
                        type: nodeType,
                        values: defaultValues,
                        connected: {},
                    } as TSLNodeData,
                };
            }

            addNodes(newNode);

            // Determine target handle on the new node
            let targetHandleId = '';

            if (handleDirection === 'output') {
                // We are dragging FROM source (output) TO new node (input)
                if (isCodeNode && codeNode) {
                    // Code node: find first input
                    if (codeNode.inputs.length > 0) {
                        targetHandleId = codeNode.inputs[0].id;
                    }
                } else if (definition) {
                    // Find compatible input on new node
                    const inputs = definition.inputs || {};
                    // Find first input that matches
                    const matchingInput = Object.entries(inputs).find(([key, port]) => {
                        return port.type === 'any' || sourceDataType === 'any' || port.type === sourceDataType;
                    });
                    if (matchingInput) {
                        targetHandleId = matchingInput[0];
                    } else if (Object.keys(inputs).length > 0) {
                        targetHandleId = Object.keys(inputs)[0]; // Fallback
                    }
                }
            } else {
                // We are dragging FROM source (input) TO new node (output)
                if (isCodeNode && codeNode) {
                    // Code node: use the single output
                    targetHandleId = codeNode.output.id;
                } else if (definition) {
                    // Find compatible output on new node
                    const outputs = definition.outputs || {};
                    const matchingOutput = Object.entries(outputs).find(([key, port]) => {
                        return port.type === 'any' || sourceDataType === 'any' || port.type === sourceDataType;
                    });
                    if (matchingOutput) {
                        targetHandleId = matchingOutput[0];
                    } else if (Object.keys(outputs).length > 0) {
                        targetHandleId = Object.keys(outputs)[0];
                    }
                }
            }

            if (targetHandleId) {
                const newEdge: Edge = handleDirection === 'output'
                    ? {
                        id: `edge-${sourceNodeId}-${sourceHandleId}-${newNodeId}-${targetHandleId}`,
                        source: sourceNodeId,
                        sourceHandle: sourceHandleId,
                        target: newNodeId,
                        targetHandle: targetHandleId,
                    }
                    : {
                        id: `edge-${newNodeId}-${targetHandleId}-${sourceNodeId}-${sourceHandleId}`,
                        source: newNodeId,
                        sourceHandle: targetHandleId,
                        target: sourceNodeId,
                        targetHandle: sourceHandleId,
                    };

                // Add edge
                setEdges((eds) => addEdge(newEdge, eds));
            }

            close();
        },
        [flowPosition, sourceNodeId, sourceHandleId, sourceDataType, handleDirection, addNodes, setEdges, close, setNodes]
    );

    if (!isOpen) return null;

    return (
        <EdgeDropNodePicker
            position={screenPosition}
            sourceDataType={sourceDataType}
            handleDirection={handleDirection}
            onNodeSelect={handleNodeSelect}
            onClose={close}
        />
    );
});
