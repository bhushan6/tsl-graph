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
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

function EditorWithProject({ projectId }: { projectId: Id<"projects"> }) {
    const project = useQuery(api.projects.get, { id: projectId });
    const updateProject = useMutation(api.projects.update);
    const loadFromJSON = useEditorStore((s) => s.loadFromJSON);
    const setAutoSaveCallback = useEditorStore((s) => s.setAutoSaveCallback);

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
        <div className="w-screen h-screen flex flex-col">
            <main className="flex-1 overflow-hidden relative">
                <Editor
                    projectName={project.name}
                />
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
