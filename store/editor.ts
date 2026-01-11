import { create } from 'zustand';
import {
    type Node,
    type Edge,
    type OnNodesChange,
    type OnEdgesChange,
    type OnConnect,
    applyNodeChanges,
    applyEdgeChanges,
    addEdge,
    type Connection,
    getNodesBounds,
} from '@xyflow/react';
import { MATERIAL_NODE_TYPES } from '@/lib/nodes';
import { TSLNodeData, NodeType, SubgraphDefinition, SubgraphPort } from '@/lib/types';

// Graph save format
export interface GraphData {
    version: number;
    nodes: Node<TSLNodeData>[];
    edges: Edge[];
    // Subgraph definitions
    subgraphs?: Record<string, SubgraphDefinition>;
}

// Editor mode - main graph or editing a subgraph
export type EditorMode = 'main' | 'subgraph';

const GRAPH_VERSION = 1;
const STORAGE_KEY = 'tsl-editor-graph';

interface EditorState {
    nodes: Node<TSLNodeData>[];
    edges: Edge[];
    selectedNodeId: string | null;
    selectedNodeIds: string[]; // For multi-selection

    // Subgraph state
    subgraphs: Record<string, SubgraphDefinition>;
    editorMode: EditorMode;
    editingSubgraphId: string | null;
    // When editing, store the main graph state and which nodes were selected
    mainGraphBackup: {
        nodes: Node<TSLNodeData>[];
        edges: Edge[];
        originalNodeIds: string[];  // Nodes to be replaced with subgraph instance
    } | null;

    onNodesChange: OnNodesChange<Node<TSLNodeData>>;
    onEdgesChange: OnEdgesChange;
    onConnect: OnConnect;

    addNode: (type: NodeType, position: { x: number; y: number }, data?: Partial<TSLNodeData>) => boolean;
    updateNodeValue: (nodeId: string, key: string, value: unknown) => void;
    deleteNode: (nodeId: string) => void;
    setSelectedNode: (nodeId: string | null) => void;
    setSelectedNodes: (nodeIds: string[]) => void;
    getSelectedNode: () => Node<TSLNodeData> | undefined;
    getSelectedNodes: () => Node<TSLNodeData>[];

    // Save/Load
    saveToJSON: () => string;
    loadFromJSON: (json: string) => boolean;
    saveToLocalStorage: () => void;
    loadFromLocalStorage: () => boolean;
    clearGraph: () => void;

    // Helper to check if a material node exists
    hasMaterialNode: () => boolean;
    getMaterialNode: () => Node<TSLNodeData> | undefined;

    // Subgraph actions
    createSubgraph: (name: string, selectedNodeIds: string[]) => string | null;
    enterSubgraphEditor: (subgraphId: string) => boolean;
    exitSubgraphEditor: (save: boolean, nameOverride?: string) => void;
    updateSubgraphDefinition: (subgraphId: string, updates: Partial<SubgraphDefinition>) => void;
    deleteSubgraph: (subgraphId: string) => void;
    addDynamicPort: (nodeId: string, port: SubgraphPort) => void;
    removeDynamicPort: (nodeId: string, portId: string) => void;
    updateDynamicPort: (nodeId: string, portId: string, updates: Partial<SubgraphPort>) => void;
    getSubgraph: (id: string) => SubgraphDefinition | undefined;
    isSubgraphMode: () => boolean;
}

export const useEditorStore = create<EditorState>((set, get) => ({
    nodes: [],
    edges: [],
    selectedNodeId: null,
    selectedNodeIds: [],

    // Subgraph state initialization
    subgraphs: {},
    editorMode: 'main',
    editingSubgraphId: null,
    mainGraphBackup: null,

    onNodesChange: (changes) => {
        // Prevent deletion of subgraph anchor nodes
        const filteredChanges = changes.filter(change => {
            if (change.type === 'remove') {
                const nodeId = change.id;
                if (nodeId === 'subgraph-input' || nodeId === 'subgraph-output') {
                    return false; // Block deletion of anchor nodes
                }
            }
            return true;
        });
        set({
            nodes: applyNodeChanges(filteredChanges, get().nodes),
        });
    },

    onEdgesChange: (changes) => {
        set({
            edges: applyEdgeChanges(changes, get().edges),
        });
    },

    onConnect: (connection: Connection) => {
        const { edges } = get();

        // Remove any existing connection to the same target handle
        // (inputs can only have one connection, so replace the old one)
        const filteredEdges = edges.filter(
            (edge) => !(edge.target === connection.target && edge.targetHandle === connection.targetHandle)
        );

        set({
            edges: addEdge(connection, filteredEdges),
        });
    },

    addNode: (type, position, data = {}) => {
        const isMaterialNode = (MATERIAL_NODE_TYPES as readonly string[]).includes(type);

        // If trying to add a material node, check if one already exists
        if (isMaterialNode) {
            const existingMaterial = get().nodes.find(n =>
                (MATERIAL_NODE_TYPES as readonly string[]).includes(n.data.type)
            );

            if (existingMaterial) {
                // Remove the existing material node and its edges
                set({
                    nodes: get().nodes.filter(n => n.id !== existingMaterial.id),
                    edges: get().edges.filter(
                        e => e.source !== existingMaterial.id && e.target !== existingMaterial.id
                    ),
                });
            }
        }

        const id = `${type}-${Date.now()}`;
        const newNode: Node<TSLNodeData> = {
            id,
            type,
            position,
            data: {
                type,
                values: {},
                connected: {},
                ...data,
            },
        };
        set({ nodes: [...get().nodes, newNode] });
        return true;
    },

    updateNodeValue: (nodeId, key, value) => {
        set({
            nodes: get().nodes.map((node) =>
                node.id === nodeId
                    ? {
                        ...node,
                        data: {
                            ...node.data,
                            values: { ...node.data.values, [key]: value as import('@/lib/nodes/definitions').TSLValueType },
                        },
                    }
                    : node
            ),
        });
    },

    deleteNode: (nodeId) => {
        set({
            nodes: get().nodes.filter((node) => node.id !== nodeId),
            edges: get().edges.filter(
                (edge) => edge.source !== nodeId && edge.target !== nodeId
            ),
            // Clear selection if the deleted node was selected
            selectedNodeId: get().selectedNodeId === nodeId ? null : get().selectedNodeId,
        });
    },

    setSelectedNode: (nodeId) => {
        set({ selectedNodeId: nodeId });
    },

    getSelectedNode: () => {
        const { nodes, selectedNodeId } = get();
        return nodes.find((n) => n.id === selectedNodeId);
    },

    setSelectedNodes: (nodeIds: string[]) => {
        set({
            selectedNodeIds: nodeIds,
            // Also update single selection to first node if any
            selectedNodeId: nodeIds.length === 1 ? nodeIds[0] : (nodeIds.length > 1 ? null : get().selectedNodeId),
        });
    },

    getSelectedNodes: () => {
        const { nodes, selectedNodeIds } = get();
        return nodes.filter((n) => selectedNodeIds.includes(n.id));
    },

    // Save graph to JSON string
    saveToJSON: () => {
        const graphData: GraphData = {
            version: GRAPH_VERSION,
            nodes: get().nodes,
            edges: get().edges,
            subgraphs: get().subgraphs,
        };
        return JSON.stringify(graphData, null, 2);
    },

    // Load graph from JSON string
    loadFromJSON: (json: string) => {
        try {
            const data = JSON.parse(json) as GraphData;
            if (data.version && data.nodes && data.edges) {
                set({
                    nodes: data.nodes,
                    edges: data.edges,
                    subgraphs: data.subgraphs || {},
                });
                return true;
            }
            return false;
        } catch {
            return false;
        }
    },

    // Save to localStorage
    saveToLocalStorage: () => {
        const json = get().saveToJSON();
        localStorage.setItem(STORAGE_KEY, json);
    },

    // Load from localStorage
    loadFromLocalStorage: () => {
        const json = localStorage.getItem(STORAGE_KEY);
        if (json) {
            return get().loadFromJSON(json);
        }
        return false;
    },

    // Clear the graph
    clearGraph: () => {
        set({ nodes: [], edges: [] });
    },

    hasMaterialNode: () => {
        return get().nodes.some(n => (MATERIAL_NODE_TYPES as readonly string[]).includes(n.data.type));
    },

    getMaterialNode: () => {
        return get().nodes.find(n => (MATERIAL_NODE_TYPES as readonly string[]).includes(n.data.type));
    },

    // Subgraph actions

    createSubgraph: (name: string, selectedNodeIds: string[]) => {
        if (selectedNodeIds.length === 0) return null;

        const { nodes, edges } = get();
        const selectedNodes = nodes.filter(n => selectedNodeIds.includes(n.id));

        if (selectedNodes.length === 0) return null;

        // Validate: material nodes cannot be part of a subgraph
        const hasMaterialNode = selectedNodes.some(n =>
            (MATERIAL_NODE_TYPES as readonly string[]).includes(n.data.type)
        );
        if (hasMaterialNode) {
            console.warn('Cannot create subgraph: Material nodes cannot be included in a subgraph.');
            return null;
        }

        // Get edges that are internal to the selected nodes
        const internalEdges = edges.filter(
            e => selectedNodeIds.includes(e.source) && selectedNodeIds.includes(e.target)
        );

        // Calculate bounding box of selected nodes using React Flow helper
        const NODE_WIDTH = 180; // Approximate anchor node width
        const PADDING = 100; // Padding between anchor nodes and content

        const bounds = getNodesBounds(selectedNodes);

        // Position anchor nodes based on bounding box
        const centerY = bounds.y + bounds.height / 2 - 50; // Center vertically (50 = half node height)
        const inputNodePosition = { x: bounds.x - NODE_WIDTH - PADDING, y: centerY };
        const outputNodePosition = { x: bounds.x + bounds.width + PADDING, y: centerY };

        // Generate unique ID
        const id = `custom/${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`;

        // Create subgraph definition
        const subgraph: SubgraphDefinition = {
            id,
            name,
            inputs: [{ id: 'in_0', label: 'Input 1', type: 'any' }],
            outputs: [{ id: 'out_0', label: 'Output 1', type: 'any' }],
            nodes: selectedNodes.map(n => ({ ...n })), // Clone nodes
            edges: internalEdges.map(e => ({ ...e })), // Clone edges
            inputNodePosition,
            outputNodePosition,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        set({
            subgraphs: { ...get().subgraphs, [id]: subgraph },
        });

        return id;
    },

    enterSubgraphEditor: (subgraphId: string) => {
        const subgraph = get().subgraphs[subgraphId];
        if (!subgraph) return false;

        // Backup current main graph
        const { nodes, edges } = get();

        // Get the IDs of the original nodes that will be replaced
        const originalNodeIds = subgraph.nodes.map(n => n.id);

        // Create input anchor node (use stored position or calculate fallback)
        const inputNode: Node<TSLNodeData> = {
            id: 'subgraph-input',
            type: 'subgraph/input',
            position: subgraph.inputNodePosition || { x: 0, y: 200 },
            data: {
                type: 'subgraph/input',
                values: {},
                connected: {},
                dynamicPorts: subgraph.inputs,
            },
        };

        // Create output anchor node (use stored position or calculate fallback)
        const outputNode: Node<TSLNodeData> = {
            id: 'subgraph-output',
            type: 'subgraph/output',
            position: subgraph.outputNodePosition || { x: 600, y: 200 },
            data: {
                type: 'subgraph/output',
                values: {},
                connected: {},
                dynamicPorts: subgraph.outputs,
            },
        };

        set({
            mainGraphBackup: { nodes, edges, originalNodeIds },
            editorMode: 'subgraph',
            editingSubgraphId: subgraphId,
            nodes: [inputNode, outputNode, ...subgraph.nodes],
            edges: [...subgraph.edges],
            selectedNodeId: null,
        });

        return true;
    },

    exitSubgraphEditor: (save: boolean, nameOverride?: string) => {
        const { mainGraphBackup, editingSubgraphId, nodes, edges, subgraphs } = get();

        if (!mainGraphBackup || !editingSubgraphId) return;

        if (save) {
            // Save the current editor state back to subgraph definition
            const inputNode = nodes.find(n => n.id === 'subgraph-input');
            const outputNode = nodes.find(n => n.id === 'subgraph-output');

            const inputPorts = inputNode?.data.dynamicPorts || [];
            const outputPorts = outputNode?.data.dynamicPorts || [];

            // Validation: Check for at least one input and one output
            if (inputPorts.length === 0) {
                console.warn('Subgraph Warning: No input ports defined. Consider adding at least one input.');
            }
            if (outputPorts.length === 0) {
                console.warn('Subgraph Warning: No output ports defined. Consider adding at least one output.');
            }

            // Check which ports are connected
            const connectedInputPorts = new Set(
                edges.filter(e => e.source === 'subgraph-input').map(e => e.sourceHandle)
            );
            const connectedOutputPorts = new Set(
                edges.filter(e => e.target === 'subgraph-output').map(e => e.targetHandle)
            );

            // Warn about unconnected ports
            for (const port of inputPorts) {
                if (!connectedInputPorts.has(port.id)) {
                    console.warn(`Subgraph Warning: Input port "${port.label}" is not connected to any internal node.`);
                }
            }
            for (const port of outputPorts) {
                if (!connectedOutputPorts.has(port.id)) {
                    console.warn(`Subgraph Warning: Output port "${port.label}" is not connected to any internal node.`);
                }
            }

            // Filter out anchor nodes from internal nodes
            const internalNodes = nodes.filter(
                n => n.id !== 'subgraph-input' && n.id !== 'subgraph-output'
            );

            // Keep all edges including those connected to anchor nodes so we preserve inputs/outputs wiring
            const internalEdges = edges;

            const updatedSubgraph: SubgraphDefinition = {
                ...subgraphs[editingSubgraphId],
                inputs: inputPorts,
                outputs: outputPorts,
                nodes: internalNodes,
                edges: internalEdges,
                inputNodePosition: inputNode?.position,
                outputNodePosition: outputNode?.position,
                updatedAt: Date.now(),
            };

            if (nameOverride) {
                updatedSubgraph.name = nameOverride;
            }

            // First, save the subgraph definition and exit editor mode
            // This updates the subgraphs state which triggers nodeTypes to update
            set({
                subgraphs: { ...subgraphs, [editingSubgraphId]: updatedSubgraph },
                editorMode: 'main',
                editingSubgraphId: null,
            });

            // Prepare instance node data for deferred creation
            const originalNodeIds = mainGraphBackup.originalNodeIds;
            const originalNodes = mainGraphBackup.nodes.filter(n => originalNodeIds.includes(n.id));
            const subgraphIdForInstance = editingSubgraphId;
            const backupNodes = mainGraphBackup.nodes;
            const backupEdges = mainGraphBackup.edges;

            if (originalNodes.length > 0) {
                // Calculate center position of original nodes
                const avgX = originalNodes.reduce((sum, n) => sum + n.position.x, 0) / originalNodes.length;
                const avgY = originalNodes.reduce((sum, n) => sum + n.position.y, 0) / originalNodes.length;

                // Create the subgraph instance node
                const instanceId = `${subgraphIdForInstance}-instance-${Date.now()}`;
                const instanceNode: Node<TSLNodeData> = {
                    id: instanceId,
                    type: subgraphIdForInstance as NodeType, // The subgraph ID becomes the node type
                    position: { x: avgX, y: avgY },
                    data: {
                        type: subgraphIdForInstance as NodeType,
                        values: {},
                        connected: {},
                        // Store the subgraph inputs/outputs for rendering
                        dynamicPorts: [...inputPorts, ...outputPorts],
                    },
                };

                // Filter out original nodes
                const newNodes = backupNodes.filter(n => !originalNodeIds.includes(n.id));
                newNodes.push(instanceNode);

                // Rewire external edges to the instance node
                const newEdges = backupEdges
                    .filter(e => {
                        const sourceIsOriginal = originalNodeIds.includes(e.source);
                        const targetIsOriginal = originalNodeIds.includes(e.target);
                        return !(sourceIsOriginal && targetIsOriginal);
                    })
                    .map(e => {
                        const sourceIsOriginal = originalNodeIds.includes(e.source);
                        const targetIsOriginal = originalNodeIds.includes(e.target);

                        if (targetIsOriginal && !sourceIsOriginal) {
                            const inputPortIndex = inputPorts.findIndex((_, i) => i === 0);
                            return {
                                ...e,
                                target: instanceId,
                                targetHandle: inputPorts[inputPortIndex]?.id || 'in_0',
                            };
                        } else if (sourceIsOriginal && !targetIsOriginal) {
                            return {
                                ...e,
                                source: instanceId,
                                sourceHandle: outputPorts[0]?.id || 'out_0',
                            };
                        }
                        return e;
                    });

                // Use setTimeout to defer adding the instance node
                // This ensures React Flow has registered the new nodeType first
                setTimeout(() => {
                    set({
                        nodes: newNodes,
                        edges: newEdges,
                        mainGraphBackup: null,
                        selectedNodeId: null,
                        selectedNodeIds: [],
                    });
                }, 0);
                return;
            }

            // No original nodes - just restore backup and clear
            set({
                nodes: backupNodes,
                edges: backupEdges,
                mainGraphBackup: null,
                selectedNodeId: null,
                selectedNodeIds: [],
            });
            return;
        }

        // Restore main graph (fallback for cancel)
        set({
            nodes: mainGraphBackup.nodes,
            edges: mainGraphBackup.edges,
            mainGraphBackup: null,
            editorMode: 'main',
            editingSubgraphId: null,
            selectedNodeId: null,
            selectedNodeIds: [],
        });
    },

    updateSubgraphDefinition: (subgraphId: string, updates: Partial<SubgraphDefinition>) => {
        const subgraph = get().subgraphs[subgraphId];
        if (!subgraph) return;

        set({
            subgraphs: {
                ...get().subgraphs,
                [subgraphId]: { ...subgraph, ...updates, updatedAt: Date.now() },
            },
        });
    },

    deleteSubgraph: (subgraphId: string) => {
        const { [subgraphId]: _, ...rest } = get().subgraphs;
        set({ subgraphs: rest });
    },

    addDynamicPort: (nodeId: string, port: SubgraphPort) => {
        set({
            nodes: get().nodes.map(node =>
                node.id === nodeId
                    ? {
                        ...node,
                        data: {
                            ...node.data,
                            dynamicPorts: [...(node.data.dynamicPorts || []), port],
                        },
                    }
                    : node
            ),
        });
    },

    removeDynamicPort: (nodeId: string, portId: string) => {
        set({
            nodes: get().nodes.map(node =>
                node.id === nodeId
                    ? {
                        ...node,
                        data: {
                            ...node.data,
                            dynamicPorts: (node.data.dynamicPorts || []).filter(p => p.id !== portId),
                        },
                    }
                    : node
            ),
        });
    },

    updateDynamicPort: (nodeId: string, portId: string, updates: Partial<SubgraphPort>) => {
        set({
            nodes: get().nodes.map(node =>
                node.id === nodeId
                    ? {
                        ...node,
                        data: {
                            ...node.data,
                            dynamicPorts: (node.data.dynamicPorts || []).map(p =>
                                p.id === portId ? { ...p, ...updates } : p
                            ),
                        },
                    }
                    : node
            ),
        });
    },

    getSubgraph: (id: string) => {
        return get().subgraphs[id];
    },

    isSubgraphMode: () => {
        return get().editorMode === 'subgraph';
    },
}));
