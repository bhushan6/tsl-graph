'use client';

import { memo, useCallback } from "react";
import { addEdge, useReactFlow, Edge } from "@xyflow/react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { EdgeDropNodePicker } from "./EdgeDropNodePicker";
import { registry } from "@/lib/registry";
import { getMultiOpHandleId, getMultiOpParams } from "@/lib/multi-op";
import { MATERIAL_NODE_TYPES } from "@/lib/nodes";
import { useEdgeDropPickerStore } from "@/store/edge-drop-picker";
import { useEditorStore } from "@/store/editor";
import { NodeType, AppNode, TSLNodeData, TSLValueType, SubgraphPort } from "@/lib/types";
import { getAbsolutePosition } from "@/lib/utils";

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

    // Fetch templates (cached by Convex, no extra network request if NodePicker already subscribed)
    const userCodeNodeTemplates = useQuery(api.templates.listCodeNodeTemplates);
    const userSubgraphTemplates = useQuery(api.templates.listSubgraphTemplates);

    const handleNodeSelect = useCallback(
        (nodeType: NodeType) => {
            const definition = registry.get(nodeType);
            const isCodeNode = nodeType.startsWith('code/');
            const isSubgraphNode = nodeType.startsWith('subgraph/') && !nodeType.startsWith('subgraph/input') && !nodeType.startsWith('subgraph/output');

            // For code nodes, look up the template from the fetched templates
            // nodeType is in format "code/{templateId}"
            let codeTemplateData: {
                id: string;
                name: string;
                code: string;
                inputs: SubgraphPort[];
                output: SubgraphPort;
            } | null = null;
            let codeTemplateId: string | undefined;
            let codeTemplateVersion: number | undefined;

            if (isCodeNode && userCodeNodeTemplates) {
                const tplId = nodeType.slice('code/'.length); // Extract template ID
                const template = userCodeNodeTemplates.find(t => t._id === tplId);
                if (template) {
                    const data = template.data as {
                        id: string;
                        name: string;
                        code: string;
                        inputs: Array<{ id: string; label: string; type: string }>;
                        output: { id: string; label: string; type: string };
                    };
                    codeTemplateData = {
                        id: data.id,
                        name: data.name || template.name,
                        code: data.code,
                        inputs: data.inputs.map(inp => ({ id: inp.id, label: inp.label, type: inp.type as SubgraphPort['type'] })),
                        output: { id: data.output.id, label: data.output.label, type: data.output.type as SubgraphPort['type'] },
                    };
                    codeTemplateId = template._id;
                    codeTemplateVersion = template.version;
                }
            }

            // For subgraph nodes, look up the template from the fetched templates
            // nodeType is in format "subgraph/{templateId}"
            let subgraphTemplateData: {
                id: string;
                name: string;
                inputs: SubgraphPort[];
                outputs: SubgraphPort[];
                nodes: AppNode[];
                edges: import('@xyflow/react').Edge[];
            } | null = null;
            let subgraphTemplateId: string | undefined;
            let subgraphTemplateVersion: number | undefined;

            if (isSubgraphNode && userSubgraphTemplates) {
                const tplId = nodeType.slice('subgraph/'.length); // Extract template ID
                const template = userSubgraphTemplates.find(t => t._id === tplId);
                if (template) {
                    const data = template.data as {
                        id: string;
                        name: string;
                        inputs: Array<{ id: string; label: string; type: string }>;
                        outputs: Array<{ id: string; label: string; type: string }>;
                        nodes: AppNode[];
                        edges: import('@xyflow/react').Edge[];
                    };
                    subgraphTemplateData = {
                        id: data.id,
                        name: data.name || template.name,
                        inputs: data.inputs.map(inp => ({ id: inp.id, label: inp.label, type: inp.type as SubgraphPort['type'] })),
                        outputs: data.outputs.map(out => ({ id: out.id, label: out.label, type: out.type as SubgraphPort['type'] })),
                        nodes: data.nodes || [],
                        edges: data.edges || [],
                    };
                    subgraphTemplateId = template._id;
                    subgraphTemplateVersion = template.version;
                }
            }

            // Must have either a registry definition or be a valid template
            if (!definition && !codeTemplateData && !subgraphTemplateData) return;

            // Build default values from definition
            // Note: definition.inputs is a Record<string, Port>
            const defaultValues: Record<string, TSLValueType> = {};
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
            const { nodes } = useEditorStore.getState();

            if (isMaterialNode && sourceNodeId) {
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

            // Create the new node - handle custom nodes specially
            let newNode: AppNode;
            let actualNodeType = nodeType; // May be overwritten for custom nodes

            if (isCodeNode && codeTemplateData) {
                // Generate a unique instance ID for this code node
                const instanceId = `${codeTemplateData.id || 'code-template'}-${Date.now()}`;
                actualNodeType = instanceId as NodeType;

                // Add the code node definition to the store
                const codeDefinition = {
                    id: instanceId,
                    name: codeTemplateData.name,
                    templateId: codeTemplateId,
                    templateVersion: codeTemplateVersion,
                    code: codeTemplateData.code,
                    inputs: codeTemplateData.inputs,
                    output: codeTemplateData.output,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                };
                useEditorStore.getState().addCodeNodeDefinition(codeDefinition);

                // Code node instance
                newNode = {
                    id: newNodeId,
                    type: actualNodeType,
                    position: flowPosition,
                    selected: true,
                    data: {
                        type: actualNodeType,
                        values: {},
                        connected: {},
                        dynamicPorts: [...codeTemplateData.inputs, codeTemplateData.output],
                    } as TSLNodeData,
                };
            } else if (isSubgraphNode && subgraphTemplateData) {
                // Generate a unique instance ID for this subgraph node
                const instanceId = `${subgraphTemplateData.id || 'subgraph-template'}-${Date.now()}`;
                actualNodeType = instanceId as NodeType;

                // Add the subgraph definition to the store
                const subgraphDefinition = {
                    id: instanceId,
                    name: subgraphTemplateData.name,
                    templateId: subgraphTemplateId,
                    templateVersion: subgraphTemplateVersion,
                    inputs: subgraphTemplateData.inputs,
                    outputs: subgraphTemplateData.outputs,
                    nodes: subgraphTemplateData.nodes,
                    edges: subgraphTemplateData.edges,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                };
                useEditorStore.getState().addSubgraphDefinition(subgraphDefinition);

                // Subgraph node instance
                newNode = {
                    id: newNodeId,
                    type: actualNodeType,
                    position: flowPosition,
                    selected: true,
                    data: {
                        type: actualNodeType,
                        values: {},
                        connected: {},
                        dynamicPorts: [...subgraphTemplateData.inputs, ...subgraphTemplateData.outputs],
                    } as TSLNodeData,
                };
            } else {
                // Regular node from registry
                const nodeData: TSLNodeData = {
                    type: nodeType,
                    values: defaultValues,
                    connected: {},
                } as TSLNodeData;

                // Add default operation for MultiOp nodes
                if (nodeType === 'math/multiOp') {
                    const opId = `op_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
                    nodeData.operations = [{ id: opId, op: 'add' }];
                }

                newNode = {
                    id: newNodeId,
                    type: nodeType,
                    position: flowPosition,
                    selected: true,
                    data: nodeData,
                };
            }

            const nodesById = new Map(nodes.map(n => [n.id, n]));
            const sourceNode = sourceNodeId && nodesById.get(sourceNodeId);

            const isGroupNode = (node: AppNode) => node.type === 'group' || node.data.type === 'loop';
            const isLoopBoundaryHandle = (node: AppNode, direction: 'input' | 'output', handleId?: string | null) => {
                if (node.data.type === 'loop/count' && direction === 'input' && handleId === 'count') return true;
                if (node.data.type === 'loop/start' && direction === 'input' && handleId === 'start') return true;
                if (node.data.type === 'loop/end' && direction === 'input' && handleId === 'end') return true;
                if (node.data.type === 'loop/count2' && direction === 'input' && handleId === 'count') return true;
                if (node.data.type === 'loop/accumulator' && direction === 'input' && handleId === 'seed') return true;
                if (node.data.type === 'loop/condition' && direction === 'input' && handleId === 'cond') return true;
                if (node.data.type === 'loop/output' && direction === 'output' && (!handleId || handleId === 'out')) return true;
                return false;
            };

            const getGroupAncestorId = (node: AppNode | undefined): string | null => {
                if (!node) return null;
                let parentId = node.parentId;
                while (parentId) {
                    const parent = nodesById.get(parentId);
                    if (!parent) break;
                    if (isGroupNode(parent)) return parent.id;
                    parentId = parent.parentId;
                }
                return null;
            };

            const getGroupDepth = (node: AppNode): number => {
                let depth = 0;
                let parentId = node.parentId;
                while (parentId) {
                    depth += 1;
                    parentId = nodesById.get(parentId)?.parentId;
                }
                return depth;
            };

            const getNodeDimension = (node: AppNode, key: 'width' | 'height'): number | null => {
                const direct = (node as AppNode & { [k: string]: unknown })[key];
                if (typeof direct === 'number') return direct;
                const styleValue = node.style?.[key];
                if (typeof styleValue === 'number') return styleValue;
                if (typeof styleValue === 'string') {
                    const parsed = Number(styleValue.replace('px', ''));
                    return Number.isFinite(parsed) ? parsed : null;
                }
                return null;
            };

            const blockGroupNesting = !!sourceNode && !!handleDirection && isLoopBoundaryHandle(sourceNode, handleDirection, sourceHandleId);
            let parentGroupId: string | null = blockGroupNesting || !sourceNode ? null : getGroupAncestorId(sourceNode);

            if (!parentGroupId && !blockGroupNesting) {
                const groupCandidates = nodes.filter(isGroupNode).flatMap((node) => {
                    const width = getNodeDimension(node, 'width');
                    const height = getNodeDimension(node, 'height');
                    if (!width || !height) return [];
                    const abs = getAbsolutePosition(node, nodes);
                    const inside = flowPosition.x >= abs.x
                        && flowPosition.x <= abs.x + width
                        && flowPosition.y >= abs.y
                        && flowPosition.y <= abs.y + height;
                    if (!inside) return [];
                    return [{ node, depth: getGroupDepth(node) }];
                });

                if (groupCandidates.length > 0) {
                    groupCandidates.sort((a, b) => b.depth - a.depth);
                    parentGroupId = groupCandidates[0].node.id;
                }
            }

            if (parentGroupId) {
                const parent = nodesById.get(parentGroupId);
                if (parent) {
                    const absParent = getAbsolutePosition(parent, nodes);
                    newNode = {
                        ...newNode,
                        parentId: parentGroupId,
                        extent: 'parent',
                        position: {
                            x: flowPosition.x - absParent.x,
                            y: flowPosition.y - absParent.y,
                        },
                    };
                }
            }

            addNodes(newNode);

            // Determine target handle on the new node
            let targetHandleId = '';

            if (handleDirection === 'output') {
                // We are dragging FROM source (output) TO new node (input)
                if (isCodeNode && codeTemplateData) {
                    // Code node: find first input
                    if (codeTemplateData.inputs.length > 0) {
                        targetHandleId = codeTemplateData.inputs[0].id;
                    }
                } else if (isSubgraphNode && subgraphTemplateData) {
                    // Subgraph node: find first input
                    if (subgraphTemplateData.inputs.length > 0) {
                        targetHandleId = subgraphTemplateData.inputs[0].id;
                    }
                } else if (nodeType === 'math/multiOp' && newNode.data.operations?.length) {
                    // MultiOp: connect to the first operation's first param
                    const op = newNode.data.operations[0];
                    const params = getMultiOpParams(op.op, true);
                    if (params.length > 0) {
                        targetHandleId = getMultiOpHandleId(op.id, params[0].key);
                    }
                } else if (definition) {
                    // Find compatible input on new node
                    const inputs = definition.inputs || {};
                    // Find first input that matches
                    const matchingInput = Object.entries(inputs).find(([, port]) => {
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
                if (isCodeNode && codeTemplateData) {
                    // Code node: use the single output
                    targetHandleId = codeTemplateData.output.id;
                } else if (isSubgraphNode && subgraphTemplateData) {
                    // Subgraph node: find first output
                    if (subgraphTemplateData.outputs.length > 0) {
                        targetHandleId = subgraphTemplateData.outputs[0].id;
                    }
                } else if (definition) {
                    // Find compatible output on new node
                    const outputs = definition.outputs || {};
                    const matchingOutput = Object.entries(outputs).find(([, port]) => {
                        return port.type === 'any' || sourceDataType === 'any' || port.type === sourceDataType;
                    });
                    if (matchingOutput) {
                        targetHandleId = matchingOutput[0];
                    } else if (Object.keys(outputs).length > 0) {
                        targetHandleId = Object.keys(outputs)[0];
                    }
                }
            }

            if (targetHandleId && sourceNodeId && sourceHandleId && handleDirection) {
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
        [flowPosition, sourceNodeId, sourceHandleId, sourceDataType, handleDirection, addNodes, setEdges, close, setNodes, userCodeNodeTemplates, userSubgraphTemplates]
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
