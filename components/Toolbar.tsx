'use client';

import { useCallback, useRef } from 'react';
import { Save, Upload, Trash2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEditorStore } from '@/store/editor';
import { ThemeToggle } from '@/components/ThemeToggle';

export function Toolbar() {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { saveToJSON, loadFromJSON, clearGraph, nodes } = useEditorStore();

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

    return (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-card border border-border rounded-lg p-1 shadow-lg">
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
    );
}
