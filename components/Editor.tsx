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
    type Connection,
    type Edge,
    type OnConnectEnd,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useEditorStore } from '@/store/editor';
import type { AppNode, TSLType } from '@/lib/types';
import { hasCycle } from '@/lib/graph-utils';
import { getAbsolutePosition } from '@/lib/utils';
import { getLocalSourceId, isLocalGetNode, isLocalScopeAccessible, isLocalSetNode } from '@/lib/local-utils';
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
import { PanelLeft } from 'lucide-react';
import TSLEdge from './TSLEdge';
import { CanvasEdgeDropPicker } from './CanvasEdgeDropPicker';
import { useEdgeDropPickerStore } from '@/store/edge-drop-picker';
import { CodeNodeDialog } from './CodeNodeDialog';
import { StaleTemplatesNotification } from './StaleTemplatesNotification';
import type { Id } from '@/convex/_generated/dataModel';
import { DEFAULT_EDITOR_HOST_CAPABILITIES, type EditorHostCapabilities } from '@/lib/editor-host/types';
import { TutorialOverlay, TutorialHighlight, TutorialComplete, TutorialLauncher } from '@/components/tutorial';
import { useTutorialStore } from '@/store/tutorial-store';
import { EDITOR_SHORTCUTS, isEditorShortcutBlocked, matchesEditorShortcut } from '@/lib/editor-shortcuts';

// Initialize nodes on module load
initializeNodes();

const edgeTypes = {
    default: TSLEdge,
}

interface NavbarProps {
    projectName?: string;
    projectId?: Id<"projects">;
    capabilities?: EditorHostCapabilities;
}

interface EditorProps extends NavbarProps {
    projectId?: Id<"projects">;
    hasThumbnail?: boolean;
    isReadOnly?: boolean;
}

interface EditorChromeProps {
    navbarProps?: NavbarProps;
    projectId?: Id<"projects">;
    hasThumbnail?: boolean;
    isReadOnly?: boolean;
    isFindOpen: boolean;
    onCloseFind: () => void;
}

const EditorChrome = memo(function EditorChrome({
    navbarProps,
    projectId,
    hasThumbnail,
    isReadOnly,
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
    const canUseAI = navbarProps?.capabilities?.canUseAI ?? DEFAULT_EDITOR_HOST_CAPABILITIES.canUseAI;
    const effectiveBottomBarMode = canUseAI ? bottomBarMode : 'toolbar';

    const onNodePickerClose = useCallback(() => setIsNodePickerOpen(false), []);
    const onOpenNodePicker = useCallback(() => setIsNodePickerOpen(true), []);
    const onOpenCodePanel = useCallback(() => setIsCodePanelOpen(true), []);
    const onCloseCodePanel = useCallback(() => setIsCodePanelOpen(false), []);
    const onOpenCodeNodeDialog = useCallback(() => setIsCodeNodeDialogOpen(true), []);
    const onOpenAiDock = useCallback(() => setBottomBarMode('ai'), []);
    const onOpenToolbar = useCallback(() => setBottomBarMode('toolbar'), []);

    return (
        <>
            <UILayer>
                {!isReadOnly && isTutorialActive && isTutorialRoute && (
                    <UILayer.CenterPanel>
                        <TutorialOverlay />
                    </UILayer.CenterPanel>
                )}

                <UILayer.TopBar>
                    <Navbar
                        {...navbarProps}
                        projectId={projectId}
                        isReadOnly={isReadOnly}
                        capabilities={navbarProps?.capabilities}
                        noteSearchBar={
                            isFindOpen ? (
                                <NoteSearchBar
                                    open={true}
                                    onClose={onCloseFind}
                                />
                            ) : null
                        }
                    />
                </UILayer.TopBar>

                {!isReadOnly && (
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

                <UILayer.RightPanel>
                    {editorMode === 'main' && <Preview projectId={projectId} hasThumbnail={hasThumbnail} />}
                    {!isReadOnly && <PropertiesPanel />}
                </UILayer.RightPanel>

                {!isReadOnly && (
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

function EditorCanvas({ navbarProps, projectId, hasThumbnail, isReadOnly }: { navbarProps?: NavbarProps; projectId?: Id<"projects">; hasThumbnail?: boolean; isReadOnly?: boolean }) {
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
    const { screenToFlowPosition } = useReactFlow();

    // const isInitialized = useRef(false);
    const [isFindOpen, setIsFindOpen] = useState(false);
    const lastPanePositionRef = useRef<{ x: number; y: number } | null>(null);

    const onCloseFind = useCallback(() => setIsFindOpen(false), []);

    // Global editing shortcuts that are not toolbar-specific.
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (isEditorShortcutBlocked(event)) return;

            if (matchesEditorShortcut(event, EDITOR_SHORTCUTS.findNotes)) {
                event.preventDefault();
                setIsFindOpen(true);
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
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [undo, redo, copySelection, pasteSelection, screenToFlowPosition, isReadOnly]);

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

    // 2. Nodes Change: Snapshot only on Add/Remove
    const handleNodesChange = useCallback((changes: Parameters<typeof onNodesChange>[0]) => {
        const hasStructuralChange = changes.some(
            (c) => c.type === 'add' || c.type === 'remove'
        );
        if (hasStructuralChange) {
            takeSnapshot();
        }
        onNodesChange(changes);
    }, [onNodesChange, takeSnapshot]);

    // 3. Edges Change: Snapshot only on Add/Remove
    const handleEdgesChange = useCallback((changes: Parameters<typeof onEdgesChange>[0]) => {
        const hasStructuralChange = changes.some(
            (c) => c.type === 'add' || c.type === 'remove'
        );
        if (hasStructuralChange) {
            takeSnapshot();
        }
        onEdgesChange(changes);
    }, [onEdgesChange, takeSnapshot]);

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
        (connection: Connection | Edge) => {
            const nodes = getNodes();
            const edges = getEdges();
            const target = nodes.find((node) => node.id === connection.target);
            const source = nodes.find((node) => node.id === connection.source);
            const nodesById = new Map(nodes.map((node) => [node.id, node]));

            if (!target || !source) {
                return false;
            }

            const getLoopParentId = (node: AppNode): string | null => {
                if (node.type === 'loop' || node.data.type === 'loop') return node.id;
                let parentId = node.parentId;
                while (parentId) {
                    const parent = nodes.find(n => n.id === parentId);
                    if (!parent) break;
                    if (parent.type === 'loop' || parent.data.type === 'loop') return parent.id;
                    parentId = parent.parentId;
                }
                return null;
            };

            const sourceLoopId = getLoopParentId(source);
            const targetLoopId = getLoopParentId(target);

            // Disallow connections across different loops
            if (sourceLoopId && targetLoopId && sourceLoopId !== targetLoopId) {
                return false;
            }

            // Inside -> outside only allowed from loop/output
            if (sourceLoopId && !targetLoopId) {
                if (source.data.type !== 'loop/output') return false;
            }

            // Outside -> inside allowed, except into loop/output (must be internal)
            if (!sourceLoopId && targetLoopId) {
                if (target.data.type === 'loop/output') return false;
            }

            if (isLocalGetNode(source)) {
                const sourceSetId = getLocalSourceId(source);
                if (!sourceSetId) return false;
                const sourceSetNode = nodesById.get(sourceSetId);
                if (!isLocalSetNode(sourceSetNode)) return false;
                if (!isLocalScopeAccessible(sourceSetNode, source, nodesById)) return false;
            }

            return !hasCycle(target, source, nodes, edges);
        },
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
                    if (def && def.inputs) {
                        const port = def.inputs[handleId];
                        if (port) dataType = port.type;
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

    return (
        <>
            {/* Canvas Layer */}
            <div data-tutorial-target="canvas" className="absolute inset-0">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={handleNodesChange}
                    onEdgesChange={handleEdgesChange}
                    onConnect={onConnect}
                    onConnectEnd={onConnectEnd}
                    onNodeDragStart={onNodeDragStart}
                    onNodeDrag={onNodeDrag}
                    onNodeDragStop={onNodeDragStop}
                    onSelectionChange={onSelectionChange}
                    onNodeContextMenu={(event, node) => {
                        event.preventDefault();
                        // Select the right-clicked node
                        const { selectSingleNode } = useEditorStore.getState();
                        selectSingleNode(node.id);
                        // Open the node picker at the right-click position
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
                    }}
                    onPaneContextMenu={(event) => {
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
                    }}
                    onPaneMouseMove={handlePaneMouseMove}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    isValidConnection={isValidConnection}
                    fitView
                    className="bg-background"
                    panOnDrag={canvasMode === 'pan'}
                    selectionOnDrag={canvasMode === 'select'}
                    selectionKeyCode={null} // Box selection is mode-only; Shift here would hijack shift-clicks and leave stale selection rects
                    multiSelectionKeyCode={["Shift", "Meta", "Control"]}
                    maxZoom={4}
                    minZoom={0.05}
                    nodesDraggable={!isReadOnly}
                    nodesConnectable={!isReadOnly}
                    elementsSelectable={!isReadOnly}
                    panOnScroll={isReadOnly}
                    deleteKeyCode={["Backspace", "Delete"]}
                >
                    <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
                </ReactFlow>
                <NodeDebugPreviewOverlay />
                {!isReadOnly && <CanvasEdgeDropPicker />}
            </div >

            <EditorChrome
                navbarProps={navbarProps}
                projectId={projectId}
                hasThumbnail={hasThumbnail}
                isReadOnly={isReadOnly}
                isFindOpen={isFindOpen}
                onCloseFind={onCloseFind}
            />
        </>
    );
}

export function Editor(props: EditorProps) {
    return (
        <div className="w-full h-full relative">
            <ReactFlowProvider>
                <EditorCanvas navbarProps={props} projectId={props.projectId} hasThumbnail={props.hasThumbnail} isReadOnly={props.isReadOnly} />
            </ReactFlowProvider>
        </div>
    );
}
