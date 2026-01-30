import { useRef, useState } from "react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Trash2, FolderOpen, Clock, Loader2, Share2, Pen } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ShareDialog } from "@/components/ShareDialog";

interface ProjectCardProps {
    project: {
        _id: Id<"projects">;
        name: string;
        thumbnail?: string;
        updatedAt: number;
        isPublic: boolean;
    };
    onDelete: (id: Id<"projects">) => void;
}

const calculateTimeAgo = (updatedAt: number) => {
    const minutes = Math.floor((Date.now() - updatedAt) / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
};

export function ProjectCard({ project, onDelete }: ProjectCardProps) {
    const router = useRouter();
    const updateProject = useMutation(api.projects.update);
    const timeAgo = calculateTimeAgo(project.updatedAt);
    const [isRenaming, setIsRenaming] = useState(false);
    const [isRenamingInProgress, setIsRenamingInProgress] = useState(false);
    const [tempName, setTempName] = useState(project.name);
    const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);

    const handleOpen = () => {
        router.push(`/editor/${project._id}`);
    };

    const inputRef = useRef<HTMLInputElement>(null);

    const handleRenameStart = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsRenaming(true);
        // Reset temp name to current name when starting rename
        setTempName(project.name);
        setTimeout(() => {
            inputRef.current?.focus();
        }, 500);
    };

    const handleRenameSave = async (e?: React.SyntheticEvent) => {
        e?.stopPropagation();
        if (tempName.trim() && tempName.trim() !== project.name) {
            try {
                setIsRenamingInProgress(true);
                await updateProject({ id: project._id, name: tempName.trim() });
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

    const handleRenameCancel = (e?: React.SyntheticEvent) => {
        if (isRenamingInProgress) return;
        e?.stopPropagation();
        setIsRenaming(false);
        setTempName(project.name);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (isRenamingInProgress) return;
        if (e.key === "Enter") {
            handleRenameSave(e);
        } else if (e.key === "Escape") {
            handleRenameCancel(e);
        }
        e.stopPropagation();
    };

    return (
        <>
            <div
                onClick={handleOpen}
                className="group relative w-full aspect-video rounded-xl bg-card border border-white/5 overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:shadow-primary/10 hover:border-primary/50"
            >
                {/* Thumbnail */}
                <div className="absolute inset-0 bg-muted/20">
                    {project.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={project.thumbnail}
                            alt={project.name}
                            className="w-full h-full object-cover object-center transition-transform duration-500 ease-out group-hover:scale-105 group-hover:brightness-110"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-card to-muted group-hover:scale-105 transition-transform duration-500">
                            {/* Placeholder Pattern */}
                            <div className="absolute inset-0 opacity-10"
                                style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '20px 20px' }}>
                            </div>
                        </div>
                    )}
                </div>

                {/* Overlay - Gradient Fade */}
                <div className={`absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-60 transition-opacity duration-300 ${isRenaming ? 'opacity-90' : 'group-hover:opacity-80'}`} />

                {/* Actions (Top Right) */}
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20 rounded-full backdrop-blur-sm">
                                <MoreHorizontal className="h-5 w-5" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpen(); }}>
                                <FolderOpen className="mr-2 h-4 w-4" /> Open
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleRenameStart}>
                                <Pen className="mr-2 h-4 w-4" /> Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setIsShareDialogOpen(true); }}>
                                <Share2 className="mr-2 h-4 w-4" /> Share
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onClick={(e) => { e.stopPropagation(); onDelete(project._id); }}
                                className="text-destructive focus:text-destructive"
                            >
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                {/* Content (Bottom) */}
                <div className={`absolute bottom-0 left-0 right-0 p-5 flex flex-col gap-1 z-10 transition-transform duration-300 ease-out ${isRenaming ? 'translate-y-0' : 'translate-y-2 group-hover:translate-y-0'}`}>
                    {isRenaming ? (
                        <div onClick={(e) => e.stopPropagation()} className="relative flex items-center">
                            <input
                                ref={inputRef}
                                type="text"
                                value={tempName}
                                onChange={(e) => setTempName(e.target.value)}
                                onBlur={(e) => !isRenamingInProgress && handleRenameSave(e)}
                                onKeyDown={handleKeyDown}
                                autoFocus
                                disabled={isRenamingInProgress}
                                className="w-full bg-transparent text-lg font-medium text-white border-b border-white/50 focus:border-white focus:outline-none p-0 pb-1 disabled:opacity-50"
                            />
                            {isRenamingInProgress && (
                                <Loader2 className="h-4 w-4 animate-spin absolute right-0 text-white" />
                            )}
                        </div>
                    ) : (
                        <h3 className="text-white font-medium text-lg leading-tight tracking-wide transition-colors truncate">
                            {project.name}
                        </h3>
                    )}
                    <div className="flex items-center gap-2 text-white/50 text-xs font-medium uppercase tracking-wider">
                        <Clock className="w-3 h-3" />
                        <span>Updated {timeAgo}</span>
                    </div>
                </div>

                {/* Subtle Border Highlight on Hover */}
                <div className="absolute inset-0 border-2 border-primary/0 rounded-xl group-hover:border-primary/10 pointer-events-none transition-colors duration-300" />
            </div>

            <ShareDialog
                open={isShareDialogOpen}
                onOpenChange={setIsShareDialogOpen}
                projectId={project._id}
                currentIsPublic={project.isPublic}
            />
        </>
    );
}
