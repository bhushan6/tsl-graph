import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Trash2, FolderOpen, Clock } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { useRouter } from "next/navigation";

interface ProjectCardProps {
    project: {
        _id: Id<"projects">;
        name: string;
        thumbnail?: string;
        updatedAt: number;
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
    const timeAgo = calculateTimeAgo(project.updatedAt)


    const handleOpen = () => {
        router.push(`/editor/${project._id}`);
    };

    return (
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
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-300" />

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
            <div className="absolute bottom-0 left-0 right-0 p-5 flex flex-col gap-1 z-10 translate-y-2 group-hover:translate-y-0 transition-transform duration-300 ease-out">
                <h3 className="text-white font-medium text-lg leading-tight tracking-wide transition-colors">
                    {project.name}
                </h3>
                <div className="flex items-center gap-2 text-white/50 text-xs font-medium uppercase tracking-wider">
                    <Clock className="w-3 h-3" />
                    <span>Updated {timeAgo}</span>
                </div>
            </div>

            {/* Subtle Border Highlight on Hover */}
            <div className="absolute inset-0 border-2 border-primary/0 rounded-xl group-hover:border-primary/10 pointer-events-none transition-colors duration-300" />
        </div>
    );
}
