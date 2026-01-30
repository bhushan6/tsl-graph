"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Loader2 } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface CloneBannerProps {
    sourceProjectId: Id<"projects">;
    sourceProjectName: string;
    sourceGraphData: unknown;
}

export function CloneBanner({ sourceProjectId, sourceProjectName, sourceGraphData }: CloneBannerProps) {
    const router = useRouter();
    const cloneProject = useMutation(api.projects.clone);
    const [isCloning, setIsCloning] = useState(false);

    const handleClone = async () => {
        try {
            setIsCloning(true);

            const projectId = await cloneProject({
                sourceId: sourceProjectId,
                name: `${sourceProjectName} (Copy)`,
                graphData: sourceGraphData,
            });

            toast.success("Project cloned successfully!");
            // Redirect to the newly cloned project
            router.push(`/editor/${projectId}`);
        } catch (error) {
            console.error("Failed to clone project:", error);
            toast.error("Failed to clone project");
        } finally {
            setIsCloning(false);
        }
    };

    return (
        <div className="h-14 border-b bg-primary/10 flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                        You&apos;re viewing a shared project
                    </span>
                    <div className="h-4 w-px bg-border" />
                    <span className="text-sm text-muted-foreground">
                        Make it your own by cloning it
                    </span>
                </div>
            </div>
            <Button
                variant="default"
                size="sm"
                onClick={handleClone}
                disabled={isCloning}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
                {isCloning ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                    <Copy className="h-4 w-4 mr-2" />
                )}
                Clone Project
            </Button>
        </div>
    );
}
