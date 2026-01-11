'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import { Download, Upload, Trash2, Code, Layers, Plus, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEditorStore } from '@/store/editor';
import { ThemeToggle } from '@/components/ThemeToggle';
import { registry } from '@/lib/registry';
import { toast } from 'sonner';

interface ToolbarProps {
    onOpenCodePanel?: () => void;
    onToggleNodePicker?: () => void;
}

export function Toolbar({ onOpenCodePanel, onToggleNodePicker }: ToolbarProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const {
        saveToJSON,
        loadFromJSON,
        clearGraph,
        nodes,
        selectedNodeIds,
        createSubgraph,
        enterSubgraphEditor,
        editorMode,
        exitSubgraphEditor,
        editingSubgraphId,
        subgraphs,
        updateSubgraphDefinition,
    } = useEditorStore();

    // Ref to track subgraph name without causing re-renders
    const subgraphNameRef = useRef<HTMLInputElement>(null);

    // Download as JSON file
    const handleSaveFile = useCallback(() => {
        const json = saveToJSON();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tsl-shader-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, [saveToJSON]);

    // Open file picker
    const handleLoadClick = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    // Load from file
    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const json = event.target?.result as string;
            const success = loadFromJSON(json);
            if (!success) {
                alert('Failed to load graph. Invalid format.');
            }
        };
        reader.readAsText(file);

        // Reset input so same file can be loaded again
        e.target.value = '';
    }, [loadFromJSON]);

    // Clear graph with confirmation
    const handleClear = useCallback(() => {
        if (nodes.length === 0) return;
        if (confirm('Clear all nodes? This cannot be undone.')) {
            clearGraph();
        }
    }, [clearGraph, nodes.length]);

    // Create subgraph from selected nodes
    const handleCreateSubgraph = useCallback(() => {
        if (selectedNodeIds.length < 1) return;

        const defaultName = 'Subgraph';
        const subgraphId = createSubgraph(defaultName, selectedNodeIds);
        if (subgraphId) {
            enterSubgraphEditor(subgraphId);
        }
    }, [selectedNodeIds.length, createSubgraph, enterSubgraphEditor, selectedNodeIds]);

    // Exit subgraph mode
    const handleExitSubgraph = useCallback((save: boolean) => {
        let nameOverride: string | undefined = undefined;

        if (save && editingSubgraphId && subgraphNameRef.current) {
            const rawName = subgraphNameRef.current.value;
            const normalizedName = rawName.trim();

            if (!normalizedName) {
                toast.error('Subgraph name cannot be empty.');
                return;
            }

            // Uniqueness Check
            // 1. Check against built-in nodes
            const registryConfict = registry.all().some(def => def.label.toLowerCase() === normalizedName.toLowerCase());
            if (registryConfict) {
                toast.error(`Name "${normalizedName}" is reserved by a built-in node.`);
                return;
            }

            // 2. Check against other subgraphs
            const otherSubgraphs = Object.values(subgraphs).filter(sg => sg.id !== editingSubgraphId);
            const subgraphConflict = otherSubgraphs.some(sg => sg.name.toLowerCase() === normalizedName.toLowerCase());
            if (subgraphConflict) {
                toast.error(`A subgraph with the name "${normalizedName}" already exists.`);
                return;
            }

            nameOverride = rawName;
        }

        exitSubgraphEditor(save, nameOverride);
    }, [exitSubgraphEditor, editingSubgraphId, subgraphs]);

    // Removed handleNameChange as we're using ref now

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

                <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-3 gap-2 text-primary hover:text-primary"
                    title="Save and exit"
                >
                    <span className="text-xs">Save & Exit</span>
                </Button>

                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleExitSubgraph(false)}
                    className="h-8 px-3 gap-2 text-muted-foreground"
                    title="Cancel and exit"
                >
                    <span className="text-xs">Cancel</span>
                </Button>
            </form>
        );
    }

    return (
        <>
            <div className="pointer-events-auto flex items-center gap-1 bg-card/95 backdrop-blur-sm border border-border rounded-xl p-1.5 shadow-lg">
                {onToggleNodePicker && (
                    <>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onToggleNodePicker}
                            className="h-8 px-3 gap-2"
                            title="Toggle Node Picker"
                        >
                            <Plus className="w-4 h-4" />
                            <span className="text-xs">Nodes</span>
                        </Button>
                        <div className="w-px h-4 bg-border" />
                    </>
                )}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSaveFile}
                    className="h-8 px-3 gap-2"
                    title="Save to file"
                >
                    <Download className="w-4 h-4" />
                    <span className="text-xs">Save</span>
                </Button>

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLoadClick}
                    className="h-8 px-3 gap-2"
                    title="Load from file"
                >
                    <Upload className="w-4 h-4" />
                    <span className="text-xs">Load</span>
                </Button>

                <div className="w-px h-4 bg-border" />

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClear}
                    className="h-8 px-3 gap-2 text-destructive hover:text-destructive"
                    title="Clear graph"
                    disabled={nodes.length === 0}
                >
                    <Trash2 className="w-4 h-4" />
                    <span className="text-xs">Clear</span>
                </Button>

                <div className="w-px h-4 bg-border" />

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCreateSubgraph}
                    className="h-8 px-3 gap-2"
                    title="Create subgraph from selected nodes"
                    disabled={selectedNodeIds.length < 1}
                >
                    <Layers className="w-4 h-4" />
                    <span className="text-xs">Subgraph</span>
                </Button>

                <div className="w-px h-4 bg-border" />

                {onOpenCodePanel && (
                    <>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onOpenCodePanel}
                            className="h-8 px-3 gap-2"
                            title="View generated code"
                        >
                            <Code className="w-4 h-4" />
                            <span className="text-xs">Code</span>
                        </Button>

                        <div className="w-px h-4 bg-border" />
                    </>
                )}

                <ThemeToggle />

                {/* Hidden file input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleFileChange}
                    className="hidden"
                />
            </div>

        </>
    );
}
