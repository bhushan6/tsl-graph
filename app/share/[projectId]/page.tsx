"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Editor } from "@/components/Editor";
import { useEffect, useRef } from "react";
import { useEditorStore } from "@/store/editor";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Lock } from "lucide-react";
import Link from "next/link";
import { PresetSelector } from "@/components/PresetSelector";
import { useState } from "react";
import { CloneBanner } from "@/components/CloneBanner";

function PublicView({ projectId }: { projectId: Id<"projects"> }) {
    const project = useQuery(api.projects.get, { id: projectId });

    const loadFromJSON = useEditorStore((s) => s.loadFromJSON);
    const resetEditor = useEditorStore((s) => s.resetEditor);

    const hasLoadedRef = useRef(false);
    const [showPresetSelector, setShowPresetSelector] = useState(false);

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
            {/* Clone Banner */}
            <CloneBanner
                sourceProjectId={projectId}
                sourceProjectName={project.name}
                sourceGraphData={project.graphData}
            />

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
        <PublicView projectId={projectId as Id<"projects">} />
    );
}
