'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import posthog from "posthog-js";
import { Code, Layers, Undo2, Redo2, Hand, MousePointer2, Group, Ungroup, Loader2, Check, X, Repeat, Combine, Split, FileCode2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useEditorStore } from '@/store/editor';
import { registry } from '@/lib/registry';
import { toast } from 'sonner';
import { detectConvertibleChain } from '@/lib/multi-op-convert';
import { ExportImageButton } from '@/components/ExportImageButton';
import { MATERIAL_NODE_TYPES } from '@/lib/nodes';
import { useReactFlow } from '@xyflow/react';
import {
    EDITOR_SHORTCUTS,
    isEditorShortcutBlocked,
    matchesEditorShortcut,
    shortcutTooltip,
} from '@/lib/editor-shortcuts';

interface ToolbarProps {
    onOpenCodePanel?: () => void;
    onCreateCodeNode?: () => void;
}

export function Toolbar({ onOpenCodePanel, onCreateCodeNode }: ToolbarProps) {
    const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds);
    const createSubgraph = useEditorStore((s) => s.createSubgraph);
    const enterSubgraphEditor = useEditorStore((s) => s.enterSubgraphEditor);
    const editorMode = useEditorStore((s) => s.editorMode);
    const exitSubgraphEditor = useEditorStore((s) => s.exitSubgraphEditor);
    const editingSubgraphId = useEditorStore((s) => s.editingSubgraphId);
    const editingSubgraphScopeDraft = useEditorStore((s) => s.editingSubgraphScopeDraft);
    const setEditingSubgraphScopeDraft = useEditorStore((s) => s.setEditingSubgraphScopeDraft);
    const subgraphs = useEditorStore((s) => s.subgraphs);
    const undo = useEditorStore((s) => s.undo);
    const redo = useEditorStore((s) => s.redo);
    const canUndo = useEditorStore((s) => s.history.past.length > 0);
    const canRedo = useEditorStore((s) => s.history.future.length > 0);
    const canvasMode = useEditorStore((s) => s.canvasMode);
    const setCanvasMode = useEditorStore((s) => s.setCanvasMode);
    const groupNodes = useEditorStore((s) => s.groupNodes);
    const ungroupNodes = useEditorStore((s) => s.ungroupNodes);
    const createLoopGroup = useEditorStore((s) => s.createLoopGroup);
    const removeNodesFromGroup = useEditorStore((s) => s.removeNodesFromGroup);
    const convertChainToMultiOp = useEditorStore((s) => s.convertChainToMultiOp);
    const convertMultiOpToChain = useEditorStore((s) => s.convertMultiOpToChain);
    const graphStructureVersion = useEditorStore((s) => s.graphStructureVersion);

    // Ref to track subgraph name without causing re-renders
    const subgraphNameRef = useRef<HTMLInputElement>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const { setCenter, getZoom, screenToFlowPosition, fitView } = useReactFlow();
    const { nodes, edges } = useMemo(() => {
        const state = useEditorStore.getState();
        return { nodes: state.nodes, edges: state.edges };
    }, [editorMode, graphStructureVersion, selectedNodeIds]);

    // Create subgraph from selected nodes (sync - DB save is fire-and-forget)
    const handleCreateSubgraph = useCallback(() => {
        const defaultName = 'Subgraph';
        const subgraphId = createSubgraph(defaultName, selectedNodeIds);
        if (subgraphId) {
            enterSubgraphEditor(subgraphId, { createInstanceOnSave: true });
        }
    }, [selectedNodeIds, createSubgraph, enterSubgraphEditor]);

    // Exit subgraph mode
    const handleExitSubgraph = useCallback(async (save: boolean) => {
        if (isProcessing) return;

        let nameOverride: string | undefined = undefined;

        if (save && editingSubgraphId && subgraphNameRef.current) {
            const rawName = subgraphNameRef.current.value;
            const normalizedName = rawName.trim();
            const currentName = subgraphs[editingSubgraphId]?.name ?? '';
            const currentNormalized = currentName.trim();
            const nameChanged = normalizedName.toLowerCase() !== currentNormalized.toLowerCase();

            if (!normalizedName) {
                toast.error('Subgraph name cannot be empty.');
                posthog.capture('error_occurred', { context: 'exit_subgraph_validation', error: 'Subgraph name cannot be empty.' });
                return;
            }

            if (nameChanged) {
                // Uniqueness Check
                // 1. Check against built-in nodes
                const registryConfict = registry.all().some(def => def.label.toLowerCase() === normalizedName.toLowerCase());
                if (registryConfict) {
                    toast.error(`Name "${normalizedName}" is reserved by a built-in node.`);
                    posthog.capture('error_occurred', { context: 'exit_subgraph_validation', error: 'Name reserved by built-in node', name: normalizedName });
                    return;
                }

                // 2. Check against other subgraphs
                const otherSubgraphs = Object.values(subgraphs).filter(sg => sg.id !== editingSubgraphId);
                const subgraphConflict = otherSubgraphs.some(sg => sg.name.toLowerCase() === normalizedName.toLowerCase());
                if (subgraphConflict) {
                    toast.error(`A subgraph with the name "${normalizedName}" already exists.`);
                    posthog.capture('error_occurred', { context: 'exit_subgraph_validation', error: 'Subgraph name already exists', name: normalizedName });
                    return;
                }
            }

            if (rawName !== currentName) {
                nameOverride = rawName;
            }
        }

        setIsProcessing(true);
        try {
            const subgraphNode = await exitSubgraphEditor(save, nameOverride);
            if (subgraphNode) {
                const zoom = getZoom();
                setCenter(subgraphNode.position.x, subgraphNode.position.y, { duration: 0, zoom });

            }
        } finally {
            setIsProcessing(false);
            requestAnimationFrame(() => {
                fitView({
                    padding: 0.2,
                    duration: 250,
                });
            })

        }
    }, [exitSubgraphEditor, editingSubgraphId, subgraphs, isProcessing, setCenter, getZoom, fitView]);

    const {
        canRemoveFromGroup,
        canUngroup,
        convertibleChain,
        isMaterialSelected,
        selectedMultiOpId,
    } = useMemo(() => {
        const selectedIdSet = new Set(selectedNodeIds);
        const nodeById = new Map(nodes.map((node) => [node.id, node]));
        const selectedNodes = nodes.filter((node) => selectedIdSet.has(node.id));

        return {
            isMaterialSelected: selectedNodes.some((node) =>
                (MATERIAL_NODE_TYPES as readonly string[]).includes(node.data.type),
            ),
            canRemoveFromGroup: selectedNodes.length > 0 && selectedNodes.every((node) => {
                if (node.type === 'group' || node.data.type === 'loop') return false;
                if (!node.parentId || node.data.type.startsWith('loop/')) return false;
                const parent = nodeById.get(node.parentId);
                return Boolean(parent && (parent.type === 'group' || parent.data.type === 'loop'));
            }),
            canUngroup: selectedNodes.length > 0 && selectedNodes.every(
                (node) => node.type === 'group' && node.data.type !== 'loop',
            ),
            convertibleChain: selectedNodeIds.length >= 2
                ? detectConvertibleChain(selectedNodeIds, nodes, edges)
                : null,
            selectedMultiOpId:
                selectedNodeIds.length === 1 && selectedNodes[0]?.data.type === 'math/multiOp'
                    ? selectedNodeIds[0]
                    : null,
        };
    }, [edges, nodes, selectedNodeIds]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.repeat) return;

            const run = (action: () => void) => {
                event.preventDefault();
                action();
            };

            const isSubgraphSaveShortcut =
                editorMode === 'subgraph' &&
                !event.defaultPrevented &&
                !document.querySelector('[role="dialog"][data-state="open"]') &&
                matchesEditorShortcut(event, EDITOR_SHORTCUTS.saveAndExitSubgraph);

            // Saving should work while the subgraph name input is focused.
            if (isSubgraphSaveShortcut && !isProcessing) {
                run(() => { void handleExitSubgraph(true); });
                return;
            }

            if (isEditorShortcutBlocked(event)) return;

            if (matchesEditorShortcut(event, EDITOR_SHORTCUTS.panMode)) {
                run(() => setCanvasMode('pan'));
            } else if (matchesEditorShortcut(event, EDITOR_SHORTCUTS.selectMode)) {
                run(() => setCanvasMode('select'));
            } else if (editorMode === 'subgraph') {
                if (matchesEditorShortcut(event, EDITOR_SHORTCUTS.cancelSubgraph) && !isProcessing) {
                    run(() => { void handleExitSubgraph(false); });
                } else if (matchesEditorShortcut(event, EDITOR_SHORTCUTS.createLoop) && !isMaterialSelected) {
                    run(() => {
                        const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
                        createLoopGroup(center);
                    });
                } else if (
                    matchesEditorShortcut(event, EDITOR_SHORTCUTS.convertToMultiOp) &&
                    convertibleChain?.valid
                ) {
                    run(() => convertChainToMultiOp(convertibleChain.orderedNodeIds));
                } else if (matchesEditorShortcut(event, EDITOR_SHORTCUTS.expandMultiOp) && selectedMultiOpId) {
                    run(() => convertMultiOpToChain(selectedMultiOpId));
                } else if (matchesEditorShortcut(event, EDITOR_SHORTCUTS.viewCode) && onOpenCodePanel) {
                    run(onOpenCodePanel);
                }
                return;
            } else if (matchesEditorShortcut(event, EDITOR_SHORTCUTS.createSubgraph)) {
                run(handleCreateSubgraph);
            } else if (matchesEditorShortcut(event, EDITOR_SHORTCUTS.createCodeNode) && onCreateCodeNode) {
                run(onCreateCodeNode);
            } else if (matchesEditorShortcut(event, EDITOR_SHORTCUTS.removeFromGroup) && canRemoveFromGroup) {
                run(() => removeNodesFromGroup(selectedNodeIds));
            } else if (matchesEditorShortcut(event, EDITOR_SHORTCUTS.createLoop) && !isMaterialSelected) {
                run(() => {
                    const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
                    createLoopGroup(center);
                });
            } else if (matchesEditorShortcut(event, EDITOR_SHORTCUTS.groupNodes) && selectedNodeIds.length > 0) {
                run(groupNodes);
            } else if (matchesEditorShortcut(event, EDITOR_SHORTCUTS.ungroupNodes) && canUngroup) {
                run(ungroupNodes);
            } else if (
                matchesEditorShortcut(event, EDITOR_SHORTCUTS.convertToMultiOp) &&
                convertibleChain?.valid
            ) {
                run(() => convertChainToMultiOp(convertibleChain.orderedNodeIds));
            } else if (matchesEditorShortcut(event, EDITOR_SHORTCUTS.expandMultiOp) && selectedMultiOpId) {
                run(() => convertMultiOpToChain(selectedMultiOpId));
            } else if (matchesEditorShortcut(event, EDITOR_SHORTCUTS.viewCode) && onOpenCodePanel) {
                run(onOpenCodePanel);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        canRemoveFromGroup,
        canUngroup,
        convertibleChain,
        convertChainToMultiOp,
        convertMultiOpToChain,
        createLoopGroup,
        editorMode,
        groupNodes,
        handleCreateSubgraph,
        handleExitSubgraph,
        isMaterialSelected,
        isProcessing,
        onCreateCodeNode,
        onOpenCodePanel,
        removeNodesFromGroup,
        screenToFlowPosition,
        selectedMultiOpId,
        selectedNodeIds,
        setCanvasMode,
        ungroupNodes,
    ]);

    // Subgraph mode toolbar
    if (editorMode === 'subgraph') {
        return (
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    handleExitSubgraph(true);
                }}
                className="pointer-events-auto flex items-center gap-1 bg-card/95 backdrop-blur-sm border-2 border-primary rounded-xl p-1.5 shadow-lg"
            >
                <div className="px-3 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    <Input
                        ref={subgraphNameRef}
                        key={editingSubgraphId} // Force re-render when switching subgraphs to update defaultValue
                        defaultValue={editingSubgraphId ? subgraphs[editingSubgraphId]?.name : ''}
                        className="h-7 w-40 px-2 text-xs border-transparent hover:border-border focus:border-border bg-transparent focus:bg-background transition-colors font-medium"
                        placeholder="Subgraph Name"
                    />
                    {editingSubgraphId && (
                        <select
                            className="h-7 rounded-md border border-border bg-background/60 px-2 text-xs text-foreground"
                            title="Scope: Project = only in this project. Library = available in all your projects."
                            value={editingSubgraphScopeDraft ?? (subgraphs[editingSubgraphId]?.scope ?? (subgraphs[editingSubgraphId]?.templateId ? 'library' : 'project'))}
                            onChange={(e) => setEditingSubgraphScopeDraft(e.target.value as 'project' | 'library')}
                        >
                            <option value="project">Project</option>
                            <option value="library">Library</option>
                        </select>
                    )}
                </div>



                <div className="w-px h-4 bg-border" />

                <div className="flex items-center gap-0.5">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant={canvasMode === 'pan' ? 'secondary' : 'ghost'}
                                size="icon"
                                onClick={() => setCanvasMode('pan')}
                                className="h-8 w-8"
                            >
                                <Hand className="w-4 h-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{shortcutTooltip('Pan Mode', EDITOR_SHORTCUTS.panMode)}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant={canvasMode === 'select' ? 'secondary' : 'ghost'}
                                size="icon"
                                onClick={() => setCanvasMode('select')}
                                className="h-8 w-8"
                            >
                                <MousePointer2 className="w-4 h-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{shortcutTooltip('Selection Mode', EDITOR_SHORTCUTS.selectMode)}</TooltipContent>
                    </Tooltip>
                </div>

                <div className="w-px h-4 bg-border" />

                <div className="flex items-center gap-0.5">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="inline-flex">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={undo}
                                    disabled={!canUndo}
                                    className="h-8 w-8 text-primary hover:text-primary"
                                >
                                    <Undo2 className="w-4 h-4" />
                                </Button>
                            </span>
                        </TooltipTrigger>
                        <TooltipContent>{shortcutTooltip('Undo', EDITOR_SHORTCUTS.undo)}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="inline-flex">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={redo}
                                    disabled={!canRedo}
                                    className="h-8 w-8 text-primary hover:text-primary"
                                >
                                    <Redo2 className="w-4 h-4" />
                                </Button>
                            </span>
                        </TooltipTrigger>
                        <TooltipContent>{shortcutTooltip('Redo', EDITOR_SHORTCUTS.redo)}</TooltipContent>
                    </Tooltip>
                </div>

                <div className="w-px h-4 bg-border" />

                <div className="flex items-center gap-0.5">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="inline-flex">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                        const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
                                        createLoopGroup(center);
                                    }}
                                    className="h-8 w-8 text-primary hover:text-primary"
                                    disabled={isMaterialSelected}
                                >
                                    <Repeat className="w-4 h-4" />
                                </Button>
                            </span>
                        </TooltipTrigger>
                        <TooltipContent>{shortcutTooltip('Create Loop', EDITOR_SHORTCUTS.createLoop)}</TooltipContent>
                    </Tooltip>
                    {selectedNodeIds.length >= 2 && (() => {
                        const chainResult = detectConvertibleChain(selectedNodeIds, nodes, edges);
                        if (!chainResult.valid) return null;
                        return (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => convertChainToMultiOp(chainResult.orderedNodeIds)}
                                        className="h-8 w-8"
                                    >
                                        <Combine className="w-4 h-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>{shortcutTooltip('Convert to Multi-op', EDITOR_SHORTCUTS.convertToMultiOp)}</TooltipContent>
                            </Tooltip>
                        );
                    })()}
                    {selectedNodeIds.length === 1 && nodes.find((n) => n.id === selectedNodeIds[0])?.data.type === 'math/multiOp' && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => convertMultiOpToChain(selectedNodeIds[0])}
                                    className="h-8 w-8"
                                >
                                    <Split className="w-4 h-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>{shortcutTooltip('Expand to separate nodes', EDITOR_SHORTCUTS.expandMultiOp)}</TooltipContent>
                        </Tooltip>
                    )}
                    {onOpenCodePanel && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={onOpenCodePanel}
                                    className="h-8 w-8 text-primary hover:text-primary"
                                >
                                    <Code className="w-4 h-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>{shortcutTooltip('View Code', EDITOR_SHORTCUTS.viewCode)}</TooltipContent>
                        </Tooltip>
                    )}
                    <ExportImageButton />
                </div>

                <div className="w-px h-4 bg-border" />

                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="inline-flex">
                            <Button
                                type="submit"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-primary hover:text-primary"
                                disabled={isProcessing}
                            >
                                {isProcessing ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Check className="w-4 h-4" />
                                )}
                            </Button>
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>{isProcessing ? 'Saving...' : shortcutTooltip('Save & Exit', EDITOR_SHORTCUTS.saveAndExitSubgraph)}</TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleExitSubgraph(false)}
                            className="h-8 w-8 text-muted-foreground"
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>{shortcutTooltip('Cancel', EDITOR_SHORTCUTS.cancelSubgraph)}</TooltipContent>
                </Tooltip>
            </form >
        );
    }

    return (
        <div className="pointer-events-auto flex items-center gap-1 bg-card/95 backdrop-blur-sm border border-border rounded-xl p-1.5 shadow-lg">
            <div className="flex items-center gap-0.5">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant={canvasMode === 'pan' ? 'secondary' : 'ghost'}
                            size="icon"
                            onClick={() => setCanvasMode('pan')}
                            className="h-8 w-8"
                        >
                            <Hand className="w-4 h-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>{shortcutTooltip('Pan Mode', EDITOR_SHORTCUTS.panMode)}</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant={canvasMode === 'select' ? 'secondary' : 'ghost'}
                            size="icon"
                            onClick={() => setCanvasMode('select')}
                            className="h-8 w-8"
                        >
                            <MousePointer2 className="w-4 h-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>{shortcutTooltip('Selection Mode', EDITOR_SHORTCUTS.selectMode)}</TooltipContent>
                </Tooltip>
            </div>

            <div className="w-px h-4 bg-border" />

            <Tooltip>
                <TooltipTrigger asChild>
                    <span className="inline-flex">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleCreateSubgraph}
                            className="h-8 w-8"
                        >
                            <Layers className="w-4 h-4" />
                        </Button>
                    </span>
                </TooltipTrigger>
                <TooltipContent>{shortcutTooltip('Create Subgraph', EDITOR_SHORTCUTS.createSubgraph)}</TooltipContent>
            </Tooltip>

            {onCreateCodeNode && (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="inline-flex">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onCreateCodeNode}
                                className="h-8 w-8"
                            >
                                <FileCode2 className="w-4 h-4" />
                            </Button>
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>{shortcutTooltip('Create Code Node', EDITOR_SHORTCUTS.createCodeNode)}</TooltipContent>
                </Tooltip>
            )}

            <div className="w-px h-4 bg-border" />

            <div className="flex items-center gap-0.5">
                {canRemoveFromGroup && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="inline-flex">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeNodesFromGroup(selectedNodeIds)}
                                    className="h-8 w-8"
                                >
                                    <Ungroup className="w-4 h-4" />
                                </Button>
                            </span>
                        </TooltipTrigger>
                        <TooltipContent>{shortcutTooltip('Remove from Group', EDITOR_SHORTCUTS.removeFromGroup)}</TooltipContent>
                    </Tooltip>
                )}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="inline-flex">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                    const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
                                    createLoopGroup(center);
                                }}
                                className="h-8 w-8"
                                disabled={isMaterialSelected}
                            >
                                <Repeat className="w-4 h-4" />
                            </Button>
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>{shortcutTooltip('Create Loop', EDITOR_SHORTCUTS.createLoop)}</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="inline-flex">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={groupNodes}
                                className="h-8 w-8"
                                disabled={selectedNodeIds.length < 1}
                            >
                                <Group className="w-4 h-4" />
                            </Button>
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>{shortcutTooltip('Group Nodes', EDITOR_SHORTCUTS.groupNodes)}</TooltipContent>
                </Tooltip>
                {canUngroup && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={ungroupNodes}
                                className="h-8 w-8"
                            >
                                <Ungroup className="w-4 h-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{shortcutTooltip('Ungroup Nodes', EDITOR_SHORTCUTS.ungroupNodes)}</TooltipContent>
                    </Tooltip>
                )}
                {selectedNodeIds.length >= 2 && (() => {
                    const chainResult = detectConvertibleChain(selectedNodeIds, nodes, edges);
                    if (!chainResult.valid) return null;
                    return (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => convertChainToMultiOp(chainResult.orderedNodeIds)}
                                    className="h-8 w-8"
                                >
                                    <Combine className="w-4 h-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>{shortcutTooltip('Convert to Multi-op', EDITOR_SHORTCUTS.convertToMultiOp)}</TooltipContent>
                        </Tooltip>
                    );
                })()}
                {selectedNodeIds.length === 1 && nodes.find((n) => n.id === selectedNodeIds[0])?.data.type === 'math/multiOp' && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => convertMultiOpToChain(selectedNodeIds[0])}
                                className="h-8 w-8"
                            >
                                <Split className="w-4 h-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{shortcutTooltip('Expand to separate nodes', EDITOR_SHORTCUTS.expandMultiOp)}</TooltipContent>
                    </Tooltip>
                )}
            </div>

            <div className="w-px h-4 bg-border" />

            <div className="flex items-center gap-0.5">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="inline-flex">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={undo}
                                disabled={!canUndo}
                                className="h-8 w-8"
                            >
                                <Undo2 className="w-4 h-4" />
                            </Button>
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>{shortcutTooltip('Undo', EDITOR_SHORTCUTS.undo)}</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="inline-flex">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={redo}
                                disabled={!canRedo}
                                className="h-8 w-8"
                            >
                                <Redo2 className="w-4 h-4" />
                            </Button>
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>{shortcutTooltip('Redo', EDITOR_SHORTCUTS.redo)}</TooltipContent>
                </Tooltip>
            </div>

            <div className="w-px h-4 bg-border" />

            <ExportImageButton />

            {onOpenCodePanel && (
                <>
                    <div className="w-px h-4 bg-border" />
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onOpenCodePanel}
                                className="h-8 w-8"
                            >
                                <Code className="w-4 h-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{shortcutTooltip('View Code', EDITOR_SHORTCUTS.viewCode)}</TooltipContent>
                    </Tooltip>
                </>
            )}
        </div>
    );
}
