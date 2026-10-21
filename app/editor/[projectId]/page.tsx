"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useConvex, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useEditorStore } from "@/store/editor";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { PresetSelector } from "@/components/PresetSelector";
import { EditorHost } from "@/components/editor-host/EditorHost";
import {
    createConvexProjectAdapter,
    createConvexProjectServices,
    type ConvexProjectRef,
} from "@/lib/editor-host/adapters/convex-adapter";
import type { EditorHostConfig } from "@/lib/editor-host/types";

function EditorWithProject({ projectId }: { projectId: Id<"projects"> }) {
    const convex = useConvex();
    const project = useQuery(api.projects.get, { id: projectId });

    const loadFromJSON = useEditorStore((s) => s.loadFromJSON);
    const markSaved = useEditorStore((s) => s.markSaved);

    const [showPresetSelector, setShowPresetSelector] = useState(false);
    const presetSelectorInitializedRef = useRef(false);

    const persistence = useMemo(() => createConvexProjectAdapter(convex), [convex]);
    const services = useMemo(() => createConvexProjectServices(convex), [convex]);

    const hostConfig = useMemo<EditorHostConfig<ConvexProjectRef>>(
        () => ({
            ref: { projectId },
            persistence,
            services,
            autosaveDebounceMs: 2000,
            recoveryKey: `project:${projectId}`,
            capabilities: {
                canRenameProject: true,
                canShare: true,
                canUploadAssets: true,
            },
        }),
        [projectId, persistence, services]
    );

    useEffect(() => {
        if (!project || presetSelectorInitializedRef.current) return;

        const graphData = project.graphData as { nodes?: unknown[] } | null | undefined;
        const hasNodes = Array.isArray(graphData?.nodes) && graphData.nodes.length > 0;
        setShowPresetSelector(!hasNodes);
        presetSelectorInitializedRef.current = true;
    }, [project]);

    const hasProjectData = project !== undefined && project !== null;
    const initialData = useMemo(() => {
        if (!hasProjectData || !project) return undefined;
        return {
            graphData: project.graphData,
            projectName: project.name,
        };
    }, [project, hasProjectData]);

    const handlePresetSelect = async (url: string) => {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error("Failed to fetch preset");

            const json = await response.text();
            const success = loadFromJSON(json);
            if (!success) throw new Error('Invalid preset payload');

            const graphData = JSON.parse(json) as unknown;
            await persistence.save({
                ref: { projectId },
                graphData,
                reason: 'manual',
            });

            markSaved();
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
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <p className="text-muted-foreground">Project not found</p>
                <Link href="/dashboard">
                    <Button variant="outline">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Dashboard
                    </Button>
                </Link>
            </div>
        );
    }

    return (
        <>
            <EditorHost
                config={hostConfig}
                projectId={projectId}
                projectName={project.name}
                hasThumbnail={!!project.thumbnail}
                initialData={initialData}
            />
            {showPresetSelector && (
                <PresetSelector
                    onSelect={handlePresetSelect}
                    onCancel={() => setShowPresetSelector(false)}
                />
            )}
        </>
    );
}

export default function EditorPage({
    params,
}: {
    params: Promise<{ projectId: string }>;
}) {
    const { projectId } = use(params);

    return (
        <ProtectedRoute>
            <EditorWithProject projectId={projectId as Id<"projects">} />
        </ProtectedRoute>
    );
}
