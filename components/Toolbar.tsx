'use client';

import { useCallback, useRef, useState } from 'react';
import { Download, Upload, Trash2, Code, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEditorStore } from '@/store/editor';
import { ThemeToggle } from '@/components/ThemeToggle';

interface ToolbarProps {
    onOpenCodePanel?: () => void;
}

export function Toolbar({ onOpenCodePanel }: ToolbarProps) {
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
    } = useEditorStore();

    const [showSubgraphDialog, setShowSubgraphDialog] = useState(false);
    const [subgraphName, setSubgraphName] = useState('');

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
        setSubgraphName('');
        setShowSubgraphDialog(true);
    }, [selectedNodeIds.length]);

    const handleConfirmSubgraph = useCallback(() => {
        const name = subgraphName.trim() || 'Custom Node';
        const subgraphId = createSubgraph(name, selectedNodeIds);
        if (subgraphId) {
            enterSubgraphEditor(subgraphId);
        }
        setShowSubgraphDialog(false);
    }, [subgraphName, selectedNodeIds, createSubgraph, enterSubgraphEditor]);

    const handleCancelSubgraph = useCallback(() => {
        setShowSubgraphDialog(false);
    }, []);

    // Exit subgraph mode
    const handleExitSubgraph = useCallback((save: boolean) => {
        exitSubgraphEditor(save);
    }, [exitSubgraphEditor]);

    // Subgraph mode toolbar
    if (editorMode === 'subgraph') {
        return (
            <div className="pointer-events-auto flex items-center gap-1 bg-card/95 backdrop-blur-sm border-2 border-primary rounded-xl p-1.5 shadow-lg">
                <div className="px-3 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    <span className="text-xs font-medium text-primary">Editing Subgraph</span>
                </div>

                <div className="w-px h-4 bg-border" />

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleExitSubgraph(true)}
                    className="h-8 px-3 gap-2 text-primary hover:text-primary"
                    title="Save and exit"
                >
                    <span className="text-xs">Save & Exit</span>
                </Button>

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleExitSubgraph(false)}
                    className="h-8 px-3 gap-2 text-muted-foreground"
                    title="Cancel and exit"
                >
                    <span className="text-xs">Cancel</span>
                </Button>
            </div>
        );
    }

    return (
        <>
            <div className="pointer-events-auto flex items-center gap-1 bg-card/95 backdrop-blur-sm border border-border rounded-xl p-1.5 shadow-lg">
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

            {/* Create Subgraph Dialog */}
            {showSubgraphDialog && (
                <div className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/50 pointer-events-auto">
                    <div className="bg-card border border-border rounded-xl p-6 shadow-xl max-w-sm w-full mx-4">
                        <h3 className="text-lg font-semibold mb-4">Create Subgraph</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                            Creating subgraph from {selectedNodeIds.length} selected node{selectedNodeIds.length > 1 ? 's' : ''}.
                        </p>
                        <input
                            type="text"
                            placeholder="Subgraph name..."
                            value={subgraphName}
                            onChange={(e) => setSubgraphName(e.target.value)}
                            className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm mb-4"
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleConfirmSubgraph();
                                if (e.key === 'Escape') handleCancelSubgraph();
                            }}
                        />
                        <div className="flex gap-2 justify-end">
                            <Button variant="ghost" size="sm" onClick={handleCancelSubgraph}>
                                Cancel
                            </Button>
                            <Button size="sm" onClick={handleConfirmSubgraph}>
                                Create
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
