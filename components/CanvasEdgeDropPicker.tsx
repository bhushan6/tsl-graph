'use client';

import { memo, useCallback } from "react";
import { addEdge, useReactFlow, Edge } from "@xyflow/react";
import { EdgeDropNodePicker, MULTI_OP_INPUT_HANDLE_PREFIX, type EdgeDropSelection } from "./EdgeDropNodePicker";
import { registry } from "@/lib/registry";
import { getMultiOpHandleId, getMultiOpParams } from "@/lib/multi-op";
import { MATERIAL_NODE_TYPES, POST_ANCHOR_NODE_TYPES, POST_FX_NODE_TYPES } from "@/lib/nodes";
import { useEdgeDropPickerStore } from "@/store/edge-drop-picker";
import { useEditorStore } from "@/store/editor";
import { CodeNodeDefinition, CodeNodeLanguage, NodeType, AppNode, TSLNodeData, TSLValueType, SubgraphPort } from "@/lib/types";
import { getAbsolutePosition } from "@/lib/utils";
import { replaceEdgeOnTargetHandle } from "@/lib/graph-utils";
import { useTemplateLibrary } from "@/lib/editor-host/template-library";
import type { QuickCreateConstantIntent } from "@/lib/quick-create-constants";
import {
    buildQuickCreateExpressionGraph,
    type QuickCreateExpressionIntent,
} from "@/lib/quick-create-expressions";

export const CanvasEdgeDropPicker = memo(function CanvasEdgeDropPicker() {

    const { setNodes, setEdges } = useReactFlow<AppNode>();

    const isOpen = useEdgeDropPickerStore(state => state.isOpen);
    const screenPosition = useEdgeDropPickerStore(state => state.screenPosition);
    const flowPosition = useEdgeDropPickerStore(state => state.flowPosition);
    const sourceDataType = useEdgeDropPickerStore(state => state.sourceDataType);
    const sourceNodeId = useEdgeDropPickerStore(state => state.sourceNodeId);
    const sourceHandleId = useEdgeDropPickerStore(state => state.sourceHandleId);
    const handleDirection = useEdgeDropPickerStore(state => state.handleDirection);
    const close = useEdgeDropPickerStore(state => state.close);
    const activeRootGraph = useEditorStore(state => state.activeRootGraph);

    const { userCodeNodeTemplates, userSubgraphTemplates } = useTemplateLibrary();

    const handleNodeSelect = useCallback(
        (selection: EdgeDropSelection, initialValues?: Record<string, TSLValueType>) => {
            const nodeType = selection.nodeType;
            const selectedHandleId = selection.handleId;
            const selectedGlobalId = selection.globalId;
            const selectedLocalSourceId = selection.localSourceId;
            const definition = registry.get(nodeType);
            const isCodeNode = nodeType.startsWith('code/');
            const isSubgraphNode = nodeType.startsWith('subgraph/') && !nodeType.startsWith('subgraph/input') && !nodeType.startsWith('subgraph/output');
            const projectCodeNode = isCodeNode
                ? useEditorStore.getState().codeNodes[nodeType]
                : undefined;
            const projectSubgraph = nodeType.startsWith('custom/')
                ? useEditorStore.getState().subgraphs[nodeType]
                : undefined;

            // For code nodes, look up the template from the fetched templates
            // nodeType is in format "code/{templateId}"
            let codeTemplateData: {
                id: string;
                name: string;
                code: string;
                inputs: SubgraphPort[];
                output: SubgraphPort;
                scope?: 'project' | 'library';
                language?: CodeNodeLanguage;
            } | null = null;
            let codeTemplateId: string | undefined;
            let codeTemplateVersion: number | undefined;

            if (isCodeNode) {
                const tplId = nodeType.slice('code/'.length); // Extract template ID
                const template = userCodeNodeTemplates.find(t => t._id === tplId);
                if (template) {
                    const data = template.data as {
                        id: string;
                        name: string;
                        code: string;
                        scope?: 'project' | 'library';
                        language?: CodeNodeLanguage;
                        inputs: Array<{ id: string; label: string; type: string }>;
                        output: { id: string; label: string; type: string };
                    };
                    codeTemplateData = {
                        id: data.id,
                        name: data.name || template.name,
                        code: data.code,
                        scope: data.scope,
                        language: data.language ?? 'tsl',
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
                scope?: 'project' | 'library';
            } | null = null;
            let subgraphTemplateId: string | undefined;
            let subgraphTemplateVersion: number | undefined;

            if (isSubgraphNode) {
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
                        scope?: 'project' | 'library';
                    };
                    subgraphTemplateData = {
                        id: data.id,
                        name: data.name || template.name,
                        inputs: data.inputs.map(inp => ({ id: inp.id, label: inp.label, type: inp.type as SubgraphPort['type'] })),
                        outputs: data.outputs.map(out => ({ id: out.id, label: out.label, type: out.type as SubgraphPort['type'] })),
                        nodes: data.nodes || [],
                        edges: data.edges || [],
                        scope: data.scope,
                    };
                    subgraphTemplateId = template._id;
                    subgraphTemplateVersion = template.version;
                }
            }

            // Must have either a registry definition or be a valid template
            if (!definition && !codeTemplateData && !projectCodeNode && !subgraphTemplateData && !projectSubgraph) return;

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
            const isPostAnchorType = (POST_ANCHOR_NODE_TYPES as readonly string[]).includes(nodeType as typeof POST_ANCHOR_NODE_TYPES[number]);
            const isPostFxNode = (POST_FX_NODE_TYPES as readonly string[]).includes(nodeType);
            const isViewportSharedNode = nodeType === 'texture/viewportShared';
            const isUniformNode = nodeType === 'const/uniform';
            const { nodes } = useEditorStore.getState();

            if (isPostAnchorType) {
                close();
                return;
            }

            if (activeRootGraph === 'post' && isMaterialNode) {
                close();
                return;
            }

            if (activeRootGraph === 'post' && isViewportSharedNode) {
                close();
                return;
            }

            if (activeRootGraph === 'post' && isUniformNode) {
                close();
                return;
            }

            if (activeRootGraph === 'material' && isPostFxNode) {
                close();
                return;
            }

            if (activeRootGraph === 'material' && isMaterialNode) {
                const existingMaterialIds = nodes
                    .filter((n) => (MATERIAL_NODE_TYPES as readonly string[]).includes(n.data.type))
                    .map((n) => n.id);

                if (sourceNodeId && existingMaterialIds.includes(sourceNodeId)) {
                    // Prevent replacing the node we are currently extending from.
                    console.warn("Cannot replace material node when extending from it.");
                    return;
                }

                if (existingMaterialIds.length > 0) {
                    const existingIds = new Set(existingMaterialIds);
                    setNodes((nds) => nds.filter((n) => !existingIds.has(n.id)));
                    setEdges((eds) => eds.filter(
                        (e) => !existingIds.has(e.source) && !existingIds.has(e.target)
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
                const codeDefinition: CodeNodeDefinition = {
                    id: instanceId,
                    name: codeTemplateData.name,
                    templateId: codeTemplateId,
                    templateVersion: codeTemplateVersion,
                    scope: codeTemplateData.scope === 'project' ? 'project' : 'library',
                    language: codeTemplateData.language ?? 'tsl',
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
            } else if (projectCodeNode) {
                newNode = {
                    id: newNodeId,
                    type: nodeType,
                    position: flowPosition,
                    selected: true,
                    data: {
                        type: nodeType,
                        values: {},
                        connected: {},
                        dynamicPorts: [...projectCodeNode.inputs, projectCodeNode.output],
                    } as TSLNodeData,
                };
            } else if (isSubgraphNode && subgraphTemplateData) {
                const rawId = subgraphTemplateData.id || subgraphTemplateId || 'subgraph-template';
                const subgraphId = rawId.startsWith('custom/') ? rawId : `custom/${rawId}`;
                actualNodeType = subgraphId as NodeType;
                const existingSubgraph = useEditorStore.getState().subgraphs[subgraphId];

                // Add the subgraph definition to the store
                const subgraphDefinition = {
                    id: subgraphId,
                    name: subgraphTemplateData.name,
                    templateId: subgraphTemplateId,
                    templateVersion: subgraphTemplateVersion,
                    scope: subgraphTemplateData.scope ?? 'library',
                    inputs: subgraphTemplateData.inputs,
                    outputs: subgraphTemplateData.outputs,
                    nodes: subgraphTemplateData.nodes,
                    edges: subgraphTemplateData.edges,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                };
                if (!existingSubgraph) {
                    useEditorStore.getState().addSubgraphDefinition(subgraphDefinition);
                }
                const definitionForPorts = existingSubgraph ?? subgraphDefinition;

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
                        dynamicPorts: [...definitionForPorts.inputs, ...definitionForPorts.outputs],
                    } as TSLNodeData,
                };
            } else if (projectSubgraph) {
                newNode = {
                    id: newNodeId,
                    type: nodeType,
                    position: flowPosition,
                    selected: true,
                    data: {
                        type: nodeType,
                        values: {},
                        connected: {},
                        dynamicPorts: [...projectSubgraph.inputs, ...projectSubgraph.outputs],
                    } as TSLNodeData,
                };
            } else {
                // Regular node from registry
                const nodeData: TSLNodeData = {
                    type: nodeType,
                    values: {
                        ...defaultValues,
                        ...(initialValues ?? {}),
                    },
                    connected: {},
                } as TSLNodeData;

                if (nodeType === 'global/ref' && typeof selectedGlobalId === 'string') {
                    nodeData.values = {
                        ...nodeData.values,
                        globalId: selectedGlobalId,
                    };
                }
                if (nodeType === 'local/get') {
                    nodeData.values = {
                        ...nodeData.values,
                        localSourceId: typeof selectedLocalSourceId === 'string' ? selectedLocalSourceId : '',
                    };
                }

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


            setNodes((nds) => {
                const deselectedNodes = nds.map((n) => ({
                    ...n,
                    selected: false,
                }));
                return [...deselectedNodes, newNode];
            });

            // Determine target handle on the new node
            let targetHandleId = '';

            if (selectedHandleId) {
                if (
                    nodeType === 'math/multiOp' &&
                    handleDirection === 'output' &&
                    selectedHandleId.startsWith(MULTI_OP_INPUT_HANDLE_PREFIX)
                ) {
                    const paramKey = selectedHandleId.slice(MULTI_OP_INPUT_HANDLE_PREFIX.length);
                    const op = newNode.data.operations?.[0];
                    if (op && paramKey) {
                        targetHandleId = getMultiOpHandleId(op.id, paramKey);
                    }
                } else {
                    targetHandleId = selectedHandleId;
                }
            }

            // Backward-safe fallback: pick a default handle when picker didn't provide one.
            if (!targetHandleId) {
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
                setEdges((eds) => {
                    const filtered = replaceEdgeOnTargetHandle(
                        eds,
                        newEdge.target,
                        newEdge.targetHandle
                    );
                    return addEdge(newEdge, filtered);
                });
            }

            close();
        },
        [flowPosition, sourceNodeId, sourceHandleId, sourceDataType, handleDirection, setEdges, close, setNodes, userCodeNodeTemplates, userSubgraphTemplates, activeRootGraph]
    );

    const handleQuickCreate = useCallback(
        (intent: QuickCreateConstantIntent) => {
            handleNodeSelect(
                {
                    nodeType: intent.nodeType,
                    handleId: handleDirection === 'input' ? intent.outputHandleId : null,
                },
                intent.values
            );
        },
        [handleDirection, handleNodeSelect]
    );

    const handleQuickCreateExpression = useCallback(
        (intent: QuickCreateExpressionIntent) => {
            const state = useEditorStore.getState();
            const nodes = state.nodes;
            const nodesById = new Map(nodes.map((node) => [node.id, node]));
            const sourceNode = sourceNodeId ? nodesById.get(sourceNodeId) : undefined;

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

            const blockGroupNesting = !!sourceNode
                && !!handleDirection
                && isLoopBoundaryHandle(sourceNode, handleDirection, sourceHandleId);
            let parentGroupId: string | null = blockGroupNesting || !sourceNode
                ? null
                : getGroupAncestorId(sourceNode);

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

            const parentGroup = parentGroupId ? nodesById.get(parentGroupId) : undefined;
            const parent = parentGroup
                ? {
                    id: parentGroup.id,
                    absolutePosition: getAbsolutePosition(parentGroup, nodes),
                }
                : undefined;

            const graph = buildQuickCreateExpressionGraph(intent, {
                basePosition: flowPosition,
                parent,
            });

            state.takeSnapshot();

            setNodes((nds) => {
                const deselectedNodes = nds.map((node) => ({
                    ...node,
                    selected: false,
                }));
                return [...deselectedNodes, ...graph.nodes];
            });
            state.setSelectedNodes(graph.nodes.map((node) => node.id));

            setEdges((eds) => {
                const withExpressionEdges = [...eds, ...graph.edges];
                if (handleDirection !== 'input' || !sourceNodeId || !sourceHandleId) {
                    return withExpressionEdges;
                }

                const newEdge: Edge = {
                    id: `edge-${graph.outputNodeId}-${graph.outputHandleId}-${sourceNodeId}-${sourceHandleId}`,
                    source: graph.outputNodeId,
                    sourceHandle: graph.outputHandleId,
                    target: sourceNodeId,
                    targetHandle: sourceHandleId,
                };
                const filtered = replaceEdgeOnTargetHandle(
                    withExpressionEdges,
                    newEdge.target,
                    newEdge.targetHandle
                );
                return addEdge(newEdge, filtered);
            });

            close();
        },
        [close, flowPosition, handleDirection, setEdges, setNodes, sourceHandleId, sourceNodeId]
    );

    if (!isOpen) return null;

    return (
        <EdgeDropNodePicker
            position={screenPosition}
            flowPosition={flowPosition}
            sourceDataType={sourceDataType}
            sourceNodeId={sourceNodeId}
            handleDirection={handleDirection}
            onNodeSelect={handleNodeSelect}
            onQuickCreate={handleQuickCreate}
            onQuickCreateExpression={handleQuickCreateExpression}
            onClose={close}
        />
    );
});
