'use client';

import { useMemo, useEffect, useCallback, useState, useRef } from 'react';
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
import type { AppNode, TSLType, TSLNodeData } from '@/lib/types';
import { hasCycle } from '@/lib/graph-utils';
import { getAbsolutePosition } from '@/lib/utils';
import { TSLNode } from './TSLNode';
import GroupNode from './GroupNode';
import LoopInternalNode from './LoopInternalNode';
import { NodePicker } from './NodePicker';
import { Navbar } from '@/components/Navbar';
import { registry } from '@/lib/registry';
import { initializeNodes } from '@/lib/nodes';
import { MATERIAL_NODE_TYPES } from '@/lib/nodes';
import { UILayer } from './UILayer';
import { Preview } from './Preview';
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

// Initialize nodes on module load
initializeNodes();

const edgeTypes = {
    default: TSLEdge,
}

interface NavbarProps {
    projectName?: string;
    projectId?: Id<"projects">;
}

interface EditorProps extends NavbarProps {
    projectId?: Id<"projects">;
    hasThumbnail?: boolean;
    isReadOnly?: boolean;
}

function EditorCanvas({ navbarProps, projectId, hasThumbnail, isReadOnly }: { navbarProps?: NavbarProps; projectId?: Id<"projects">; hasThumbnail?: boolean; isReadOnly?: boolean }) {
    const {
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        onConnect,
        setSelectedNode,
        setSelectedNodes,
        editorMode,
        undo,
        redo,
        takeSnapshot,
        canvasMode,
        copySelection,
        pasteSelection,
    } = useEditorStore();

    const openEdgeDropPicker = useEdgeDropPickerStore(state => state.open);
    const { screenToFlowPosition } = useReactFlow();

    // const isInitialized = useRef(false);
    const [isCodePanelOpen, setIsCodePanelOpen] = useState(false);
    const [isNodePickerOpen, setIsNodePickerOpen] = useState(true);
    const [isCodeNodeDialogOpen, setIsCodeNodeDialogOpen] = useState(false);
    const [bottomBarMode, setBottomBarMode] = useState<'ai' | 'toolbar'>('toolbar');
    const lastPanePositionRef = useRef<{ x: number; y: number } | null>(null);

    const onNodePickerClose = useCallback(() => setIsNodePickerOpen(false), []);
    const onOpenCodeNodeDialog = useCallback(() => setIsCodeNodeDialogOpen(true), []);

    // Keyboard shortcuts for Undo/Redo + Copy/Paste
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Ignore if focus is in an input or textarea
            if (
                event.target instanceof HTMLInputElement ||
                event.target instanceof HTMLTextAreaElement ||
                (event.target as HTMLElement).isContentEditable
            ) {
                return;
            }

            const isMod = event.ctrlKey || event.metaKey;
            const key = event.key.toLowerCase();

            if (isMod && key === "z") {
                event.preventDefault();
                if (event.shiftKey) {
                    redo();
                } else {
                    undo();
                }
            }

            if (isMod && key === "y") {
                event.preventDefault();
                redo();
            }

            if (isMod && key === "c") {
                event.preventDefault();
                copySelection();
            }

            if (isMod && key === "v") {
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

    const { getNodes, getEdges } = useReactFlow<AppNode>();
    const dropNodesIntoGroup = useEditorStore((s) => s.dropNodesIntoGroup);
    const setHoveredGroupId = useEditorStore((s) => s.setHoveredGroupId);

    const handlePaneMouseMove = useCallback((event: React.MouseEvent) => {
        lastPanePositionRef.current = { x: event.clientX, y: event.clientY };
    }, []);

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
                    if (def && def.outputs) {
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
            <div className="absolute inset-0">
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
                    selectionKeyCode={"Shift"}
                    maxZoom={4}
                    minZoom={0.05}
                    nodesDraggable={!isReadOnly}
                    nodesConnectable={!isReadOnly}
                    elementsSelectable={!isReadOnly}
                    panOnScroll={isReadOnly}
                >
                    <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
                </ReactFlow>
                {!isReadOnly && <CanvasEdgeDropPicker />}
            </div >

            {/* UI Layer */}
            < UILayer >
                <UILayer.TopBar>
                    <Navbar {...navbarProps} projectId={projectId} isReadOnly={isReadOnly} />
                </UILayer.TopBar>

                {!isReadOnly && (
                    <UILayer.LeftPanel>
                        {isNodePickerOpen ? (
                            <NodePicker
                                onClose={onNodePickerClose}
                                onOpenCodeNodeDialog={onOpenCodeNodeDialog}
                            />
                        ) : (
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setIsNodePickerOpen(true)}
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
                                onOpenCodePanel={() => setIsCodePanelOpen(true)}
                            />
                        ) : (
                            <div className="pointer-events-auto">
                                <div className={bottomBarMode === 'toolbar' ? 'block' : 'hidden'}>
                                    <Toolbar
                                        onOpenCodePanel={() => setIsCodePanelOpen(true)}
                                        onOpenAiDock={() => setBottomBarMode('ai')}
                                    />
                                </div>
                                <div className={bottomBarMode === 'ai' ? 'block' : 'hidden'}>
                                    <AiChatDock onOpenToolbar={() => setBottomBarMode('toolbar')} isOpen={bottomBarMode === 'ai'} />
                                </div>
                            </div>
                        )}
                    </UILayer.BottomBar>
                )}
            </UILayer >

            {!isReadOnly && (
                <>
                    {/* Code Panel Modal */}
                    <CodePanel
                        isOpen={isCodePanelOpen}
                        onClose={() => setIsCodePanelOpen(false)}
                    />

                    {/* Code Node Dialog */}
                    {isCodeNodeDialogOpen && (
                        <CodeNodeDialog
                            open={true}
                            onOpenChange={setIsCodeNodeDialogOpen}
                            mode="create"
                        />
                    )}

                    {/* Stale Templates Notification */}
                    <StaleTemplatesNotification />
                </>
            )}
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
