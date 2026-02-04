import { useState } from "react";
import type { MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Clock, Heart, Loader2 } from "lucide-react";

interface CommunityProjectCardProps {
    project: {
        _id: Id<"projects">;
        name: string;
        thumbnail?: string;
        updatedAt: number;
        likeCount?: number;
        likedByMe?: boolean;
        authorName?: string;
    };
    href: string;
}

const calculateTimeAgo = (updatedAt: number) => {
    const minutes = Math.floor((Date.now() - updatedAt) / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
};

export function CommunityProjectCard({ project, href }: CommunityProjectCardProps) {
    const router = useRouter();
    const setLike = useMutation(api.projects.setLike);
    const [isUpdatingLike, setIsUpdatingLike] = useState(false);

    const timeAgo = calculateTimeAgo(project.updatedAt);

    const handleOpen = () => {
        router.push(href);
    };

    const handleToggleLike = async (e: MouseEvent) => {
        e.stopPropagation();
        try {
            setIsUpdatingLike(true);
            const nextLike = !project.likedByMe;
            await setLike({ projectId: project._id, like: nextLike });
        } catch (error) {
            console.error("Failed to update like:", error);
        } finally {
            setIsUpdatingLike(false);
        }
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
                        <div
                            className="absolute inset-0 opacity-10"
                            style={{
                                backgroundImage:
                                    "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
                                backgroundSize: "20px 20px",
                            }}
                        />
                    </div>
                )}
            </div>

            {/* Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-70 transition-opacity duration-300 group-hover:opacity-80" />

            {/* Like Button */}
            <div className="absolute top-3 left-3 z-20" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2 rounded-full bg-black/30 pl-1 pr-2 py-1 backdrop-blur-sm">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-white hover:bg-white/20 rounded-full cursor-pointer"
                        onClick={handleToggleLike}
                        disabled={isUpdatingLike}
                    >
                        {isUpdatingLike ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Heart
                                className={cn(
                                    "h-4 w-4",
                                    project.likedByMe ? "text-rose-400 fill-rose-400" : "text-white/70"
                                )}
                            />
                        )}
                    </Button>
                    <div className="text-[11px] text-white/80 tabular-nums">{project.likeCount ?? 0}</div>
                </div>
            </div>

            {/* Content */}
            <div className="absolute bottom-0 left-0 right-0 p-5 flex flex-col gap-1 z-10 transition-transform duration-300 ease-out translate-y-2 group-hover:translate-y-0">
                <h3 className="text-white font-medium text-lg leading-tight tracking-wide transition-colors truncate">
                    {project.name}
                </h3>
                {project.authorName && (
                    <div className="text-white/70 text-xs font-medium uppercase tracking-wider">
                        By {project.authorName}
                    </div>
                )}
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
