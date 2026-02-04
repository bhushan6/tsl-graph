"use client";

import { use } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Editor } from "@/components/Editor";
import { useEffect, useRef } from "react";
import { useEditorStore } from "@/store/editor";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Lock, Copy, Heart } from "lucide-react";
import Link from "next/link";
import { PresetSelector } from "@/components/PresetSelector";
import { useState } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

function PublicView({ projectId }: { projectId: Id<"projects"> }) {
    const router = useRouter();
    type ProjectWithLikes = {
        _id: Id<"projects">;
        name: string;
        graphData: any;
        thumbnail?: string;
        likedByMe?: boolean;
        likeCount?: number;
    };

    const project = useQuery(api.projects.get, { id: projectId }) as
        | ProjectWithLikes
        | null
        | undefined;
    const cloneProject = useMutation(api.projects.clone);
    const setLike = useMutation(api.projects.setLike);

    const loadFromJSON = useEditorStore((s) => s.loadFromJSON);
    const resetEditor = useEditorStore((s) => s.resetEditor);

    const hasLoadedRef = useRef(false);
    const [showPresetSelector, setShowPresetSelector] = useState(false);
    const [isCloning, setIsCloning] = useState(false);
    const [isUpdatingLike, setIsUpdatingLike] = useState(false);

    const handleClone = async () => {
        if (!project) return;

        try {
            setIsCloning(true);
            const newProjectId = await cloneProject({
                sourceId: projectId,
                name: `${project.name} (Clone)`,
                graphData: project.graphData,
            });
            toast.success("Project cloned successfully!");
            router.push(`/editor/${newProjectId}`);
        } catch (error) {
            console.error("Error cloning project:", error);
            toast.error("Failed to clone project. Please try again.");
            setIsCloning(false);
        }
    };

    const handleToggleLike = async () => {
        if (!project) return;
        try {
            setIsUpdatingLike(true);
            const nextLike = !project.likedByMe;
            await setLike({ projectId, like: nextLike });
        } catch (error) {
            console.error("Failed to update like:", error);
            toast.error("Failed to update like. Please try again.");
        } finally {
            setIsUpdatingLike(false);
        }
    };

    // Reset editor on unmount
    useEffect(() => {
        return () => {
            resetEditor();
        };
    }, [resetEditor]);

    // Load project data when it arrives
    useEffect(() => {
        if (project && !hasLoadedRef.current) {
            const graphData = project.graphData;
            const hasNodes = graphData && graphData.nodes && graphData.nodes.length > 0;

            if (hasNodes) {
                const json = JSON.stringify(graphData);
                loadFromJSON(json);
            } else {
                // Empty project - show selector
                setShowPresetSelector(true);
            }
            hasLoadedRef.current = true;
        }
    }, [project, loadFromJSON]);

    const handlePresetSelect = async (url: string) => {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error("Failed to fetch preset");

            const json = await response.text();
            loadFromJSON(json);
            setShowPresetSelector(false);
        } catch (error) {
            console.error("Error loading preset:", error);
        }
    };

    if (project === undefined) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (project === null) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-6">
                <div className="text-center">
                    <Lock className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                    <h2 className="text-2xl font-medium mb-2">Project Not Found</h2>
                    <p className="text-muted-foreground max-w-md">
                        This project doesn&apos;t exist or isn&apos;t publicly accessible.
                    </p>
                </div>
                <Link href="/">
                    <Button variant="outline">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Home
                    </Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="w-screen h-screen flex flex-col">
            <div className="absolute z-50 left-1/2 -translate-x-1/2 bottom-8 flex items-center gap-4">
                <Button
                    size="lg"
                    className="hover:scale-105 transition-all duration-200 cursor-pointer font-semibold px-6"
                    onClick={handleClone}
                    disabled={isCloning}
                >
                    {isCloning ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                        <Copy className="h-5 w-5" />
                    )}
                    {isCloning ? "Cloning..." : "Clone Project"}
                </Button>
                <div className="flex items-center gap-2 rounded-full bg-black/40 pl-2 pr-3 py-2 backdrop-blur-sm">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleToggleLike}
                        disabled={isUpdatingLike}
                        className="h-9 w-9 rounded-full hover:bg-white/15 text-white cursor-pointer"
                    >
                        {isUpdatingLike ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            <Heart
                                className={
                                    project.likedByMe ? "h-5 w-5 text-rose-400 fill-rose-400" : "h-5 w-5"
                                }
                            />
                        )}
                    </Button>
                    <span className="text-sm text-white/80 tabular-nums">{project.likeCount ?? 0}</span>
                </div>
            </div>

            <main className="flex-1 overflow-hidden relative">
                <Editor
                    projectName={project.name}
                    projectId={projectId}
                    hasThumbnail={!!project.thumbnail}
                    isReadOnly={true}
                />
                {showPresetSelector && (
                    <PresetSelector
                        onSelect={handlePresetSelect}
                        onCancel={() => setShowPresetSelector(false)}
                    />
                )}
            </main>
        </div>
    );
}

export default function SharePage({
    params,
}: {
    params: Promise<{ projectId: string }>;
}) {
    const { projectId } = use(params);

    return (
        <ProtectedRoute>
            <PublicView projectId={projectId as Id<"projects">} />
        </ProtectedRoute>
    );
}
