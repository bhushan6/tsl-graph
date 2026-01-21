import { useRef, useCallback, useState } from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { FileText, Download, Upload, Trash2, ChevronDown, Loader2, Pen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useEditorStore } from '@/store/editor';
import { useRouter } from 'next/navigation';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Logo } from '@/components/ui/logo';
import { FeedbackDialog } from '@/components/feedback/FeedbackDialog';

interface NavbarProps {
    projectName?: string;
    projectId?: Id<"projects">;
}

export function Navbar({ projectName, projectId }: NavbarProps) {
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const {
        saveToJSON,
        loadFromJSON,
        clearGraph,
        nodes,
        isSaving,
        isDirty,
    } = useEditorStore();

    const updateProject = useMutation(api.projects.update);
    const [isRenaming, setIsRenaming] = useState(false);
    const [isRenamingInProgress, setIsRenamingInProgress] = useState(false);
    const [tempName, setTempName] = useState(projectName || "");

    const handleRenameStart = () => {
        if (projectId) {
            setIsRenaming(true);
            setTempName(projectName || "");
        }
    };

    const handleRenameSave = async () => {
        if (tempName.trim() && tempName.trim() !== projectName && projectId) {
            try {
                setIsRenamingInProgress(true);
                await updateProject({ id: projectId, name: tempName.trim() });
                setIsRenaming(false);
            } catch (error) {
                console.error("Failed to rename project:", error);
            } finally {
                setIsRenamingInProgress(false);
            }
        } else {
            setIsRenaming(false);
        }
    };

    const handleRenameCancel = () => {
        if (isRenamingInProgress) return;
        setIsRenaming(false);
        setTempName(projectName || "");
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (isRenamingInProgress) return;
        if (e.key === "Enter") {
            handleRenameSave();
        } else if (e.key === "Escape") {
            handleRenameCancel();
        }
    };

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

    // Clear graph dialog state
    const [showClearDialog, setShowClearDialog] = useState(false);

    // Initial check before showing dialog
    const handleClearClick = useCallback(() => {
        if (nodes.length === 0) return;
        setShowClearDialog(true);
    }, [nodes.length]);

    // Actual clear action
    const handleConfirmClear = useCallback(() => {
        clearGraph();
        setShowClearDialog(false);
    }, [clearGraph]);

    return (
        <div className="w-full flex items-center justify-between px-3 h-10 bg-card border-b border-border pointer-events-auto rounded-md">
            <div className="flex items-center gap-2">
                <div
                    onClick={() => router.push('/dashboard')}
                    className="flex items-center gap-2 mr-2 cursor-pointer select-none transition-opacity hover:opacity-80"
                >
                    <Logo size="sm" />
                </div>

                <div className="h-4 w-px bg-border mx-1" />

                {isRenaming ? (
                    <div className="relative flex items-center w-fit">
                        <input
                            type="text"
                            value={tempName}
                            onChange={(e) => setTempName(e.target.value)}
                            onBlur={() => !isRenamingInProgress && handleRenameSave()}
                            onKeyDown={handleKeyDown}
                            autoFocus
                            disabled={isRenamingInProgress}
                            className="text-sm font-medium mr-2 bg-transparent border-b focus:ring-0 focus:ring-offset-0 focus:outline-none text-foreground disabled:opacity-50 !flex !items-center !gap-1 w-full p-1"
                        />
                        {isRenamingInProgress && (
                            <Loader2 className="h-3 w-3 animate-spin absolute right-2 text-primary" />
                        )}
                    </div>
                ) : (
                    projectName && (
                        <div
                            onDoubleClick={handleRenameStart}
                            className="text-sm font-medium mr-2 hidden sm:inline-block text-muted-foreground cursor-text hover:text-foreground transition-colors select-none !flex !items-center !gap-1 group"
                            title="Double-click to rename"
                        >
                            <span>{projectName}</span>
                            <Pen className="w-3 h-3 ml-1 hidden group-hover:block" />
                        </div>
                    )
                )}

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-muted-foreground hover:text-foreground">
                            <FileText className="w-3.5 h-3.5" />
                            <span className="text-xs">File</span>
                            <ChevronDown className="w-3 h-3 opacity-50" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                        <DropdownMenuItem onClick={handleSaveFile} className="gap-2">
                            <Download className="w-4 h-4 text-muted-foreground" />
                            <span>Save to JSON</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleLoadClick} className="gap-2">
                            <Upload className="w-4 h-4 text-muted-foreground" />
                            <span>Load from output</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={handleClearClick}
                            disabled={nodes.length === 0}
                            className="gap-2 text-destructive focus:text-destructive"
                        >
                            <Trash2 className="w-4 h-4" />
                            <span>Clear Graph</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <div className="flex items-center gap-2 group">


                {/* Sync Status Badge */}
                {isSaving ? (
                    <Badge variant="default" className="w-[80px] justify-center bg-blue-500 hover:bg-blue-600 border-blue-600 text-white gap-1.5 transition-all">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Saving
                    </Badge>
                ) : isDirty ? (
                    <Badge variant="secondary" className="w-[80px] justify-center bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800 transition-all">
                        Unsaved
                    </Badge>
                ) : (
                    <Badge variant="outline" className="w-[80px] justify-center text-green-600 border-green-200 bg-green-50 hover:bg-green-100 hover:text-green-700 dark:text-green-400 dark:border-green-900/50 dark:bg-green-900/20 transition-all">
                        Saved
                    </Badge>
                )}
                <FeedbackDialog />
                <ThemeToggle />
            </div>

            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
            />

            {/* Clear Graph Confirmation Dialog */}
            <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Clear Graph?</DialogTitle>
                        <DialogDescription>
                            This will remove all nodes and edges from the canvas. This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowClearDialog(false)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleConfirmClear}>
                            Clear Graph
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
