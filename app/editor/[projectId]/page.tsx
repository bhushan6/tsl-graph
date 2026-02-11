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
import { PresetSelector } from "@/components/PresetSelector";
import { useState } from "react";

function EditorWithProject({ projectId }: { projectId: Id<"projects"> }) {
    const project = useQuery(api.projects.get, { id: projectId });
    const updateProject = useMutation(api.projects.update);

    // Template mutations
    const createSubgraphTemplate = useMutation(api.templates.createSubgraphTemplate);
    const updateSubgraphTemplate = useMutation(api.templates.updateSubgraphTemplate);
    const createCodeNodeTemplate = useMutation(api.templates.createCodeNodeTemplate);
    const updateCodeNodeTemplate = useMutation(api.templates.updateCodeNodeTemplate);

    const loadFromJSON = useEditorStore((s) => s.loadFromJSON);
    const setAutoSaveCallback = useEditorStore((s) => s.setAutoSaveCallback);
    const setTemplateCallbacks = useEditorStore((s) => s.setTemplateCallbacks);
    const setProjectId = useEditorStore((s) => s.setProjectId);
    const resetEditor = useEditorStore((s) => s.resetEditor);

    const hasLoadedRef = useRef(false);
    const [showPresetSelector, setShowPresetSelector] = useState(false);

    // Reset editor on unmount
    useEffect(() => {
        return () => {
            resetEditor();
        };
    }, [resetEditor]);

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

    // Register template callbacks
    useEffect(() => {
        setTemplateCallbacks({
            onSubgraphTemplateCreate: async (subgraph) => {
                const result = await createSubgraphTemplate({
                    name: subgraph.name,
                    data: {
                        id: subgraph.id,
                        name: subgraph.name,
                        inputs: subgraph.inputs,
                        outputs: subgraph.outputs,
                        nodes: subgraph.nodes,
                        edges: subgraph.edges,
                        inputNodePosition: subgraph.inputNodePosition,
                        outputNodePosition: subgraph.outputNodePosition,
                    },
                    isPublic: false,
                });
                return { templateId: result.templateId, version: result.version };
            },
            onSubgraphTemplateUpdate: async (templateId, subgraph) => {
                const result = await updateSubgraphTemplate({
                    id: templateId as Id<"subgraphTemplates">,
                    name: subgraph.name, // Update the top-level name in DB
                    data: {
                        id: subgraph.id,
                        name: subgraph.name,
                        inputs: subgraph.inputs,
                        outputs: subgraph.outputs,
                        nodes: subgraph.nodes,
                        edges: subgraph.edges,
                        inputNodePosition: subgraph.inputNodePosition,
                        outputNodePosition: subgraph.outputNodePosition,
                    },
                });
                return { version: result.version };
            },
            onCodeNodeTemplateCreate: async (codeNode) => {
                const result = await createCodeNodeTemplate({
                    name: codeNode.name,
                    data: {
                        id: codeNode.id,
                        name: codeNode.name,
                        language: codeNode.language ?? 'tsl',
                        code: codeNode.code,
                        inputs: codeNode.inputs,
                        output: codeNode.output,
                    },
                    isPublic: false,
                });
                return { templateId: result.templateId, version: result.version };
            },
            onCodeNodeTemplateUpdate: async (templateId, codeNode) => {
                const result = await updateCodeNodeTemplate({
                    id: templateId as Id<"codeNodeTemplates">,
                    name: codeNode.name, // Update the top-level name in DB
                    data: {
                        id: codeNode.id,
                        name: codeNode.name,
                        language: codeNode.language ?? 'tsl',
                        code: codeNode.code,
                        inputs: codeNode.inputs,
                        output: codeNode.output,
                    },
                });
                return { version: result.version };
            },
        });

        return () => {
            setTemplateCallbacks({});
        };
    }, [createSubgraphTemplate, updateSubgraphTemplate, createCodeNodeTemplate, updateCodeNodeTemplate, setTemplateCallbacks]);

    // Load project data when it arrives
    useEffect(() => {
        if (project && !hasLoadedRef.current) {
            const graphData = project.graphData;
            const hasNodes = graphData && graphData.nodes && graphData.nodes.length > 0;

            setProjectId(projectId);

            if (hasNodes) {
                const json = JSON.stringify(graphData);
                loadFromJSON(json);
                // Set lastSavedVersion to current to prevent immediate re-save
                useEditorStore.setState({
                    isDirty: false
                });
            } else {
                // Empty project - show selector
                setShowPresetSelector(true);
            }
            hasLoadedRef.current = true;
        }
    }, [project, loadFromJSON, projectId, setProjectId]);

    const handlePresetSelect = async (url: string) => {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error("Failed to fetch preset");

            const json = await response.text();
            loadFromJSON(json);

            // Save to backend immediately
            const graphData = JSON.parse(json);
            await updateProject({
                id: projectId,
                graphData,
            });

            useEditorStore.setState({ isDirty: false });
            setShowPresetSelector(false);
        } catch (error) {
            console.error("Error loading preset:", error);
            // Optionally show toast error here
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
        <div className="w-screen h-screen flex flex-col">
            <main className="flex-1 overflow-hidden relative">
                <Editor
                    projectName={project.name}
                    projectId={projectId}
                    hasThumbnail={!!project.thumbnail}
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
