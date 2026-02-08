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
import { getMultiOpInputHandleIds, type MultiOpType } from '@/lib/multi-op';
import { toast } from 'sonner';

const LOOP_LAYOUT = {
    portHeight: 28,
    portGap: 12,
    portWidth: 110,
    portStartY: 24,
    leftX: 12,
    innerOffsetX: 32,
};

const relayoutLoopChildren = (nodes: Node<TSLNodeData>[], loopGroupId: string) => {
    const group = nodes.find(n => n.id === loopGroupId);
    if (!group || group.type !== 'group' || group.data?.loop?.kind !== 'loop') return nodes;

    const width = Number(group.width ?? group.style?.width ?? 0);
    if (!Number.isFinite(width) || width <= 0) return nodes;

    const childNodes = nodes.filter(n => n.parentId === loopGroupId);
    if (childNodes.length === 0) return nodes;

    const inputPorts = childNodes.filter(n => n.type === 'loop/input');
    const outputPorts = childNodes.filter(n => n.type === 'loop/output');
    const indexNode = childNodes.find(n => n.type === 'loop/index' || n.id === group.data?.loop?.indexNodeId);
    const accNodeId = group.data?.loop?.accNodeId;
    const accNode = accNodeId ? childNodes.find(n => n.id === accNodeId) : undefined;

    const countPortId = group.data?.loop?.countPortId;
    const initPortId = group.data?.loop?.initPortId;

    const countPort = inputPorts.find(p => p.id === countPortId || p.data?.loopPort?.role === 'count');
    const initPort = inputPorts.find(p => p.id === initPortId || p.data?.loopPort?.role === 'init');

    const remainingPorts = inputPorts.filter(p => p !== countPort && p !== initPort);
    remainingPorts.sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0));

    const orderedInputPorts = [countPort, initPort, ...remainingPorts].filter(Boolean) as Node<TSLNodeData>[];
    const orderedOutputPorts = outputPorts.slice().sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0));

    const updates = new Map<string, { x: number; y: number }>();

    orderedInputPorts.forEach((port, index) => {
        updates.set(port.id, {
            x: LOOP_LAYOUT.leftX,
            y: LOOP_LAYOUT.portStartY + index * (LOOP_LAYOUT.portHeight + LOOP_LAYOUT.portGap),
        });
    });

    const rightX = width - LOOP_LAYOUT.portWidth - LOOP_LAYOUT.leftX;
    orderedOutputPorts.forEach((port, index) => {
        updates.set(port.id, {
            x: rightX,
            y: LOOP_LAYOUT.portStartY + index * (LOOP_LAYOUT.portHeight + LOOP_LAYOUT.portGap),
        });
    });

    if (indexNode) {
        updates.set(indexNode.id, {
            x: LOOP_LAYOUT.leftX + LOOP_LAYOUT.portWidth + LOOP_LAYOUT.innerOffsetX,
            y: LOOP_LAYOUT.portStartY,
        });
    }

    if (accNode) {
        updates.set(accNode.id, {
            x: LOOP_LAYOUT.leftX + LOOP_LAYOUT.portWidth + LOOP_LAYOUT.innerOffsetX,
            y: LOOP_LAYOUT.portStartY + (LOOP_LAYOUT.portHeight + LOOP_LAYOUT.portGap) * 2,
        });
    }

    if (updates.size === 0) return nodes;

    return nodes.map(node => {
        const nextPos = updates.get(node.id);
        if (!nextPos) return node;
        return {
            ...node,
            position: nextPos,
        };
    });
};

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
    showBackdrop?: boolean;
    showGrid?: boolean;
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
    hoveredGroupId: string | null;

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
    addMultiOp: (nodeId: string, op?: MultiOpType) => void;
    updateMultiOp: (nodeId: string, opId: string, op: MultiOpType) => void;
    removeMultiOp: (nodeId: string, opId: string) => void;
    deleteNode: (nodeId: string) => void;
    setSelectedNode: (nodeId: string | null) => void;
    setSelectedNodes: (nodeIds: string[]) => void;
    setHoveredGroupId: (groupId: string | null) => void;
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
    reparentNodes: (nodeIds: string[], targetGroupId: string | null, options?: { skipSnapshot?: boolean }) => void;
    removeFromGroup: () => void;
    createLoopFromSelection: () => void;


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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    hoveredGroupId: null,

    // Preview settings
    previewSettings: {
        mesh: 'sphere' as PreviewMeshType,
        isInstanced: false,
        instanceCount: 100,
        environment: 'studio',
        environmentIntensity: 1,
        showEnvironmentBackground: false,
        showGrid: true,
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

        let nextNodes = applyNodeChanges(filteredChanges, get().nodes);

        const resizedLoopGroups = filteredChanges
            .filter(change => change.type === 'dimensions')
            .map(change => change.id)
            .filter((id): id is string => typeof id === 'string');

        if (resizedLoopGroups.length > 0) {
            for (const loopId of resizedLoopGroups) {
                nextNodes = relayoutLoopChildren(nextNodes, loopId);
            }
        }

        set({
            nodes: nextNodes,
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

    addMultiOp: (nodeId, op = 'add') => {
        get().takeSnapshot();
        const opId = `op_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        set({
            nodes: get().nodes.map((node) =>
                node.id === nodeId
                    ? {
                        ...node,
                        data: {
                            ...node.data,
                            operations: [...(node.data.operations ?? []), { id: opId, op }],
                        },
                    }
                    : node
            ),
            graphStructureVersion: get().graphStructureVersion + 1,
        });
        get().markDirty();
    },

    updateMultiOp: (nodeId, opId, op) => {
        get().takeSnapshot();
        const { nodes, edges } = get();
        let newEdges = edges;

        const newNodes = nodes.map((node) => {
            if (node.id !== nodeId) return node;
            const operations = Array.isArray(node.data.operations) ? node.data.operations : [];
            const updatedOperations = operations.map((entry) =>
                entry.id === opId ? { ...entry, op } : entry
            );

            const validInputIds = new Set(getMultiOpInputHandleIds(updatedOperations));
            newEdges = newEdges.filter((edge) => {
                if (edge.target === node.id) {
                    return validInputIds.has(edge.targetHandle ?? '');
                }
                if (edge.source === node.id) {
                    return (edge.sourceHandle ?? 'out') === 'out';
                }
                return true;
            });

            const newValues = { ...node.data.values };
            for (const key of Object.keys(newValues)) {
                if (key.startsWith('op_') && !validInputIds.has(key)) {
                    delete newValues[key];
                }
            }

            return {
                ...node,
                data: {
                    ...node.data,
                    operations: updatedOperations,
                    values: newValues,
                },
            };
        });

        set({
            nodes: newNodes,
            edges: newEdges,
            graphStructureVersion: get().graphStructureVersion + 1,
        });
        get().markDirty();
    },

    removeMultiOp: (nodeId, opId) => {
        get().takeSnapshot();
        const { nodes, edges } = get();
        let newEdges = edges;

        const newNodes = nodes.map((node) => {
            if (node.id !== nodeId) return node;
            const operations = Array.isArray(node.data.operations) ? node.data.operations : [];
            const updatedOperations = operations.filter((entry) => entry.id !== opId);

            const validInputIds = new Set(getMultiOpInputHandleIds(updatedOperations));
            newEdges = newEdges.filter((edge) => {
                if (edge.target === node.id) {
                    return validInputIds.has(edge.targetHandle ?? '');
                }
                if (edge.source === node.id) {
                    return (edge.sourceHandle ?? 'out') === 'out';
                }
                return true;
            });

            const newValues = { ...node.data.values };
            for (const key of Object.keys(newValues)) {
                if (key.startsWith('op_') && !validInputIds.has(key)) {
                    delete newValues[key];
                }
            }

            return {
                ...node,
                data: {
                    ...node.data,
                    operations: updatedOperations,
                    values: newValues,
                },
            };
        });

        set({
            nodes: newNodes,
            edges: newEdges,
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

    setHoveredGroupId: (groupId) => {
        set({ hoveredGroupId: groupId });
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
                        showGrid: true,
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

    reparentNodes: (nodeIds, targetGroupId, options) => {
        if (!nodeIds.length) return;

        const { nodes, edges } = get();
        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        const selectedSet = new Set(nodeIds);

        const selectedRoots = nodes.filter(node => selectedSet.has(node.id) && (!node.parentId || !selectedSet.has(node.parentId)));
        if (selectedRoots.length === 0) return;

        const targetGroup = targetGroupId ? nodeMap.get(targetGroupId) : null;
        if (targetGroupId && (!targetGroup || targetGroup.type !== 'group')) {
            return;
        }

        const isDescendantOf = (targetId: string, ancestorId: string) => {
            const current = nodeMap.get(targetId);
            let parentId = current?.parentId ?? null;
            while (parentId) {
                if (parentId === ancestorId) return true;
                parentId = nodeMap.get(parentId)?.parentId ?? null;
            }
            return false;
        };

        const isProtectedLoopNode = (node: Node<TSLNodeData>, parent: Node<TSLNodeData> | undefined) => {
            if (!parent || parent.type !== 'group' || parent.data?.loop?.kind !== 'loop') return false;
            if (node.type === 'loop/input' || node.type === 'loop/output' || node.type === 'loop/index') return true;
            const accNodeId = parent.data.loop?.accNodeId;
            return !!accNodeId && node.id === accNodeId;
        };

        const blockedIds: string[] = [];

        const movableRoots = selectedRoots.filter(node => {
            if (!targetGroupId) {
                if (!node.parentId) return false;
                const parent = node.parentId ? nodeMap.get(node.parentId) : undefined;
                if (isProtectedLoopNode(node, parent)) {
                    blockedIds.push(node.id);
                    return false;
                }
                return true;
            }

            if ((MATERIAL_NODE_TYPES as readonly string[]).includes(node.data.type)) {
                const targetParent = nodeMap.get(targetGroupId);
                if (targetParent?.type === 'group' && targetParent.data?.loop?.kind === 'loop') {
                    blockedIds.push(node.id);
                    return false;
                }
            }

            if (node.parentId === targetGroupId) return false;
            if (isDescendantOf(targetGroupId, node.id)) return false;
            return true;
        });

        if (blockedIds.length > 0) {
            toast.error('Some nodes cannot be moved into or out of loop groups.');
        }

        if (movableRoots.length === 0) return;

        if (!options?.skipSnapshot) {
            get().takeSnapshot();
        }

        const movedRootIds = new Set(movableRoots.map(n => n.id));
        const parentAbs = targetGroup ? getAbsolutePosition(targetGroup, nodes) : null;

        const updatedNodes = nodes.map(node => {
            if (!movedRootIds.has(node.id)) return node;

            const absPos = getAbsolutePosition(node, nodes);

            if (targetGroupId && parentAbs) {
                return {
                    ...node,
                    parentId: targetGroupId,
                    extent: 'parent' as const,
                    position: {
                        x: absPos.x - parentAbs.x,
                        y: absPos.y - parentAbs.y,
                    },
                };
            }

            return {
                ...node,
                parentId: undefined,
                extent: undefined,
                position: absPos,
            };
        });

        let nextEdges = edges;
        if (!targetGroupId) {
            const removedFromLoopIds = movableRoots
                .filter(node => {
                    const parent = node.parentId ? nodeMap.get(node.parentId) : undefined;
                    return parent?.type === 'group' && parent.data?.loop?.kind === 'loop';
                })
                .map(node => node.id);

            if (removedFromLoopIds.length > 0) {
                const removedSet = new Set(removedFromLoopIds);
                const loopGroupIds = new Set(
                    movableRoots
                        .filter(node => node.parentId)
                        .map(node => node.parentId as string)
                );
                const loopChildIds = new Set(
                    nodes.filter(n => n.parentId && loopGroupIds.has(n.parentId)).map(n => n.id)
                );

                nextEdges = edges.filter(edge => {
                    const fromLoop = loopChildIds.has(edge.source);
                    const toLoop = loopChildIds.has(edge.target);
                    const fromRemoved = removedSet.has(edge.source);
                    const toRemoved = removedSet.has(edge.target);
                    if (fromLoop && toRemoved) return false;
                    if (fromRemoved && toLoop) return false;
                    return true;
                });
            }
        }

        const movedRootsInOrder = updatedNodes.filter(n => movedRootIds.has(n.id));
        const remainingNodes = updatedNodes.filter(n => !movedRootIds.has(n.id));

        let finalNodes = updatedNodes;
        if (targetGroupId) {
            const groupIndex = remainingNodes.findIndex(n => n.id === targetGroupId);
            const insertIndex = groupIndex >= 0 ? groupIndex + 1 : remainingNodes.length;
            finalNodes = [
                ...remainingNodes.slice(0, insertIndex),
                ...movedRootsInOrder,
                ...remainingNodes.slice(insertIndex),
            ];
        } else {
            finalNodes = [...remainingNodes, ...movedRootsInOrder];
        }

        set({
            nodes: finalNodes,
            edges: nextEdges,
            graphStructureVersion: get().graphStructureVersion + 1,
        });
        get().markDirty();
    },

    removeFromGroup: () => {
        const { selectedNodeIds } = get();
        if (selectedNodeIds.length === 0) return;
        get().reparentNodes(selectedNodeIds, null);
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

    createLoopFromSelection: () => {
        const { nodes, edges, selectedNodeIds } = get();
        if (selectedNodeIds.length === 0) return;

        // Expand selection to include descendants of selected groups
        const expandedIds = new Set<string>(selectedNodeIds);
        let changed = true;
        while (changed) {
            changed = false;
            for (const node of nodes) {
                if (node.parentId && expandedIds.has(node.parentId) && !expandedIds.has(node.id)) {
                    expandedIds.add(node.id);
                    changed = true;
                }
            }
        }

        const selectedNodes = nodes.filter(n => expandedIds.has(n.id));
        if (selectedNodes.length === 0) return;

        // Roots are nodes whose parent isn't in the selection
        const selectedRoots = selectedNodes.filter(node => {
            if (!node.parentId) return true;
            return !expandedIds.has(node.parentId);
        });

        if (selectedRoots.length === 0) return;

        // Disallow outgoing edges (V0 accumulator-only output)
        const outgoingEdges = edges.filter(e => expandedIds.has(e.source) && !expandedIds.has(e.target));
        if (outgoingEdges.length > 0) {
            toast.error('Loop V0 only supports outputs via accumulator. Remove outgoing edges and try again.');
            return;
        }

        get().takeSnapshot();

        // Calculate bounds using absolute positions
        const nodesForBounds = selectedRoots.map(n => ({
            ...n,
            position: getAbsolutePosition(n, nodes),
        }));

        const bounds = getNodesBounds(nodesForBounds);
        const PADDING = 60;
        const baseWidth = bounds.width + PADDING * 2;
        const baseHeight = bounds.height + PADDING * 2;

        const minHeight = (LOOP_LAYOUT.portHeight + LOOP_LAYOUT.portGap) * 2 + 80;

        const width = baseWidth;
        const height = Math.max(baseHeight, minHeight);
        const x = bounds.x - PADDING;
        const y = bounds.y - PADDING;

        const loopId = `loop-${Date.now()}`;
        const outputPortId = `${loopId}-out`;
        const indexNodeId = `${loopId}-index`;
        const countPortId = `${loopId}-count`;

        const groupNode: Node<TSLNodeData> = {
            id: loopId,
            type: 'group',
            position: { x, y },
            style: { width, height },
            data: {
                type: 'group',
                values: { label: 'Loop', count: 1, init: 0 },
                connected: {},
                loop: {
                    kind: 'loop',
                    mode: 'count',
                    outputPortId,
                    countPortId,
                    indexNodeId,
                },
            },
            selected: true,
        };

        const portWidth = LOOP_LAYOUT.portWidth;
        const leftX = LOOP_LAYOUT.leftX;
        const portStartY = LOOP_LAYOUT.portStartY;
        const rightX = width - portWidth - LOOP_LAYOUT.leftX;
        const countPortNode: Node<TSLNodeData> = {
            id: countPortId,
            type: 'loop/input',
            parentId: loopId,
            extent: 'parent',
            position: { x: leftX, y: portStartY },
            style: { width: portWidth, height: LOOP_LAYOUT.portHeight },
            data: {
                type: 'loop/input',
                values: {},
                connected: {},
                loopPort: {
                    kind: 'input',
                    portId: 'count',
                    label: 'Count',
                    role: 'count',
                    type: 'int',
                },
            },
            draggable: false,
            selectable: true,
            deletable: false,
        };

        const outputPortNode: Node<TSLNodeData> = {
            id: outputPortId,
            type: 'loop/output',
            parentId: loopId,
            extent: 'parent',
            position: { x: rightX, y: portStartY },
            style: { width: portWidth, height: LOOP_LAYOUT.portHeight },
            data: {
                type: 'loop/output',
                values: {},
                connected: {},
                loopPort: {
                    kind: 'output',
                    portId: 'out',
                    label: 'Acc',
                    type: 'float',
                },
            },
            draggable: false,
            selectable: true,
            deletable: false,
        };

        const indexNode: Node<TSLNodeData> = {
            id: indexNodeId,
            type: 'loop/index',
            parentId: loopId,
            extent: 'parent',
            position: { x: leftX + portWidth + LOOP_LAYOUT.innerOffsetX, y: portStartY },
            data: {
                type: 'loop/index',
                values: {},
                connected: {},
            },
            deletable: false,
        };

        // Reparent selected roots into the loop group
        const newNodes = nodes.map(node => {
            const isRoot = selectedRoots.some(root => root.id === node.id);

            if (isRoot) {
                return {
                    ...node,
                    parentId: loopId,
                    extent: 'parent' as const,
                    position: {
                        x: getAbsolutePosition(node, nodes).x - x,
                        y: getAbsolutePosition(node, nodes).y - y,
                    },
                    selected: false,
                };
            }
            return { ...node, selected: false };
        });

        const filteredEdges = edges;

        const loopChildNodes = [
            outputPortNode,
            countPortNode,
            indexNode,
        ];

        const firstRootIndex = newNodes.findIndex(
            (n) => selectedRoots.some((root) => root.id === n.id)
        );
        const insertIndex = firstRootIndex >= 0 ? firstRootIndex : 0;

        const finalNodes = [
            ...newNodes.slice(0, insertIndex),
            groupNode,
            ...loopChildNodes,
            ...newNodes.slice(insertIndex),
        ];

        set({
            nodes: finalNodes,
            edges: filteredEdges,
            selectedNodeIds: [loopId],
            selectedNodeId: loopId,
            graphStructureVersion: get().graphStructureVersion + 1,
        });

        get().markDirty();
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
        });
    },
}));
