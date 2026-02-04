import { create } from 'zustand';
import {
    type Node,
    type Edge,
    type OnNodesChange,
    type OnEdgesChange,
    type OnConnect,
    type NodeChange,
    type EdgeChange,
    applyNodeChanges,
    applyEdgeChanges,
    addEdge,
    type Connection,
    getNodesBounds,
} from '@xyflow/react';
import { getAbsolutePosition, getErrorMessage } from '@/lib/utils';
import { MATERIAL_NODE_TYPES } from '@/lib/nodes';
import { TSLNodeData, NodeType, SubgraphDefinition, SubgraphPort, CodeNodeDefinition, TSLValueType } from '@/lib/types';

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

interface SubgraphEnterState {
    subgraphStack: SubgraphStackItem[];
    editorMode: EditorMode;
    editingSubgraphId: string | null;
    nodes: Node<TSLNodeData>[];
    edges: Edge[];
    selectedNodeId: string | null;
    history: HistoryState;
}

interface SubgraphExitState {
    nodes: Node<TSLNodeData>[];
    edges: Edge[];
    subgraphStack: SubgraphStackItem[];
    selectedNodeId: string | null;
    selectedNodeIds: string[];
    editorMode: EditorMode;
    editingSubgraphId: string | null;
    history: HistoryState;
}

type EditorStatePatch = Partial<{
    nodes: Node<TSLNodeData>[];
    edges: Edge[];
    selectedNodeId: string | null;
    selectedNodeIds: string[];
    graphStructureVersion: number;
    subgraphs: Record<string, SubgraphDefinition>;
    editorMode: EditorMode;
    editingSubgraphId: string | null;
    subgraphStack: SubgraphStackItem[];
    history: HistoryState;
    codeNodes: Record<string, CodeNodeDefinition>;
    canvasMode: 'pan' | 'select';
    debugMode: boolean;
    previewSettings: PreviewSettings;
    projectId: string | null;
    autoSaveCallback: (() => Promise<void>) | null;
    isSaving: boolean;
    isDirty: boolean;
    autoSaveEnabled: boolean;
    onSubgraphTemplateCreate: ((subgraph: SubgraphDefinition) => Promise<{ templateId: string; version: number }>) | null;
    onSubgraphTemplateUpdate: ((templateId: string, subgraph: SubgraphDefinition) => Promise<{ version: number }>) | null;
    onCodeNodeTemplateCreate: ((codeNode: CodeNodeDefinition) => Promise<{ templateId: string; version: number }>) | null;
    onCodeNodeTemplateUpdate: ((templateId: string, codeNode: CodeNodeDefinition) => Promise<{ version: number }>) | null;
}>;

export type EditorAction =
    | { type: 'editor/patch'; state: EditorStatePatch }
    | { type: 'editor/reset' }
    | { type: 'nodes/change'; changes: NodeChange[] }
    | { type: 'edges/change'; changes: EdgeChange[] }
    | { type: 'edges/connect'; connection: Connection; skipSnapshot?: boolean }
    | { type: 'edges/add'; edge: Edge; skipSnapshot?: boolean }
    | { type: 'nodes/add'; node: Node<TSLNodeData>; skipSnapshot?: boolean }
    | { type: 'nodes/delete'; nodeId: string; skipSnapshot?: boolean }
    | { type: 'nodes/updateValue'; nodeId: string; key: string; value: TSLValueType }
    | { type: 'selection/setNode'; nodeId: string | null }
    | { type: 'selection/setNodes'; nodeIds: string[] }
    | { type: 'preview/update'; updates: Partial<PreviewSettings> }
    | { type: 'canvas/setMode'; mode: 'pan' | 'select' }
    | { type: 'debug/setMode'; mode: boolean }
    | { type: 'autosave/markDirty' }
    | { type: 'autosave/setState'; isSaving?: boolean; isDirty?: boolean }
    | { type: 'history/snapshot' }
    | { type: 'history/undo' }
    | { type: 'history/redo' }
    | { type: 'history/clear' }
    | { type: 'history/setInProgress'; value: boolean }
    | { type: 'graph/clear' }
    | { type: 'nodes/group' }
    | { type: 'nodes/ungroup' }
    | { type: 'subgraph/create'; subgraph: SubgraphDefinition; edges: Edge[] }
    | { type: 'subgraph/enter'; state: SubgraphEnterState }
    | { type: 'subgraph/exit'; state: SubgraphExitState }
    | { type: 'subgraph/setDefinitions'; subgraphs: Record<string, SubgraphDefinition> }
    | { type: 'subgraph/addDefinition'; subgraph: SubgraphDefinition; skipSnapshot?: boolean }
    | { type: 'subgraph/updateDefinition'; subgraphId: string; updates: Partial<SubgraphDefinition> }
    | { type: 'subgraph/delete'; subgraphId: string }
    | { type: 'node/dynamicPort/add'; nodeId: string; port: SubgraphPort }
    | { type: 'node/dynamicPort/remove'; nodeId: string; portId: string }
    | { type: 'node/dynamicPort/update'; nodeId: string; portId: string; updates: Partial<SubgraphPort> }
    | { type: 'codeNode/setDefinitions'; codeNodes: Record<string, CodeNodeDefinition> }
    | { type: 'codeNode/addDefinition'; codeNode: CodeNodeDefinition; skipSnapshot?: boolean }
    | { type: 'codeNode/update'; id: string; updates: Partial<CodeNodeDefinition> }
    | { type: 'codeNode/delete'; id: string }
    | { type: 'project/setId'; projectId: string | null }
    | { type: 'autosave/success'; projectId: string | null }
    | { type: 'autosave/error'; projectId: string | null; message: string }
    | { type: 'event/error'; message: string; context?: string };

// Strip transient fields (like selection) from nodes for history
const stripTransientFields = (nodes: Node<TSLNodeData>[]): Node<TSLNodeData>[] => {
    return nodes.map(node => ({
        ...node,
        selected: false, // Don't store selection state
    }));
};


export interface EditorState {
    lastAction: EditorAction | null;
    dispatch: (action: EditorAction) => void;
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
}

export const createEditorStore = () => create<EditorState>((set, get) => ({
    lastAction: null,
    dispatch: (action) => {
        set({ lastAction: action });

        switch (action.type) {
            case 'editor/reset': {
                set({
                    lastAction: null,
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
                break;
            }
            case 'editor/patch': {
                set(action.state);
                break;
            }
            case 'nodes/change': {
                const changes = action.changes;
                const hasStructuralChange = changes.some(change => {
                    if (change.type === 'remove') return true;
                    if (change.type === 'add') return true;
                    if (change.type === 'position' || change.type === 'select') return false;
                    if (change.type === 'dimensions') return false;
                    return true;
                });

                const filteredChanges = changes.filter(change => {
                    if (change.type === 'remove') {
                        const nodeId = change.id;
                        if (nodeId === 'subgraph-input' || nodeId === 'subgraph-output') {
                            return false;
                        }
                    }
                    return true;
                });

                const hasSaveableChange = changes.some(change => change.type !== 'select');

                set({
                    nodes: applyNodeChanges(filteredChanges, get().nodes),
                    graphStructureVersion: hasStructuralChange ? get().graphStructureVersion + 1 : get().graphStructureVersion,
                });

                if (hasSaveableChange) {
                    get().markDirty();
                }
                break;
            }
            case 'edges/change': {
                const changes = action.changes;
                const hasStructuralChange = changes.some(change => change.type !== 'select');
                const hasSaveableChange = changes.some(change => change.type !== 'select');

                set({
                    edges: applyEdgeChanges(changes, get().edges),
                    graphStructureVersion: hasStructuralChange ? get().graphStructureVersion + 1 : get().graphStructureVersion,
                });

                if (hasSaveableChange) {
                    get().markDirty();
                }
                break;
            }
            case 'edges/connect': {
                if (!action.skipSnapshot) {
                    get().takeSnapshot();
                }

                const { edges } = get();
                const filteredEdges = edges.filter(
                    (edge) => {
                        const sameTarget = edge.target === action.connection.target;
                        const sameHandle = (edge.targetHandle || null) === (action.connection.targetHandle || null);
                        return !(sameTarget && sameHandle);
                    }
                );

                set({
                    edges: addEdge(action.connection, filteredEdges),
                    graphStructureVersion: get().graphStructureVersion + 1,
                });

                get().markDirty();
                break;
            }
            case 'edges/add': {
                if (!action.skipSnapshot) {
                    get().takeSnapshot();
                }

                set({
                    edges: addEdge(action.edge, get().edges),
                    graphStructureVersion: get().graphStructureVersion + 1,
                });

                get().markDirty();
                break;
            }
            case 'nodes/add': {
                if (!action.skipSnapshot) {
                    get().takeSnapshot();
                }

                const nodeType = action.node.data?.type ?? action.node.type;
                const isMaterialNode = (MATERIAL_NODE_TYPES as readonly string[]).includes(nodeType);
                let nextNodes = get().nodes;
                let nextEdges = get().edges;

                if (isMaterialNode) {
                    const existingMaterial = nextNodes.find(n =>
                        (MATERIAL_NODE_TYPES as readonly string[]).includes(n.data.type)
                    );

                    if (existingMaterial) {
                        const existingId = existingMaterial.id;
                        nextNodes = nextNodes.filter(n => n.id !== existingId);
                        nextEdges = nextEdges.filter(
                            e => e.source !== existingId && e.target !== existingId
                        );
                    }
                }

                const preparedNode = { ...action.node };
                const isInstanceCount = nodeType === 'geo/instanceCount';
                if (isInstanceCount) {
                    const { previewSettings } = get();
                    const initialCount = previewSettings.isInstanced ? previewSettings.instanceCount : 1;
                    const existingValues = preparedNode.data?.values ?? {};
                    if (existingValues.value === undefined) {
                        preparedNode.data = {
                            ...preparedNode.data,
                            values: { ...existingValues, value: initialCount },
                        };
                    }
                }

                set({
                    nodes: [...nextNodes, preparedNode],
                    edges: nextEdges,
                    graphStructureVersion: get().graphStructureVersion + 1,
                });

                get().markDirty();
                break;
            }
            case 'nodes/delete': {
                if (!action.skipSnapshot) {
                    get().takeSnapshot();
                }

                set({
                    nodes: get().nodes.filter((node) => node.id !== action.nodeId),
                    edges: get().edges.filter(
                        (edge) => edge.source !== action.nodeId && edge.target !== action.nodeId
                    ),
                    selectedNodeId: get().selectedNodeId === action.nodeId ? null : get().selectedNodeId,
                    graphStructureVersion: get().graphStructureVersion + 1,
                });

                get().markDirty();
                break;
            }
            case 'nodes/updateValue': {
                get().takeSnapshot();
                set({
                    nodes: get().nodes.map((node) =>
                        node.id === action.nodeId
                            ? {
                                ...node,
                                data: {
                                    ...node.data,
                                    values: { ...node.data.values, [action.key]: action.value },
                                },
                            }
                            : node
                    ),
                    graphStructureVersion: get().graphStructureVersion + 1,
                });
                get().markDirty();
                break;
            }
            case 'selection/setNode': {
                set({ selectedNodeId: action.nodeId });
                break;
            }
            case 'selection/setNodes': {
                set({
                    selectedNodeIds: action.nodeIds,
                    selectedNodeId: action.nodeIds.length === 1 ? action.nodeIds[0] : (action.nodeIds.length > 1 ? null : get().selectedNodeId),
                });
                break;
            }
            case 'preview/update': {
                set({ previewSettings: { ...get().previewSettings, ...action.updates } });
                get().markDirty();
                break;
            }
            case 'canvas/setMode': {
                set({ canvasMode: action.mode });
                break;
            }
            case 'debug/setMode': {
                set({ debugMode: action.mode });
                break;
            }
            case 'autosave/markDirty': {
                if (!get().isDirty) {
                    set({ isDirty: true });
                }
                get().triggerAutoSave();
                break;
            }
            case 'autosave/setState': {
                set({
                    ...(action.isSaving === undefined ? {} : { isSaving: action.isSaving }),
                    ...(action.isDirty === undefined ? {} : { isDirty: action.isDirty }),
                });
                break;
            }
            case 'history/snapshot': {
                const { nodes, edges, subgraphs, history, isUndoRedoInProgress } = get();

                if (isUndoRedoInProgress) return;

                const snapshot: Snapshot = {
                    nodes: stripTransientFields(nodes),
                    edges,
                    subgraphs,
                };

                const newPast = [...history.past, snapshot];
                if (newPast.length > 50) {
                    newPast.shift();
                }

                set({
                    history: {
                        past: newPast,
                        future: [],
                    },
                });
                break;
            }
            case 'history/undo': {
                const { history, nodes, edges, subgraphs } = get();
                if (history.past.length === 0) return;

                const previous = history.past[history.past.length - 1];
                const newPast = history.past.slice(0, -1);

                const currentSnapshot: Snapshot = {
                    nodes: stripTransientFields(nodes),
                    edges,
                    subgraphs,
                };

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

                setTimeout(() => {
                    get().dispatch({ type: 'history/setInProgress', value: false });
                    get().markDirty();
                }, 0);
                break;
            }
            case 'history/redo': {
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
                    get().dispatch({ type: 'history/setInProgress', value: false });
                    get().markDirty();
                }, 0);
                break;
            }
            case 'history/clear': {
                set({ history: { past: [], future: [] } });
                break;
            }
            case 'history/setInProgress': {
                set({ isUndoRedoInProgress: action.value });
                break;
            }
            case 'graph/clear': {
                get().takeSnapshot();
                set({
                    nodes: [],
                    edges: [],
                    graphStructureVersion: get().graphStructureVersion + 1,
                });
                get().markDirty();
                break;
            }
            case 'nodes/group': {
                const { nodes, selectedNodeIds } = get();

                const allSelectedNodes = nodes.filter(n => selectedNodeIds.includes(n.id));
                const selectedRoots = allSelectedNodes.filter(node => {
                    if (!node.parentId) return true;
                    return !selectedNodeIds.includes(node.parentId);
                });

                if (selectedRoots.length === 0) return;

                get().takeSnapshot();

                const nodesForBounds = selectedRoots.map(n => ({
                    ...n,
                    position: getAbsolutePosition(n, nodes),
                }));

                const bounds = getNodesBounds(nodesForBounds);

                const PADDING = 40;
                const width = bounds.width + PADDING * 2;
                const height = bounds.height + PADDING * 2;
                const x = bounds.x - PADDING;
                const y = bounds.y - PADDING;

                const groupId = `group-${Date.now()}`;

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

                const newNodes = nodes.map(node => {
                    const isRoot = selectedRoots.some(root => root.id === node.id);

                    if (isRoot) {
                        return {
                            ...node,
                            parentId: groupId,
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
                    selectedNodeIds: [groupId],
                    selectedNodeId: groupId,
                });
                break;
            }
            case 'nodes/ungroup': {
                const { nodes, selectedNodeIds } = get();
                if (selectedNodeIds.length === 0) return;

                get().takeSnapshot();

                const groupsToUngroup = nodes.filter(n =>
                    selectedNodeIds.includes(n.id) && n.type === 'group'
                );

                if (groupsToUngroup.length === 0) return;

                const groupIds = groupsToUngroup.map(g => g.id);

                const updatedNodes = nodes
                    .filter((node) => !groupIds.includes(node.id))
                    .map((node) => {
                        if (node.parentId && groupIds.includes(node.parentId)) {
                            const parentGroup = groupsToUngroup.find((g) => g.id === node.parentId);
                            if (parentGroup) {
                                return {
                                    ...node,
                                    parentId: undefined,
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
                    selectedNodeIds: [],
                    selectedNodeId: null,
                });
                break;
            }
            case 'subgraph/create': {
                set({
                    subgraphs: { ...get().subgraphs, [action.subgraph.id]: action.subgraph },
                    edges: action.edges,
                });
                get().markDirty();
                break;
            }
            case 'subgraph/enter': {
                set(action.state);
                break;
            }
            case 'subgraph/exit': {
                set(action.state);
                break;
            }
            case 'subgraph/setDefinitions': {
                set({ subgraphs: action.subgraphs });
                break;
            }
            case 'subgraph/addDefinition': {
                if (!action.skipSnapshot) {
                    get().takeSnapshot();
                }
                set({
                    subgraphs: {
                        ...get().subgraphs,
                        [action.subgraph.id]: {
                            ...action.subgraph,
                            createdAt: action.subgraph.createdAt || Date.now(),
                            updatedAt: Date.now(),
                        },
                    },
                    graphStructureVersion: get().graphStructureVersion + 1,
                });
                get().markDirty();
                break;
            }
            case 'subgraph/updateDefinition': {
                get().takeSnapshot();
                const subgraph = get().subgraphs[action.subgraphId];
                if (!subgraph) return;

                set({
                    subgraphs: {
                        ...get().subgraphs,
                        [action.subgraphId]: { ...subgraph, ...action.updates, updatedAt: Date.now() },
                    },
                    graphStructureVersion: get().graphStructureVersion + 1,
                });

                get().markDirty();
                break;
            }
            case 'subgraph/delete': {
                const { [action.subgraphId]: _, ...rest } = get().subgraphs;
                set({ subgraphs: rest });
                get().markDirty();
                break;
            }
            case 'node/dynamicPort/add': {
                get().takeSnapshot();
                set({
                    nodes: get().nodes.map(node =>
                        node.id === action.nodeId
                            ? {
                                ...node,
                                data: {
                                    ...node.data,
                                    dynamicPorts: [...(node.data.dynamicPorts || []), action.port],
                                },
                            }
                            : node
                    ),
                });
                break;
            }
            case 'node/dynamicPort/remove': {
                get().takeSnapshot();
                set({
                    nodes: get().nodes.map(node =>
                        node.id === action.nodeId
                            ? {
                                ...node,
                                data: {
                                    ...node.data,
                                    dynamicPorts: (node.data.dynamicPorts || []).filter(p => p.id !== action.portId),
                                },
                            }
                            : node
                    ),
                });
                break;
            }
            case 'node/dynamicPort/update': {
                get().takeSnapshot();
                set({
                    nodes: get().nodes.map(node =>
                        node.id === action.nodeId
                            ? {
                                ...node,
                                data: {
                                    ...node.data,
                                    dynamicPorts: (node.data.dynamicPorts || []).map(p =>
                                        p.id === action.portId ? { ...p, ...action.updates } : p
                                    ),
                                },
                            }
                            : node
                    ),
                });
                break;
            }
            case 'codeNode/setDefinitions': {
                set({ codeNodes: action.codeNodes });
                break;
            }
            case 'codeNode/addDefinition': {
                if (!action.skipSnapshot) {
                    get().takeSnapshot();
                }
                set({
                    codeNodes: {
                        ...get().codeNodes,
                        [action.codeNode.id]: {
                            ...action.codeNode,
                            createdAt: action.codeNode.createdAt || Date.now(),
                            updatedAt: Date.now(),
                        },
                    },
                    graphStructureVersion: get().graphStructureVersion + 1,
                });
                get().markDirty();
                break;
            }
            case 'codeNode/update': {
                get().takeSnapshot();
                const codeNode = get().codeNodes[action.id];
                if (!codeNode) return;

                const updatedCodeNode = { ...codeNode, ...action.updates, updatedAt: Date.now() };
                const { nodes, edges } = get();

                const newInputIds = (updatedCodeNode.inputs || []).map(p => p.id);
                const newOutputId = updatedCodeNode.output?.id;

                let newEdges = edges;

                const newNodes = nodes.map(node => {
                    if (node.data.type === action.id || node.type === action.id) {
                        const newPorts = [...(updatedCodeNode.inputs || []), updatedCodeNode.output].filter(Boolean) as SubgraphPort[];
                        const validHandleIds = new Set([...newInputIds, newOutputId].filter(Boolean));

                        newEdges = newEdges.filter(edge => {
                            if (edge.source === node.id) {
                                return validHandleIds.has(edge.sourceHandle || '');
                            }
                            if (edge.target === node.id) {
                                return validHandleIds.has(edge.targetHandle || '');
                            }
                            return true;
                        });

                        return {
                            ...node,
                            data: {
                                ...node.data,
                                label: updatedCodeNode.name,
                                dynamicPorts: newPorts,
                            }
                        };
                    }
                    return node;
                });

                set({
                    codeNodes: {
                        ...get().codeNodes,
                        [action.id]: updatedCodeNode,
                    },
                    nodes: newNodes,
                    edges: newEdges,
                    graphStructureVersion: get().graphStructureVersion + 1,
                });
                get().markDirty();
                break;
            }
            case 'codeNode/delete': {
                get().takeSnapshot();
                const { [action.id]: _, ...rest } = get().codeNodes;
                set({ codeNodes: rest });
                get().markDirty();
                break;
            }
            case 'project/setId': {
                set({ projectId: action.projectId });
                break;
            }
            case 'autosave/success':
            case 'autosave/error':
            case 'event/error':
                break;
            default:
                break;
        }
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
        get().dispatch({ type: 'preview/update', updates });
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
    setCanvasMode: (mode) => get().dispatch({ type: 'canvas/setMode', mode }),

    // Debug Mode - off by default
    debugMode: false,
    setDebugMode: (mode) => get().dispatch({ type: 'debug/setMode', mode }),

    // History initialization
    history: { past: [], future: [] },
    isUndoRedoInProgress: false,

    // Auto-save methods
    setAutoSaveCallback: (callback) => {
        get().dispatch({ type: 'editor/patch', state: { autoSaveCallback: callback } });
    },
    setProjectId: (projectId) => {
        get().dispatch({ type: 'project/setId', projectId });
    },

    // Template callbacks setter
    setTemplateCallbacks: (callbacks) => {
        get().dispatch({
            type: 'editor/patch',
            state: {
                onSubgraphTemplateCreate: callbacks.onSubgraphTemplateCreate ?? null,
                onSubgraphTemplateUpdate: callbacks.onSubgraphTemplateUpdate ?? null,
                onCodeNodeTemplateCreate: callbacks.onCodeNodeTemplateCreate ?? null,
                onCodeNodeTemplateUpdate: callbacks.onCodeNodeTemplateUpdate ?? null,
            },
        });
    },

    markDirty: () => {
        get().dispatch({ type: 'autosave/markDirty' });
    },

    triggerAutoSave: (() => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        return () => {
            const state = get();
            if (!state.autoSaveEnabled || !state.autoSaveCallback) return;

            // If already saving, just ensure dirty flag is set and exit
            // The completion handler will pick it up
            if (state.isSaving) {
                if (!state.isDirty) {
                    get().dispatch({ type: 'autosave/setState', isDirty: true });
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
                const currentState = get();

                // Double-check we're not already saving (race condition guard)
                if (currentState.isSaving) {
                    return;
                }

                if (!currentState.isDirty) return;

                // Clear dirty flag BEFORE starting save - this captures the current state.
                // If changes happen during the save, markDirty() will set isDirty: true again,
                // and the follow-up check will trigger another save.
                get().dispatch({ type: 'autosave/setState', isSaving: true, isDirty: false });

                try {
                    await currentState.autoSaveCallback?.();

                    get().dispatch({ type: 'autosave/success', projectId: currentState.projectId });

                    get().dispatch({ type: 'autosave/setState', isSaving: false });

                    // Immediately check if more changes occurred during save
                    // Use a small delay to ensure state is settled
                    setTimeout(() => {
                        const afterSaveState = get();
                        if (afterSaveState.isDirty && !afterSaveState.isSaving) {
                            afterSaveState.triggerAutoSave();
                        }
                    }, 100);
                } catch (error) {
                    console.error('Auto-save failed:', error);
                    // Re-mark as dirty since save failed - the original changes weren't persisted
                    get().dispatch({ type: 'autosave/setState', isSaving: false, isDirty: true });
                    const message = getErrorMessage(error);
                    get().dispatch({ type: 'autosave/error', projectId: currentState.projectId, message });

                    // On error, retry after a delay
                    setTimeout(() => {
                        const afterErrorState = get();
                        if (afterErrorState.isDirty && !afterErrorState.isSaving) {
                            afterErrorState.triggerAutoSave();
                        }
                    }, 1000);
                }
            }, 2000);
        };
    })(),

    onNodesChange: (changes) => {
        get().dispatch({ type: 'nodes/change', changes });
    },

    onEdgesChange: (changes) => {
        get().dispatch({ type: 'edges/change', changes });
    },

    onConnect: (connection: Connection) => {
        get().dispatch({ type: 'edges/connect', connection });
    },

    addNode: (type, position, data = {}) => {
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
        get().dispatch({ type: 'nodes/add', node: newNode });

        return true;
    },

    updateNodeValue: (nodeId, key, value) => {
        get().dispatch({ type: 'nodes/updateValue', nodeId, key, value });
    },

    deleteNode: (nodeId) => {
        get().dispatch({ type: 'nodes/delete', nodeId });
    },

    setSelectedNode: (nodeId) => {
        get().dispatch({ type: 'selection/setNode', nodeId });
    },

    getSelectedNode: () => {
        const { nodes, selectedNodeId } = get();
        return nodes.find((n) => n.id === selectedNodeId);
    },

    setSelectedNodes: (nodeIds: string[]) => {
        get().dispatch({ type: 'selection/setNodes', nodeIds });
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
                get().dispatch({
                    type: 'editor/patch',
                    state: {
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
                    },
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
        get().dispatch({ type: 'graph/clear' });
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

        get().dispatch({ type: 'history/snapshot' });
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

        get().dispatch({ type: 'subgraph/create', subgraph, edges: edgesToKeep });

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

        get().dispatch({
            type: 'subgraph/enter',
            state: {
                subgraphStack: [...subgraphStack, stackItem],
                editorMode: 'subgraph',
                editingSubgraphId: subgraphId,
                nodes: [inputNode, outputNode, ...subgraph.nodes],
                edges: [...subgraph.edges],
                selectedNodeId: null,
                history: { past: [], future: [] },
            },
        });

        return true;
    },

    exitSubgraphEditor: async (save: boolean, nameOverride?: string) => {
        const { editingSubgraphId, nodes, edges, subgraphs, subgraphStack } = get();

        if (subgraphStack.length === 0 || !editingSubgraphId) {
            // Fallback for safety, though stack should not be empty if we are in subgraph mode
            get().dispatch({ type: 'editor/patch', state: { editorMode: 'main', editingSubgraphId: null } });
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
            get().dispatch({
                type: 'subgraph/setDefinitions',
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
                        const latestSubgraphs = get().subgraphs;
                        if (latestSubgraphs[editingSubgraphId]) {
                            get().dispatch({
                                type: 'subgraph/setDefinitions',
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
                        get().dispatch({ type: 'event/error', context: 'update_subgraph_template', message });
                    }
                }
            } else {
                // CREATE new template (first time saving this subgraph)
                if (onSubgraphTemplateCreate) {
                    try {
                        const result = await onSubgraphTemplateCreate(updatedSubgraph);
                        // Update local definition with template reference
                        const latestSubgraphs = get().subgraphs;
                        if (latestSubgraphs[editingSubgraphId]) {
                            get().dispatch({
                                type: 'subgraph/setDefinitions',
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
                        get().dispatch({ type: 'event/error', context: 'create_subgraph_template', message });
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
                    get().dispatch({
                        type: 'subgraph/exit',
                        state: {
                            nodes: newNodes,
                            edges: newEdges,
                            subgraphStack: newStack,
                            selectedNodeId: null,
                            selectedNodeIds: [],
                            editorMode: previousMode,
                            editingSubgraphId: previousSubgraphId,
                            history: stackItem.history,
                        },
                    });
                }, 0);
                return;
            }

            // No original nodes - just restore backup
            get().dispatch({
                type: 'subgraph/exit',
                state: {
                    nodes: restoredNodes,
                    edges: restoredEdges,
                    subgraphStack: newStack,
                    selectedNodeId: null,
                    selectedNodeIds: [],
                    editorMode: previousMode,
                    editingSubgraphId: previousSubgraphId,
                    history: stackItem.history,
                },
            });
            return;
        }

        // Restore graph (fallback for cancel)
        const previousMode = stackItem.subgraphId ? 'subgraph' : 'main';
        const previousSubgraphId = stackItem.subgraphId;

        get().dispatch({
            type: 'subgraph/exit',
            state: {
                nodes: stackItem.nodes,
                edges: stackItem.edges,
                subgraphStack: newStack,
                editorMode: previousMode,
                editingSubgraphId: previousSubgraphId,
                selectedNodeId: null,
                selectedNodeIds: [],
                history: stackItem.history,
            },
        });
    },

    updateSubgraphDefinition: (subgraphId: string, updates: Partial<SubgraphDefinition>) => {
        get().dispatch({ type: 'subgraph/updateDefinition', subgraphId, updates });
    },

    addSubgraphDefinition: (subgraph: SubgraphDefinition) => {
        get().dispatch({ type: 'subgraph/addDefinition', subgraph });
    },

    deleteSubgraph: (subgraphId: string) => {
        get().dispatch({ type: 'subgraph/delete', subgraphId });
    },

    addDynamicPort: (nodeId: string, port: SubgraphPort) => {
        get().dispatch({ type: 'node/dynamicPort/add', nodeId, port });
    },

    removeDynamicPort: (nodeId: string, portId: string) => {
        get().dispatch({ type: 'node/dynamicPort/remove', nodeId, portId });
    },

    updateDynamicPort: (nodeId: string, portId: string, updates: Partial<SubgraphPort>) => {
        get().dispatch({ type: 'node/dynamicPort/update', nodeId, portId, updates });
    },

    getSubgraph: (id: string) => {
        return get().subgraphs[id];
    },

    isSubgraphMode: () => {
        return get().editorMode === 'subgraph';
    },

    // Code Node Actions

    createCodeNode: async (name: string, code: string, inputs: SubgraphPort[], output: SubgraphPort) => {
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

        get().dispatch({ type: 'codeNode/addDefinition', codeNode });

        // Auto-save to DB as private template
        const { onCodeNodeTemplateCreate } = get();
        if (onCodeNodeTemplateCreate) {
            try {
                const result = await onCodeNodeTemplateCreate(codeNode);
                // Update local definition with template reference
                const currentCodeNodes = get().codeNodes;
                if (currentCodeNodes[id]) {
                    get().dispatch({
                        type: 'codeNode/setDefinitions',
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
                const currentCodeNodes = get().codeNodes;
                const { [id]: _, ...rest } = currentCodeNodes;
                get().dispatch({ type: 'codeNode/setDefinitions', codeNodes: rest });

                console.error('Failed to save code node template to DB:', error);
                const message = getErrorMessage(error);
                get().dispatch({ type: 'event/error', context: 'create_code_node_template', message });
                return null;
            }
        }

        return id;
    },

    updateCodeNode: (id: string, updates: Partial<CodeNodeDefinition>) => {
        get().dispatch({ type: 'codeNode/update', id, updates });

        // Push updates to DB if this code node is linked to a template
        // AND we are not just syncing the version from the DB (indicated by presence of templateVersion in updates)
        const isSyncing = typeof updates.templateVersion === 'number';
        const { onCodeNodeTemplateUpdate } = get();
        const updatedCodeNode = get().codeNodes[id];
        if (onCodeNodeTemplateUpdate && updatedCodeNode?.templateId && !isSyncing) {
            onCodeNodeTemplateUpdate(updatedCodeNode.templateId, updatedCodeNode).then(result => {
                // Update local version
                const latestCodeNodes = get().codeNodes;
                if (latestCodeNodes[id]) {
                    get().dispatch({
                        type: 'codeNode/setDefinitions',
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
                get().dispatch({ type: 'event/error', context: 'update_code_node_template', message });
            });
        }
    },

    deleteCodeNode: (id: string) => {
        get().dispatch({ type: 'codeNode/delete', id });
    },

    addCodeNodeDefinition: (codeNode: CodeNodeDefinition) => {
        get().dispatch({ type: 'codeNode/addDefinition', codeNode });
    },

    getCodeNode: (id: string) => {
        return get().codeNodes[id];
    },

    // History Implementation

    takeSnapshot: () => {
        get().dispatch({ type: 'history/snapshot' });
    },

    undo: () => {
        get().dispatch({ type: 'history/undo' });
    },

    redo: () => {
        get().dispatch({ type: 'history/redo' });
    },

    clearHistory: () => {
        get().dispatch({ type: 'history/clear' });
    },

    groupNodes: () => {
        get().dispatch({ type: 'nodes/group' });
    },

    ungroupNodes: () => {
        get().dispatch({ type: 'nodes/ungroup' });
    },

    resetEditor: () => {
        get().dispatch({ type: 'editor/reset' });
    },
}));

// Note: Auto-save is triggered by markDirty() which is called when changes occur
