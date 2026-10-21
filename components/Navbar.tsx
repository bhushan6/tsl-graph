import { memo, useRef, useCallback, useEffect, useState } from 'react';
import {
    BookOpen,
    Download,
    GraduationCap,
    HelpCircle,
    Loader2,
    Moon,
    MoreHorizontal,
    Pen,
    Share2,
    Sun,
    Trash2,
    Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
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
import { Logo } from '@/components/ui/logo';
import { ShareDialog } from '@/components/ShareDialog';
import { HelpDialog } from '@/components/HelpDialog';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useTutorialStore } from '@/store/tutorial-store';
import {
    DEFAULT_EDITOR_HOST_CAPABILITIES,
    normalizeEnabledGraphs,
    type EditorHostCapabilities,
} from '@/lib/editor-host/types';
import { useEditorHostConfig } from '@/lib/editor-host/context';
import { getStandaloneProjectUrl } from '@/lib/editor-host/standalone-project';
import { saveEditorNow } from '@/lib/editor-host/use-editor-persistence';

interface NavbarProps {
    projectName?: string;
    projectId?: string;
    isReadOnly?: boolean;
    capabilities?: EditorHostCapabilities;
}

// Save state changes independently of the navbar's menus and dialogs. Keep the
// subscription at this leaf so an autosave cycle only reconciles the badge.
const SaveStatusBadge = memo(function SaveStatusBadge() {
    const status = useEditorStore((state) => (
        state.isSaving
            ? 'saving'
            : state.saveFailed
                ? 'failed'
                : state.isDirty ? 'unsaved' : 'saved'
    ));

    if (status === 'saving') {
        return (
            <Badge variant="default" className="w-[80px] justify-center bg-blue-500 hover:bg-blue-600 border-blue-600 text-white gap-1.5 transition-all">
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving
            </Badge>
        );
    }

    if (status === 'failed') {
        return (
            <Badge
                asChild
                variant="secondary"
                className="w-[80px] justify-center cursor-pointer bg-red-100 text-red-700 hover:bg-red-200 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800 transition-all"
            >
                <button
                    type="button"
                    onClick={() => void saveEditorNow()}
                    title="Autosave stopped after repeated failures. Click to retry."
                >
                    Save failed
                </button>
            </Badge>
        );
    }

    if (status === 'unsaved') {
        return (
            <Badge variant="secondary" className="w-[80px] justify-center bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800 transition-all">
                Unsaved
            </Badge>
        );
    }

    return (
        <Badge variant="outline" className="w-[80px] justify-center text-green-600 border-green-200 bg-green-50 hover:bg-green-100 hover:text-green-700 dark:text-green-400 dark:border-green-900/50 dark:bg-green-900/20 transition-all">
            Saved
        </Badge>
    );
});

export const Navbar = memo(function Navbar({
    projectName,
    projectId,
    isReadOnly,
    capabilities = DEFAULT_EDITOR_HOST_CAPABILITIES,
}: NavbarProps) {
    const router = useRouter();
    const { resolvedTheme, setTheme } = useTheme();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const saveToJSON = useEditorStore((s) => s.saveToJSON);
    const loadFromJSON = useEditorStore((s) => s.loadFromJSON);
    const clearGraph = useEditorStore((s) => s.clearGraph);
    const nodeCount = useEditorStore((s) => s.nodes.length);
    const activeRootGraph = useEditorStore((s) => s.activeRootGraph);
    const setActiveRootGraph = useEditorStore((s) => s.setActiveRootGraph);
    const editorMode = useEditorStore((s) => s.editorMode);

    const hostConfig = useEditorHostConfig();
    const projectService = hostConfig?.services?.project;
    const hostRef = hostConfig?.ref;
    const enabledGraphs = normalizeEnabledGraphs(hostConfig?.enabledGraphs);
    const materialGraphEnabled = enabledGraphs.includes('material');
    const postGraphEnabled = enabledGraphs.includes('postprocessing');

    const canRenameProject = capabilities.canRenameProject
        && !isReadOnly
        && !!projectId
        && !!projectService
        && hostRef !== undefined;
    const canShareProject = capabilities.canShare
        && !isReadOnly
        && !!projectId
        && !!projectService?.getProject
        && !!projectService?.setProjectPublic
        && hostRef !== undefined;

    const [isRenaming, setIsRenaming] = useState(false);
    const [isRenamingInProgress, setIsRenamingInProgress] = useState(false);
    const [tempName, setTempName] = useState(projectName || "");
    const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
    const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
    const [projectIsPublic, setProjectIsPublic] = useState(false);
    const [isShareStateLoaded, setIsShareStateLoaded] = useState(false);

    useEffect(() => {
        let cancelled = false;

        if (!canShareProject || !projectService?.getProject || hostRef === undefined) {
            setIsShareStateLoaded(false);
            return;
        }

        setIsShareStateLoaded(false);
        void projectService
            .getProject({ ref: hostRef })
            .then((project) => {
                if (cancelled) return;
                setProjectIsPublic(Boolean(project?.isPublic));
                setIsShareStateLoaded(true);
            })
            .catch((error) => {
                console.error("Failed to load project sharing state:", error);
                if (cancelled) return;
                setProjectIsPublic(false);
                setIsShareStateLoaded(true);
            });

        return () => {
            cancelled = true;
        };
    }, [canShareProject, hostRef, projectService]);

    const handleRenameStart = () => {
        if (canRenameProject) {
            setIsRenaming(true);
            setTempName(projectName || "");
        }
    };

    const handleRenameSave = async () => {
        if (
            tempName.trim()
            && tempName.trim() !== projectName
            && canRenameProject
            && projectService
            && hostRef !== undefined
        ) {
            try {
                setIsRenamingInProgress(true);
                await projectService.renameProject({ ref: hostRef, name: tempName.trim() });
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

    const handleShareVisibilityChange = useCallback(async (nextIsPublic: boolean) => {
        if (!projectService?.setProjectPublic || hostRef === undefined) {
            throw new Error('Project sharing service is unavailable.');
        }
        await projectService.setProjectPublic({ ref: hostRef, isPublic: nextIsPublic });
        setProjectIsPublic(nextIsPublic);
    }, [hostRef, projectService]);

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
        if (nodeCount === 0) return;
        setShowClearDialog(true);
    }, [nodeCount]);

    // Actual clear action
    const handleConfirmClear = useCallback(() => {
        clearGraph();
        setShowClearDialog(false);
    }, [clearGraph]);
    const shareUrl = projectId && typeof window !== "undefined"
        ? `${window.location.origin}/share/${projectId}`
        : "";
    const standaloneUrl = projectId && typeof window !== "undefined"
        ? getStandaloneProjectUrl(window.location.origin, projectId)
        : "";
    const isDarkTheme = resolvedTheme === 'dark';

    return (
        <div className="w-full min-w-0 flex items-center justify-between gap-2 px-3 h-10 bg-card border-b border-border pointer-events-auto rounded-md">
            <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                <button
                    type="button"
                    onClick={() => router.push('/dashboard')}
                    className="flex items-center gap-2 mr-2 cursor-pointer select-none transition-opacity hover:opacity-80"
                    aria-label="Go to dashboard"
                >
                    <Logo size="sm" />
                </button>

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
                            aria-label="Project name"
                            className="text-sm font-medium mr-2 bg-transparent border-b focus:ring-0 focus:ring-offset-0 focus:outline-none text-foreground disabled:opacity-50 !flex !items-center !gap-1 w-full p-1"
                        />
                        {isRenamingInProgress && (
                            <Loader2 className="h-3 w-3 animate-spin absolute right-2 text-primary" />
                        )}
                    </div>
                ) : (
                    projectName && (
                        <div
                            onDoubleClick={canRenameProject ? handleRenameStart : undefined}
                            className="mr-2 hidden min-w-0 max-w-40 items-center gap-1 text-sm font-medium text-muted-foreground cursor-text hover:text-foreground transition-colors select-none sm:flex group"
                            title={canRenameProject ? "Double-click to rename" : undefined}
                        >
                            <span className="truncate">{projectName}</span>
                            {canRenameProject && <Pen className="w-3 h-3 ml-1 hidden group-hover:block" />}
                        </div>
                    )
                )}

                <div className="flex items-center rounded-md border border-border p-0.5">
                    {materialGraphEnabled && (
                        <Button
                            variant={activeRootGraph === 'material' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-6 px-2 text-[11px]"
                            disabled={editorMode === 'subgraph' || !!isReadOnly}
                            onClick={() => setActiveRootGraph('material')}
                        >
                            Material
                        </Button>
                    )}
                    {postGraphEnabled && (
                        <Button
                            variant={activeRootGraph === 'post' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-6 px-2 text-[11px]"
                            disabled={editorMode === 'subgraph' || !!isReadOnly}
                            onClick={() => setActiveRootGraph('post')}
                        >
                            Post
                        </Button>
                    )}
                </div>

            </div>

            <div className="flex shrink-0 items-center gap-2">
                <SaveStatusBadge />

                {/* Share Button - Only show for project owners, not in read-only mode */}
                {canShareProject && projectId && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setIsShareDialogOpen(true)}
                        title="Share Project"
                        aria-label="Share project"
                    >
                        <Share2 className="h-4 w-4" />
                    </Button>
                )}

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            title="More options"
                            aria-label="More options"
                        >
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel className="text-xs text-muted-foreground">File</DropdownMenuLabel>
                        <DropdownMenuItem onSelect={handleSaveFile}>
                            <Download />
                            <span>Save to JSON</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={handleLoadClick}>
                            <Upload />
                            <span>Load from JSON</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onSelect={handleClearClick}
                            disabled={nodeCount === 0}
                            variant="destructive"
                        >
                            <Trash2 />
                            <span>Clear graph</span>
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-xs text-muted-foreground">Help</DropdownMenuLabel>
                        <DropdownMenuItem asChild>
                            <Link href="/docs/nodes">
                                <BookOpen />
                                <span>Documentation</span>
                            </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setIsHelpDialogOpen(true)}>
                            <HelpCircle />
                            <span>User guide</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => useTutorialStore.getState().setLauncherOpen(true)}>
                            <GraduationCap />
                            <span>Interactive tutorials</span>
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => setTheme(isDarkTheme ? 'light' : 'dark')}>
                            {isDarkTheme ? <Sun /> : <Moon />}
                            <span>{isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'}</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
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

            {/* Share Dialog */}
            {canShareProject && projectId && isShareStateLoaded && (
                <ShareDialog
                    open={isShareDialogOpen}
                    onOpenChange={setIsShareDialogOpen}
                    isPublic={projectIsPublic}
                    onTogglePublic={handleShareVisibilityChange}
                    shareUrl={shareUrl}
                    embedUrl={standaloneUrl}
                />
            )}

            <HelpDialog
                open={isHelpDialogOpen}
                onOpenChange={setIsHelpDialogOpen}
                showTrigger={false}
            />
        </div>
    );
});
