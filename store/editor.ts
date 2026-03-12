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
import { replaceEdgeOnTargetHandle } from '@/lib/graph-utils';
import { loopNodes, MATERIAL_NODE_TYPES, POST_ANCHOR_NODE_TYPES, POST_FX_NODE_TYPES } from '@/lib/nodes';
import { TSLNodeData, NodeType, SubgraphDefinition, SubgraphPort, CodeNodeDefinition, TSLValueType, AppNode, GlobalContextEntry, GlobalContextKind, TSLType } from '@/lib/types';
import { getMultiOpInputHandleIds, type MultiOpType } from '@/lib/multi-op';
import { buildMultiOpFromChain } from '@/lib/multi-op-convert';
import { DEFAULT_GRADIENT_STOPS, normalizeGradientStops } from '@/lib/gradient-utils';
import { registry } from '@/lib/registry';
import { getMaterialStoredActiveInputs } from '@/lib/material-inputs';
import { toast } from 'sonner';
import { UNIFORM_KINDS, coerceUniformValue, getUniformKindFromNode, type UniformKind } from '@/lib/uniform-utils';
import { clearUniforms, removeUniform, updateUniformValue } from '@/lib/uniform-store';
import {
    getLocalName,
    isLocalSetNode,
    isLocalSetType,
    normalizeLocalName,
} from '@/lib/local-utils';

// Preview mesh type
export type PreviewMeshType = 'box' | 'sphere' | 'torus' | 'plane' | 'cylinder' | 'fullscreenQuad';
export type RootGraphMode = 'material' | 'post';
export type MaterialNodeType = (typeof MATERIAL_NODE_TYPES)[number];

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
    geometryScript?: string;
    codeMode?: 'generated' | 'custom';
    customCode?: string;
    environment?: string;
    environmentIntensity?: number;
    showEnvironmentBackground?: boolean;
    showBackdrop?: boolean;
    showGrid?: boolean;
    postEnabled?: boolean;
}

// Graph save format
export interface GraphData {
    version: number;
    activeRootGraph?: RootGraphMode;
    nodes: Node<TSLNodeData>[];
    edges: Edge[];
    postNodes?: Node<TSLNodeData>[];
    postEdges?: Edge[];
    globals?: GlobalContextEntry[];
    // Subgraph definitions
    subgraphs?: Record<string, SubgraphDefinition>;
    // Code node definitions
    codeNodes?: Record<string, CodeNodeDefinition>;
    // Preview settings
    previewSettings?: PreviewSettings;
}

// Editor mode - main graph or editing a subgraph
export type EditorMode = 'main' | 'subgraph';

const GRAPH_VERSION = 2;
const STORAGE_KEY = 'tsl-editor-graph';

const SUBGRAPH_INPUT_ID = 'subgraph-input';
const SUBGRAPH_OUTPUT_ID = 'subgraph-output';
const POST_INPUT_ID = 'post-input';
const POST_OUTPUT_ID = 'post-output';
const POST_INPUT_POSITION = { x: -400, y: 200 };
const POST_OUTPUT_POSITION = { x: 400, y: 200 };

type LoopMode = 'count' | 'range' | 'reverse' | 'nested' | 'condition';

const LOOP_MODES: readonly LoopMode[] = ['count', 'range', 'reverse', 'nested', 'condition'];
const DEFAULT_LOOP_MODE: LoopMode = 'count';
const DEFAULT_LOOP_TYPE = 'int';
const DEFAULT_LOOP_COMPARE = '<';

const LOOP_INTERNAL_NODE_TYPES = new Set([
    'loop/count',
    'loop/start',
    'loop/end',
    'loop/index',
    'loop/count2',
    'loop/index2',
    'loop/accumulator',
    'loop/condition',
    'loop/output',
]);

const LOOP_SLOT_X = 20;
const LOOP_SLOT_Y = 20;
const LOOP_SLOT_GAP = 90;
const LOOP_NODE_WIDTH = 50;
const LOOP_EXTRA_HEIGHT = 120;

//omit 'loop' 
type LoopInternalNodeType = Exclude<typeof loopNodes[number]['type'], "loop">;

const LOOP_LEFT_NODE_TYPES_BY_MODE: Record<LoopMode, readonly LoopInternalNodeType[]> = {
    count: ['loop/count', 'loop/index', 'loop/accumulator'],
    range: ['loop/start', 'loop/end', 'loop/index', 'loop/accumulator'],
    reverse: ['loop/start', 'loop/index', 'loop/accumulator'],
    nested: ['loop/count', 'loop/index', 'loop/count2', 'loop/index2', 'loop/accumulator'],
    condition: ['loop/condition', 'loop/accumulator'],
};

const isLoopGroupNode = (node: Node<TSLNodeData>) => node.type === 'loop' || node.data.type === 'loop';

const isGroupLikeNode = (node: Node<TSLNodeData>) => node.type === 'group' || isLoopGroupNode(node);

const isLoopInternalNode = (node: Node<TSLNodeData>) => LOOP_INTERNAL_NODE_TYPES.has(node.data.type);

const isPostAnchorNodeType = (type: string) =>
    (POST_ANCHOR_NODE_TYPES as readonly string[]).includes(type);

const isMaterialNodeType = (type: string): type is MaterialNodeType =>
    (MATERIAL_NODE_TYPES as readonly string[]).includes(type);

const isSubgraphAnchorNode = (node: Node<TSLNodeData>) =>
    node.id === SUBGRAPH_INPUT_ID ||
    node.id === SUBGRAPH_OUTPUT_ID ||
    node.data.type === 'subgraph/input' ||
    node.data.type === 'subgraph/output';

const isPostAnchorNode = (node: Node<TSLNodeData>) =>
    node.id === POST_INPUT_ID ||
    node.id === POST_OUTPUT_ID ||
    isPostAnchorNodeType(node.data.type);

const isAnchorNode = (node: Node<TSLNodeData>) =>
    isSubgraphAnchorNode(node) ||
    isPostAnchorNode(node);

const cloneNode = (node: Node<TSLNodeData>): Node<TSLNodeData> => ({
    ...node,
    data: {
        ...node.data,
        values: { ...(node.data.values || {}) },
        connected: { ...(node.data.connected || {}) },
        activeInputs: node.data.activeInputs ? [...node.data.activeInputs] : undefined,
        dynamicPorts: node.data.dynamicPorts ? node.data.dynamicPorts.map((p) => ({ ...p })) : undefined,
        operations: Array.isArray(node.data.operations)
            ? node.data.operations.map((op) => ({ ...op }))
            : undefined,
    },
    style: node.style ? { ...node.style } : undefined,
});

const cloneEdge = (edge: Edge): Edge => ({
    ...edge,
    data: edge.data ? { ...(edge.data as Record<string, unknown>) } : edge.data,
    style: edge.style ? { ...edge.style } : edge.style,
});

const cloneNodes = (nodes: Node<TSLNodeData>[]): Node<TSLNodeData>[] => nodes.map(cloneNode);

const cloneEdges = (edges: Edge[]): Edge[] => edges.map(cloneEdge);

const createDefaultPreviewSettings = (): PreviewSettings => ({
    mesh: 'sphere',
    isInstanced: false,
    instanceCount: 100,
    geometryScript: '',
    codeMode: 'generated',
    customCode: '',
    environment: 'none',
    environmentIntensity: 1,
    showEnvironmentBackground: false,
    showBackdrop: false,
    showGrid: true,
    postEnabled: true,
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
    },
});

const createPostInputAnchorNode = (position = POST_INPUT_POSITION): Node<TSLNodeData> => ({
    id: POST_INPUT_ID,
    type: 'post/input',
    position: { ...position },
    data: {
        type: 'post/input',
        values: {},
        connected: {},
    },
});

const createPostOutputAnchorNode = (position = POST_OUTPUT_POSITION): Node<TSLNodeData> => ({
    id: POST_OUTPUT_ID,
    type: 'post/output',
    position: { ...position },
    data: {
        type: 'post/output',
        values: {},
        connected: {},
    },
});

const normalizePostGraph = (
    inputNodes: Node<TSLNodeData>[] | undefined,
    inputEdges: Edge[] | undefined
): { nodes: Node<TSLNodeData>[]; edges: Edge[] } => {
    const nodes = Array.isArray(inputNodes) ? cloneNodes(inputNodes) : [];
    const edges = Array.isArray(inputEdges) ? cloneEdges(inputEdges) : [];

    const inputAlias = nodes.find((node) => node.id === POST_INPUT_ID || node.data.type === 'post/input');
    const outputAlias = nodes.find((node) => node.id === POST_OUTPUT_ID || node.data.type === 'post/output');

    const aliases = new Map<string, string>();
    if (inputAlias) aliases.set(inputAlias.id, POST_INPUT_ID);
    if (outputAlias) aliases.set(outputAlias.id, POST_OUTPUT_ID);

    const internalNodes = nodes.filter((node) => !isPostAnchorNode(node));
    const normalizedNodes: Node<TSLNodeData>[] = [
        createPostInputAnchorNode(inputAlias?.position ?? POST_INPUT_POSITION),
        createPostOutputAnchorNode(outputAlias?.position ?? POST_OUTPUT_POSITION),
        ...internalNodes,
    ];

    const validNodeIds = new Set(normalizedNodes.map((node) => node.id));
    const normalizedEdges = edges
        .map((edge) => ({
            ...edge,
            source: aliases.get(edge.source) ?? edge.source,
            target: aliases.get(edge.target) ?? edge.target,
        }))
        .filter((edge) => validNodeIds.has(edge.source) && validNodeIds.has(edge.target));

    return {
        nodes: normalizedNodes,
        edges: normalizedEdges,
    };
};

const isLoopMode = (value: string): value is LoopMode => {
    return LOOP_MODES.includes(value as LoopMode);
};

const getLoopMode = (node: Node<TSLNodeData>): LoopMode => {
    const mode = node.data.values?.loopMode;
    return typeof mode === 'string' && isLoopMode(mode) ? mode : DEFAULT_LOOP_MODE;
};

const getLoopLeftNodeTypes = (mode: LoopMode): readonly NodeType[] => {
    return LOOP_LEFT_NODE_TYPES_BY_MODE[mode] ?? LOOP_LEFT_NODE_TYPES_BY_MODE[DEFAULT_LOOP_MODE];
};

const getLoopRequiredHeight = (mode: LoopMode): number => {
    const leftCount = getLoopLeftNodeTypes(mode).length;
    if (leftCount === 0) return LOOP_EXTRA_HEIGHT;
    return LOOP_SLOT_Y + (leftCount - 1) * LOOP_SLOT_GAP + LOOP_EXTRA_HEIGHT;
};

const getLoopInternalDefaultValues = (type: string): Record<string, TSLValueType> => {
    switch (type) {
        case 'loop/count':
        case 'loop/count2':
            return { count: 1 };
        case 'loop/start':
            return { start: 0 };
        case 'loop/end':
            return { end: 1 };
        case 'loop/accumulator':
            return { seed: 0 };
        case 'loop/condition':
            return { cond: false };
        default:
            return {};
    }
};

const isUniformKindType = (type: TSLType): type is UniformKind => {
    return UNIFORM_KINDS.includes(type as UniformKind);
};

const getGlobalDefaultValue = (type: TSLType): TSLValueType => {
    switch (type) {
        case 'color':
            return '#ffffff';
        case 'bool':
            return false;
        case 'vec2':
            return [0, 0];
        case 'vec3':
            return [0, 0, 0];
        case 'vec4':
            return [0, 0, 0, 1];
        case 'int':
        case 'uint':
        case 'float':
        case 'any':
            return 0;
        case 'string':
            return '';
        default:
            return 0;
    }
};

const coerceGlobalValue = (type: TSLType, value: TSLValueType | undefined): TSLValueType => {
    if (isUniformKindType(type)) {
        return coerceUniformValue(type, value);
    }
    if (type === 'string') {
        return typeof value === 'string' ? value : String(value ?? '');
    }
    if (type === 'any') {
        return value ?? 0;
    }
    return value ?? getGlobalDefaultValue(type);
};

const makeUniqueGlobalName = (baseName: string, globals: GlobalContextEntry[]): string => {
    const trimmed = baseName.trim() || 'Global';
    const lowerSet = new Set(globals.map((g) => g.name.toLowerCase()));
    if (!lowerSet.has(trimmed.toLowerCase())) return trimmed;
    let suffix = 1;
    let candidate = `${trimmed}_${suffix}`;
    while (lowerSet.has(candidate.toLowerCase())) {
        suffix += 1;
        candidate = `${trimmed}_${suffix}`;
    }
    return candidate;
};

const syncGlobalUniforms = (prev: GlobalContextEntry[], next: GlobalContextEntry[]) => {
    const prevUniforms = prev.filter(
        (entry): entry is GlobalContextEntry & { type: UniformKind } =>
            entry.kind === 'uniform' && isUniformKindType(entry.type)
    );
    const nextUniforms = next.filter(
        (entry): entry is GlobalContextEntry & { type: UniformKind } =>
            entry.kind === 'uniform' && isUniformKindType(entry.type)
    );
    const nextUniformMap = new Map(nextUniforms.map((entry) => [entry.id, entry]));

    prevUniforms.forEach((entry) => {
        const nextEntry = nextUniformMap.get(entry.id);
        if (!nextEntry || nextEntry.type !== entry.type) {
            removeUniform(entry.id);
        }
    });

    nextUniforms.forEach((entry) => {
        updateUniformValue(entry.id, entry.type, entry.defaultValue);
    });
};

const makeUniqueLocalName = (
    baseName: string,
    nodes: Node<TSLNodeData>[],
    excludeNodeId?: string
): string => {
    const trimmed = baseName.trim() || 'local';
    const normalizedSet = new Set(
        nodes
            .filter((node) => isLocalSetNode(node) && node.id !== excludeNodeId)
            .map((node) => normalizeLocalName(getLocalName(node)))
            .filter((name) => name.length > 0)
    );

    if (!normalizedSet.has(normalizeLocalName(trimmed))) return trimmed;

    let suffix = 1;
    let candidate = `${trimmed}_${suffix}`;
    while (normalizedSet.has(normalizeLocalName(candidate))) {
        suffix += 1;
        candidate = `${trimmed}_${suffix}`;
    }
    return candidate;
};

const getDefaultLocalSourceId = (
    nodes: Node<TSLNodeData>[],
    position: { x: number; y: number }
): string | null => {
    const localSets = nodes.filter((node) => isLocalSetNode(node));
    if (localSets.length === 0) return null;

    let best: { id: string; dist: number } | null = null;
    for (const node of localSets) {
        const dx = node.position.x - position.x;
        const dy = node.position.y - position.y;
        const dist = dx * dx + dy * dy;
        if (!best || dist < best.dist) {
            best = { id: node.id, dist };
        }
    }

    return best?.id ?? null;
};

const LOOP_INTERNAL_ID_SUFFIX: Record<string, string> = {
    'loop/count': 'count',
    'loop/start': 'start',
    'loop/end': 'end',
    'loop/index': 'index',
    'loop/count2': 'count2',
    'loop/index2': 'index2',
    'loop/accumulator': 'acc',
    'loop/condition': 'condition',
    'loop/output': 'output',
};

const createLoopInternalNode = (
    loopId: string,
    type: string,
    position: { x: number; y: number },
    width?: number
): Node<TSLNodeData> => {
    const idSuffix = LOOP_INTERNAL_ID_SUFFIX[type] ?? type.split('/')[1];
    const id = `${loopId}::${idSuffix}`;
    const node: Node<TSLNodeData> = {
        id,
        type,
        position,
        parentId: loopId,
        extent: 'parent',
        draggable: false,
        data: {
            type: type as NodeType,
            values: getLoopInternalDefaultValues(type),
            connected: {},
        },
    };

    if (type === 'loop/output' && typeof width === 'number') {
        node.position.x = Math.max(LOOP_SLOT_X, width - LOOP_NODE_WIDTH - LOOP_SLOT_X);
        node.position.y = LOOP_SLOT_Y;
    }

    return node;
};

const getNodeDimensionValue = (node: Node<TSLNodeData>, key: 'width' | 'height'): number | null => {
    const direct = (node as Node<TSLNodeData> & { [k: string]: unknown })[key];
    if (typeof direct === 'number') return direct;
    const styleValue = node.style?.[key];
    if (typeof styleValue === 'number') return styleValue;
    if (typeof styleValue === 'string') {
        const parsed = Number(styleValue.replace('px', ''));
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

const getAncestorLoopId = (node: Node<TSLNodeData>, nodes: Node<TSLNodeData>[]): string | null => {
    let parentId = node.parentId;
    while (parentId) {
        const parent = nodes.find(n => n.id === parentId);
        if (!parent) break;
        if (isLoopGroupNode(parent)) return parent.id;
        parentId = parent.parentId;
    }
    return null;
};

const resolveSubgraphScope = (
    subgraph: Pick<SubgraphDefinition, 'scope' | 'templateId'> | undefined
): 'project' | 'library' => {
    if (subgraph?.scope === 'library' || subgraph?.scope === 'project') return subgraph.scope;
    return subgraph?.templateId ? 'library' : 'project';
};


interface SubgraphStackItem {
    nodes: Node<TSLNodeData>[];
    edges: Edge[];
    originalNodeIds: string[];
    subgraphId: string | null; // The ID of the subgraph we were editing (or null for main graph)
    editingScopeDraft: 'project' | 'library' | null;
    history: HistoryState; // Preserve history of the parent graph
    createInstanceOnSave?: boolean;
}

interface Snapshot {
    nodes: Node<TSLNodeData>[];
    edges: Edge[];
    subgraphs: Record<string, SubgraphDefinition>;
    globals: GlobalContextEntry[];
}

interface HistoryState {
    past: Snapshot[];
    future: Snapshot[];
}

interface RootGraphSnapshot {
    nodes: Node<TSLNodeData>[];
    edges: Edge[];
    history: HistoryState;
    selectedNodeId: string | null;
    selectedNodeIds: string[];
}

type ClipboardData = {
    nodes: Node<TSLNodeData>[];
    edges: Edge[];
    worldPositions: Record<string, { x: number; y: number }>;
    bounds: { x: number; y: number; width: number; height: number };
    pasteIndex: number;
};

// Strip transient fields (like selection) from nodes for history
const stripTransientFields = (nodes: Node<TSLNodeData>[]): Node<TSLNodeData>[] => {
    return nodes.map(node => ({
        ...node,
        selected: false, // Don't store selection state
    }));
};

const createEmptyHistoryState = (): HistoryState => ({ past: [], future: [] });

const createRootGraphSnapshot = (snapshot?: Partial<RootGraphSnapshot>): RootGraphSnapshot => ({
    nodes: cloneNodes(snapshot?.nodes ?? []),
    edges: cloneEdges(snapshot?.edges ?? []),
    history: snapshot?.history ?? createEmptyHistoryState(),
    selectedNodeId: snapshot?.selectedNodeId ?? null,
    selectedNodeIds: snapshot?.selectedNodeIds ? [...snapshot.selectedNodeIds] : [],
});

const createMaterialNode = (
    nodeId: string,
    type: MaterialNodeType,
    position: { x: number; y: number } = { x: 0, y: 0 }
): Node<TSLNodeData> => ({
    id: nodeId,
    type,
    position: { ...position },
    data: {
        type,
        values: {},
        connected: {},
    },
});

const enforceMaterialNodeOnGraph = ({
    nodes,
    edges,
    materialType,
    forcedNodeId,
}: {
    nodes: Node<TSLNodeData>[];
    edges: Edge[];
    materialType: MaterialNodeType;
    forcedNodeId?: string;
}) => {
    const materialNodes = nodes.filter((node) => isMaterialNodeType(node.data.type));
    const materialNodeIds = new Set(materialNodes.map((node) => node.id));
    const fallbackMaterialNode = materialNodes.find((node) => node.id === forcedNodeId) ?? materialNodes[0];
    const materialNodeId = forcedNodeId ?? fallbackMaterialNode?.id ?? 'root-material';
    const materialNodePosition = fallbackMaterialNode?.position ?? { x: 0, y: 0 };

    // Look up the new material type's definition to know which inputs it has
    const newDef = registry.get(materialType);
    const newInputKeys = newDef?.inputs
        ? new Set(
            Object.entries(newDef.inputs)
                .filter(([, port]) => !port.propertyOnly)
                .map(([key]) => key)
        )
        : new Set<string>();

    const baseMaterialNode = materialNodes.find((node) => node.id === materialNodeId);
    const baseData = baseMaterialNode ? cloneNode(baseMaterialNode).data : { values: {}, connected: {} };

    // Carry over only values whose keys exist on the new material type
    const newDefAllInputKeys = newDef?.inputs ? new Set(Object.keys(newDef.inputs)) : new Set<string>();
    const preservedValues: Record<string, TSLValueType> = {};
    if (baseData.values) {
        const srcValues = baseData.values as Record<string, TSLValueType>;
        for (const key of Object.keys(srcValues)) {
            if (newDefAllInputKeys.has(key)) {
                preservedValues[key] = srcValues[key];
            }
        }
    }

    const normalizedMaterialNode: Node<TSLNodeData> = {
        ...(baseMaterialNode ? cloneNode(baseMaterialNode) : createMaterialNode(materialNodeId, materialType, materialNodePosition)),
        id: materialNodeId,
        type: materialType,
        data: {
            ...baseData,
            type: materialType,
            values: preservedValues,
        },
    };

    const normalizedNodes = [
        ...nodes.filter((node) => !materialNodeIds.has(node.id)),
        normalizedMaterialNode,
    ];

    // Preserve edges whose targetHandle matches an input on the new material type
    const normalizedEdges = edges.filter((edge) => {
        // Keep edges that don't involve any material node
        if (!materialNodeIds.has(edge.source) && !materialNodeIds.has(edge.target)) return true;

        // For edges targeting a material node, keep if the input exists on the new type
        if (materialNodeIds.has(edge.target) && edge.targetHandle && newInputKeys.has(edge.targetHandle)) {
            return true;
        }

        // Drop outbound edges from material nodes and edges to non-matching inputs
        return false;
    }).map((edge) => {
        // Re-target preserved edges to the new material node ID
        if (materialNodeIds.has(edge.target) && edge.target !== materialNodeId) {
            return { ...edge, target: materialNodeId };
        }
        return edge;
    });

    return {
        nodes: normalizedNodes,
        edges: normalizedEdges,
        nodeId: materialNodeId,
    };
};


interface EditorState {
    nodes: Node<TSLNodeData>[];
    edges: Edge[];
    activeRootGraph: RootGraphMode;
    materialRootGraph: RootGraphSnapshot;
    postRootGraph: RootGraphSnapshot;
    forcedRootMaterial: { nodeId: string; type: MaterialNodeType } | null;
    selectedNodeId: string | null;
    selectedNodeIds: string[]; // For multi-selection
    clipboard: ClipboardData | null;
    graphStructureVersion: number;
    commentDraftSnapshotTakenFor: Record<string, true>;
    hoveredGroupId: string | null;
    setHoveredGroupId: (groupId: string | null) => void;
    setActiveRootGraph: (mode: RootGraphMode) => void;
    getRootGraph: (mode: RootGraphMode) => { nodes: Node<TSLNodeData>[]; edges: Edge[] };

    // Global context
    globals: GlobalContextEntry[];
    addGlobal: (entry?: Partial<GlobalContextEntry>) => string | null;
    addGlobals: (entries: Partial<GlobalContextEntry>[]) => string[];
    updateGlobal: (id: string, updates: Partial<GlobalContextEntry>) => void;
    removeGlobal: (id: string) => void;
    getGlobal: (id: string) => GlobalContextEntry | undefined;

    // Subgraph state
    subgraphs: Record<string, SubgraphDefinition>;
    editorMode: EditorMode;
    editingSubgraphId: string | null;
    editingSubgraphScopeDraft: 'project' | 'library' | null;
    setEditingSubgraphScopeDraft: (scope: 'project' | 'library') => void;

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
    updatePreviewSettingsDebounced: (updates: Partial<PreviewSettings>) => void;

    // Preview snapshot (used for AI visual verification)
    previewSnapshotProvider: ((
        options?: { format?: 'png' | 'jpeg'; quality?: number }
    ) => Promise<{
        imageUrl: string;
        storageId: string;
        width: number;
        height: number;
        format: string;
    }>) | null;
    setPreviewSnapshotProvider: (
        provider: ((
            options?: { format?: 'png' | 'jpeg'; quality?: number }
        ) => Promise<{
            imageUrl: string;
            storageId: string;
            width: number;
            height: number;
            format: string;
        }>) | null
    ) => void;

    // History state
    history: HistoryState;
    isUndoRedoInProgress: boolean;

    // Stack for nested subgraph editing
    subgraphStack: SubgraphStackItem[];

    // Save status state
    isSaving: boolean;
    isDirty: boolean; // True when there are unsaved changes

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
    setProjectId: (projectId: string | null) => void;
    setSaving: (saving: boolean) => void;
    markDirty: () => void;
    markSaved: () => void;

    onNodesChange: OnNodesChange<Node<TSLNodeData>>;
    onEdgesChange: OnEdgesChange;
    onConnect: OnConnect;

    addNode: (type: NodeType, position: { x: number; y: number }, data?: Partial<TSLNodeData>) => boolean;
    updateNodeValue: (nodeId: string, key: string, value: TSLValueType) => void;
    updateCommentNodeDraft: (nodeId: string, updates: { title?: string; markdown?: string }) => void;
    commitCommentNodeDraft: (nodeId: string) => void;
    setNodeActiveInput: (nodeId: string, inputKey: string, isActive: boolean) => void;
    setUniformType: (nodeId: string, newKind: UniformKind) => void;
    addMultiOp: (nodeId: string, op?: MultiOpType) => void;
    updateMultiOp: (nodeId: string, opId: string, op: MultiOpType) => void;
    removeMultiOp: (nodeId: string, opId: string) => void;
    deleteNode: (nodeId: string) => void;
    setSelectedNode: (nodeId: string | null) => void;
    setSelectedNodes: (nodeIds: string[]) => void;
    selectSingleNode: (nodeId: string | null) => void;
    getSelectedNode: () => Node<TSLNodeData> | undefined;
    getSelectedNodes: () => Node<TSLNodeData>[];
    copySelection: () => void;
    pasteSelection: (pastePosition?: { x: number; y: number }) => void;

    // Save/Load
    saveToJSON: () => string;
    loadFromJSON: (json: string) => boolean;
    saveToLocalStorage: () => void;
    loadFromLocalStorage: () => boolean;
    clearGraph: () => void;

    // Helper to check if a material node exists
    hasMaterialNode: () => boolean;
    getMaterialNode: () => Node<TSLNodeData> | undefined;
    setRootMaterial: (materialType: MaterialNodeType) => boolean;

    // History actions
    takeSnapshot: () => void;
    undo: () => void;
    redo: () => void;
    clearHistory: () => void;

    // Group actions
    groupNodes: () => void;
    ungroupNodes: () => void;
    createLoopGroup: (viewportCenter?: { x: number; y: number }) => void;
    setLoopMode: (loopId: string, mode: string) => void;
    removeNodesFromGroup: (nodeIds: string[]) => void;
    dropNodesIntoGroup: (nodeIds: string[], groupId: string, nodesSnapshot?: Node<TSLNodeData>[]) => void;

    // Chain-to-MultiOp conversion
    convertChainToMultiOp: (orderedNodeIds: string[]) => void;


    // Subgraph actions
    createSubgraph: (name: string, selectedNodeIds: string[]) => string | null;
    enterSubgraphEditor: (subgraphId: string, options?: { createInstanceOnSave?: boolean }) => boolean;
    exitSubgraphEditor: (save: boolean, nameOverride?: string) => Promise<Node<TSLNodeData> | null>;
    updateSubgraphDefinition: (subgraphId: string, updates: Partial<SubgraphDefinition>) => void;
    addSubgraphDefinition: (subgraph: SubgraphDefinition) => void;
    deleteSubgraph: (subgraphId: string) => void;
    addDynamicPort: (nodeId: string, port: SubgraphPort) => void;
    removeDynamicPort: (nodeId: string, portId: string) => void;
    updateDynamicPort: (nodeId: string, portId: string, updates: Partial<SubgraphPort>) => void;
    getSubgraph: (id: string) => SubgraphDefinition | undefined;
    isSubgraphMode: () => boolean;

    // Code node actions
    createCodeNode: (
        name: string,
        code: string,
        inputs: SubgraphPort[],
        output: SubgraphPort,
        language?: CodeNodeDefinition['language']
    ) => Promise<string | null>;
    updateCodeNode: (id: string, updates: Partial<CodeNodeDefinition>) => void;
    addCodeNodeDefinition: (codeNode: CodeNodeDefinition) => void;
    deleteCodeNode: (id: string) => void;
    getCodeNode: (id: string) => CodeNodeDefinition | undefined;

    // Reset entire store
    resetEditor: () => void;
    // Track event helper
    trackEvent: (event: string, properties?: Record<string, unknown>) => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
    trackEvent: (event, properties) => {
        posthog.capture(event, properties);
    },
    nodes: [],
    edges: [],
    activeRootGraph: 'material',
    materialRootGraph: createRootGraphSnapshot(),
    postRootGraph: createRootGraphSnapshot(normalizePostGraph(undefined, undefined)),
    forcedRootMaterial: null,
    selectedNodeId: null,
    selectedNodeIds: [],
    clipboard: null,
    graphStructureVersion: 0,
    commentDraftSnapshotTakenFor: {},
    hoveredGroupId: null,
    setHoveredGroupId: (groupId) => set({ hoveredGroupId: groupId }),
    setActiveRootGraph: (mode) => {
        const state = get();
        if (state.activeRootGraph === mode) return;
        if (state.editorMode === 'subgraph') return;

        const currentSnapshot = createRootGraphSnapshot({
            nodes: state.nodes,
            edges: state.edges,
            history: state.history,
            selectedNodeId: state.selectedNodeId,
            selectedNodeIds: state.selectedNodeIds,
        });

        const targetSnapshot = mode === 'material'
            ? state.materialRootGraph
            : state.postRootGraph;

        set({
            materialRootGraph: state.activeRootGraph === 'material' ? currentSnapshot : state.materialRootGraph,
            postRootGraph: state.activeRootGraph === 'post' ? currentSnapshot : state.postRootGraph,
            activeRootGraph: mode,
            nodes: cloneNodes(targetSnapshot.nodes),
            edges: cloneEdges(targetSnapshot.edges),
            history: targetSnapshot.history,
            selectedNodeId: targetSnapshot.selectedNodeId,
            selectedNodeIds: [...targetSnapshot.selectedNodeIds],
            graphStructureVersion: state.graphStructureVersion + 1,
        });
    },
    getRootGraph: (mode) => {
        const state = get();
        if (state.editorMode === 'main' && state.activeRootGraph === mode) {
            return {
                nodes: state.nodes,
                edges: state.edges,
            };
        }
        const snapshot = mode === 'material' ? state.materialRootGraph : state.postRootGraph;
        return {
            nodes: snapshot.nodes,
            edges: snapshot.edges,
        };
    },
    globals: [],

    addGlobal: (entry = {}) => {
        get().takeSnapshot();
        const globals = get().globals;
        const baseName = typeof entry.name === 'string' && entry.name.trim().length > 0 ? entry.name.trim() : 'Global';
        const name = makeUniqueGlobalName(baseName, globals);
        const type = (entry.type ?? 'float') as TSLType;
        const kind = (entry.kind ?? 'uniform') as GlobalContextKind;
        const defaultValue = coerceGlobalValue(type, entry.defaultValue);
        const id = entry.id ?? `global-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

        set({
            globals: [
                ...globals,
                {
                    id,
                    name,
                    kind,
                    type,
                    defaultValue,
                    description: entry.description,
                },
            ],
            graphStructureVersion: get().graphStructureVersion + 1,
        });
        get().markDirty();
        return id;
    },

    addGlobals: (entries) => {
        if (!entries || entries.length === 0) return [];
        get().takeSnapshot();
        const globals = [...get().globals];
        const ids: string[] = [];

        entries.forEach((entry, index) => {
            const baseName = typeof entry.name === 'string' && entry.name.trim().length > 0 ? entry.name.trim() : 'Global';
            const name = makeUniqueGlobalName(baseName, globals);
            const type = (entry.type ?? 'float') as TSLType;
            const kind = (entry.kind ?? 'uniform') as GlobalContextKind;
            const defaultValue = coerceGlobalValue(type, entry.defaultValue);
            const id = entry.id ?? `global-${Date.now()}-${index}-${Math.floor(Math.random() * 10000)}`;

            globals.push({
                id,
                name,
                kind,
                type,
                defaultValue,
                description: entry.description,
            });
            ids.push(id);
        });

        set({
            globals,
            graphStructureVersion: get().graphStructureVersion + 1,
        });
        get().markDirty();
        return ids;
    },

    updateGlobal: (id, updates) => {
        get().takeSnapshot();
        const globals = get().globals;
        const existing = globals.find((g) => g.id === id);
        if (!existing) return;

        let nextName = existing.name;
        if (typeof updates.name === 'string') {
            const trimmed = updates.name.trim();
            if (!trimmed) {
                toast.error('Global name cannot be empty.');
                return;
            }
            const nameConflict = globals.some(
                (g) => g.id !== id && g.name.toLowerCase() === trimmed.toLowerCase()
            );
            if (nameConflict) {
                toast.error(`Global name "${trimmed}" already exists.`);
                return;
            }
            nextName = trimmed;
        }

        const nextType = (updates.type ?? existing.type) as TSLType;
        const nextKind = (updates.kind ?? existing.kind) as GlobalContextKind;
        const nextDefaultValue = updates.defaultValue !== undefined
            ? coerceGlobalValue(nextType, updates.defaultValue)
            : (updates.type ? coerceGlobalValue(nextType, existing.defaultValue) : existing.defaultValue);

        const updatedEntry: GlobalContextEntry = {
            ...existing,
            ...updates,
            name: nextName,
            kind: nextKind,
            type: nextType,
            defaultValue: nextDefaultValue,
        };

        if (existing.kind === 'uniform' && (!isUniformKindType(updatedEntry.type) || updatedEntry.kind !== 'uniform')) {
            removeUniform(existing.id);
        }

        if (updatedEntry.kind === 'uniform' && isUniformKindType(updatedEntry.type)) {
            updateUniformValue(updatedEntry.id, updatedEntry.type, updatedEntry.defaultValue);
        }

        set({
            globals: globals.map((g) => (g.id === id ? updatedEntry : g)),
            graphStructureVersion: get().graphStructureVersion + 1,
        });
        get().markDirty();
    },

    removeGlobal: (id) => {
        get().takeSnapshot();
        const globals = get().globals;
        const existing = globals.find((g) => g.id === id);
        if (!existing) return;

        if (existing.kind === 'uniform') {
            removeUniform(existing.id);
        }

        set({
            globals: globals.filter((g) => g.id !== id),
            graphStructureVersion: get().graphStructureVersion + 1,
        });
        get().markDirty();
    },

    getGlobal: (id) => {
        return get().globals.find((g) => g.id === id);
    },

    // Preview settings
    previewSettings: createDefaultPreviewSettings(),
    updatePreviewSettings: (updates) => {
        set({ previewSettings: { ...get().previewSettings, ...updates } });
        get().markDirty();
    },
    updatePreviewSettingsDebounced: (() => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        return (updates) => {
            set({ previewSettings: { ...get().previewSettings, ...updates } });
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            timeoutId = setTimeout(() => {
                get().markDirty();
            }, 250);
        };
    })(),
    previewSnapshotProvider: null,
    setPreviewSnapshotProvider: (provider) => set({ previewSnapshotProvider: provider }),

    // Subgraph state initialization
    subgraphs: {},
    editorMode: 'main',
    editingSubgraphId: null,
    editingSubgraphScopeDraft: null,
    subgraphStack: [],

    // Save status state initialization
    isSaving: false,
    isDirty: false,

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
    setEditingSubgraphScopeDraft: (scope) => {
        if (get().editorMode !== 'subgraph') return;
        set({ editingSubgraphScopeDraft: scope });
    },

    // Debug Mode - off by default
    debugMode: false,
    setDebugMode: (mode) => set({ debugMode: mode }),

    // History initialization
    history: createEmptyHistoryState(),
    isUndoRedoInProgress: false,

    // Save status methods
    setProjectId: (projectId) => {
        const currentId = get().projectId;
        if (currentId !== projectId && projectId) {
            posthog.capture('project_opened', { project_id: projectId });
        }
        set({ projectId });
    },
    setSaving: (saving) => set({ isSaving: saving }),

    // Template callbacks setter
    setTemplateCallbacks: (callbacks) => set({
        onSubgraphTemplateCreate: callbacks.onSubgraphTemplateCreate ?? null,
        onSubgraphTemplateUpdate: callbacks.onSubgraphTemplateUpdate ?? null,
        onCodeNodeTemplateCreate: callbacks.onCodeNodeTemplateCreate ?? null,
        onCodeNodeTemplateUpdate: callbacks.onCodeNodeTemplateUpdate ?? null,
    }),

    markDirty: () => set({ isDirty: true }),
    markSaved: () => set({ isDirty: false }),

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

        const currentNodes = get().nodes;
        const forcedRootMaterial = get().forcedRootMaterial;

        // Prevent deletion of anchor nodes and loop internal nodes
        let filteredChanges = changes.filter(change => {
            if (change.type === 'remove') {
                const nodeId = change.id;
                const node = currentNodes.find(n => n.id === nodeId);
                if (forcedRootMaterial && nodeId === forcedRootMaterial.nodeId) {
                    return false;
                }
                if (
                    nodeId === SUBGRAPH_INPUT_ID ||
                    nodeId === SUBGRAPH_OUTPUT_ID ||
                    nodeId === POST_INPUT_ID ||
                    nodeId === POST_OUTPUT_ID ||
                    (node && isAnchorNode(node))
                ) {
                    return false; // Block deletion of anchor nodes
                }
                if (node && isLoopInternalNode(node)) {
                    return false; // Block deletion of loop internal nodes
                }
            }
            return true;
        });

        // If a loop group is removed, also remove its children
        const removedLoopIds = new Set(
            filteredChanges
                .filter((c) => c.type === 'remove')
                .map((c) => c.id)
                .filter((id) => {
                    const node = currentNodes.find(n => n.id === id);
                    return node ? isLoopGroupNode(node) : false;
                })
        );

        if (removedLoopIds.size > 0) {
            const childIds = currentNodes
                .filter(n => n.parentId && removedLoopIds.has(n.parentId))
                .map(n => n.id);
            if (childIds.length > 0) {
                filteredChanges = [
                    ...filteredChanges,
                    ...childIds.map(id => ({ id, type: 'remove' as const })),
                ];
            }
        }
        // Check if this is a saveable change (anything except selection)
        const hasSaveableChange = changes.some(change => change.type !== 'select');

        let updatedNodes = applyNodeChanges(filteredChanges, currentNodes);

        const resizedLoopGroups = new Set(
            filteredChanges
                .filter((c) => c.type === 'dimensions')
                .map((c) => c.id)
                .filter((id) => {
                    const node = updatedNodes.find(n => n.id === id);
                    return node ? isLoopGroupNode(node) : false;
                })
        );

        if (resizedLoopGroups.size > 0) {
            const nodesById = new Map(updatedNodes.map(n => [n.id, n]));
            updatedNodes = updatedNodes.map((node) => {
                if (!node.parentId || !resizedLoopGroups.has(node.parentId)) return node;

                if (!isLoopInternalNode(node)) return node;

                const parent = nodesById.get(node.parentId);
                if (!parent) return node;

                const loopMode = getLoopMode(parent);
                const leftTypes = getLoopLeftNodeTypes(loopMode);
                const width = getNodeDimensionValue(parent, 'width') ?? 0;

                if (node.data.type === 'loop/output') {
                    const nextX = Math.max(LOOP_SLOT_X, width - LOOP_NODE_WIDTH - LOOP_SLOT_X);
                    if (node.position.x === nextX && node.position.y === LOOP_SLOT_Y) return node;
                    return {
                        ...node,
                        position: {
                            x: nextX,
                            y: LOOP_SLOT_Y,
                        },
                    };
                }

                const index = leftTypes.indexOf(node.data.type);
                if (index === -1) return node;
                const expectedX = LOOP_SLOT_X;
                const expectedY = LOOP_SLOT_Y + LOOP_SLOT_GAP * index;

                if (node.position.x === expectedX && node.position.y === expectedY) return node;

                return {
                    ...node,
                    position: {
                        x: expectedX,
                        y: expectedY,
                    },
                };
            });
        }

        const removedIds = new Set(
            filteredChanges
                .filter((c) => c.type === 'remove')
                .map((c) => c.id)
        );

        if (removedIds.size > 0) {
            for (const id of removedIds) {
                const removedNode = currentNodes.find(n => n.id === id);
                if (removedNode?.data.type === 'const/uniform') {
                    removeUniform(id);
                }
            }
        }

        const updatedEdges = removedIds.size > 0
            ? get().edges.filter(e => !removedIds.has(e.source) && !removedIds.has(e.target))
            : get().edges;

        set({
            nodes: updatedNodes,
            edges: updatedEdges,
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

        const { edges, nodes } = get();

        // Remove any existing connection to the same target handle
        // (inputs can only have one connection, so replace the old one)
        const filteredEdges = replaceEdgeOnTargetHandle(
            edges,
            connection.target,
            connection.targetHandle
        );


        let nextNodes = nodes;
        const targetId = connection.target;
        const targetHandle = connection.targetHandle ?? null;
        if (targetId && targetHandle) {
            const targetNode = nodes.find((n) => n.id === targetId);
            const isMaterialNode = !!targetNode && (MATERIAL_NODE_TYPES as readonly string[]).includes(targetNode.data.type);
            if (targetNode && isMaterialNode) {
                const def = registry.get(targetNode.data.type);
                const current = new Set(getMaterialStoredActiveInputs(targetNode.data, def));
                if (!current.has(targetHandle)) {
                    current.add(targetHandle);
                    nextNodes = nodes.map((node) => {
                        if (node.id !== targetId) return node;
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                activeInputs: Array.from(current),
                            },
                        };
                    });
                }
            }
        }

        set({
            edges: addEdge(connection, filteredEdges),
            nodes: nextNodes,
            graphStructureVersion: get().graphStructureVersion + 1,
        });

        get().markDirty();
    },

    addNode: (type, position, data = {}) => {
        get().takeSnapshot();
        if (type === 'loop' || type.startsWith('loop/')) {
            toast.error('Loop nodes can only be created via Create Loop.');
            return false;
        }
        if (isPostAnchorNodeType(type)) {
            return false;
        }

        const { activeRootGraph, forcedRootMaterial } = get();
        const isMaterialNode = (MATERIAL_NODE_TYPES as readonly string[]).includes(type);
        const isPostFxNode = (POST_FX_NODE_TYPES as readonly string[]).includes(type);
        if (activeRootGraph === 'post' && isMaterialNode) {
            toast.error('Material nodes are not allowed in the post graph.');
            return false;
        }
        if (activeRootGraph === 'material' && isPostFxNode) {
            toast.error('Post FX nodes are only allowed in the post graph.');
            return false;
        }
        if (activeRootGraph === 'post' && type === 'texture/viewportShared') {
            toast.error('Use post/input + texture sampling in post graph instead of viewport shared texture.');
            return false;
        }
        if (activeRootGraph === 'post' && type === 'const/uniform') {
            toast.error('Uniform nodes are not supported in the post graph yet.');
            return false;
        }

        // If trying to add a material node, check if one already exists
        if (activeRootGraph === 'material' && isMaterialNode) {
            if (forcedRootMaterial) {
                toast.error('Root material is locked by host.');
                return false;
            }

            const existingMaterialIds = get().nodes
                .filter((n) => (MATERIAL_NODE_TYPES as readonly string[]).includes(n.data.type))
                .map((n) => n.id);

            if (existingMaterialIds.length > 0) {
                const existingIds = new Set(existingMaterialIds);
                // Remove existing material nodes and their edges before adding the new one.
                set({
                    nodes: get().nodes.filter((n) => !existingIds.has(n.id)),
                    edges: get().edges.filter(
                        (e) => !existingIds.has(e.source) && !existingIds.has(e.target)
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

        // Add a default 'add' operation for MultiOp nodes
        if (type === 'math/multiOp' && !data.operations) {
            const opId = `op_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
            data.operations = [{ id: opId, op: 'add' }];
        }

        if (type === 'global/ref') {
            const globals = get().globals;
            if (globals.length > 0) {
                data.values = {
                    ...data.values,
                    globalId: data.values?.globalId ?? globals[0].id,
                };
            }
        }

        if (isLocalSetType(type)) {
            const localNameValue = typeof data.values?.localName === 'string'
                ? data.values.localName
                : 'local';
            const uniqueLocalName = makeUniqueLocalName(localNameValue, get().nodes);
            data.values = {
                ...data.values,
                localName: uniqueLocalName,
            };
        }

        if (type === 'local/get') {
            const selectedSourceId = typeof data.values?.localSourceId === 'string'
                ? data.values.localSourceId
                : getDefaultLocalSourceId(get().nodes, position);
            data.values = {
                ...data.values,
                localSourceId: selectedSourceId ?? '',
            };
        }

        if (type === 'utils/linearGradient') {
            data.values = {
                ...data.values,
                mode: Number(data.values?.mode ?? 0.0),
                stops: normalizeGradientStops(data.values?.stops ?? DEFAULT_GRADIENT_STOPS),
            };
        }

        if (type === 'utils/comment') {
            data.values = {
                ...data.values,
                title: typeof data.values?.title === 'string' ? data.values.title : 'Comment',
                markdown: typeof data.values?.markdown === 'string' ? data.values.markdown : '',
            };
        }

        const newNode: Node<TSLNodeData> = {
            id,
            type,
            position,
            selected: true,
            style: type === 'utils/comment' ? { width: 320, height: 220 } : undefined,
            data: {
                type,
                values: {},
                connected: {},
                ...data,
            },
        };
        const deselectedNodes = get().nodes.map((node) => ({
            ...node,
            selected: false,
        }));

        set({
            nodes: [...deselectedNodes, newNode],
            selectedNodeIds: [id],
            selectedNodeId: id,
            graphStructureVersion: get().graphStructureVersion + 1,
        });
        get().markDirty();

        posthog.capture('node_added', {
            node_type: type,
            project_id: get().projectId
        });

        return true;
    },

    updateNodeValue: (nodeId, key, value) => {
        const prevNodes = get().nodes;
        const targetNode = prevNodes.find((node) => node.id === nodeId);
        if (!targetNode) return;

        let nextValue = value;
        if (key === 'localName' && isLocalSetType(targetNode.data.type)) {
            const trimmed = String(value ?? '').trim();
            if (!trimmed) {
                toast.error('Local name cannot be empty.');
                return;
            }
            const conflict = prevNodes.some((node) => {
                if (node.id === nodeId || !isLocalSetNode(node)) return false;
                return normalizeLocalName(getLocalName(node)) === normalizeLocalName(trimmed);
            });
            if (conflict) {
                toast.error(`Local name "${trimmed}" already exists.`);
                return;
            }
            nextValue = trimmed;
        }

        get().takeSnapshot();
        let uniformKind: UniformKind | null = null;
        let isUniformValueUpdate = false;

        const updatedNodes = prevNodes.map((node) => {
            if (node.id !== nodeId) return node;
            const nextValues = { ...node.data.values, [key]: nextValue };
            if (node.data.type === 'const/uniform' && key === 'value') {
                isUniformValueUpdate = true;
                uniformKind = getUniformKindFromNode({ data: { values: nextValues } } as AppNode);
            }
            return {
                ...node,
                data: {
                    ...node.data,
                    values: nextValues,
                },
            };
        });

        if (isUniformValueUpdate && uniformKind) {
            updateUniformValue(nodeId, uniformKind, nextValue);
        }

        set({
            nodes: updatedNodes,
            graphStructureVersion: isUniformValueUpdate ? get().graphStructureVersion : get().graphStructureVersion + 1,
        });
        get().markDirty();
    },

    updateCommentNodeDraft: (nodeId, updates) => {
        if (updates.title === undefined && updates.markdown === undefined) return;

        const state = get();
        const targetNode = state.nodes.find((node) => node.id === nodeId);
        if (!targetNode || targetNode.data.type !== 'utils/comment') return;

        const hasSnapshot = !!state.commentDraftSnapshotTakenFor[nodeId];
        if (!hasSnapshot) {
            state.takeSnapshot();
        }

        const nextNodes = state.nodes.map((node) => {
            if (node.id !== nodeId) return node;
            return {
                ...node,
                data: {
                    ...node.data,
                    values: {
                        ...node.data.values,
                        ...(updates.title !== undefined ? { title: updates.title } : {}),
                        ...(updates.markdown !== undefined ? { markdown: updates.markdown } : {}),
                    },
                },
            };
        });

        set({
            nodes: nextNodes,
            commentDraftSnapshotTakenFor: hasSnapshot
                ? state.commentDraftSnapshotTakenFor
                : { ...state.commentDraftSnapshotTakenFor, [nodeId]: true },
        });
        state.markDirty();
    },

    commitCommentNodeDraft: (nodeId) => {
        const marker = get().commentDraftSnapshotTakenFor;
        if (!marker[nodeId]) return;

        const nextMarker = { ...marker };
        delete nextMarker[nodeId];
        set({ commentDraftSnapshotTakenFor: nextMarker });
    },

    setNodeActiveInput: (nodeId, inputKey, isActive) => {
        get().takeSnapshot();
        const prevNodes = get().nodes;

        const updatedNodes = prevNodes.map((node) => {
            if (node.id !== nodeId) return node;
            const def = registry.get(node.data.type);
            const current = new Set(getMaterialStoredActiveInputs(node.data, def));
            if (isActive) {
                current.add(inputKey);
            } else {
                current.delete(inputKey);
            }
            return {
                ...node,
                data: {
                    ...node.data,
                    activeInputs: Array.from(current),
                },
            };
        });

        set({
            nodes: updatedNodes,
            graphStructureVersion: get().graphStructureVersion + 1,
        });
        get().markDirty();
    },

    setUniformType: (nodeId, newKind) => {
        get().takeSnapshot();
        const updatedNodes = get().nodes.map((node) => {
            if (node.id !== nodeId) return node;
            if (node.data.type !== 'const/uniform') return node;

            const prevValue = node.data.values?.value;
            const nextValue = coerceUniformValue(newKind, prevValue);

            return {
                ...node,
                data: {
                    ...node.data,
                    values: {
                        ...node.data.values,
                        uniformType: newKind,
                        value: nextValue,
                    },
                },
            };
        });

        set({
            nodes: updatedNodes,
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
        const nodes = get().nodes;
        const target = nodes.find(n => n.id === nodeId);
        if (!target) return;
        const forcedRootMaterial = get().forcedRootMaterial;
        if (forcedRootMaterial && nodeId === forcedRootMaterial.nodeId) {
            toast.error('Root material is locked by host.');
            return;
        }

        if (isAnchorNode(target)) {
            return;
        }

        if (isLoopInternalNode(target)) {
            return;
        }

        get().takeSnapshot();

        const idsToRemove = new Set<string>([nodeId]);
        if (isLoopGroupNode(target)) {
            nodes
                .filter(n => n.parentId === nodeId)
                .forEach(n => idsToRemove.add(n.id));
        }

        for (const id of idsToRemove) {
            const removedNode = nodes.find(n => n.id === id);
            if (removedNode?.data.type === 'const/uniform') {
                removeUniform(id);
            }
        }

        set({
            nodes: nodes.filter((node) => !idsToRemove.has(node.id)),
            edges: get().edges.filter(
                (edge) => !idsToRemove.has(edge.source) && !idsToRemove.has(edge.target)
            ),
            commentDraftSnapshotTakenFor: Object.fromEntries(
                Object.entries(get().commentDraftSnapshotTakenFor).filter(([key]) => !idsToRemove.has(key))
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

    selectSingleNode: (nodeId) => {
        const nodes = get().nodes;
        const hasTarget = !!nodeId && nodes.some((node) => node.id === nodeId);
        const nextId = hasTarget ? nodeId : null;
        const nextIds = nextId ? [nextId] : [];

        set({
            nodes: nodes.map((node) => ({
                ...node,
                selected: nextId ? node.id === nextId : false,
            })),
            selectedNodeId: nextId,
            selectedNodeIds: nextIds,
        });
    },

    getSelectedNodes: () => {
        const { nodes, selectedNodeIds } = get();
        return nodes.filter((n) => selectedNodeIds.includes(n.id));
    },

    copySelection: () => {
        const { nodes, edges, selectedNodeIds } = get();
        if (selectedNodeIds.length === 0) return;

        const expandedIds = new Set<string>(selectedNodeIds);

        let changed = true;
        while (changed) {
            changed = false;
            for (const node of nodes) {
                if (!node.parentId) continue;
                if (expandedIds.has(node.parentId) && !expandedIds.has(node.id)) {
                    expandedIds.add(node.id);
                    changed = true;
                }
            }
        }

        const loopGroupIds = new Set(
            nodes
                .filter((node) => expandedIds.has(node.id) && isLoopGroupNode(node))
                .map((node) => node.id)
        );

        const selectedNodes = nodes.filter((node) => {
            if (!expandedIds.has(node.id)) return false;
            if (isAnchorNode(node)) return false;
            if (isLoopInternalNode(node)) {
                return !!node.parentId && loopGroupIds.has(node.parentId);
            }
            return true;
        });

        if (selectedNodes.length === 0) {
            set({ clipboard: null });
            return;
        }

        const selectedIds = new Set(selectedNodes.map((node) => node.id));
        const internalEdges = edges.filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target));

        const worldPositions: Record<string, { x: number; y: number }> = {};
        for (const node of selectedNodes) {
            worldPositions[node.id] = getAbsolutePosition(node, nodes);
        }

        const nodesForBounds = selectedNodes.map((node) => ({
            ...node,
            position: worldPositions[node.id] ?? node.position,
        }));
        const bounds = getNodesBounds(nodesForBounds);

        set({
            clipboard: {
                nodes: selectedNodes.map(cloneNode),
                edges: internalEdges.map(cloneEdge),
                worldPositions,
                bounds,
                pasteIndex: 0,
            },
        });
    },

    pasteSelection: (pastePosition) => {
        const { clipboard, nodes, edges, subgraphs, codeNodes, editorMode, activeRootGraph } = get();
        if (!clipboard || clipboard.nodes.length === 0) return;

        const existingMaterial = nodes.some((node) => (MATERIAL_NODE_TYPES as readonly string[]).includes(node.data.type));
        const isSubgraphMode = editorMode === 'subgraph';
        const isPostRoot = activeRootGraph === 'post' && editorMode === 'main';
        const isMaterialRoot = activeRootGraph === 'material' && editorMode === 'main';
        const isMaterialNode = (node: Node<TSLNodeData>) =>
            (MATERIAL_NODE_TYPES as readonly string[]).includes(node.data.type);
        const isPostFxNode = (node: Node<TSLNodeData>) =>
            (POST_FX_NODE_TYPES as readonly string[]).includes(node.data.type);

        const nodesToPaste: Node<TSLNodeData>[] = [];
        let skippedMaterial = false;
        let skippedPostFx = false;
        let skippedUniform = false;
        let materialIncluded = false;

        for (const node of clipboard.nodes) {
            if (isAnchorNode(node)) {
                continue;
            }

            if (isSubgraphMode) {
                if (isMaterialNode(node)) {
                    skippedMaterial = true;
                    continue;
                }
                if (node.data.type === 'const/uniform') {
                    skippedUniform = true;
                    continue;
                }
            }

            if (isPostRoot && node.data.type === 'const/uniform') {
                skippedUniform = true;
                continue;
            }

            if (isMaterialNode(node)) {
                if (isPostRoot) {
                    skippedMaterial = true;
                    continue;
                }
                if (existingMaterial || materialIncluded) {
                    skippedMaterial = true;
                    continue;
                }
                materialIncluded = true;
            }

            if (isMaterialRoot && isPostFxNode(node)) {
                skippedPostFx = true;
                continue;
            }

            nodesToPaste.push(node);
        }

        if (skippedMaterial) {
            if (isSubgraphMode) {
                toast.error('Material nodes cannot be pasted inside subgraphs.');
            } else if (isPostRoot) {
                toast.error('Material nodes cannot be pasted into the post graph.');
            } else if (existingMaterial) {
                toast.error('Material node not pasted because one already exists in this graph.');
            } else {
                toast.error('Only one Material node can be pasted at a time.');
            }
        }

        if (skippedUniform && isSubgraphMode) {
            toast.error('Uniform nodes cannot be pasted inside subgraphs.');
        }
        if (skippedUniform && isPostRoot) {
            toast.error('Uniform nodes cannot be pasted into the post graph.');
        }

        if (skippedPostFx && isMaterialRoot) {
            toast.error('Post FX nodes cannot be pasted into the material graph.');
        }

        if (nodesToPaste.length === 0) {
            return;
        }

        const sourceCenter = {
            x: clipboard.bounds.x + clipboard.bounds.width / 2,
            y: clipboard.bounds.y + clipboard.bounds.height / 2,
        };
        const targetCenter = pastePosition ?? sourceCenter;
        const PASTE_OFFSET = 30;
        const offset = PASTE_OFFSET * (clipboard.pasteIndex + 1);
        const translation = {
            x: targetCenter.x - sourceCenter.x + offset,
            y: targetCenter.y - sourceCenter.y + offset,
        };

        const nodesToPasteIds = new Set(nodesToPaste.map((node) => node.id));
        const idMap = new Map<string, string>();
        const typeMap = new Map<string, string>();
        const newSubgraphs: Record<string, SubgraphDefinition> = { ...subgraphs };
        const newCodeNodes: Record<string, CodeNodeDefinition> = { ...codeNodes };

        const createCloneId = (prefix: 'custom' | 'code', nameFallback: string) => {
            const base = nameFallback.toLowerCase().replace(/[^a-z0-9]/g, '-');
            return `${prefix}/${base}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        };

        for (const node of nodesToPaste) {
            const nodeType = node.data.type;
            if (nodeType.startsWith('code/') && !typeMap.has(nodeType)) {
                const def = codeNodes[nodeType];
                if (!def) continue;
                const baseName = def.name || nodeType.replace('code/', '').split('-')[0] || 'code-node';
                const newTypeId = createCloneId('code', baseName);
                const clonedDef = JSON.parse(JSON.stringify(def));
                newCodeNodes[newTypeId] = {
                    ...clonedDef,
                    id: newTypeId,
                    templateId: undefined,
                    templateVersion: undefined,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                };
                typeMap.set(nodeType, newTypeId);
            }
        }

        let idCounter = 0;
        const getNewNodeId = () => `node-${Date.now()}-${idCounter++}`;
        for (const node of nodesToPaste) {
            idMap.set(node.id, getNewNodeId());
        }

        const newNodes = nodes.map((node) => ({
            ...node,
            selected: false,
        }));
        const takenLocalNames = new Set(
            newNodes
                .filter((node) => isLocalSetNode(node))
                .map((node) => normalizeLocalName(getLocalName(node)))
                .filter((name) => name.length > 0)
        );

        const pastedNodes: Node<TSLNodeData>[] = nodesToPaste.map((node) => {
            const newId = idMap.get(node.id)!;
            const mappedType = typeMap.get(node.data.type) ?? node.data.type;
            const hasParent = node.parentId && nodesToPasteIds.has(node.parentId);
            const parentId = hasParent ? idMap.get(node.parentId!) : undefined;
            const worldPos = clipboard.worldPositions[node.id] ?? node.position;
            const position = hasParent
                ? { ...node.position }
                : {
                    x: worldPos.x + translation.x,
                    y: worldPos.y + translation.y,
                };
            const baseClone = cloneNode(node);

            return {
                ...baseClone,
                id: newId,
                type: mappedType,
                parentId: parentId,
                extent: hasParent ? node.extent : undefined,
                position,
                selected: true,
                data: {
                    ...baseClone.data,
                    values: (() => {
                        const values = { ...baseClone.data.values };
                        if (isLocalSetType(mappedType)) {
                            const rawName = typeof values.localName === 'string' ? values.localName : 'local';
                            let candidate = rawName.trim() || 'local';
                            let suffix = 1;
                            while (takenLocalNames.has(normalizeLocalName(candidate))) {
                                candidate = `${rawName.trim() || 'local'}_${suffix++}`;
                            }
                            values.localName = candidate;
                            takenLocalNames.add(normalizeLocalName(candidate));
                        }
                        if (mappedType === 'local/get') {
                            const originalSourceId = typeof values.localSourceId === 'string' ? values.localSourceId : '';
                            values.localSourceId = idMap.get(originalSourceId) ?? originalSourceId;
                        }
                        return values;
                    })(),
                    type: mappedType as NodeType,
                },
            };
        });

        const pastedEdges: Edge[] = [];
        for (const edge of clipboard.edges) {
            const newSource = idMap.get(edge.source);
            const newTarget = idMap.get(edge.target);
            if (!newSource || !newTarget) continue;
            pastedEdges.push({
                ...cloneEdge(edge),
                id: `edge-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
                source: newSource,
                target: newTarget,
                selected: false,
            });
        }

        if (pastedNodes.length === 0) return;

        get().takeSnapshot();

        set({
            nodes: [...newNodes, ...pastedNodes],
            edges: [...edges, ...pastedEdges],
            subgraphs: newSubgraphs,
            codeNodes: newCodeNodes,
            selectedNodeIds: pastedNodes.map((node) => node.id),
            selectedNodeId: pastedNodes.length === 1 ? pastedNodes[0].id : null,
            clipboard: { ...clipboard, pasteIndex: clipboard.pasteIndex + 1 },
            graphStructureVersion: get().graphStructureVersion + 1,
        });
        get().markDirty();
    },

    // Save graph to JSON string
    saveToJSON: () => {
        const {
            nodes,
            edges,
            subgraphs,
            codeNodes,
            globals,
            editorMode,
            subgraphStack,
            editingSubgraphId,
            activeRootGraph,
            materialRootGraph,
            postRootGraph,
        } = get();

        let activeRootNodesToSave = nodes;
        let activeRootEdgesToSave = edges;
        const subgraphsToSave = { ...subgraphs };

        // If we are in subgraph mode, we need to:
        // 1. Update the 'subgraphs' map with the current state of nested subgraphs
        // 2. Use the root graph (from the bottom of the stack) as the main nodes/edges
        if (editorMode === 'subgraph' && subgraphStack.length > 0) {
            // Updated current subgraph definition
            if (editingSubgraphId) {
                // Filter out anchor nodes for the definition
                const internalNodes = nodes.filter(
                    n => n.id !== SUBGRAPH_INPUT_ID && n.id !== SUBGRAPH_OUTPUT_ID
                );

                // Get input/output ports from anchor nodes
                const inputNode = nodes.find(n => n.id === SUBGRAPH_INPUT_ID);
                const outputNode = nodes.find(n => n.id === SUBGRAPH_OUTPUT_ID);

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
                        n => n.id !== SUBGRAPH_INPUT_ID && n.id !== SUBGRAPH_OUTPUT_ID
                    );
                    const inputNode = item.nodes.find(n => n.id === SUBGRAPH_INPUT_ID);
                    const outputNode = item.nodes.find(n => n.id === SUBGRAPH_OUTPUT_ID);

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
            activeRootNodesToSave = subgraphStack[0].nodes;
            activeRootEdgesToSave = subgraphStack[0].edges;
        }

        const materialGraph = activeRootGraph === 'material'
            ? { nodes: activeRootNodesToSave, edges: activeRootEdgesToSave }
            : { nodes: materialRootGraph.nodes, edges: materialRootGraph.edges };

        const postGraphRaw = activeRootGraph === 'post'
            ? { nodes: activeRootNodesToSave, edges: activeRootEdgesToSave }
            : { nodes: postRootGraph.nodes, edges: postRootGraph.edges };
        const postGraph = normalizePostGraph(postGraphRaw.nodes, postGraphRaw.edges);

        const graphData: GraphData = {
            version: GRAPH_VERSION,
            activeRootGraph,
            nodes: materialGraph.nodes,
            edges: materialGraph.edges,
            postNodes: postGraph.nodes,
            postEdges: postGraph.edges,
            globals,
            subgraphs: subgraphsToSave,
            codeNodes: codeNodes,
            previewSettings: get().previewSettings,
        };
        return JSON.stringify(graphData, null, 2);
    },

    // Load graph from JSON string
    loadFromJSON: (json: string) => {
        try {
            const parsed = JSON.parse(json) as Partial<GraphData> & { graph?: Partial<GraphData> };
            const data = parsed && typeof parsed === 'object' ? parsed : null;
            if (!data) return false;

            const nodes = Array.isArray(data.nodes)
                ? data.nodes
                : Array.isArray(data.graph?.nodes)
                    ? data.graph?.nodes
                    : null;
            const edges = Array.isArray(data.edges)
                ? data.edges
                : Array.isArray(data.graph?.edges)
                    ? data.graph?.edges
                    : null;

            if (nodes && edges) {
                clearUniforms();
                const forcedRootMaterial = get().forcedRootMaterial;
                const defaultPreviewSettings = createDefaultPreviewSettings();

                const persistedPreview = data.previewSettings ?? data.graph?.previewSettings;
                const mergedPreviewSettings: PreviewSettings = {
                    ...defaultPreviewSettings,
                    ...persistedPreview,
                    config: {
                        ...defaultPreviewSettings.config,
                        ...(persistedPreview?.config || {}),
                    },
                };

                const rawPostNodes = Array.isArray(data.postNodes)
                    ? data.postNodes
                    : Array.isArray(data.graph?.postNodes)
                        ? data.graph?.postNodes
                        : undefined;
                const rawPostEdges = Array.isArray(data.postEdges)
                    ? data.postEdges
                    : Array.isArray(data.graph?.postEdges)
                        ? data.graph?.postEdges
                        : undefined;
                const postGraph = normalizePostGraph(rawPostNodes, rawPostEdges);

                const loadedActiveRootGraph = data.activeRootGraph ?? data.graph?.activeRootGraph;
                const activeRootGraph: RootGraphMode = loadedActiveRootGraph === 'post' ? 'post' : 'material';

                const normalizedMaterialGraph = forcedRootMaterial
                    ? enforceMaterialNodeOnGraph({
                        nodes,
                        edges,
                        materialType: forcedRootMaterial.type,
                        forcedNodeId: forcedRootMaterial.nodeId,
                    })
                    : { nodes, edges, nodeId: null as string | null };

                const initialGraph = activeRootGraph === 'post'
                    ? postGraph
                    : {
                        nodes: cloneNodes(normalizedMaterialGraph.nodes),
                        edges: cloneEdges(normalizedMaterialGraph.edges),
                    };

                set({
                    nodes: initialGraph.nodes,
                    edges: initialGraph.edges,
                    activeRootGraph,
                    materialRootGraph: createRootGraphSnapshot({
                        nodes: normalizedMaterialGraph.nodes,
                        edges: normalizedMaterialGraph.edges,
                    }),
                    postRootGraph: createRootGraphSnapshot(postGraph),
                    selectedNodeId: null,
                    selectedNodeIds: [],
                    clipboard: null,
                    commentDraftSnapshotTakenFor: {},
                    globals: data.globals ?? data.graph?.globals ?? [],
                    subgraphs: data.subgraphs ?? data.graph?.subgraphs ?? {},
                    codeNodes: data.codeNodes ?? data.graph?.codeNodes ?? {},
                    graphStructureVersion: get().graphStructureVersion + 1,
                    // Restore preview settings
                    previewSettings: mergedPreviewSettings,
                    // Reset subgraph state on load
                    editorMode: 'main',
                    editingSubgraphId: null,
                    editingSubgraphScopeDraft: null,
                    subgraphStack: [],
                    history: createEmptyHistoryState(),
                    forcedRootMaterial: forcedRootMaterial
                        ? {
                            nodeId: normalizedMaterialGraph.nodeId ?? forcedRootMaterial.nodeId,
                            type: forcedRootMaterial.type,
                        }
                        : null,
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
            const hasMaterialGraph = Array.isArray(parsed.nodes) && parsed.nodes.length > 0;
            const hasPostGraph = Array.isArray(parsed.postNodes) && parsed.postNodes.length > 2;
            if (!hasMaterialGraph && !hasPostGraph && parsed.edges && parsed.edges.length < 1 && parsed.subgraphs && Object.keys(parsed.subgraphs).length < 1) {
                return false;
            }
            return get().loadFromJSON(json);
        }
        return false;
    },

    // Clear the graph
    clearGraph: () => {
        get().takeSnapshot();
        clearUniforms();
        const forcedRootMaterial = get().forcedRootMaterial;
        const postGraph = normalizePostGraph(undefined, undefined);
        const materialGraph = { nodes: [] as Node<TSLNodeData>[], edges: [] as Edge[] };
        set({
            nodes: cloneNodes(materialGraph.nodes),
            edges: cloneEdges(materialGraph.edges),
            activeRootGraph: 'material',
            materialRootGraph: createRootGraphSnapshot({
                nodes: materialGraph.nodes,
                edges: materialGraph.edges,
            }),
            postRootGraph: createRootGraphSnapshot(postGraph),
            globals: [],
            selectedNodeId: null,
            selectedNodeIds: [],
            clipboard: null,
            commentDraftSnapshotTakenFor: {},
            graphStructureVersion: get().graphStructureVersion + 1,
            forcedRootMaterial,
        });
        get().markDirty();
    },

    hasMaterialNode: () => {
        return get().nodes.some(n => (MATERIAL_NODE_TYPES as readonly string[]).includes(n.data.type));
    },

    getMaterialNode: () => {
        return get().nodes.find(n => (MATERIAL_NODE_TYPES as readonly string[]).includes(n.data.type));
    },

    setRootMaterial: (materialType) => {
        if (!isMaterialNodeType(materialType)) {
            return false;
        }

        const state = get();
        const isMaterialRootActive = state.editorMode === 'main' && state.activeRootGraph === 'material';
        const sourceNodes = isMaterialRootActive ? state.nodes : state.materialRootGraph.nodes;
        const sourceEdges = isMaterialRootActive ? state.edges : state.materialRootGraph.edges;
        const sourceHistory = isMaterialRootActive ? state.history : state.materialRootGraph.history;
        const sourceSelectedNodeId = isMaterialRootActive
            ? state.selectedNodeId
            : state.materialRootGraph.selectedNodeId;
        const sourceSelectedNodeIds = isMaterialRootActive
            ? state.selectedNodeIds
            : state.materialRootGraph.selectedNodeIds;

        const normalizedMaterialGraph = enforceMaterialNodeOnGraph({
            nodes: sourceNodes,
            edges: sourceEdges,
            materialType,
            forcedNodeId: state.forcedRootMaterial?.nodeId,
        });

        const normalizedNodeIdSet = new Set(normalizedMaterialGraph.nodes.map((node) => node.id));
        const nextSelectedNodeIds = sourceSelectedNodeIds.filter((nodeId) => normalizedNodeIdSet.has(nodeId));
        const nextSelectedNodeId = sourceSelectedNodeId && normalizedNodeIdSet.has(sourceSelectedNodeId)
            ? sourceSelectedNodeId
            : null;

        set({
            ...(isMaterialRootActive
                ? {
                    nodes: cloneNodes(normalizedMaterialGraph.nodes),
                    edges: cloneEdges(normalizedMaterialGraph.edges),
                    selectedNodeId: nextSelectedNodeId,
                    selectedNodeIds: [...nextSelectedNodeIds],
                    graphStructureVersion: state.graphStructureVersion + 1,
                }
                : {}),
            materialRootGraph: createRootGraphSnapshot({
                nodes: normalizedMaterialGraph.nodes,
                edges: normalizedMaterialGraph.edges,
                history: sourceHistory,
                selectedNodeId: nextSelectedNodeId,
                selectedNodeIds: nextSelectedNodeIds,
            }),
            forcedRootMaterial: {
                nodeId: normalizedMaterialGraph.nodeId,
                type: materialType,
            },
        });

        get().markDirty();
        return true;
    },

    // Subgraph actions

    createSubgraph: (name: string, selectedNodeIds: string[]) => {
        get().takeSnapshot();
        const { nodes, edges } = get();

        if (selectedNodeIds.length === 0) {
            const id = `custom/${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`;
            const subgraph: SubgraphDefinition = {
                id,
                name,
                scope: 'project',
                inputs: [{ id: 'in_0', label: 'Input 1', type: 'any' }],
                outputs: [{ id: 'out_0', label: 'Output 1', type: 'any' }],
                nodes: [],
                edges: [],
                inputNodePosition: { x: 0, y: 200 },
                outputNodePosition: { x: 600, y: 200 },
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            set({
                subgraphs: { ...get().subgraphs, [id]: subgraph },
            });
            get().markDirty();
            return id;
        }
        // 1. Expand selection to include children of selected groups
        let expandedNodeIds = [...selectedNodeIds];
        const initialSelectedNodes = nodes.filter(n => selectedNodeIds.includes(n.id));

        // Find all groups in selection
        const selectedGroups = initialSelectedNodes.filter(isGroupLikeNode);

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
            toast.error('Material nodes cannot be used inside subgraphs.');
            console.warn('Cannot create subgraph: Material nodes cannot be included in a subgraph.');
            return null;
        }

        const hasUniformNode = selectedNodes.some(n => n.data.type === 'const/uniform');
        if (hasUniformNode) {
            toast.error('Uniform nodes cannot be used inside subgraphs yet.');
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
            scope: 'project',
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

    enterSubgraphEditor: (subgraphId: string, options?: { createInstanceOnSave?: boolean }) => {
        const subgraph = get().subgraphs[subgraphId];
        if (!subgraph) return false;

        // Backup current context to stack
        const state = get();
        const { nodes, edges, editingSubgraphId, subgraphStack } = state;

        const shouldPersistRootSnapshot = state.editorMode === 'main';
        const activeSnapshot = shouldPersistRootSnapshot
            ? createRootGraphSnapshot({
                nodes,
                edges,
                history: state.history,
                selectedNodeId: state.selectedNodeId,
                selectedNodeIds: state.selectedNodeIds,
            })
            : null;

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
            editingScopeDraft: state.editingSubgraphScopeDraft,
            history: get().history, // Save current history
            createInstanceOnSave: options?.createInstanceOnSave ?? false,
        };

        // Create input anchor node (use stored position or calculate fallback)
        const inputNode: Node<TSLNodeData> = {
            id: SUBGRAPH_INPUT_ID,
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
            id: SUBGRAPH_OUTPUT_ID,
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
            materialRootGraph: shouldPersistRootSnapshot && state.activeRootGraph === 'material' && activeSnapshot
                ? activeSnapshot
                : state.materialRootGraph,
            postRootGraph: shouldPersistRootSnapshot && state.activeRootGraph === 'post' && activeSnapshot
                ? activeSnapshot
                : state.postRootGraph,
            subgraphStack: [...subgraphStack, stackItem],
            editorMode: 'subgraph',
            editingSubgraphId: subgraphId,
            editingSubgraphScopeDraft: resolveSubgraphScope(subgraph),
            nodes: [inputNode, outputNode, ...subgraph.nodes],
            edges: [...subgraph.edges],
            selectedNodeId: null,
            history: { past: [], future: [] }, // Reset history for new context
        });

        return true;
    },

    exitSubgraphEditor: async (save: boolean, nameOverride?: string) => {
        const { editingSubgraphId, nodes, edges, subgraphs, subgraphStack, editingSubgraphScopeDraft } = get();

        if (subgraphStack.length === 0 || !editingSubgraphId) {
            // Fallback for safety, though stack should not be empty if we are in subgraph mode
            set({
                editorMode: 'main',
                editingSubgraphId: null,
                editingSubgraphScopeDraft: null,
            });
            return null;
        }

        // Pop last item
        const stackItem = subgraphStack[subgraphStack.length - 1];
        const newStack = subgraphStack.slice(0, -1);

        if (save) {
            // Save the current editor state back to subgraph definition
            const inputNode = nodes.find(n => n.id === SUBGRAPH_INPUT_ID);
            const outputNode = nodes.find(n => n.id === SUBGRAPH_OUTPUT_ID);

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
                edges.filter(e => e.source === SUBGRAPH_INPUT_ID).map(e => e.sourceHandle)
            );
            const connectedOutputPorts = new Set(
                edges.filter(e => e.target === SUBGRAPH_OUTPUT_ID).map(e => e.targetHandle)
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
                n => n.id !== SUBGRAPH_INPUT_ID && n.id !== SUBGRAPH_OUTPUT_ID
            );

            // Keep all edges including those connected to anchor nodes so we preserve inputs/outputs wiring
            const internalEdges = edges;

            const currentSubgraph = subgraphs[editingSubgraphId];
            if (!currentSubgraph) return null;

            const updatedSubgraph: SubgraphDefinition = {
                ...currentSubgraph,
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
            const targetScope = editingSubgraphScopeDraft ?? resolveSubgraphScope(currentSubgraph);
            updatedSubgraph.scope = targetScope;

            const { onSubgraphTemplateCreate, onSubgraphTemplateUpdate } = get();
            let nextTemplateId = currentSubgraph.templateId;
            let nextTemplateVersion = currentSubgraph.templateVersion;

            try {
                if (targetScope === 'library') {
                    if (nextTemplateId) {
                        if (!onSubgraphTemplateUpdate) {
                            throw new Error('Library subgraph sync is not available for this host.');
                        }
                        const result = await onSubgraphTemplateUpdate(nextTemplateId, updatedSubgraph);
                        nextTemplateVersion = result.version;
                    } else {
                        if (!onSubgraphTemplateCreate) {
                            throw new Error('Library subgraph sync is not available for this host.');
                        }
                        const result = await onSubgraphTemplateCreate(updatedSubgraph);
                        nextTemplateId = result.templateId;
                        nextTemplateVersion = result.version;
                    }
                } else if (nextTemplateId) {
                    if (!onSubgraphTemplateUpdate) {
                        throw new Error('Subgraph scope conversion is not available for this host.');
                    }
                    const result = await onSubgraphTemplateUpdate(nextTemplateId, {
                        ...updatedSubgraph,
                        scope: 'project',
                    });
                    nextTemplateVersion = result.version;
                }
            } catch (error) {
                console.error('Failed to sync subgraph template:', error);
                const message = getErrorMessage(error);
                toast.error(message);
                get().trackEvent('error_occurred', { context: 'sync_subgraph_template', error: message });
                return null;
            }

            if (!nextTemplateId) {
                nextTemplateVersion = undefined;
            }

            const committedSubgraph: SubgraphDefinition = {
                ...updatedSubgraph,
                scope: targetScope,
                templateId: nextTemplateId,
                templateVersion: nextTemplateVersion,
            };

            set({
                subgraphs: { ...subgraphs, [editingSubgraphId]: committedSubgraph },
            });
            get().markDirty();

            // Prepare instance node data for deferred creation
            const originalNodeIds = stackItem.originalNodeIds;
            const originalNodes = stackItem.nodes.filter(n => originalNodeIds.includes(n.id));
            const subgraphIdForInstance = editingSubgraphId;
            const restoredNodes = stackItem.nodes;
            const restoredEdges = stackItem.edges;

            // Determine previous mode based on stack item
            const previousMode = stackItem.subgraphId ? 'subgraph' : 'main';
            const previousSubgraphId = stackItem.subgraphId;

            const shouldCreateInstance = stackItem.createInstanceOnSave ?? false;

            if (!shouldCreateInstance) {
                setTimeout(() => {
                    set({
                        nodes: restoredNodes,
                        edges: restoredEdges,
                        subgraphStack: newStack,
                        selectedNodeId: null,
                        selectedNodeIds: [],
                        editorMode: previousMode,
                        editingSubgraphId: previousSubgraphId,
                        editingSubgraphScopeDraft: stackItem.editingScopeDraft,
                        history: stackItem.history, // Restore parent history
                    });
                }, 0);
                return null;
            }

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
                        editingSubgraphScopeDraft: stackItem.editingScopeDraft,
                        history: stackItem.history, // Restore parent history
                    });
                }, 0);
                return instanceNode;
            }

            // No original nodes - insert a fresh instance near the current graph
            const nodesForBounds = restoredNodes.map(n => ({
                ...n,
                position: getAbsolutePosition(n, restoredNodes),
            }));
            const bounds = nodesForBounds.length > 0
                ? getNodesBounds(nodesForBounds)
                : { x: 0, y: 0, width: 0, height: 0 };
            const instanceX = nodesForBounds.length > 0 ? bounds.x + bounds.width + 80 : 0;
            const instanceY = nodesForBounds.length > 0 ? bounds.y : 0;

            const instanceId = `${subgraphIdForInstance}-instance-${Date.now()}`;
            const instanceNode: Node<TSLNodeData> = {
                id: instanceId,
                type: subgraphIdForInstance as NodeType,
                position: { x: instanceX, y: instanceY },
                data: {
                    type: subgraphIdForInstance as NodeType,
                    values: {},
                    connected: {},
                    dynamicPorts: [...inputPorts, ...outputPorts],
                },
            };

            setTimeout(() => {
                set({
                    nodes: [...restoredNodes, instanceNode],
                    edges: restoredEdges,
                    subgraphStack: newStack,
                    selectedNodeId: instanceId,
                    selectedNodeIds: [instanceId],
                    editorMode: previousMode,
                    editingSubgraphId: previousSubgraphId,
                    editingSubgraphScopeDraft: stackItem.editingScopeDraft,
                    history: stackItem.history, // Restore parent history
                });
            }, 0);
            return instanceNode;
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
            editingSubgraphScopeDraft: stackItem.editingScopeDraft,
            selectedNodeId: null,
            selectedNodeIds: [],
            history: stackItem.history, // Restore parent history
        });
        return null;
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

    createCodeNode: async (
        name: string,
        code: string,
        inputs: SubgraphPort[],
        output: SubgraphPort,
        language: CodeNodeDefinition['language'] = 'tsl'
    ) => {
        get().takeSnapshot();

        // Generate unique ID
        const id = `code/${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`;

        const codeNode: CodeNodeDefinition = {
            id,
            name,
            code,
            inputs,
            output,
            language,
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
                    language: codeNode.language ?? 'tsl',
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
        const { nodes, edges, subgraphs, globals, history, isUndoRedoInProgress } = get();

        if (isUndoRedoInProgress) return;

        const snapshot: Snapshot = {
            nodes: stripTransientFields(nodes),
            edges,
            subgraphs, // Tracking subgraphs changes too
            globals,
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
        const { history, nodes, edges, subgraphs, globals } = get();
        if (history.past.length === 0) return;

        const previous = history.past[history.past.length - 1];
        const newPast = history.past.slice(0, -1);

        const currentSnapshot: Snapshot = {
            nodes: stripTransientFields(nodes),
            edges,
            subgraphs,
            globals,
        };

        // Don't trigger snapshot during undo
        set({ isUndoRedoInProgress: true });

        set({
            nodes: previous.nodes,
            edges: previous.edges,
            subgraphs: previous.subgraphs,
            globals: previous.globals,
            commentDraftSnapshotTakenFor: {},
            history: {
                past: newPast,
                future: [currentSnapshot, ...history.future],
            },
            graphStructureVersion: get().graphStructureVersion + 1,
        });
        syncGlobalUniforms(globals, previous.globals);

        // Use setTimeout to ensure we don't block render with flag
        setTimeout(() => {
            set({ isUndoRedoInProgress: false });
            get().markDirty();
        }, 0);
    },

    redo: () => {
        const { history, nodes, edges, subgraphs, globals } = get();
        if (history.future.length === 0) return;

        const next = history.future[0];
        const newFuture = history.future.slice(1);

        const currentSnapshot: Snapshot = {
            nodes: stripTransientFields(nodes),
            edges,
            subgraphs,
            globals,
        };

        set({ isUndoRedoInProgress: true });

        set({
            nodes: next.nodes,
            edges: next.edges,
            subgraphs: next.subgraphs,
            globals: next.globals,
            commentDraftSnapshotTakenFor: {},
            history: {
                past: [...history.past, currentSnapshot],
                future: newFuture,
            },
            graphStructureVersion: get().graphStructureVersion + 1,
        });
        syncGlobalUniforms(globals, next.globals);

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
            selectedNodeIds.includes(n.id) && n.type === 'group' && !isLoopGroupNode(n)
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

    createLoopGroup: (viewportCenter) => {
        const { nodes, selectedNodeIds } = get();
        if (selectedNodeIds.length === 0) {
            get().takeSnapshot();

            const MIN_WIDTH = 600;
            const MIN_HEIGHT = 320;
            const minLoopHeight = getLoopRequiredHeight(DEFAULT_LOOP_MODE);
            const width = MIN_WIDTH;
            const height = Math.max(MIN_HEIGHT, minLoopHeight);

            let x: number;
            let y: number;

            if (viewportCenter) {
                // Center the loop on the current viewport center
                x = viewportCenter.x - width / 2;
                y = viewportCenter.y - height / 2;
            } else {
                // Fallback: place to the right of existing nodes or at (0, 0)
                const nodesForBounds = nodes.map(n => ({
                    ...n,
                    position: getAbsolutePosition(n, nodes),
                }));
                const bounds = nodesForBounds.length > 0
                    ? getNodesBounds(nodesForBounds)
                    : { x: 0, y: 0, width: 0, height: 0 };
                const BASE_PADDING = 40;
                x = nodesForBounds.length > 0 ? bounds.x + bounds.width + BASE_PADDING : 0;
                y = nodesForBounds.length > 0 ? bounds.y : 0;
            }

            const loopId = `loop-${Date.now()}`;

            const loopNode: Node<TSLNodeData> = {
                id: loopId,
                type: 'group',
                position: { x, y },
                style: { width, height },
                data: {
                    type: 'loop',
                    values: {
                        label: 'Loop',
                        loopMode: DEFAULT_LOOP_MODE,
                        loopType: DEFAULT_LOOP_TYPE,
                        loopCompare: DEFAULT_LOOP_COMPARE,
                    },
                    connected: {},
                },
                selected: true,
            };

            const leftNodes = getLoopLeftNodeTypes(DEFAULT_LOOP_MODE).map((type, index) =>
                createLoopInternalNode(loopId, type, {
                    x: LOOP_SLOT_X,
                    y: LOOP_SLOT_Y + LOOP_SLOT_GAP * index,
                })
            );

            const outputNode = createLoopInternalNode(loopId, 'loop/output', { x: LOOP_SLOT_X, y: LOOP_SLOT_Y }, width);

            set({
                nodes: [...nodes, loopNode, ...leftNodes, outputNode],
                selectedNodeIds: [loopId],
                selectedNodeId: loopId,
                graphStructureVersion: get().graphStructureVersion + 1,
            });
            get().markDirty();
            return;
        }

        // 1. Get all selected nodes
        const allSelectedNodes = nodes.filter(n => selectedNodeIds.includes(n.id));
        if (allSelectedNodes.length === 0) return;

        // 2. Prevent nested loops
        const hasLoopInSelection = allSelectedNodes.some(n => isLoopGroupNode(n) || getAncestorLoopId(n, nodes));
        if (hasLoopInSelection) {
            toast.error('Cannot create a loop inside another loop.');
            return;
        }

        // 3. Expand selection to include children of selected groups
        let expandedNodeIds = [...selectedNodeIds];
        const selectedGroups = allSelectedNodes.filter(isGroupLikeNode);
        if (selectedGroups.length > 0) {
            const groupIds = selectedGroups.map(g => g.id);
            const children = nodes.filter(n => n.parentId && groupIds.includes(n.parentId));
            const childrenIds = children.map(c => c.id);
            expandedNodeIds = [...new Set([...expandedNodeIds, ...childrenIds])];
        }

        const selectedNodes = nodes.filter(n => expandedNodeIds.includes(n.id));
        if (selectedNodes.length === 0) return;

        // Check if any selected node is a material node
        const hasMaterialNode = selectedNodes.some(n => (MATERIAL_NODE_TYPES as readonly string[]).includes(n.data.type));
        if (hasMaterialNode) {
            toast.error('Cannot create a loop with a Material node.');
            return;
        }

        // 4. Compute selected roots (avoid moving children if parent selected)
        const selectedRoots = selectedNodes.filter(node => {
            if (!node.parentId) return true;
            return !expandedNodeIds.includes(node.parentId);
        });

        if (selectedRoots.length === 0) return;

        get().takeSnapshot();

        // 5. Calculate bounds of selected roots (absolute)
        const nodesForBounds = selectedRoots.map(n => ({
            ...n,
            position: getAbsolutePosition(n, nodes),
        }));
        const bounds = getNodesBounds(nodesForBounds);

        const BASE_PADDING = 40;
        const LEFT_PANEL = 220;
        const RIGHT_PANEL = 220;
        const MIN_WIDTH = 600;
        const MIN_HEIGHT = 320;

        const width = Math.max(bounds.width + LEFT_PANEL + RIGHT_PANEL, MIN_WIDTH);
        const minLoopHeight = getLoopRequiredHeight(DEFAULT_LOOP_MODE);
        const height = Math.max(bounds.height + BASE_PADDING * 2, MIN_HEIGHT, minLoopHeight);
        const x = bounds.x - LEFT_PANEL;
        const y = bounds.y - BASE_PADDING;

        const loopId = `loop-${Date.now()}`;

        const loopNode: Node<TSLNodeData> = {
            id: loopId,
            type: 'group',
            position: { x, y },
            style: { width, height },
            data: {
                type: 'loop',
                values: {
                    label: 'Loop',
                    loopMode: DEFAULT_LOOP_MODE,
                    loopType: DEFAULT_LOOP_TYPE,
                    loopCompare: DEFAULT_LOOP_COMPARE,
                },
                connected: {},
            },
            selected: true,
        };

        const leftNodes = getLoopLeftNodeTypes(DEFAULT_LOOP_MODE).map((type, index) =>
            createLoopInternalNode(loopId, type, {
                x: LOOP_SLOT_X,
                y: LOOP_SLOT_Y + LOOP_SLOT_GAP * index,
            })
        );

        const outputNode = createLoopInternalNode(loopId, 'loop/output', { x: LOOP_SLOT_X, y: LOOP_SLOT_Y }, width);

        // 6. Update selected nodes to be children of the loop group
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

        const firstRootIndex = newNodes.findIndex(
            (n) => selectedRoots.some((root) => root.id === n.id)
        );
        const insertIndex = firstRootIndex >= 0 ? firstRootIndex : 0;

        const finalNodes = [
            ...newNodes.slice(0, insertIndex),
            loopNode,
            ...newNodes.slice(insertIndex),
            ...leftNodes,
            outputNode,
        ];

        set({
            nodes: finalNodes,
            selectedNodeIds: [loopId],
            selectedNodeId: loopId,
            graphStructureVersion: get().graphStructureVersion + 1,
        });
        get().markDirty();
    },

    setLoopMode: (loopId, mode) => {
        const { nodes, edges } = get();
        const loopNode = nodes.find(n => n.id === loopId);
        if (!loopNode || !isLoopGroupNode(loopNode)) return;

        const normalizedMode: LoopMode = isLoopMode(mode) ? mode : DEFAULT_LOOP_MODE;
        const prevMode = getLoopMode(loopNode);

        get().takeSnapshot();

        const desiredLeftTypes = getLoopLeftNodeTypes(normalizedMode);
        const desiredTypes = new Set<string>([...desiredLeftTypes, 'loop/output']);

        const internalNodes = nodes.filter(n => n.parentId === loopId && isLoopInternalNode(n));
        const internalByType = new Map(internalNodes.map(n => [n.data.type, n]));

        const removeIds = new Set(
            internalNodes.filter(n => !desiredTypes.has(n.data.type)).map(n => n.id)
        );

        const filteredNodes = nodes.filter(n => !removeIds.has(n.id));
        const filteredEdges = edges.filter(e => !removeIds.has(e.source) && !removeIds.has(e.target));

        const leftPositions = new Map<string, { x: number; y: number }>();
        desiredLeftTypes.forEach((type, index) => {
            leftPositions.set(type, { x: LOOP_SLOT_X, y: LOOP_SLOT_Y + LOOP_SLOT_GAP * index });
        });

        const loopWidth = getNodeDimensionValue(loopNode, 'width') ?? 0;
        const outputX = Math.max(LOOP_SLOT_X, loopWidth - LOOP_NODE_WIDTH - LOOP_SLOT_X);
        const outputPosition = { x: outputX, y: LOOP_SLOT_Y };

        const newNodesToAdd: Node<TSLNodeData>[] = [];
        for (const type of desiredLeftTypes) {
            if (!internalByType.has(type)) {
                const pos = leftPositions.get(type)!;
                newNodesToAdd.push(createLoopInternalNode(loopId, type, pos));
            }
        }
        if (!internalByType.has('loop/output')) {
            newNodesToAdd.push(createLoopInternalNode(loopId, 'loop/output', outputPosition, loopWidth));
        }

        const compareOptions = ['<', '<=', '>', '>='];
        const rawCompare = loopNode.data.values?.loopCompare;
        let nextCompare = compareOptions.includes(String(rawCompare))
            ? String(rawCompare)
            : (normalizedMode === 'reverse' ? '>' : DEFAULT_LOOP_COMPARE);

        if (
            normalizedMode === 'reverse'
            && prevMode !== 'range'
            && prevMode !== 'reverse'
            && nextCompare === DEFAULT_LOOP_COMPARE
        ) {
            nextCompare = '>';
        }

        const rawType = loopNode.data.values?.loopType;
        const nextType = rawType === 'float' || rawType === 'int' ? rawType : DEFAULT_LOOP_TYPE;

        const requiredHeight = getLoopRequiredHeight(normalizedMode);
        const currentHeight = getNodeDimensionValue(loopNode, 'height') ?? 0;
        const nextHeight = currentHeight > 0 ? Math.max(currentHeight, requiredHeight) : requiredHeight;

        const updatedNodes = filteredNodes.map((node) => {
            if (node.id === loopId) {
                return {
                    ...node,
                    style: {
                        ...node.style,
                        height: nextHeight,
                    },
                    data: {
                        ...node.data,
                        values: {
                            ...node.data.values,
                            loopMode: normalizedMode,
                            loopType: nextType,
                            loopCompare: nextCompare,
                        },
                    },
                };
            }

            if (node.parentId === loopId && desiredTypes.has(node.data.type)) {
                if (node.data.type === 'loop/output') {
                    if (node.position.x === outputPosition.x && node.position.y === outputPosition.y) return node;
                    return {
                        ...node,
                        position: outputPosition,
                    };
                }

                const pos = leftPositions.get(node.data.type);
                if (!pos) return node;
                if (node.position.x === pos.x && node.position.y === pos.y) return node;
                return {
                    ...node,
                    position: pos,
                };
            }

            return node;
        });

        set({
            nodes: [...updatedNodes, ...newNodesToAdd],
            edges: filteredEdges,
            graphStructureVersion: get().graphStructureVersion + 1,
        });
        get().markDirty();
    },

    removeNodesFromGroup: (nodeIds) => {
        if (nodeIds.length === 0) return;
        get().takeSnapshot();

        const nodes = get().nodes;
        const updatedNodes = nodes.map((node) => {
            if (!nodeIds.includes(node.id)) return node;
            if (!node.parentId) return node;
            if (isLoopInternalNode(node)) return node;

            const absPos = getAbsolutePosition(node, nodes);
            const parent = nodes.find(n => n.id === node.parentId);
            if (!parent || !isGroupLikeNode(parent)) {
                return {
                    ...node,
                    parentId: undefined,
                    extent: undefined,
                    position: {
                        x: absPos.x,
                        y: absPos.y,
                    },
                };
            }

            const parentAbs = getAbsolutePosition(parent, nodes);
            const parentWidth = getNodeDimensionValue(parent, 'width') ?? 0;
            const parentHeight = getNodeDimensionValue(parent, 'height') ?? 0;

            if (!parentWidth || !parentHeight) {
                return {
                    ...node,
                    parentId: undefined,
                    extent: undefined,
                    position: {
                        x: absPos.x,
                        y: absPos.y,
                    },
                };
            }

            const nodeWidth = getNodeDimensionValue(node, 'width') ?? 0;
            const nodeHeight = getNodeDimensionValue(node, 'height') ?? 0;

            const groupCenter = {
                x: parentAbs.x + parentWidth / 2,
                y: parentAbs.y + parentHeight / 2,
            };

            const nodeCenter = {
                x: absPos.x + nodeWidth / 2,
                y: absPos.y + nodeHeight / 2,
            };

            let dirX = nodeCenter.x - groupCenter.x;
            let dirY = nodeCenter.y - groupCenter.y;
            const dirLen = Math.hypot(dirX, dirY);
            if (dirLen < 1e-6) {
                dirX = 1;
                dirY = 0;
            } else {
                dirX /= dirLen;
                dirY /= dirLen;
            }

            const halfW = parentWidth / 2;
            const halfH = parentHeight / 2;
            const tX = dirX !== 0 ? halfW / Math.abs(dirX) : Number.POSITIVE_INFINITY;
            const tY = dirY !== 0 ? halfH / Math.abs(dirY) : Number.POSITIVE_INFINITY;
            const boundaryT = Math.min(tX, tY);

            const nodeHalfAlongDir = Math.abs(dirX) * (nodeWidth / 2) + Math.abs(dirY) * (nodeHeight / 2);
            const padding = 24;
            const offset = boundaryT + nodeHalfAlongDir + padding;

            const nextCenter = {
                x: groupCenter.x + dirX * offset,
                y: groupCenter.y + dirY * offset,
            };

            const nextX = nextCenter.x - nodeWidth / 2;
            const nextY = nextCenter.y - nodeHeight / 2;
            return {
                ...node,
                parentId: undefined,
                extent: undefined,
                position: {
                    x: nextX,
                    y: nextY,
                },
            };
        });

        set({
            nodes: updatedNodes,
            graphStructureVersion: get().graphStructureVersion + 1,
        });
        get().markDirty();
    },

    dropNodesIntoGroup: (nodeIds, groupId, nodesSnapshot) => {
        if (nodeIds.length === 0) return;
        const nodes = nodesSnapshot ?? get().nodes;
        const nodesById = new Map(nodes.map(n => [n.id, n]));
        const targetGroup = nodesById.get(groupId);
        if (!targetGroup || !isGroupLikeNode(targetGroup)) return;

        const isDescendantOf = (ancestorId: string, nodeId: string): boolean => {
            let currentParentId = nodesById.get(nodeId)?.parentId;
            while (currentParentId) {
                if (currentParentId === ancestorId) return true;
                currentParentId = nodesById.get(currentParentId)?.parentId;
            }
            return false;
        };

        const targetAbs = getAbsolutePosition(targetGroup, nodes);
        const isTargetLoop = isLoopGroupNode(targetGroup);

        get().takeSnapshot();

        const updatedNodes = nodes.map((node) => {
            if (!nodeIds.includes(node.id)) return node;
            if (isLoopInternalNode(node)) return node;
            if (node.id === groupId) return node;
            if (node.parentId === groupId) return node;

            if (isDescendantOf(node.id, groupId)) return node;

            if (isTargetLoop && (isLoopGroupNode(node) || getAncestorLoopId(node, nodes))) {
                return node;
            }
            if (isTargetLoop && (MATERIAL_NODE_TYPES as readonly string[]).includes(node.data.type)) {
                return node;
            }

            const absPos = getAbsolutePosition(node, nodes);
            return {
                ...node,
                parentId: groupId,
                extent: 'parent' as const,
                position: {
                    x: absPos.x - targetAbs.x,
                    y: absPos.y - targetAbs.y,
                },
            };
        });

        // Reorder: React Flow requires parent nodes to appear before their children in the array.
        // Nodes that just became children of the group may currently precede the group in the array.
        const groupIndex = updatedNodes.findIndex((n) => n.id === groupId);
        if (groupIndex >= 0) {
            // Separate nodes that are now children of this group but appear before it
            const before: Node<TSLNodeData>[] = [];
            const movedChildren: Node<TSLNodeData>[] = [];
            for (let i = 0; i < groupIndex; i++) {
                if (updatedNodes[i].parentId === groupId) {
                    movedChildren.push(updatedNodes[i]);
                } else {
                    before.push(updatedNodes[i]);
                }
            }
            if (movedChildren.length > 0) {
                const after = updatedNodes.slice(groupIndex);
                // Insert moved children right after the group node
                const groupInAfter = after.findIndex((n) => n.id === groupId);
                const reordered = [
                    ...before,
                    ...after.slice(0, groupInAfter + 1),
                    ...movedChildren,
                    ...after.slice(groupInAfter + 1),
                ];
                set({
                    nodes: reordered,
                    graphStructureVersion: get().graphStructureVersion + 1,
                });
                get().markDirty();
                return;
            }
        }

        set({
            nodes: updatedNodes,
            graphStructureVersion: get().graphStructureVersion + 1,
        });
        get().markDirty();
    },

    convertChainToMultiOp: (orderedNodeIds) => {
        if (orderedNodeIds.length < 2) return;
        get().takeSnapshot();

        const { nodes, edges } = get();
        const { operations, values, incomingEdges, outgoingEdges } = buildMultiOpFromChain(
            orderedNodeIds,
            nodes,
            edges
        );

        // Compute position: average of all chain nodes
        const chainNodes = orderedNodeIds
            .map((id) => nodes.find((n) => n.id === id))
            .filter(Boolean) as Node<TSLNodeData>[];
        const avgX = chainNodes.reduce((s, n) => s + n.position.x, 0) / chainNodes.length;
        const avgY = chainNodes.reduce((s, n) => s + n.position.y, 0) / chainNodes.length;

        // Determine if chain nodes share a common parent (group/loop)
        const firstParentId = chainNodes[0]?.parentId;
        const commonParentId = firstParentId && chainNodes.every((n) => n.parentId === firstParentId)
            ? firstParentId
            : undefined;

        // Create the new MultiOp node
        const multiOpId = `math/multiOp-${Date.now()}`;
        const newNode: Node<TSLNodeData> = {
            id: multiOpId,
            type: 'math/multiOp',
            position: { x: avgX, y: avgY },
            ...(commonParentId ? { parentId: commonParentId, extent: 'parent' as const } : {}),
            data: {
                type: 'math/multiOp' as NodeType,
                values: values as Record<string, TSLValueType>,
                connected: {},
                operations,
            },
        };

        // Remove chain nodes
        const chainSet = new Set(orderedNodeIds);
        const filteredNodes = nodes.filter((n) => !chainSet.has(n.id));
        const filteredEdges = edges.filter(
            (e) => !chainSet.has(e.source) && !chainSet.has(e.target)
        );

        // Rewire edges
        const newEdges = [...filteredEdges];
        for (const { originalEdge, newTargetHandle } of incomingEdges) {
            newEdges.push({
                id: `e-${originalEdge.source}-${originalEdge.sourceHandle}-${multiOpId}-${newTargetHandle}`,
                source: originalEdge.source,
                sourceHandle: originalEdge.sourceHandle,
                target: multiOpId,
                targetHandle: newTargetHandle,
            });
        }
        for (const { originalEdge, newSourceHandle } of outgoingEdges) {
            newEdges.push({
                id: `e-${multiOpId}-${newSourceHandle}-${originalEdge.target}-${originalEdge.targetHandle}`,
                source: multiOpId,
                sourceHandle: newSourceHandle,
                target: originalEdge.target,
                targetHandle: originalEdge.targetHandle,
            });
        }

        // Insert new node: if it has a parent, place after the parent for correct React Flow ordering
        let finalNodes: Node<TSLNodeData>[];
        if (commonParentId) {
            const parentIndex = filteredNodes.findIndex((n) => n.id === commonParentId);
            const insertIndex = parentIndex >= 0 ? parentIndex + 1 : filteredNodes.length;
            finalNodes = [
                ...filteredNodes.slice(0, insertIndex),
                newNode,
                ...filteredNodes.slice(insertIndex),
            ];
        } else {
            finalNodes = [...filteredNodes, newNode];
        }

        set({
            nodes: finalNodes,
            edges: newEdges,
            selectedNodeIds: [multiOpId],
            selectedNodeId: multiOpId,
            graphStructureVersion: get().graphStructureVersion + 1,
        });
        get().markDirty();

        posthog.capture('chain_converted_to_multiop', {
            chain_length: orderedNodeIds.length,
            operations: operations.map((op) => op.op),
            project_id: get().projectId,
        });
    },

    resetEditor: () => {
        clearUniforms();
        const postGraph = normalizePostGraph(undefined, undefined);
        set({
            nodes: [],
            edges: [],
            activeRootGraph: 'material',
            materialRootGraph: createRootGraphSnapshot(),
            postRootGraph: createRootGraphSnapshot(postGraph),
            forcedRootMaterial: null,
            selectedNodeId: null,
            selectedNodeIds: [],
            clipboard: null,
            commentDraftSnapshotTakenFor: {},
            graphStructureVersion: 0,
            globals: [],
            subgraphs: {},
            editorMode: 'main',
            editingSubgraphId: null,
            editingSubgraphScopeDraft: null,
            subgraphStack: [],
            isSaving: false,
            isDirty: false,
            history: createEmptyHistoryState(),
            canvasMode: 'pan',
            codeNodes: {},
            previewSettings: createDefaultPreviewSettings(),
            previewSnapshotProvider: null,
            projectId: null,
            onSubgraphTemplateCreate: null,
            onSubgraphTemplateUpdate: null,
            onCodeNodeTemplateCreate: null,
            onCodeNodeTemplateUpdate: null,
        });
    },
}));
