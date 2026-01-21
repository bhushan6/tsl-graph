'use client';

import { useCallback, useRef, useState } from 'react';
import posthog from "posthog-js";
import { Code, Layers, Undo2, Redo2, Hand, MousePointer2, Group, Ungroup, Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useEditorStore } from '@/store/editor';
import { registry } from '@/lib/registry';
import { toast } from 'sonner';

interface ToolbarProps {
    onOpenCodePanel?: () => void;
}

export function Toolbar({ onOpenCodePanel }: ToolbarProps) {
    const {
        nodes,
        selectedNodeIds,
        createSubgraph,
        enterSubgraphEditor,
        editorMode,
        exitSubgraphEditor,
        editingSubgraphId,
        subgraphs,
        undo,
        redo,
        history,
        canvasMode,
        setCanvasMode,
        groupNodes,
        ungroupNodes,
    } = useEditorStore();

    // Ref to track subgraph name without causing re-renders
    const subgraphNameRef = useRef<HTMLInputElement>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Create subgraph from selected nodes (sync - DB save is fire-and-forget)
    const handleCreateSubgraph = useCallback(() => {
        if (selectedNodeIds.length < 1) return;

        const defaultName = 'Subgraph';
        const subgraphId = createSubgraph(defaultName, selectedNodeIds);
        if (subgraphId) {
            enterSubgraphEditor(subgraphId);
        }
    }, [selectedNodeIds, createSubgraph, enterSubgraphEditor]);

    // Exit subgraph mode
    const handleExitSubgraph = useCallback(async (save: boolean) => {
        if (isProcessing) return;

        let nameOverride: string | undefined = undefined;

        if (save && editingSubgraphId && subgraphNameRef.current) {
            const rawName = subgraphNameRef.current.value;
            const normalizedName = rawName.trim();

            if (!normalizedName) {
                toast.error('Subgraph name cannot be empty.');
                posthog.capture('error_occurred', { context: 'exit_subgraph_validation', error: 'Subgraph name cannot be empty.' });
                return;
            }

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

            nameOverride = rawName;
        }

        setIsProcessing(true);
        try {
            await exitSubgraphEditor(save, nameOverride);
        } finally {
            setIsProcessing(false);
        }
    }, [exitSubgraphEditor, editingSubgraphId, subgraphs, isProcessing]);

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
                            disabled={selectedNodeIds.length < 1}
                        >
                            <Layers className="w-4 h-4" />
                        </Button>
                    </span>
                </TooltipTrigger>
                <TooltipContent>Create Subgraph</TooltipContent>
            </Tooltip>

            <div className="w-px h-4 bg-border" />

            <div className="flex items-center gap-0.5">
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
                {selectedNodeIds.length > 0 && nodes.filter(n => selectedNodeIds.includes(n.id)).every(n => n.type === 'group') && (
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
