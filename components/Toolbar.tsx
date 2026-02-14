'use client';

import { useCallback, useRef, useState } from 'react';
import posthog from "posthog-js";
import { Code, Layers, Undo2, Redo2, Hand, MousePointer2, Group, Ungroup, Loader2, Check, X, Bug, Repeat, Combine, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useEditorStore } from '@/store/editor';
import { registry } from '@/lib/registry';
import { toast } from 'sonner';
import { detectConvertibleChain } from '@/lib/multi-op-convert';
import { MATERIAL_NODE_TYPES } from '@/lib/nodes';

interface ToolbarProps {
    onOpenCodePanel?: () => void;
    onOpenAiDock?: () => void;
}

export function Toolbar({ onOpenCodePanel, onOpenAiDock }: ToolbarProps) {
    const {
        nodes,
        edges,
        selectedNodeIds,
        createSubgraph,
        enterSubgraphEditor,
        editorMode,
        exitSubgraphEditor,
        editingSubgraphId,
        subgraphs,
        updateSubgraphDefinition,
        undo,
        redo,
        history,
        canvasMode,
        setCanvasMode,
        groupNodes,
        ungroupNodes,
        createLoopGroup,
        removeNodesFromGroup,
        convertChainToMultiOp,
        debugMode,
        setDebugMode,
    } = useEditorStore();

    // Ref to track subgraph name without causing re-renders
    const subgraphNameRef = useRef<HTMLInputElement>(null);
    const [isProcessing, setIsProcessing] = useState(false);

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
            await exitSubgraphEditor(save, nameOverride);
        } finally {
            setIsProcessing(false);
        }
    }, [exitSubgraphEditor, editingSubgraphId, subgraphs, isProcessing]);

    // Check if any selected node is a material node
    const isMaterialSelected = selectedNodeIds.some(id => {
        const node = nodes.find(n => n.id === id);
        return node && (MATERIAL_NODE_TYPES as readonly string[]).includes(node.data.type);
    });

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
                            value={subgraphs[editingSubgraphId]?.scope ?? (subgraphs[editingSubgraphId]?.templateId ? 'library' : 'project')}
                            onChange={(e) =>
                                updateSubgraphDefinition(editingSubgraphId, {
                                    scope: e.target.value as 'project' | 'library',
                                })
                            }
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
                        <TooltipContent>Pan Mode</TooltipContent>
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
                        <TooltipContent>Selection Mode</TooltipContent>
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
                                    disabled={history.past.length === 0}
                                    className="h-8 w-8 text-primary hover:text-primary"
                                >
                                    <Undo2 className="w-4 h-4" />
                                </Button>
                            </span>
                        </TooltipTrigger>
                        <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="inline-flex">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={redo}
                                    disabled={history.future.length === 0}
                                    className="h-8 w-8 text-primary hover:text-primary"
                                >
                                    <Redo2 className="w-4 h-4" />
                                </Button>
                            </span>
                        </TooltipTrigger>
                        <TooltipContent>Redo (Ctrl+Y)</TooltipContent>
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
                                    onClick={createLoopGroup}
                                    className="h-8 w-8 text-primary hover:text-primary"
                                    disabled={isMaterialSelected}
                                >
                                    <Repeat className="w-4 h-4" />
                                </Button>
                            </span>
                        </TooltipTrigger>
                        <TooltipContent>Create Loop</TooltipContent>
                    </Tooltip>
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
                            <TooltipContent>View Code</TooltipContent>
                        </Tooltip>
                    )}
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
                    <TooltipContent>{isProcessing ? 'Saving...' : 'Save & Exit'}</TooltipContent>
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
                    <TooltipContent>Cancel</TooltipContent>
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
                    <TooltipContent>Pan Mode</TooltipContent>
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
                    <TooltipContent>Selection Mode</TooltipContent>
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
                <TooltipContent>Create Subgraph</TooltipContent>
            </Tooltip>

            <div className="w-px h-4 bg-border" />

            <div className="flex items-center gap-0.5">
                {selectedNodeIds.length > 0 && (() => {
                    const selectedNodes = nodes.filter(n => selectedNodeIds.includes(n.id));
                    const canRemoveFromGroup = selectedNodes.length > 0 && selectedNodes.every((node) => {
                        if (node.type === 'group' || node.data.type === 'loop') return false;
                        if (!node.parentId) return false;
                        if (node.data.type.startsWith('loop/')) return false;
                        const parent = nodes.find(n => n.id === node.parentId);
                        return !!parent && (parent.type === 'group' || parent.data.type === 'loop');
                    });

                    if (!canRemoveFromGroup) return null;

                    return (
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
                            <TooltipContent>Remove from Group</TooltipContent>
                        </Tooltip>
                    );
                })()}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="inline-flex">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={createLoopGroup}
                                className="h-8 w-8"
                                disabled={isMaterialSelected}
                            >
                                <Repeat className="w-4 h-4" />
                            </Button>
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>Create Loop</TooltipContent>
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
                    <TooltipContent>Group Nodes</TooltipContent>
                </Tooltip>
                {selectedNodeIds.length > 0 && nodes.filter(n => selectedNodeIds.includes(n.id)).every(n => n.type === 'group' && n.data.type !== 'loop') && (
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
                        <TooltipContent>Ungroup Nodes</TooltipContent>
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
                            <TooltipContent>Convert to Multi-op</TooltipContent>
                        </Tooltip>
                    );
                })()}
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
                                disabled={history.past.length === 0}
                                className="h-8 w-8"
                            >
                                <Undo2 className="w-4 h-4" />
                            </Button>
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="inline-flex">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={redo}
                                disabled={history.future.length === 0}
                                className="h-8 w-8"
                            >
                                <Redo2 className="w-4 h-4" />
                            </Button>
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>Redo (Ctrl+Y)</TooltipContent>
                </Tooltip>
            </div>

            <div className="w-px h-4 bg-border" />

            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant={debugMode ? 'secondary' : 'ghost'}
                        size="icon"
                        onClick={() => setDebugMode(!debugMode)}
                        className="h-8 w-8"
                    >
                        <Bug className="w-4 h-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>Debug Mode {debugMode ? '(On)' : '(Off)'}</TooltipContent>
            </Tooltip>

            {onOpenAiDock && (
                <>
                    <div className="w-px h-4 bg-border" />
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onOpenAiDock}
                                className="h-8 w-8"
                            >
                                <Sparkles className="w-4 h-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>AI Assistant</TooltipContent>
                    </Tooltip>
                </>
            )}

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
                        <TooltipContent>View Code</TooltipContent>
                    </Tooltip>
                </>
            )}
        </div>
    );
}
