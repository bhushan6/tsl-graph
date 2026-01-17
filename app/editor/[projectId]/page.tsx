"use client";

import { use } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Editor } from "@/components/Editor";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useEditorStore } from "@/store/editor";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

function EditorWithProject({ projectId }: { projectId: Id<"projects"> }) {
    const project = useQuery(api.projects.get, { id: projectId });
    const updateProject = useMutation(api.projects.update);
    const loadFromJSON = useEditorStore((s) => s.loadFromJSON);
    const saveToJSON = useEditorStore((s) => s.saveToJSON);
    const setAutoSaveCallback = useEditorStore((s) => s.setAutoSaveCallback);
    const isSaving = useEditorStore((s) => s.isSaving);

    const hasLoadedRef = useRef(false);

    // Register auto-save callback for this project
    useEffect(() => {
        const saveCallback = async () => {
            const graphDataJson = useEditorStore.getState().saveToJSON();
            const graphData = JSON.parse(graphDataJson);
            await updateProject({
                id: projectId,
                graphData,
            });
        };

        setAutoSaveCallback(saveCallback);

        // Cleanup: remove callback when unmounting
        return () => {
            setAutoSaveCallback(null);
        };
    }, [projectId, updateProject, setAutoSaveCallback]);

    // Load project data when it arrives
    useEffect(() => {
        if (project?.graphData && !hasLoadedRef.current) {
            const json = JSON.stringify(project.graphData);
            loadFromJSON(json);
            hasLoadedRef.current = true;
            // Set lastSavedVersion to current to prevent immediate re-save
            useEditorStore.setState({
                isDirty: false
            });
        }
    }, [project, loadFromJSON]);

    const handleManualSave = async () => {
        try {
            const graphDataJson = saveToJSON();
            const graphData = JSON.parse(graphDataJson);
            await updateProject({
                id: projectId,
                graphData,
            });
            useEditorStore.setState({
                isDirty: false
            });
            toast.success("Project saved");
        } catch (error) {
            toast.error("Failed to save project");
            console.error("Save failed:", error);
        }
    };

    if (project === undefined) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
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
        <div className="w-screen h-screen flex flex-col">
            <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-50">
                <div className="flex items-center justify-between px-4 py-2">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard">
                            <Button variant="ghost" size="sm">
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Dashboard
                            </Button>
                        </Link>
                        <span className="font-medium">{project.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {isSaving && (
                            <span className="text-xs text-muted-foreground">Saving...</span>
                        )}
                        <Button variant="outline" size="sm" onClick={handleManualSave}>
                            <Save className="h-4 w-4 mr-2" />
                            Save
                        </Button>
                    </div>
                </div>
            </header>
            <main className="flex-1">
                <Editor />
            </main>
        </div>
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
