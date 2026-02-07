'use client';

import { useMemo, useEffect, useCallback, useState } from 'react';
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
import { TSLNode } from './TSLNode';
import GroupNode from './GroupNode';
import LoopPortNode from './LoopPortNode';
import LoopIndexNode from './LoopIndexNode';
import { NodePicker } from './NodePicker';
import { Navbar } from '@/components/Navbar';
import { registry } from '@/lib/registry';
import { initializeNodes } from '@/lib/nodes';
import { UILayer } from './UILayer';
import { Preview } from './Preview';
import { Toolbar } from './Toolbar';
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
        reparentNodes,
        selectedNodeIds,
        setHoveredGroupId,
    } = useEditorStore();

    const openEdgeDropPicker = useEdgeDropPickerStore(state => state.open);
    const { screenToFlowPosition, getIntersectingNodes, getNodes, getEdges } = useReactFlow<AppNode>();

    // const isInitialized = useRef(false);
    const [isCodePanelOpen, setIsCodePanelOpen] = useState(false);
    const [isNodePickerOpen, setIsNodePickerOpen] = useState(true);
    const [isCodeNodeDialogOpen, setIsCodeNodeDialogOpen] = useState(false);

    const onNodePickerClose = useCallback(() => setIsNodePickerOpen(false), []);
    const onOpenCodeNodeDialog = useCallback(() => setIsCodeNodeDialogOpen(true), []);

    // Keyboard shortcuts for Undo/Redo
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
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [undo, redo]);

    // Snapshot triggers for ReactFlow events

    // 1. Dragging: Snapshot when drag starts to capture original position
    const onNodeDragStart = useCallback(() => {
        takeSnapshot();
    }, [takeSnapshot]);

    const handleNodeDrag = useCallback(
        (_event: unknown, node: AppNode) => {
            if (node.type === 'group') {
                setHoveredGroupId(null);
                return;
            }

            const intersectingGroups = getIntersectingNodes(node).filter(
                (candidate) => candidate.type === 'group' && candidate.id !== node.id
            );

            if (intersectingGroups.length === 0) {
                setHoveredGroupId(null);
                return;
            }

            const pickGroup = (groups: AppNode[]) => {
                const getArea = (group: AppNode) => {
                    const width = Number(group.width ?? group.style?.width ?? 0);
                    const height = Number(group.height ?? group.style?.height ?? 0);
                    return width * height || Number.MAX_SAFE_INTEGER;
                };
                return groups.reduce((best, current) => (getArea(current) < getArea(best) ? current : best), groups[0]);
            };

            const targetGroup = pickGroup(intersectingGroups);
            setHoveredGroupId(targetGroup.id);
        },
        [getIntersectingNodes, setHoveredGroupId]
    );

    const handleNodeDragStop = useCallback(
        (_event: unknown, node: AppNode) => {
            const intersectingGroups = getIntersectingNodes(node).filter(
                (candidate) => candidate.type === 'group' && candidate.id !== node.id
            );

            setHoveredGroupId(null);
            if (intersectingGroups.length === 0) return;

            const pickGroup = (groups: AppNode[]) => {
                const getArea = (group: AppNode) => {
                    const width = Number(group.width ?? group.style?.width ?? 0);
                    const height = Number(group.height ?? group.style?.height ?? 0);
                    return width * height || Number.MAX_SAFE_INTEGER;
                };
                return groups.reduce((best, current) => (getArea(current) < getArea(best) ? current : best), groups[0]);
            };

            const targetGroup = pickGroup(intersectingGroups);
            const nodeIds = selectedNodeIds.length > 0 ? selectedNodeIds : [node.id];
            reparentNodes(nodeIds, targetGroup.id, { skipSnapshot: true });
        },
        [getIntersectingNodes, reparentNodes, selectedNodeIds, setHoveredGroupId]
    );

    // 2. Nodes Change: Snapshot only on Add/Remove
    const handleNodesChange = useCallback((changes: Parameters<typeof onNodesChange>[0]) => {
        const hasStructuralChange = changes.some(
            (c) => c.type === 'add' || c.type === 'remove'
        );

        const extraChanges: Parameters<typeof onNodesChange>[0] = []

        for (let index = 0; index < changes.length; index++) {
            const change = changes[index];
            if (change.type !== "remove") {
                continue;
            }

            const node = getNodes().find((n) => n.id === change.id);
            if (!node?.data.loop) {
                continue;
            }

            const loop = node.data.loop;
            if (loop.countPortId) {
                extraChanges.push({
                    id: loop.countPortId,
                    type: "remove",
                })
            }
            if (loop.indexNodeId) {
                extraChanges.push({
                    id: loop.indexNodeId,
                    type: "remove",
                })
            }
            if (loop.outputPortId) {
                extraChanges.push({
                    id: loop.outputPortId,
                    type: "remove",
                })
            }
        }

        if (hasStructuralChange) {
            takeSnapshot();
        }
        onNodesChange([...changes, ...extraChanges]);
    }, [getNodes, onNodesChange, takeSnapshot]);

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
            'loop/input': LoopPortNode,
            'loop/output': LoopPortNode,
            'loop/index': LoopIndexNode,
        };
        // Add registry types
        for (const def of registry.all()) {
            types[def.type] = TSLNode;
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

            const nodeById = new Map(nodes.map((n) => [n.id, n]));

            const findLoopParent = (nodeId: string | undefined | null): string | null => {
                let currentId = nodeId;
                while (currentId) {
                    const current = nodeById.get(currentId);
                    if (!current) return null;
                    if (current.type === 'group' && current.data?.loop?.kind === 'loop') {
                        return current.id;
                    }
                    currentId = current.parentId ?? null;
                }
                return null;
            };

            const getParentLoopId = (loopId: string): string | null => {
                let currentId: string | null = nodeById.get(loopId)?.parentId ?? null;
                while (currentId) {
                    const current = nodeById.get(currentId);
                    if (!current) return null;
                    if (current.type === 'group' && current.data?.loop?.kind === 'loop') {
                        return current.id;
                    }
                    currentId = current.parentId ?? null;
                }
                return null;
            };

            const isAncestorLoop = (loopId: string, ancestorId: string): boolean => {
                let currentId: string | null = loopId;
                while (currentId) {
                    if (currentId === ancestorId) return true;
                    currentId = getParentLoopId(currentId);
                }
                return false;
            };

            const sourceLoop = findLoopParent(source.id);
            const targetLoop = findLoopParent(target.id);

            if (sourceLoop !== targetLoop) {
                const sourceIsLoopOutput =
                    source.type === 'loop/output' &&
                    source.data?.loopPort?.kind === 'output' &&
                    (connection.sourceHandle ?? '') === 'out';

                const sourceParentLoop = sourceLoop ? getParentLoopId(sourceLoop) : null;

                const sourceIsAncestor =
                    targetLoop !== null && (sourceLoop === null || isAncestorLoop(targetLoop, sourceLoop));

                if (sourceIsAncestor) {
                    return !hasCycle(target, source, nodes, edges);
                }

                const isToParentLoop = sourceIsLoopOutput && targetLoop === sourceParentLoop;
                const isToGlobalFromTop = sourceIsLoopOutput && sourceParentLoop === null && targetLoop === null;

                if (!isToParentLoop && !isToGlobalFromTop) return false;

                if (sourceParentLoop) {
                    const targetType = target.data?.type;
                    const isAssignTarget =
                        targetType === 'math/assign' ||
                        targetType === 'math/addAssign' ||
                        targetType === 'math/subAssign' ||
                        targetType === 'math/mulAssign' ||
                        targetType === 'math/divAssign';

                    if (!isAssignTarget) return false;
                }
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
                    onNodeDrag={handleNodeDrag}
                    onNodeDragStart={onNodeDragStart}
                    onNodeDragStop={handleNodeDragStop}
                    onSelectionChange={onSelectionChange}
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
                        <Toolbar
                            onOpenCodePanel={() => setIsCodePanelOpen(true)}
                        />
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
