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
} from '@xyflow/react';
import { TSLNodeData } from '@/components/TSLNode';
import { MATERIAL_NODE_TYPES } from '@/lib/nodes';

// Graph save format
export interface GraphData {
    version: number;
    nodes: Node<TSLNodeData>[];
    edges: Edge[];
}

const GRAPH_VERSION = 1;
const STORAGE_KEY = 'tsl-editor-graph';

interface EditorState {
    nodes: Node<TSLNodeData>[];
    edges: Edge[];

    onNodesChange: OnNodesChange<Node<TSLNodeData>>;
    onEdgesChange: OnEdgesChange;
    onConnect: OnConnect;

    addNode: (type: string, position: { x: number; y: number }, data?: Partial<TSLNodeData>) => boolean;
    updateNodeValue: (nodeId: string, key: string, value: unknown) => void;
    deleteNode: (nodeId: string) => void;

    // Save/Load
    saveToJSON: () => string;
    loadFromJSON: (json: string) => boolean;
    saveToLocalStorage: () => void;
    loadFromLocalStorage: () => boolean;
    clearGraph: () => void;

    // Helper to check if a material node exists
    hasMaterialNode: () => boolean;
    getMaterialNode: () => Node<TSLNodeData> | undefined;
}

export const useEditorStore = create<EditorState>((set, get) => ({
    nodes: [],
    edges: [],

    onNodesChange: (changes) => {
        set({
            nodes: applyNodeChanges(changes, get().nodes),
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
        const isMaterialNode = MATERIAL_NODE_TYPES.includes(type);

        // If trying to add a material node, check if one already exists
        if (isMaterialNode) {
            const existingMaterial = get().nodes.find(n =>
                MATERIAL_NODE_TYPES.includes(n.data.type)
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
                            values: { ...node.data.values, [key]: value },
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
        });
    },

    // Save graph to JSON string
    saveToJSON: () => {
        const graphData: GraphData = {
            version: GRAPH_VERSION,
            nodes: get().nodes,
            edges: get().edges,
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
        return get().nodes.some(n => MATERIAL_NODE_TYPES.includes(n.data.type));
    },

    getMaterialNode: () => {
        return get().nodes.find(n => MATERIAL_NODE_TYPES.includes(n.data.type));
    },
}));
