import { create } from 'zustand';
import posthog from 'posthog-js';
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
import { getAbsolutePosition, getErrorMessage } from '@/lib/utils';
import { MATERIAL_NODE_TYPES } from '@/lib/nodes';
import { TSLNodeData, NodeType, SubgraphDefinition, SubgraphPort, CodeNodeDefinition, TSLValueType } from '@/lib/types';
import { toast } from 'sonner';

// Preview mesh type
export type PreviewMeshType = 'box' | 'sphere' | 'torus' | 'plane' | 'cylinder';

// Geometry configuration
export interface GeometryConfig {
    // Box
    width?: number;
    height?: number;
    depth?: number;
    widthSegments?: number;
    heightSegments?: number;
    depthSegments?: number;

    // Sphere
    radius?: number;
    widthSegmentsSphere?: number;
    heightSegmentsSphere?: number;

    // Torus
    radiusTorus?: number;
    tube?: number;
    radialSegments?: number;
    tubularSegments?: number;

    // Plane
    widthPlane?: number;
    heightPlane?: number;
    widthSegmentsPlane?: number;
    heightSegmentsPlane?: number;

    // Cylinder
    radiusTop?: number;
    radiusBottom?: number;
    heightCylinder?: number;
    radialSegmentsCylinder?: number;
    heightSegmentsCylinder?: number;
    openEnded?: boolean;
}

// Preview settings interface
export interface PreviewSettings {
    mesh: PreviewMeshType;
    config: GeometryConfig;
    isInstanced: boolean;
    instanceCount: number;
    environment?: string;
    environmentIntensity?: number;
    showEnvironmentBackground?: boolean;
}

// Graph save format
export interface GraphData {
    version: number;
    nodes: Node<TSLNodeData>[];
    edges: Edge[];
    // Subgraph definitions
    subgraphs?: Record<string, SubgraphDefinition>;
    // Code node definitions
    codeNodes?: Record<string, CodeNodeDefinition>;
    // Preview settings
    previewSettings?: PreviewSettings;
}

// Editor mode - main graph or editing a subgraph
export type EditorMode = 'main' | 'subgraph';

const GRAPH_VERSION = 1;
const STORAGE_KEY = 'tsl-editor-graph';


interface SubgraphStackItem {
    nodes: Node<TSLNodeData>[];
    edges: Edge[];
    originalNodeIds: string[];
    subgraphId: string | null; // The ID of the subgraph we were editing (or null for main graph)
    history: HistoryState; // Preserve history of the parent graph
}

interface Snapshot {
    nodes: Node<TSLNodeData>[];
    edges: Edge[];
    subgraphs: Record<string, SubgraphDefinition>;
}

interface HistoryState {
    past: Snapshot[];
    future: Snapshot[];
}

// Strip transient fields (like selection) from nodes for history
const stripTransientFields = (nodes: Node<TSLNodeData>[]): Node<TSLNodeData>[] => {
    return nodes.map(node => ({
        ...node,
        selected: false, // Don't store selection state
    }));
};


interface EditorState {
    nodes: Node<TSLNodeData>[];
    edges: Edge[];
    selectedNodeId: string | null;
    selectedNodeIds: string[]; // For multi-selection
    graphStructureVersion: number;

    // Subgraph state
    subgraphs: Record<string, SubgraphDefinition>;
    editorMode: EditorMode;
    editingSubgraphId: string | null;

    // Code nodes state
    codeNodes: Record<string, CodeNodeDefinition>;

    // Canvas Mode
    canvasMode: 'pan' | 'select';
    setCanvasMode: (mode: 'pan' | 'select') => void;

    // Debug Mode - controls node preview visibility
    debugMode: boolean;
    setDebugMode: (mode: boolean) => void;

    // Preview settings
    previewSettings: PreviewSettings;
    updatePreviewSettings: (updates: Partial<PreviewSettings>) => void;

    // History state
    history: HistoryState;
    isUndoRedoInProgress: boolean;

    // Stack for nested subgraph editing
    subgraphStack: SubgraphStackItem[];

    // Auto-save state
    autoSaveCallback: (() => Promise<void>) | null;
    isSaving: boolean;
    isDirty: boolean; // True when there are unsaved changes
    autoSaveEnabled: boolean;

    // Project ID for asset management
    projectId: string | null;

    // Template callbacks (for async DB operations)
    onSubgraphTemplateCreate: ((subgraph: SubgraphDefinition) => Promise<{ templateId: string; version: number }>) | null;
    onSubgraphTemplateUpdate: ((templateId: string, subgraph: SubgraphDefinition) => Promise<{ version: number }>) | null;
    onCodeNodeTemplateCreate: ((codeNode: CodeNodeDefinition) => Promise<{ templateId: string; version: number }>) | null;
    onCodeNodeTemplateUpdate: ((templateId: string, codeNode: CodeNodeDefinition) => Promise<{ version: number }>) | null;
    setTemplateCallbacks: (callbacks: {
        onSubgraphTemplateCreate?: (subgraph: SubgraphDefinition) => Promise<{ templateId: string; version: number }>;
        onSubgraphTemplateUpdate?: (templateId: string, subgraph: SubgraphDefinition) => Promise<{ version: number }>;
        onCodeNodeTemplateCreate?: (codeNode: CodeNodeDefinition) => Promise<{ templateId: string; version: number }>;
        onCodeNodeTemplateUpdate?: (templateId: string, codeNode: CodeNodeDefinition) => Promise<{ version: number }>;
    }) => void;
    setAutoSaveCallback: (callback: (() => Promise<void>) | null) => void;
    setProjectId: (projectId: string | null) => void;
    triggerAutoSave: () => void;
    markDirty: () => void;

    onNodesChange: OnNodesChange<Node<TSLNodeData>>;
    onEdgesChange: OnEdgesChange;
    onConnect: OnConnect;

    addNode: (type: NodeType, position: { x: number; y: number }, data?: Partial<TSLNodeData>) => boolean;
    updateNodeValue: (nodeId: string, key: string, value: TSLValueType) => void;
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

    // History actions
    takeSnapshot: () => void;
    undo: () => void;
    redo: () => void;
    clearHistory: () => void;

    // Group actions
    groupNodes: () => void;
    ungroupNodes: () => void;


    // Subgraph actions
    createSubgraph: (name: string, selectedNodeIds: string[]) => string | null;
    enterSubgraphEditor: (subgraphId: string) => boolean;
    exitSubgraphEditor: (save: boolean, nameOverride?: string) => Promise<void>;
    updateSubgraphDefinition: (subgraphId: string, updates: Partial<SubgraphDefinition>) => void;
    addSubgraphDefinition: (subgraph: SubgraphDefinition) => void;
    deleteSubgraph: (subgraphId: string) => void;
    addDynamicPort: (nodeId: string, port: SubgraphPort) => void;
    removeDynamicPort: (nodeId: string, portId: string) => void;
    updateDynamicPort: (nodeId: string, portId: string, updates: Partial<SubgraphPort>) => void;
    getSubgraph: (id: string) => SubgraphDefinition | undefined;
    isSubgraphMode: () => boolean;

    // Code node actions
    createCodeNode: (name: string, code: string, inputs: SubgraphPort[], output: SubgraphPort) => Promise<string | null>;
    updateCodeNode: (id: string, updates: Partial<CodeNodeDefinition>) => void;
    addCodeNodeDefinition: (codeNode: CodeNodeDefinition) => void;
    deleteCodeNode: (id: string) => void;
    getCodeNode: (id: string) => CodeNodeDefinition | undefined;

    // Reset entire store
    resetEditor: () => void;
    // Track event helper
    trackEvent: (event: string, properties?: Record<string, any>) => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
    trackEvent: (event, properties) => {
        posthog.capture(event, properties);
    },
    nodes: [],
    edges: [],
    selectedNodeId: null,
    selectedNodeIds: [],
    graphStructureVersion: 0,

    // Preview settings
    previewSettings: {
        mesh: 'sphere' as PreviewMeshType,
        isInstanced: false,
        instanceCount: 100,
        environment: 'studio',
        environmentIntensity: 1,
        showEnvironmentBackground: false,
        config: {
            // Defaults with low resolution as requested
            // Box
            width: 1.5,
            height: 1.5,
            depth: 1.5,
            widthSegments: 1,
            heightSegments: 1,
            depthSegments: 1,

            // Sphere
            radius: 1,
            widthSegmentsSphere: 32,
            heightSegmentsSphere: 16,

            // Torus
            radiusTorus: 0.8,
            tube: 0.3,
            radialSegments: 16,
            tubularSegments: 32,

            // Plane
            widthPlane: 1,
            heightPlane: 1,
            widthSegmentsPlane: 1,
            heightSegmentsPlane: 1,

            // Cylinder
            radiusTop: 1,
            radiusBottom: 1,
            heightCylinder: 1,
            radialSegmentsCylinder: 20,
            heightSegmentsCylinder: 20,
            openEnded: true,
        }
    },
    updatePreviewSettings: (updates) => {
        set({ previewSettings: { ...get().previewSettings, ...updates } });
        get().markDirty();
    },

    // Subgraph state initialization
    subgraphs: {},
    editorMode: 'main',
    editingSubgraphId: null,
    subgraphStack: [],

    // Auto-save state initialization
    autoSaveCallback: null,
    isSaving: false,
    isDirty: false,
    autoSaveEnabled: true,

    // Project ID initialization
    projectId: null,

    // Template callbacks initialization
    onSubgraphTemplateCreate: null,
    onSubgraphTemplateUpdate: null,
    onCodeNodeTemplateCreate: null,
    onCodeNodeTemplateUpdate: null,

    // Code nodes initialization
    codeNodes: {},

    // Canvas Mode
    canvasMode: 'pan',
    setCanvasMode: (mode) => set({ canvasMode: mode }),

    // Debug Mode - off by default
    debugMode: false,
    setDebugMode: (mode) => set({ debugMode: mode }),

    // History initialization
    history: { past: [], future: [] },
    isUndoRedoInProgress: false,

    // Auto-save methods
    setAutoSaveCallback: (callback) => set({ autoSaveCallback: callback }),
    setProjectId: (projectId) => {
        const currentId = get().projectId;
        if (currentId !== projectId && projectId) {
            posthog.capture('project_opened', { project_id: projectId });
        }
        set({ projectId });
    },

    // Template callbacks setter
    setTemplateCallbacks: (callbacks) => set({
        onSubgraphTemplateCreate: callbacks.onSubgraphTemplateCreate ?? null,
        onSubgraphTemplateUpdate: callbacks.onSubgraphTemplateUpdate ?? null,
        onCodeNodeTemplateCreate: callbacks.onCodeNodeTemplateCreate ?? null,
        onCodeNodeTemplateUpdate: callbacks.onCodeNodeTemplateUpdate ?? null,
    }),

    markDirty: () => {
        set({ isDirty: true });
        // Trigger auto-save when marked dirty
        useEditorStore.getState().triggerAutoSave();
    },

    triggerAutoSave: (() => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        return () => {
            const state = useEditorStore.getState();
            if (!state.autoSaveEnabled || !state.autoSaveCallback) return;

            // If already saving, just ensure dirty flag is set and exit
            // The completion handler will pick it up
            if (state.isSaving) {
                if (!state.isDirty) {
                    useEditorStore.setState({ isDirty: true });
                }
                return;
            }

            // If not dirty, nothing to save
            if (!state.isDirty) return;

            // Clear any pending save
            if (timeoutId) {
                clearTimeout(timeoutId);
            }

            // Debounce: wait 2 seconds before saving
            timeoutId = setTimeout(async () => {
                const currentState = useEditorStore.getState();

                // Double-check we're not already saving (race condition guard)
                if (currentState.isSaving) {
                    return;
                }

                if (!currentState.isDirty) return;

                // Clear dirty flag BEFORE starting save - this captures the current state.
                // If changes happen during the save, markDirty() will set isDirty: true again,
                // and the follow-up check will trigger another save.
                useEditorStore.setState({ isSaving: true, isDirty: false });

                try {
                    await currentState.autoSaveCallback?.();

                    // Track save
                    if (currentState.projectId) {
                        posthog.capture('project_saved', { project_id: currentState.projectId });
                    }

                    useEditorStore.setState({ isSaving: false });

                    // Immediately check if more changes occurred during save
                    // Use a small delay to ensure state is settled
                    setTimeout(() => {
                        const afterSaveState = useEditorStore.getState();
                        if (afterSaveState.isDirty && !afterSaveState.isSaving) {
                            afterSaveState.triggerAutoSave();
                        }
                    }, 100);
                } catch (error) {
                    console.error('Auto-save failed:', error);
                    // Re-mark as dirty since save failed - the original changes weren't persisted
                    useEditorStore.setState({ isSaving: false, isDirty: true });

                    // On error, retry after a delay
                    setTimeout(() => {
                        const afterErrorState = useEditorStore.getState();
                        if (afterErrorState.isDirty && !afterErrorState.isSaving) {
                            afterErrorState.triggerAutoSave();
                        }
                    }, 1000);
                }
            }, 2000);
        };
    })(),

    onNodesChange: (changes) => {
        const hasStructuralChange = changes.some(change => {
            if (change.type === 'remove') return true;
            if (change.type === 'add') return true;
            // if (change.type === 'reset') return true;
            // Position and selection don't count as structural changes
            if (change.type === 'position' || change.type === 'select') return false;
            // Dimensions changes might affect layout but not material building
            if (change.type === 'dimensions') return false;
            return true; // Other changes (like data updates) are structural
        });

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
        // Check if this is a saveable change (anything except selection)
        const hasSaveableChange = changes.some(change => change.type !== 'select');

        set({
            nodes: applyNodeChanges(filteredChanges, get().nodes),
            graphStructureVersion: hasStructuralChange ? get().graphStructureVersion + 1 : get().graphStructureVersion,
        });

        // Mark dirty for auto-save
        if (hasSaveableChange) {
            get().markDirty();
        }
    },

    onEdgesChange: (changes) => {
        const hasStructuralChange = changes.some(change => {
            return change.type !== 'select';
        });
        // Check if this is a saveable change (anything except selection)
        const hasSaveableChange = changes.some(change => change.type !== 'select');

        set({
            edges: applyEdgeChanges(changes, get().edges),
            graphStructureVersion: hasStructuralChange ? get().graphStructureVersion + 1 : get().graphStructureVersion,
        });

        // Mark dirty for auto-save
        if (hasSaveableChange) {
            get().markDirty();
        }
    },

    onConnect: (connection: Connection) => {
        // Snapshot before connecting
        get().takeSnapshot();

        const { edges } = get();

        // Remove any existing connection to the same target handle
        // (inputs can only have one connection, so replace the old one)
        const filteredEdges = edges.filter(
            (edge) => {
                const sameTarget = edge.target === connection.target;
                const sameHandle = (edge.targetHandle || null) === (connection.targetHandle || null);
                return !(sameTarget && sameHandle);
            }
        );


        set({
            edges: addEdge(connection, filteredEdges),
            graphStructureVersion: get().graphStructureVersion + 1,
        });

        get().markDirty();
    },

    addNode: (type, position, data = {}) => {
        get().takeSnapshot();
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

        // Set default value for InstanceCount node based on current store state
        if (type === 'geo/instanceCount') {
            const { previewSettings } = get();
            const initialCount = previewSettings.isInstanced ? previewSettings.instanceCount : 1;
            data.values = { value: initialCount, ...data.values };
        }

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
        set({ nodes: [...get().nodes, newNode], graphStructureVersion: get().graphStructureVersion + 1 });
        get().markDirty();

        posthog.capture('node_added', {
            node_type: type,
            project_id: get().projectId
        });

        return true;
    },

    updateNodeValue: (nodeId, key, value) => {
        get().takeSnapshot();
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
            graphStructureVersion: get().graphStructureVersion + 1,
        });
        get().markDirty();
    },

    deleteNode: (nodeId) => {
        get().takeSnapshot();
        set({
            nodes: get().nodes.filter((node) => node.id !== nodeId),
            edges: get().edges.filter(
                (edge) => edge.source !== nodeId && edge.target !== nodeId
            ),
            // Clear selection if the deleted node was selected
            selectedNodeId: get().selectedNodeId === nodeId ? null : get().selectedNodeId,
            graphStructureVersion: get().graphStructureVersion + 1,
        });
        get().markDirty();
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
        const { nodes, edges, subgraphs, codeNodes, editorMode, subgraphStack, editingSubgraphId } = get();

        let nodesToSave = nodes;
        let edgesToSave = edges;
        const subgraphsToSave = { ...subgraphs };

        // If we are in subgraph mode, we need to:
        // 1. Update the 'subgraphs' map with the current state of nested subgraphs
        // 2. Use the root graph (from the bottom of the stack) as the main nodes/edges
        if (editorMode === 'subgraph' && subgraphStack.length > 0) {
            // Updated current subgraph definition
            if (editingSubgraphId) {
                // Filter out anchor nodes for the definition
                const internalNodes = nodes.filter(
                    n => n.id !== 'subgraph-input' && n.id !== 'subgraph-output'
                );

                // Get input/output ports from anchor nodes
                const inputNode = nodes.find(n => n.id === 'subgraph-input');
                const outputNode = nodes.find(n => n.id === 'subgraph-output');

                subgraphsToSave[editingSubgraphId] = {
                    ...subgraphsToSave[editingSubgraphId],
                    nodes: internalNodes,
                    edges: edges, // Save all edges
                    inputNodePosition: inputNode?.position,
                    outputNodePosition: outputNode?.position,
                    updatedAt: Date.now(),
                    inputs: inputNode?.data.dynamicPorts || subgraphsToSave[editingSubgraphId].inputs,
                    outputs: outputNode?.data.dynamicPorts || subgraphsToSave[editingSubgraphId].outputs,
                };
            }

            // Update definitions for intermediate subgraphs in the stack
            // The stack contains the state of the graph *before* entering the next level.
            // But if that state was "inside a subgraph", we need to update that subgraph's definition too.
            // Stack items are ordered: [Root, Level1, Level2...]

            // We need to verify if we should traverse the stack to update 'subgraphsToSave'.
            // When we enter a subgraph, we push the *current* state.
            // If the current state was a subgraph editor, we need to update its definition in the map.

            subgraphStack.forEach(item => {
                if (item.subgraphId) {
                    // This stack item represents a subgraph we were editing
                    const internalNodes = item.nodes.filter(
                        n => n.id !== 'subgraph-input' && n.id !== 'subgraph-output'
                    );
                    const inputNode = item.nodes.find(n => n.id === 'subgraph-input');
                    const outputNode = item.nodes.find(n => n.id === 'subgraph-output');

                    subgraphsToSave[item.subgraphId] = {
                        ...subgraphsToSave[item.subgraphId],
                        nodes: internalNodes,
                        edges: item.edges,
                        inputNodePosition: inputNode?.position,
                        outputNodePosition: outputNode?.position,
                        updatedAt: Date.now(),
                        inputs: inputNode?.data.dynamicPorts || subgraphsToSave[item.subgraphId].inputs,
                        outputs: outputNode?.data.dynamicPorts || subgraphsToSave[item.subgraphId].outputs,
                    };
                }
            });

            // The root graph is at index 0 of the stack
            nodesToSave = subgraphStack[0].nodes;
            edgesToSave = subgraphStack[0].edges;
        }

        const graphData: GraphData = {
            version: GRAPH_VERSION,
            nodes: nodesToSave,
            edges: edgesToSave,
            subgraphs: subgraphsToSave,
            codeNodes: codeNodes,
            previewSettings: get().previewSettings,
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
                    codeNodes: data.codeNodes || {},
                    graphStructureVersion: get().graphStructureVersion + 1,
                    // Restore preview settings
                    previewSettings: data.previewSettings || {
                        mesh: 'sphere',
                        isInstanced: false,
                        instanceCount: 100,
                        config: {
                            width: 1.5,
                            height: 1.5,
                            depth: 1.5,
                            widthSegments: 1,
                            heightSegments: 1,
                            depthSegments: 1,
                            radius: 1,
                            widthSegmentsSphere: 32,
                            heightSegmentsSphere: 16,
                            radiusTorus: 0.8,
                            tube: 0.3,
                            radialSegments: 16,
                            tubularSegments: 32,
                            widthPlane: 1,
                            heightPlane: 1,
                            widthSegmentsPlane: 1,
                            heightSegmentsPlane: 1,
                            radiusTop: 1,
                            radiusBottom: 1,
                            heightCylinder: 1,
                            radialSegmentsCylinder: 20,
                            heightSegmentsCylinder: 20,
                            openEnded: true,
                        }
                    },
                    // Reset subgraph state on load
                    editorMode: 'main',
                    editingSubgraphId: null,
                    subgraphStack: [],
                    history: { past: [], future: [] },
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
            const parsed = JSON.parse(json);
            if (parsed.nodes && parsed.nodes.length < 1 && parsed.edges && parsed.edges.length < 1 && parsed.subgraphs && Object.keys(parsed.subgraphs).length < 1) {
                return false;
            }
            return get().loadFromJSON(json);
        }
        return false;
    },

    // Clear the graph
    // Clear the graph
    clearGraph: () => {
        get().takeSnapshot();
        set({
            nodes: [],
            edges: [],
            graphStructureVersion: get().graphStructureVersion + 1,
        });
        get().markDirty();
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

        get().takeSnapshot();
        const { nodes, edges } = get();
        // 1. Expand selection to include children of selected groups
        let expandedNodeIds = [...selectedNodeIds];
        const initialSelectedNodes = nodes.filter(n => selectedNodeIds.includes(n.id));

        // Find all groups in selection
        const selectedGroups = initialSelectedNodes.filter(n => n.type === 'group');

        // Add all children of selected groups to the selection
        if (selectedGroups.length > 0) {
            const groupIds = selectedGroups.map(g => g.id);
            const children = nodes.filter(n => n.parentId && groupIds.includes(n.parentId));
            const childrenIds = children.map(c => c.id);
            // Add unique children IDs
            expandedNodeIds = [...new Set([...expandedNodeIds, ...childrenIds])];
        }

        const selectedNodes = nodes.filter(n => expandedNodeIds.includes(n.id));

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

        // Filter out edges that connect selected nodes to non-selected nodes
        const edgesToKeep = edges.filter(e => {
            const sourceSelected = selectedNodeIds.includes(e.source);
            const targetSelected = selectedNodeIds.includes(e.target);
            // Keep internal edges (both selected) or completely external edges (neither selected)
            return (sourceSelected && targetSelected) || (!sourceSelected && !targetSelected);
        });

        // Calculate bounding box of selected nodes using React Flow helper
        // Using getAbsolutePosition from utils to ensure correct bounds for nested nodes
        const nodesForBounds = selectedNodes.map(n => ({
            ...n,
            position: getAbsolutePosition(n, nodes),
        }));

        const bounds = getNodesBounds(nodesForBounds);

        // Position anchor nodes based on bounding box
        const NODE_WIDTH = 180; // Approximate anchor node width
        const PADDING = 100; // Padding between anchor nodes and content

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
            nodes: selectedNodes.map(n => {
                const newNode = { ...n };
                // Check if parent is also selected
                if (newNode.parentId && !expandedNodeIds.includes(newNode.parentId)) {
                    // Parent is not moving to subgraph, so orphan this node
                    delete newNode.parentId;
                    delete newNode.extent;
                    // Position needs to be absolute now? 
                    // React Flow might handle this, but usually child positions are relative.
                    // If we remove parentId, we should convert relative position to absolute.
                    // BUT, inside the subgraph, the coordinate system is new (0,0 based on bounding box?).
                    // Actually, we are resetting positions based on the new subgraph context.
                    // Wait, usually subgraphs have their own coordinate system.
                    // If we just copy nodes, they keep their positions.
                    // If we orphan a node, its position is currently relative to the group.
                    // We need to make it relative to the subgraph origin.
                    // However, `selectedNodes` still has the original nodes with original positions.
                    // We need to calculate absolute positions for ALL nodes relative to the subgraph anchor?
                    // Or does the subgraph just assume the positions are absolute world coordinates?
                    // Currently TSL Editor seems to use absolute coordinates for everything in proper "main" graph.
                    // If `parentId` exists, position is relative.
                    // So if we remove `parentId`, we MUST update `position` to be absolute (world).
                    // Calculation: absolute = parent.position + child.position
                    // Position needs to be absolute now
                    // Use helper to get strictly world coordinates
                    const absPos = getAbsolutePosition(n, nodes);
                    newNode.position = absPos;
                }
                return newNode;
            }), // Clone nodes and fix hierarchy
            edges: internalEdges.map(e => ({ ...e })), // Clone edges
            inputNodePosition,
            outputNodePosition,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        set({
            subgraphs: { ...get().subgraphs, [id]: subgraph },
            edges: edgesToKeep,
        });
        get().markDirty();

        // NOTE: Template is NOT saved to DB here. It only gets saved when user
        // clicks "Save & Exit" in exitSubgraphEditor. This prevents orphaned 
        // templates when user cancels.

        return id;
    },

    enterSubgraphEditor: (subgraphId: string) => {
        const subgraph = get().subgraphs[subgraphId];
        if (!subgraph) return false;

        // Backup current context to stack
        const { nodes, edges, editingSubgraphId, subgraphStack } = get();

        // Get the IDs of the original nodes that might be replaced
        // Note: This logic assumes we are entering from a "create subgraph" flow where 
        // the original nodes are still in the graph and match the subgraph nodes.
        // If we are just "drilling down", this list will be irrelevant for retrieval later, which is fine.
        const originalNodeIds = subgraph.nodes.map(n => n.id);

        const stackItem: SubgraphStackItem = {
            nodes,
            edges,
            originalNodeIds,
            subgraphId: editingSubgraphId,
            history: get().history, // Save current history
        };

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
            subgraphStack: [...subgraphStack, stackItem],
            editorMode: 'subgraph',
            editingSubgraphId: subgraphId,
            nodes: [inputNode, outputNode, ...subgraph.nodes],
            edges: [...subgraph.edges],
            selectedNodeId: null,
            history: { past: [], future: [] }, // Reset history for new context
        });

        return true;
    },

    exitSubgraphEditor: async (save: boolean, nameOverride?: string) => {
        const { editingSubgraphId, nodes, edges, subgraphs, subgraphStack } = get();

        if (subgraphStack.length === 0 || !editingSubgraphId) {
            // Fallback for safety, though stack should not be empty if we are in subgraph mode
            set({
                editorMode: 'main',
                editingSubgraphId: null,
            });
            return;
        }

        // Pop last item
        const stackItem = subgraphStack[subgraphStack.length - 1];
        const newStack = subgraphStack.slice(0, -1);

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

            // Update subgraphs first
            // Note: We don't snapshot here because exitSubgraphEditor is a meta-action
            // that restores previous state + new node. The new node addition will be the "change"
            // in the PARENT history if we wanted to support undoing "Create Subgraph".
            // But here we are just saving internally.

            // Actually, we SHOULD update the subgraphs definition in the parent context's history
            // or just let it be. For now, we update the store.
            set({
                subgraphs: { ...subgraphs, [editingSubgraphId]: updatedSubgraph },
            });

            // Push to DB: Create new template OR update existing
            const currentSubgraph = get().subgraphs[editingSubgraphId];
            const { onSubgraphTemplateCreate, onSubgraphTemplateUpdate } = get();

            if (currentSubgraph?.templateId) {
                // UPDATE existing template
                if (onSubgraphTemplateUpdate) {
                    try {
                        const result = await onSubgraphTemplateUpdate(currentSubgraph.templateId, updatedSubgraph);
                        // Update local version
                        const latestSubgraphs = useEditorStore.getState().subgraphs;
                        if (latestSubgraphs[editingSubgraphId]) {
                            useEditorStore.setState({
                                subgraphs: {
                                    ...latestSubgraphs,
                                    [editingSubgraphId]: {
                                        ...latestSubgraphs[editingSubgraphId],
                                        templateVersion: result.version,
                                    },
                                },
                            });
                        }
                    } catch (error) {
                        console.error('Failed to update subgraph template in DB:', error);
                        const message = getErrorMessage(error);
                        toast.error(message);
                        get().trackEvent('error_occurred', { context: 'create_subgraph_template', error: message });
                    }
                }
            } else {
                // CREATE new template (first time saving this subgraph)
                if (onSubgraphTemplateCreate) {
                    try {
                        const result = await onSubgraphTemplateCreate(updatedSubgraph);
                        // Update local definition with template reference
                        const latestSubgraphs = useEditorStore.getState().subgraphs;
                        if (latestSubgraphs[editingSubgraphId]) {
                            useEditorStore.setState({
                                subgraphs: {
                                    ...latestSubgraphs,
                                    [editingSubgraphId]: {
                                        ...latestSubgraphs[editingSubgraphId],
                                        templateId: result.templateId,
                                        templateVersion: result.version,
                                    },
                                },
                            });
                        }
                    } catch (error) {
                        console.error('Failed to create subgraph template in DB:', error);
                        const message = getErrorMessage(error);
                        toast.error(message);
                        get().trackEvent('error_occurred', { context: 'update_subgraph_template', error: message });
                    }
                }
            }

            // Prepare instance node data for deferred creation
            const originalNodeIds = stackItem.originalNodeIds;
            const originalNodes = stackItem.nodes.filter(n => originalNodeIds.includes(n.id));
            const subgraphIdForInstance = editingSubgraphId;
            const restoredNodes = stackItem.nodes;
            const restoredEdges = stackItem.edges;

            // Determine previous mode based on stack item
            const previousMode = stackItem.subgraphId ? 'subgraph' : 'main';
            const previousSubgraphId = stackItem.subgraphId;

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

                // Filter out original nodes from the restored state
                const newNodes = restoredNodes.filter(n => !originalNodeIds.includes(n.id));
                newNodes.push(instanceNode);

                // Rewire external edges to the instance node
                const newEdges = restoredEdges
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
                setTimeout(() => {
                    set({
                        nodes: newNodes,
                        edges: newEdges,
                        subgraphStack: newStack,
                        selectedNodeId: null,
                        selectedNodeIds: [],
                        editorMode: previousMode,
                        editingSubgraphId: previousSubgraphId,
                        history: stackItem.history, // Restore parent history
                    });
                }, 0);
                return;
            }

            // No original nodes - just restore backup
            set({
                nodes: restoredNodes,
                edges: restoredEdges,
                subgraphStack: newStack,
                selectedNodeId: null,
                selectedNodeIds: [],
                editorMode: previousMode,
                editingSubgraphId: previousSubgraphId,
                history: stackItem.history, // Restore parent history
            });
            return;
        }

        // Restore graph (fallback for cancel)
        const previousMode = stackItem.subgraphId ? 'subgraph' : 'main';
        const previousSubgraphId = stackItem.subgraphId;

        set({
            nodes: stackItem.nodes,
            edges: stackItem.edges,
            subgraphStack: newStack,
            editorMode: previousMode,
            editingSubgraphId: previousSubgraphId,
            selectedNodeId: null,
            selectedNodeIds: [],
            history: stackItem.history, // Restore parent history
        });
    },

    updateSubgraphDefinition: (subgraphId: string, updates: Partial<SubgraphDefinition>) => {
        get().takeSnapshot();
        const subgraph = get().subgraphs[subgraphId];
        if (!subgraph) return;

        set({
            subgraphs: {
                ...get().subgraphs,
                [subgraphId]: { ...subgraph, ...updates, updatedAt: Date.now() },
            },
            graphStructureVersion: get().graphStructureVersion + 1,
        });

        get().markDirty();
    },

    addSubgraphDefinition: (subgraph: SubgraphDefinition) => {
        get().takeSnapshot();
        set({
            subgraphs: {
                ...get().subgraphs,
                [subgraph.id]: {
                    ...subgraph,
                    createdAt: subgraph.createdAt || Date.now(),
                    updatedAt: Date.now(),
                },
            },
            graphStructureVersion: get().graphStructureVersion + 1,
        });
        get().markDirty();
    },

    deleteSubgraph: (subgraphId: string) => {
        const { [subgraphId]: _, ...rest } = get().subgraphs;
        set({ subgraphs: rest });
        get().markDirty();
    },

    addDynamicPort: (nodeId: string, port: SubgraphPort) => {
        get().takeSnapshot();
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
        get().takeSnapshot();
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
        get().takeSnapshot();
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

    // Code Node Actions

    createCodeNode: async (name: string, code: string, inputs: SubgraphPort[], output: SubgraphPort) => {
        get().takeSnapshot();

        // Generate unique ID
        const id = `code/${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`;

        const codeNode: CodeNodeDefinition = {
            id,
            name,
            code,
            inputs,
            output,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        set({
            codeNodes: { ...get().codeNodes, [id]: codeNode },
        });
        get().markDirty();

        // Auto-save to DB as private template
        const { onCodeNodeTemplateCreate } = get();
        if (onCodeNodeTemplateCreate) {
            try {
                const result = await onCodeNodeTemplateCreate(codeNode);
                // Update local definition with template reference
                const currentCodeNodes = useEditorStore.getState().codeNodes;
                if (currentCodeNodes[id]) {
                    useEditorStore.setState({
                        codeNodes: {
                            ...currentCodeNodes,
                            [id]: {
                                ...currentCodeNodes[id],
                                templateId: result.templateId,
                                templateVersion: result.version,
                            },
                        },
                    });
                }
                return id;
            } catch (error) {
                // Rollback: remove the code node from local state
                const currentCodeNodes = useEditorStore.getState().codeNodes;
                const { [id]: _, ...rest } = currentCodeNodes;
                useEditorStore.setState({ codeNodes: rest });

                console.error('Failed to save code node template to DB:', error);
                const message = getErrorMessage(error);
                toast.error(message);
                get().trackEvent('error_occurred', { context: 'create_code_node_template', error: message });
                return null;
            }
        }

        return id;
    },

    updateCodeNode: (id: string, updates: Partial<CodeNodeDefinition>) => {
        get().takeSnapshot();
        const codeNode = get().codeNodes[id];
        if (!codeNode) return;

        const updatedCodeNode = { ...codeNode, ...updates, updatedAt: Date.now() };

        // Propagate changes to all instances of this code node
        const { nodes, edges } = get();

        // Find existing edges to remove if ports are removed
        const newInputIds = (updatedCodeNode.inputs || []).map(p => p.id);
        const newOutputId = updatedCodeNode.output?.id;

        let newEdges = edges;

        const newNodes = nodes.map(node => {
            // Check if this node is an instance of the code node
            // The instance type is either the ID itself (usually) or stored in data.type
            if (node.data.type === id || node.type === id) {
                const newPorts = [...(updatedCodeNode.inputs || []), updatedCodeNode.output].filter(Boolean) as SubgraphPort[];

                // If ports are removed, we must remove connected edges
                // Identify removed input IDs
                // Note: we only check inputs for removal here as output usually persists (or is single 'out')
                // But strictly checking all valid handles is better.
                const validHandleIds = new Set([...newInputIds, newOutputId].filter(Boolean));

                // Filter edges connected to this node
                newEdges = newEdges.filter(edge => {
                    if (edge.source === node.id) {
                        // Edge from this node (output)
                        return validHandleIds.has(edge.sourceHandle || '');
                    }
                    if (edge.target === node.id) {
                        // Edge to this node (input)
                        return validHandleIds.has(edge.targetHandle || '');
                    }
                    return true;
                });

                return {
                    ...node,
                    data: {
                        ...node.data,
                        label: updatedCodeNode.name, // Update label if name changed
                        dynamicPorts: newPorts,
                    }
                };
            }
            return node;
        });

        set({
            codeNodes: {
                ...get().codeNodes,
                [id]: updatedCodeNode,
            },
            nodes: newNodes,
            edges: newEdges,
            graphStructureVersion: get().graphStructureVersion + 1,
        });
        get().markDirty();

        // Push updates to DB if this code node is linked to a template
        // AND we are not just syncing the version from the DB (indicated by presence of templateVersion in updates)
        const isSyncing = typeof updates.templateVersion === 'number';
        const { onCodeNodeTemplateUpdate } = get();

        if (onCodeNodeTemplateUpdate && codeNode.templateId && !isSyncing) {
            onCodeNodeTemplateUpdate(codeNode.templateId, updatedCodeNode).then(result => {
                // Update local version
                const latestCodeNodes = useEditorStore.getState().codeNodes;
                if (latestCodeNodes[id]) {
                    useEditorStore.setState({
                        codeNodes: {
                            ...latestCodeNodes,
                            [id]: {
                                ...latestCodeNodes[id],
                                templateVersion: result.version,
                            },
                        },
                    });
                }
            }).catch(error => {
                console.error('Failed to update code node template in DB:', error);
                const message = getErrorMessage(error);
                toast.error(message);
                get().trackEvent('error_occurred', { context: 'update_code_node_template', error: message });
            });
        }
    },

    deleteCodeNode: (id: string) => {
        get().takeSnapshot();
        const { [id]: _, ...rest } = get().codeNodes;
        set({ codeNodes: rest });
        get().markDirty();
    },

    addCodeNodeDefinition: (codeNode: CodeNodeDefinition) => {
        get().takeSnapshot();
        set({
            codeNodes: {
                ...get().codeNodes,
                [codeNode.id]: {
                    ...codeNode,
                    createdAt: codeNode.createdAt || Date.now(),
                    updatedAt: Date.now(),
                },
            },
            graphStructureVersion: get().graphStructureVersion + 1,
        });
        get().markDirty();
    },

    getCodeNode: (id: string) => {
        return get().codeNodes[id];
    },

    // History Implementation

    takeSnapshot: () => {
        const { nodes, edges, subgraphs, history, isUndoRedoInProgress } = get();

        if (isUndoRedoInProgress) return;

        const snapshot: Snapshot = {
            nodes: stripTransientFields(nodes),
            edges,
            subgraphs, // Tracking subgraphs changes too
        };

        const newPast = [...history.past, snapshot];
        // Limit history size
        if (newPast.length > 50) {
            newPast.shift();
        }

        set({
            history: {
                past: newPast,
                future: [],
            },
        });
    },

    undo: () => {
        const { history, nodes, edges, subgraphs } = get();
        if (history.past.length === 0) return;

        const previous = history.past[history.past.length - 1];
        const newPast = history.past.slice(0, -1);

        const currentSnapshot: Snapshot = {
            nodes: stripTransientFields(nodes),
            edges,
            subgraphs,
        };

        // Don't trigger snapshot during undo
        set({ isUndoRedoInProgress: true });

        set({
            nodes: previous.nodes,
            edges: previous.edges,
            subgraphs: previous.subgraphs,
            history: {
                past: newPast,
                future: [currentSnapshot, ...history.future],
            },
            graphStructureVersion: get().graphStructureVersion + 1,
        });

        // Use setTimeout to ensure we don't block render with flag
        setTimeout(() => {
            set({ isUndoRedoInProgress: false });
            get().markDirty();
        }, 0);
    },

    redo: () => {
        const { history, nodes, edges, subgraphs } = get();
        if (history.future.length === 0) return;

        const next = history.future[0];
        const newFuture = history.future.slice(1);

        const currentSnapshot: Snapshot = {
            nodes: stripTransientFields(nodes),
            edges,
            subgraphs,
        };

        set({ isUndoRedoInProgress: true });

        set({
            nodes: next.nodes,
            edges: next.edges,
            subgraphs: next.subgraphs,
            history: {
                past: [...history.past, currentSnapshot],
                future: newFuture,
            },
            graphStructureVersion: get().graphStructureVersion + 1,
        });

        setTimeout(() => {
            set({ isUndoRedoInProgress: false });
            get().markDirty();
        }, 0);
    },

    clearHistory: () => {
        set({ history: { past: [], future: [] } });
    },

    groupNodes: () => {
        const { nodes, selectedNodeIds } = get();

        // 1. Get all selected nodes
        const allSelectedNodes = nodes.filter(n => selectedNodeIds.includes(n.id));

        // 2. Filter to find the "roots" of the selection.
        // If a node is selected, but its parent is ALSO selected, we ignore the child
        // because it will move along with the parent group.
        // Also, we DO allow groups to be selected now (nesting).
        const selectedRoots = allSelectedNodes.filter(node => {
            if (!node.parentId) return true; // No parent, so it's a root
            return !selectedNodeIds.includes(node.parentId); // Parent is NOT selected, so this is a top-level selection
        });

        if (selectedRoots.length === 0) return;

        get().takeSnapshot();

        // Calculate bounding box of selected roots using absolute positions
        const nodesForBounds = selectedRoots.map(n => ({
            ...n,
            position: getAbsolutePosition(n, nodes),
        }));

        const bounds = getNodesBounds(nodesForBounds);

        // Add padding (Reference uses 40)
        const PADDING = 40;
        const width = bounds.width + PADDING * 2;
        const height = bounds.height + PADDING * 2;
        const x = bounds.x - PADDING;
        const y = bounds.y - PADDING;

        const groupId = `group-${Date.now()}`;

        // Create the group node
        const groupNode: Node<TSLNodeData> = {
            id: groupId,
            type: 'group',
            position: { x, y },
            style: { width, height },
            data: {
                type: 'group',
                values: { label: 'Group' },
                connected: {},
            },
            selected: true,
        };

        // Update selected nodes to be children of the group
        const newNodes = nodes.map(node => {
            // Check if this node is one of the ROOTS we are grouping
            const isRoot = selectedRoots.some(root => root.id === node.id);

            if (isRoot) {
                return {
                    ...node,
                    parentId: groupId,
                    extent: 'parent' as const, // Constrain to parent
                    position: {
                        x: getAbsolutePosition(node, nodes).x - x, // Relative position from world coords
                        y: getAbsolutePosition(node, nodes).y - y,
                    },
                    selected: false, // Deselect children
                };
            }
            return { ...node, selected: false }; // Clear other selections
        });

        // Insert group at the position of the first selected root, then add all other nodes
        const firstRootIndex = newNodes.findIndex(
            (n) => selectedRoots.some((root) => root.id === n.id)
        );
        const insertIndex = firstRootIndex >= 0 ? firstRootIndex : 0;

        const finalNodes = [
            ...newNodes.slice(0, insertIndex),
            groupNode,
            ...newNodes.slice(insertIndex),
        ];

        set({
            nodes: finalNodes,
            selectedNodeIds: [groupId], // Select ONLY the new group
            selectedNodeId: groupId,
        });
    },

    ungroupNodes: () => {
        const { nodes, selectedNodeIds } = get();
        if (selectedNodeIds.length === 0) return;

        get().takeSnapshot();

        // Find groups to ungroup (only selected groups)
        const groupsToUngroup = nodes.filter(n =>
            selectedNodeIds.includes(n.id) && n.type === 'group'
        );

        if (groupsToUngroup.length === 0) return;

        const groupIds = groupsToUngroup.map(g => g.id);

        // Update nodes: remove parentId and convert to absolute positions
        const updatedNodes = nodes
            .filter((node) => !groupIds.includes(node.id)) // Remove group nodes
            .map((node) => {
                if (node.parentId && groupIds.includes(node.parentId)) {
                    // Calculate absolute position
                    const parentGroup = groupsToUngroup.find((g) => g.id === node.parentId);
                    if (parentGroup) {
                        return {
                            ...node,
                            parentId: undefined, // Remove parent relationship
                            extent: undefined,
                            position: {
                                x: node.position.x + parentGroup.position.x,
                                y: node.position.y + parentGroup.position.y,
                            },
                        };
                    }
                }
                return node;
            });

        set({
            nodes: updatedNodes,
            selectedNodeIds: [], // Clear selection
            selectedNodeId: null,
        });
    },

    resetEditor: () => {
        set({
            nodes: [],
            edges: [],
            selectedNodeId: null,
            selectedNodeIds: [],
            graphStructureVersion: 0,
            subgraphs: {},
            editorMode: 'main',
            editingSubgraphId: null,
            subgraphStack: [],
            autoSaveCallback: null,
            isSaving: false,
            isDirty: false,
            history: { past: [], future: [] },
            canvasMode: 'pan',
            codeNodes: {},
            previewSettings: {
                mesh: 'sphere',
                isInstanced: false,
                instanceCount: 100,
                config: {
                    width: 1.5,
                    height: 1.5,
                    depth: 1.5,
                    widthSegments: 1,
                    heightSegments: 1,
                    depthSegments: 1,
                    radius: 1,
                    widthSegmentsSphere: 32,
                    heightSegmentsSphere: 16,
                    radiusTorus: 0.8,
                    tube: 0.3,
                    radialSegments: 16,
                    tubularSegments: 32,
                    widthPlane: 1,
                    heightPlane: 1,
                    widthSegmentsPlane: 1,
                    heightSegmentsPlane: 1,
                }
            },
            // Reset template callbacks as well? Probably no, they are set by the component. 
            // The component usually sets them in useEffect.
        });
    },
}));

// Note: Auto-save is triggered by markDirty() which is called when changes occur
