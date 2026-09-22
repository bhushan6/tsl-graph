'use client';

import { memo, useMemo, useEffect, useCallback, useState, useRef } from 'react';
import { usePathname } from 'next/navigation';
import {
    ReactFlow,
    Background,
    BackgroundVariant,
    ReactFlowProvider,
    type NodeTypes,
    type OnSelectionChangeParams,
    useReactFlow,
    useStoreApi,
    type Connection,
    type Edge,
    type OnBeforeDelete,
    type OnConnectEnd,
    type NodeMouseHandler,
    applyNodeChanges,
    SelectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useEditorStore } from '@/store/editor';
import type { AppNode, TSLType } from '@/lib/types';
import { getAbsolutePosition } from '@/lib/utils';
import { isConnectionAllowed } from '@/lib/connection-rules';
import { resolveInputHandleType } from '@/lib/graph-handles';
import { resolveNodeOutputTypeById } from '@/lib/type-inference';
import { TSLNode } from './TSLNode';
import { CommentNode } from './CommentNode';
import { LocalPortalNode } from './LocalPortalNode';
import GroupNode from './GroupNode';
import LoopInternalNode from './LoopInternalNode';
import { NodePicker } from './NodePicker';
import { Navbar } from '@/components/Navbar';
import { NoteSearchBar } from './NoteSearchBar';
import { registry } from '@/lib/registry';
import { initializeNodes } from '@/lib/nodes';
import { MATERIAL_NODE_TYPES } from '@/lib/nodes';
import { UILayer } from './UILayer';
import { Preview } from './Preview';
import { NodeDebugPreviewOverlay } from './NodeDebugPreviewOverlay';
import { Toolbar } from './Toolbar';
import { AiChatDock } from './AiChatDock';
import { PropertiesPanel } from './PropertiesPanel';
import { CodePanel } from './CodePanel';
import { Button } from '@/components/ui/button';
import { PanelLeft, SlidersHorizontal } from 'lucide-react';
import TSLEdge from './TSLEdge';
import { CanvasEdgeDropPicker } from './CanvasEdgeDropPicker';
import { EdgeContextMenu } from './EdgeContextMenu';
import { useEdgeContextMenuStore } from '@/store/edge-context-menu';
import { useEdgeDropPickerStore } from '@/store/edge-drop-picker';
import { CodeNodeDialog } from './CodeNodeDialog';
import { StaleTemplatesNotification } from './StaleTemplatesNotification';
import type { Id } from '@/convex/_generated/dataModel';
import { DEFAULT_EDITOR_HOST_CAPABILITIES, type EditorHostCapabilities } from '@/lib/editor-host/types';
import { TutorialOverlay, TutorialHighlight, TutorialComplete, TutorialLauncher } from '@/components/tutorial';
import { useTutorialStore } from '@/store/tutorial-store';
import { EDITOR_SHORTCUTS, isEditorShortcutBlocked, matchesEditorShortcut } from '@/lib/editor-shortcuts';
import {
    FULL_EDITOR_CHROME,
    type EditorChromeVisibility,
} from '@/lib/editor-host/standalone-ui';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// Initialize nodes on module load
initializeNodes();

const edgeTypes = {
    default: TSLEdge,
}

const MULTI_SELECTION_KEYS = ["Shift", "Meta", "Control"];
const DELETE_KEYS = ["Backspace", "Delete"];

type ToggleableChrome = Exclude<keyof EditorChromeVisibility, 'controls'>;

const CHROME_OPTIONS: { key: ToggleableChrome; label: string }[] = [
    { key: 'library', label: 'Node library' },
    { key: 'preview', label: 'Preview' },
    { key: 'inspector', label: 'Properties' },
    { key: 'toolbar', label: 'Toolbar' },
    { key: 'navbar', label: 'Navbar' },
];

interface NavbarProps {
    projectName?: string;
    projectId?: Id<"projects">;
    capabilities?: EditorHostCapabilities;
}

interface EditorProps extends NavbarProps {
    projectId?: Id<"projects">;
    hasThumbnail?: boolean;
    isReadOnly?: boolean;
    chromeVisibility?: EditorChromeVisibility;
}

interface EditorChromeProps {
    navbarProps?: NavbarProps;
    projectId?: Id<"projects">;
    hasThumbnail?: boolean;
    isReadOnly?: boolean;
    chromeVisibility?: EditorChromeVisibility;
    isFindOpen: boolean;
    onCloseFind: () => void;
}

const EditorChrome = memo(function EditorChrome({
    navbarProps,
    projectId,
    hasThumbnail,
    isReadOnly,
    chromeVisibility = FULL_EDITOR_CHROME,
    isFindOpen,
    onCloseFind,
}: EditorChromeProps) {
    const editorMode = useEditorStore((s) => s.editorMode);
    const isTutorialActive = useTutorialStore((s) => s.isActive);
    // The tutorial session lives in a global store (persisted to localStorage),
    // so an active session must only surface its UI inside the tutorial sandbox.
    const isTutorialRoute = usePathname() === '/editor/tutorial';
    const [isCodePanelOpen, setIsCodePanelOpen] = useState(false);
    const [isNodePickerOpen, setIsNodePickerOpen] = useState(true);
    const [isCodeNodeDialogOpen, setIsCodeNodeDialogOpen] = useState(false);
    const [bottomBarMode, setBottomBarMode] = useState<'ai' | 'toolbar'>('toolbar');
    const [chromeOverrides, setChromeOverrides] = useState<Partial<EditorChromeVisibility>>({});
    const canUseAI = navbarProps?.capabilities?.canUseAI ?? DEFAULT_EDITOR_HOST_CAPABILITIES.canUseAI;
    const effectiveBottomBarMode = canUseAI ? bottomBarMode : 'toolbar';
    const visibleChrome = { ...chromeVisibility, ...chromeOverrides };

    const onNodePickerClose = useCallback(() => setIsNodePickerOpen(false), []);
    const onOpenNodePicker = useCallback(() => setIsNodePickerOpen(true), []);
    const onOpenCodePanel = useCallback(() => setIsCodePanelOpen(true), []);
    const onCloseCodePanel = useCallback(() => setIsCodePanelOpen(false), []);
    const onOpenCodeNodeDialog = useCallback(() => setIsCodeNodeDialogOpen(true), []);
    const onOpenAiDock = useCallback(() => setBottomBarMode('ai'), []);
    const onOpenToolbar = useCallback(() => setBottomBarMode('toolbar'), []);
    const setChromeVisible = useCallback((surface: ToggleableChrome, visible: boolean) => {
        setChromeOverrides((current) => ({ ...current, [surface]: visible }));
    }, []);
    const showAllChrome = useCallback(() => {
        setChromeOverrides({
            navbar: true,
            library: true,
            preview: true,
            inspector: true,
            toolbar: true,
        });
    }, []);
    const resetChrome = useCallback(() => setChromeOverrides({}), []);
    const hidePreview = useCallback(() => setChromeVisible('preview', false), [setChromeVisible]);
    const hideInspector = useCallback(() => setChromeVisible('inspector', false), [setChromeVisible]);

    return (
        <>
            <UILayer>
                <UILayer.CenterPanel>
                    {!isReadOnly && isTutorialActive && isTutorialRoute && (
                        <TutorialOverlay />
                    )}
                    {isFindOpen && (
                        <div className="pointer-events-auto absolute right-0 top-0 z-50">
                            <NoteSearchBar
                                open={true}
                                onClose={onCloseFind}
                            />
                        </div>
                    )}
                    {chromeVisibility.controls && (
                        <div className="pointer-events-auto absolute right-0 top-0 z-50">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-10 w-10 border-sidebar-border bg-background/95 shadow-sm backdrop-blur"
                                        aria-label="Configure editor panels"
                                        title="Configure editor panels"
                                    >
                                        <SlidersHorizontal className="h-4 w-4" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent align="end" className="w-56 p-2">
                                    <p className="px-2 pb-1.5 text-sm font-medium">Editor panels</p>
                                    <div className="space-y-0.5">
                                        {CHROME_OPTIONS.map((option) => (
                                            <label
                                                key={option.key}
                                                className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                                            >
                                                <span>{option.label}</span>
                                                <input
                                                    type="checkbox"
                                                    checked={visibleChrome[option.key]}
                                                    onChange={(event) => setChromeVisible(option.key, event.target.checked)}
                                                    className="h-4 w-4 accent-foreground"
                                                />
                                            </label>
                                        ))}
                                    </div>
                                    <div className="mt-2 flex gap-2 border-t pt-2">
                                        <Button type="button" variant="outline" size="sm" onClick={showAllChrome}>
                                            Show all
                                        </Button>
                                        <Button type="button" variant="ghost" size="sm" onClick={resetChrome}>
                                            Reset
                                        </Button>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    )}
                </UILayer.CenterPanel>

                {visibleChrome.navbar && (
                    <UILayer.TopBar>
                        <Navbar
                            {...navbarProps}
                            projectId={projectId}
                            isReadOnly={isReadOnly}
                            capabilities={navbarProps?.capabilities}
                        />
                    </UILayer.TopBar>
                )}

                {!isReadOnly && visibleChrome.library && (
                    <UILayer.LeftPanel>
                        {isNodePickerOpen ? (
                            <NodePicker
                                onClose={onNodePickerClose}
                            />
                        ) : (
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={onOpenNodePicker}
                                className="bg-background/95 backdrop-blur shadow-sm border-sidebar-border h-10 w-10 pointer-events-auto"
                                title="Open Node Picker"
                            >
                                <PanelLeft className="h-4 w-4" />
                            </Button>
                        )}
                    </UILayer.LeftPanel>
                )}

                {(visibleChrome.preview || (!isReadOnly && visibleChrome.inspector)) && (
                    <UILayer.RightPanel>
                        {visibleChrome.preview && editorMode === 'main' && (
                            <Preview
                                projectId={projectId}
                                hasThumbnail={hasThumbnail}
                                onHide={chromeVisibility.controls ? hidePreview : undefined}
                            />
                        )}
                        {!isReadOnly && visibleChrome.inspector && (
                            <PropertiesPanel onHide={chromeVisibility.controls ? hideInspector : undefined} />
                        )}
                    </UILayer.RightPanel>
                )}

                {!isReadOnly && visibleChrome.toolbar && (
                    <UILayer.BottomBar>
                        {editorMode === 'subgraph' ? (
                            <Toolbar
                                onOpenCodePanel={onOpenCodePanel}
                                onCreateCodeNode={onOpenCodeNodeDialog}
                            />
                        ) : (
                            <div className="pointer-events-auto">
                                <div className={effectiveBottomBarMode === 'toolbar' ? 'block' : 'hidden'}>
                                    <Toolbar
                                        onOpenCodePanel={onOpenCodePanel}
                                        onOpenAiDock={canUseAI ? onOpenAiDock : undefined}
                                        onCreateCodeNode={onOpenCodeNodeDialog}
                                    />
                                </div>
                                {canUseAI && (
                                    <div className={effectiveBottomBarMode === 'ai' ? 'block' : 'hidden'}>
                                        <AiChatDock onOpenToolbar={onOpenToolbar} isOpen={effectiveBottomBarMode === 'ai'} />
                                    </div>
                                )}
                            </div>
                        )}
                    </UILayer.BottomBar>
                )}
            </UILayer>

            {!isReadOnly && (
                <>
                    {isCodePanelOpen && (
                        <CodePanel
                            isOpen={true}
                            onClose={onCloseCodePanel}
                        />
                    )}

                    {isCodeNodeDialogOpen && (
                        <CodeNodeDialog
                            open={true}
                            onOpenChange={setIsCodeNodeDialogOpen}
                            mode="create"
                        />
                    )}

                    <StaleTemplatesNotification />

                    {isTutorialRoute && (
                        <>
                            <TutorialHighlight />
                            <TutorialComplete />
                        </>
                    )}
                    <TutorialLauncher />
                </>
            )}
        </>
    );
});

interface FlowCanvasProps {
    isReadOnly?: boolean;
    onOpenFind: () => void;
}

/**
 * Mirrors the viewport zoom into a --rf-zoom CSS variable on the flow
 * container so the selection halo (globals.css) can keep a constant on-screen
 * thickness. Subscribes to the store imperatively and writes straight to the
 * DOM — no React re-renders on zoom/pan frames.
 */
function ZoomCssVariable() {
    const store = useStoreApi();

    useEffect(() => {
        const apply = (state: { domNode: HTMLDivElement | null; transform: [number, number, number] }) => {
            state.domNode?.style.setProperty('--rf-zoom', String(state.transform[2]));
        };
        apply(store.getState());
        return store.subscribe((state, prev) => {
            if (state.transform[2] !== prev.transform[2] || state.domNode !== prev.domNode) {
                apply(state);
            }
        });
    }, [store]);

    return null;
}

/**
 * Leaf owner of the controlled React Flow state. Uniform scrubs and drag
 * frames must not reconcile the editor chrome around the canvas.
 */
const FlowCanvas = memo(function FlowCanvas({ isReadOnly, onOpenFind }: FlowCanvasProps) {
    const nodes = useEditorStore((s) => s.nodes);
    const edges = useEditorStore((s) => s.edges);
    const onNodesChange = useEditorStore((s) => s.onNodesChange);
    const onEdgesChange = useEditorStore((s) => s.onEdgesChange);
    const onConnect = useEditorStore((s) => s.onConnect);
    const setSelectedNode = useEditorStore((s) => s.setSelectedNode);
    const setSelectedNodes = useEditorStore((s) => s.setSelectedNodes);
    const undo = useEditorStore((s) => s.undo);
    const redo = useEditorStore((s) => s.redo);
    const takeSnapshot = useEditorStore((s) => s.takeSnapshot);
    const canvasMode = useEditorStore((s) => s.canvasMode);
    const copySelection = useEditorStore((s) => s.copySelection);
    const pasteSelection = useEditorStore((s) => s.pasteSelection);
    const editingSubgraphId = useEditorStore((s) => s.editingSubgraphId);
    const activeRootGraph = useEditorStore((s) => s.activeRootGraph);

    const openEdgeDropPicker = useEdgeDropPickerStore(state => state.open);
    const { screenToFlowPosition } = useReactFlow<AppNode>();
    const flowStore = useStoreApi<AppNode>();

    // const isInitialized = useRef(false);
    const lastPanePositionRef = useRef<{ x: number; y: number } | null>(null);

    // Global editing shortcuts that are not toolbar-specific.
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (isEditorShortcutBlocked(event)) return;

            if (matchesEditorShortcut(event, EDITOR_SHORTCUTS.findNotes)) {
                event.preventDefault();
                onOpenFind();
            }

            if (matchesEditorShortcut(event, EDITOR_SHORTCUTS.undo)) {
                event.preventDefault();
                undo();
            }

            if (
                matchesEditorShortcut(event, EDITOR_SHORTCUTS.redo) ||
                ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.code === 'KeyY')
            ) {
                event.preventDefault();
                redo();
            }

            if (matchesEditorShortcut(event, EDITOR_SHORTCUTS.copy)) {
                event.preventDefault();
                copySelection();
            }

            if (matchesEditorShortcut(event, EDITOR_SHORTCUTS.paste)) {
                event.preventDefault();
                if (isReadOnly) return;
                const screenPosition = lastPanePositionRef.current ?? {
                    x: window.innerWidth / 2,
                    y: window.innerHeight / 2,
                };
                const flowPosition = screenToFlowPosition(screenPosition);
                pasteSelection(flowPosition);
            }

            if (matchesEditorShortcut(event, EDITOR_SHORTCUTS.convertEdgeToPortal)) {
                if (isReadOnly) return;
                const state = useEditorStore.getState();
                const selectedEdges = state.edges.filter((edge) => edge.selected);
                if (selectedEdges.length === 0) return;
                event.preventDefault();
                for (const edge of selectedEdges) {
                    state.convertEdgeToLocalPortal(edge.id);
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [undo, redo, copySelection, pasteSelection, screenToFlowPosition, isReadOnly, onOpenFind]);

    // Snapshot triggers for ReactFlow events

    const { getNodes, getEdges, fitView } = useReactFlow<AppNode>();
    const dropNodesIntoGroup = useEditorStore((s) => s.dropNodesIntoGroup);
    const setHoveredGroupId = useEditorStore((s) => s.setHoveredGroupId);

    const handlePaneMouseMove = useCallback((event: React.MouseEvent) => {
        lastPanePositionRef.current = { x: event.clientX, y: event.clientY };
    }, []);

    useEffect(() => {
        if (editingSubgraphId) {
            fitView();
        }
    }, [fitView, editingSubgraphId]);

    useEffect(() => {
        const frameId = requestAnimationFrame(() => {
            fitView({
                padding: 0.2,
                duration: 250,
                includeHiddenNodes: false,
            });
        });

        return () => cancelAnimationFrame(frameId);
    }, [activeRootGraph, fitView]);

    // 1. Dragging: Snapshot when drag starts to capture original position
    const onNodeDragStart = useCallback(() => {
        takeSnapshot();
        setHoveredGroupId(null);
    }, [takeSnapshot, setHoveredGroupId]);

    // 2. Nodes Change: Snapshot only on Add (removals snapshot once in handleBeforeDelete)
    const handleNodesChange = useCallback((changes: Parameters<typeof onNodesChange>[0]) => {
        const isLiveDragFrame =
            changes.length > 0 &&
            changes.every((change) => change.type === 'position' && change.dragging === true);

        if (isLiveDragFrame) {
            // React Flow already owns the transient drag interaction. Keep
            // per-frame positions in its internal store so the controlled app
            // tree does not render just to feed those positions back. The final
            // `dragging: false` change falls through and persists once.
            const flowState = flowStore.getState();
            flowState.setNodes(applyNodeChanges(changes, flowState.nodes));
            return;
        }

        const hasAddedNodes = changes.some((c) => c.type === 'add');
        if (hasAddedNodes) {
            takeSnapshot();
        }
        onNodesChange(changes);
    }, [flowStore, onNodesChange, takeSnapshot]);

    // 3. Edges Change: Snapshot only on Add (removals snapshot once in handleBeforeDelete)
    const handleEdgesChange = useCallback((changes: Parameters<typeof onEdgesChange>[0]) => {
        const hasAddedEdges = changes.some((c) => c.type === 'add');
        if (hasAddedEdges) {
            takeSnapshot();
        }
        onEdgesChange(changes);
    }, [onEdgesChange, takeSnapshot]);

    // 4. Deletes: React Flow fires the edge removals before the node removals of
    // a single delete action. Snapshot once up front so the whole delete (nodes
    // and their connections) comes back in a single undo step.
    const handleBeforeDelete = useCallback<OnBeforeDelete<AppNode, Edge>>(
        async ({ nodes: deletedNodes, edges: deletedEdges }) => {
            if (deletedNodes.length > 0 || deletedEdges.length > 0) {
                takeSnapshot();
            }
            return true;
        },
        [takeSnapshot]
    );

    // Handle selection change
    const onSelectionChange = useCallback(
        ({ nodes: selectedNodes }: OnSelectionChangeParams) => {
            // Track multi-selection for subgraph creation
            setSelectedNodes(selectedNodes.map(n => n.id));

            // Also track single selection for properties panel
            if (selectedNodes.length === 1) {
                setSelectedNode(selectedNodes[0].id);
            } else {
                setSelectedNode(null);
            }
        },
        [setSelectedNode, setSelectedNodes]
    );

    // Get subgraph types from store
    const subgraphs = useEditorStore((s) => s.subgraphs);
    const codeNodes = useEditorStore((s) => s.codeNodes);

    // Generate node types from registry + subgraphs - all use the same TSLNode component
    const nodeTypes: NodeTypes = useMemo(() => {
        const types: NodeTypes = {
            group: GroupNode,
            loop: GroupNode,
            'utils/comment': CommentNode,
            'local/set': LocalPortalNode,
            'local/get': LocalPortalNode,
            'loop/count': LoopInternalNode,
            'loop/start': LoopInternalNode,
            'loop/end': LoopInternalNode,
            'loop/index': LoopInternalNode,
            'loop/count2': LoopInternalNode,
            'loop/index2': LoopInternalNode,
            'loop/accumulator': LoopInternalNode,
            'loop/condition': LoopInternalNode,
            'loop/output': LoopInternalNode,
        };
        // Add registry types
        for (const def of registry.all()) {
            if (!types[def.type]) {
                types[def.type] = TSLNode;
            }
        }
        // Add subgraph types
        for (const subgraphId of Object.keys(subgraphs)) {
            types[subgraphId] = TSLNode;
        }
        // Add code node types
        for (const codeNodeId of Object.keys(codeNodes)) {
            types[codeNodeId] = TSLNode;
        }
        return types;
    }, [subgraphs, codeNodes]);

    const isValidConnection = useCallback(
        (connection: Connection | Edge) => isConnectionAllowed(connection, getNodes(), getEdges()),
        [getNodes, getEdges]
    );

    const onConnectEnd: OnConnectEnd = useCallback(
        (event, connectionState) => {
            if (!connectionState.isValid && connectionState.fromHandle && connectionState.fromNode) {
                const { clientX, clientY } =
                    'changedTouches' in event ? (event as TouchEvent).changedTouches[0] : (event as MouseEvent);

                const flowPosition = screenToFlowPosition({ x: clientX, y: clientY });

                const handleId = connectionState.fromHandle.id || '';
                const node = connectionState.fromNode;
                const nodeType = node.type || node.data?.type;
                const def = registry.get(nodeType);

                let dataType: TSLType | '' = 'any';
                let direction: 'input' | 'output' = 'output';

                if (connectionState.fromHandle.type === 'target') {
                    direction = 'input';
                    const state = useEditorStore.getState();
                    const storeNode = state.nodes.find((entry) => entry.id === node.id);
                    if (storeNode) {
                        dataType = resolveInputHandleType(storeNode, handleId, {
                            nodesById: new Map(state.nodes.map((entry) => [entry.id, entry])),
                            edges: state.edges,
                            globals: state.globals,
                            subgraphs: state.subgraphs,
                            codeNodes: state.codeNodes,
                        });
                    }
                } else {
                    direction = 'output';
                    const state = useEditorStore.getState();
                    const nodesById = new Map(state.nodes.map((entry) => [entry.id, entry]));
                    const inferred = resolveNodeOutputTypeById(
                        node.id,
                        handleId || 'out',
                        nodesById,
                        state.edges,
                        state.globals,
                        state.subgraphs
                    );
                    if (inferred) {
                        dataType = inferred;
                    } else if (def && def.outputs) {
                        const port = def.outputs[handleId];
                        if (port) dataType = port.type;
                    }
                }

                openEdgeDropPicker({
                    screenPosition: { x: clientX, y: clientY },
                    flowPosition,
                    sourceDataType: dataType,
                    sourceNodeId: node.id,
                    sourceHandleId: handleId,
                    handleDirection: direction,
                });
            }
        },
        [screenToFlowPosition, openEdgeDropPicker]
    );

    const onNodeDragStop = useCallback(
        (_event: React.MouseEvent, node: AppNode) => {
            const nodes = getNodes();
            if (nodes.length === 0) return;

            const nodesById = new Map(nodes.map(n => [n.id, n]));
            const draggedNode = (nodesById.get(node.id) ?? node) as AppNode;
            const selectedNodes = nodes.filter(n => n.selected);
            const draggedNodes = selectedNodes.length > 0 ? selectedNodes : [draggedNode];
            const draggedIds = draggedNodes.map(n => n.id);
            const absPos = getAbsolutePosition(draggedNode, nodes);

            const getNodeDimension = (n: AppNode, key: 'width' | 'height'): number | null => {
                const direct = (n as AppNode & { [k: string]: unknown })[key];
                if (typeof direct === 'number') return direct;
                const styleValue = n.style?.[key];
                if (typeof styleValue === 'number') return styleValue;
                if (typeof styleValue === 'string') {
                    const parsed = Number(styleValue.replace('px', ''));
                    return Number.isFinite(parsed) ? parsed : null;
                }
                return null;
            };

            const getGroupDepth = (n: AppNode): number => {
                let depth = 0;
                let parentId = n.parentId;
                while (parentId) {
                    depth += 1;
                    parentId = nodesById.get(parentId)?.parentId;
                }
                return depth;
            };

            const isGroupNode = (n: AppNode) => n.type === 'group' || n.data.type === 'loop';

            const center = {
                x: absPos.x + (getNodeDimension(draggedNode, 'width') ?? 0) / 2,
                y: absPos.y + (getNodeDimension(draggedNode, 'height') ?? 0) / 2,
            };

            const groupCandidates = nodes
                .filter(isGroupNode)
                .filter(n => !draggedIds.includes(n.id))
                .flatMap((group) => {
                    const width = getNodeDimension(group, 'width');
                    const height = getNodeDimension(group, 'height');
                    if (!width || !height) return [];
                    const groupAbs = getAbsolutePosition(group, nodes);
                    const inside = center.x >= groupAbs.x
                        && center.x <= groupAbs.x + width
                        && center.y >= groupAbs.y
                        && center.y <= groupAbs.y + height;
                    if (!inside) return [];
                    return [{ group, depth: getGroupDepth(group) }];
                });

            if (groupCandidates.length === 0) return;

            groupCandidates.sort((a, b) => b.depth - a.depth);
            const targetGroup = groupCandidates[0].group;

            dropNodesIntoGroup(draggedIds, targetGroup.id, nodes);
            setHoveredGroupId(null);
        },
        [getNodes, dropNodesIntoGroup, setHoveredGroupId]
    );

    const onNodeDrag = useCallback(
        (_event: React.MouseEvent, node: AppNode) => {
            const nodes = getNodes();
            if (nodes.length === 0) return;

            const nodesById = new Map(nodes.map(n => [n.id, n]));
            const draggedNode = (nodesById.get(node.id) ?? node) as AppNode;

            if (draggedNode.data.type.startsWith('loop/')) {
                setHoveredGroupId(null);
                return;
            }

            const selectedNodes = nodes.filter(n => n.selected);
            const draggedNodes = selectedNodes.length > 0 ? selectedNodes : [draggedNode];
            const draggedIds = draggedNodes.map(n => n.id);
            const hasMaterialDragged = draggedNodes.some(n =>
                (MATERIAL_NODE_TYPES as readonly string[]).includes(n.data.type)
            );

            const getNodeDimension = (n: AppNode, key: 'width' | 'height'): number | null => {
                const direct = (n as AppNode & { [k: string]: unknown })[key];
                if (typeof direct === 'number') return direct;
                const styleValue = n.style?.[key];
                if (typeof styleValue === 'number') return styleValue;
                if (typeof styleValue === 'string') {
                    const parsed = Number(styleValue.replace('px', ''));
                    return Number.isFinite(parsed) ? parsed : null;
                }
                return null;
            };

            const getGroupDepth = (n: AppNode): number => {
                let depth = 0;
                let parentId = n.parentId;
                while (parentId) {
                    depth += 1;
                    parentId = nodesById.get(parentId)?.parentId;
                }
                return depth;
            };

            const getGroupAncestorId = (n: AppNode): string | null => {
                let parentId = n.parentId;
                while (parentId) {
                    const parent = nodesById.get(parentId);
                    if (!parent) break;
                    if (parent.type === 'group' || parent.data.type === 'loop') return parent.id;
                    parentId = parent.parentId;
                }
                return null;
            };

            const isGroupNode = (n: AppNode) => n.type === 'group' || n.data.type === 'loop';

            const absPos = getAbsolutePosition(draggedNode, nodes);
            const center = {
                x: absPos.x + (getNodeDimension(draggedNode, 'width') ?? 0) / 2,
                y: absPos.y + (getNodeDimension(draggedNode, 'height') ?? 0) / 2,
            };

            const groupCandidates = nodes
                .filter(isGroupNode)
                .filter(n => !draggedIds.includes(n.id))
                .flatMap((group) => {
                    const width = getNodeDimension(group, 'width');
                    const height = getNodeDimension(group, 'height');
                    if (!width || !height) return [];
                    const groupAbs = getAbsolutePosition(group, nodes);
                    const inside = center.x >= groupAbs.x
                        && center.x <= groupAbs.x + width
                        && center.y >= groupAbs.y
                        && center.y <= groupAbs.y + height;
                    if (!inside) return [];
                    return [{ group, depth: getGroupDepth(group) }];
                });

            if (groupCandidates.length === 0) {
                setHoveredGroupId(null);
                return;
            }

            groupCandidates.sort((a, b) => b.depth - a.depth);
            const targetGroup = groupCandidates[0].group;
            const currentParentGroup = getGroupAncestorId(draggedNode);

            if (currentParentGroup && currentParentGroup === targetGroup.id) {
                setHoveredGroupId(null);
                return;
            }

            if (hasMaterialDragged && (targetGroup.type === 'loop' || targetGroup.data.type === 'loop')) {
                setHoveredGroupId(null);
                return;
            }

            setHoveredGroupId(targetGroup.id);
        },
        [getNodes, setHoveredGroupId]
    );

    const openCanvasNodePicker = useCallback(
        (event: React.MouseEvent | MouseEvent) => {
            event.preventDefault();
            const { clientX, clientY } = event;
            const flowPosition = screenToFlowPosition({ x: clientX, y: clientY });
            openEdgeDropPicker({
                screenPosition: { x: clientX, y: clientY },
                flowPosition,
                sourceDataType: '',
                sourceNodeId: null,
                sourceHandleId: null,
                handleDirection: null,
            });
        },
        [openEdgeDropPicker, screenToFlowPosition]
    );

    const handleNodeContextMenu = useCallback<NodeMouseHandler<AppNode>>(
        (event, node) => {
            useEditorStore.getState().selectSingleNode(node.id);
            openCanvasNodePicker(event);
        },
        [openCanvasNodePicker]
    );

    const handlePaneContextMenu = useCallback(
        (event: React.MouseEvent | MouseEvent) => {
            openCanvasNodePicker(event);
        },
        [openCanvasNodePicker]
    );

    const openEdgeContextMenu = useEdgeContextMenuStore((s) => s.open);
    const handleEdgeContextMenu = useCallback(
        (event: React.MouseEvent, edge: Edge) => {
            event.preventDefault();
            if (isReadOnly) return;
            openEdgeContextMenu({
                edgeId: edge.id,
                screenPosition: { x: event.clientX, y: event.clientY },
            });
        },
        [openEdgeContextMenu, isReadOnly]
    );

    return (
        <>
            {/* Canvas Layer */}
            <div data-tutorial-target="canvas" className="absolute inset-0">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={handleNodesChange}
                    onEdgesChange={handleEdgesChange}
                    onBeforeDelete={handleBeforeDelete}
                    onConnect={onConnect}
                    onConnectEnd={onConnectEnd}
                    onNodeDragStart={onNodeDragStart}
                    onNodeDrag={onNodeDrag}
                    onNodeDragStop={onNodeDragStop}
                    onSelectionChange={onSelectionChange}
                    onNodeContextMenu={handleNodeContextMenu}
                    onPaneContextMenu={handlePaneContextMenu}
                    onEdgeContextMenu={handleEdgeContextMenu}
                    onPaneMouseMove={handlePaneMouseMove}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    isValidConnection={isValidConnection}
                    fitView
                    className="bg-background"
                    panOnDrag={canvasMode === 'pan'}
                    selectionOnDrag={canvasMode === 'select'}
                    // selectionMode={SelectionMode.Partial}
                    // selectionKeyCode={null} // Box selection is mode-only; Shift here would hijack shift-clicks and leave stale selection rects
                    multiSelectionKeyCode={MULTI_SELECTION_KEYS}
                    maxZoom={4}
                    minZoom={0.05}
                    nodesDraggable={!isReadOnly}
                    nodesConnectable={!isReadOnly}
                    elementsSelectable={!isReadOnly}
                    panOnScroll={isReadOnly}
                    deleteKeyCode={DELETE_KEYS}
                >
                    <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
                    <ZoomCssVariable />
                </ReactFlow>
                <NodeDebugPreviewOverlay />
                {!isReadOnly && <CanvasEdgeDropPicker />}
                {!isReadOnly && <EdgeContextMenu />}
            </div >

        </>
    );
});

function EditorContent(props: EditorProps) {
    const [isFindOpen, setIsFindOpen] = useState(false);
    const onOpenFind = useCallback(() => setIsFindOpen(true), []);
    const onCloseFind = useCallback(() => setIsFindOpen(false), []);

    return (
        <>
            <FlowCanvas
                isReadOnly={props.isReadOnly}
                onOpenFind={onOpenFind}
            />
            <EditorChrome
                navbarProps={props}
                projectId={props.projectId}
                hasThumbnail={props.hasThumbnail}
                isReadOnly={props.isReadOnly}
                chromeVisibility={props.chromeVisibility}
                isFindOpen={isFindOpen}
                onCloseFind={onCloseFind}
            />
        </>
    );
}

export const Editor = memo(function Editor(props: EditorProps) {
    return (
        <div className="w-full h-full relative">
            <ReactFlowProvider>
                <EditorContent {...props} />
            </ReactFlowProvider>
        </div>
    );
});
