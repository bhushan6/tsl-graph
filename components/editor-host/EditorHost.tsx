'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Editor } from '@/components/Editor';
import { useEditorStore } from '@/store/editor';
import type { CodeNodeDefinition, SubgraphDefinition } from '@/lib/types';
import type { EditorHostConfig } from '@/lib/editor-host/types';
import {
    DEFAULT_EDITOR_HOST_CAPABILITIES,
    graphKindToRootGraphMode,
    normalizeEnabledGraphs,
    resolveDefaultGraphKind,
    rootGraphModeToGraphKind,
} from '@/lib/editor-host/types';
import {
    useEditorPersistence,
} from '@/lib/editor-host/use-editor-persistence';
import type { Id } from '@/convex/_generated/dataModel';
import { EditorHostProvider } from '@/lib/editor-host/context';
import { TemplateLibraryProvider, requestTemplateLibraryRefresh } from '@/lib/editor-host/template-library';
import type { EditorChromeVisibility } from '@/lib/editor-host/standalone-ui';

interface TemplateCallbacks {
    onSubgraphTemplateCreate?: (subgraph: SubgraphDefinition) => Promise<{ templateId: string; version: number }>;
    onSubgraphTemplateUpdate?: (templateId: string, subgraph: SubgraphDefinition) => Promise<{ version: number }>;
    onCodeNodeTemplateCreate?: (codeNode: CodeNodeDefinition) => Promise<{ templateId: string; version: number }>;
    onCodeNodeTemplateUpdate?: (templateId: string, codeNode: CodeNodeDefinition) => Promise<{ version: number }>;
}

interface EditorHostProps<TRef> {
    config: EditorHostConfig<TRef>;
    projectId?: Id<'projects'>;
    projectName?: string;
    hasThumbnail?: boolean;
    isReadOnly?: boolean;
    chromeVisibility?: EditorChromeVisibility;
    initialData?: {
        graphData: unknown;
        projectName?: string;
    } | null;
    /** Called after the one-time bootstrap has initialized the editor store. */
    onInitialized?: () => void;
    templateCallbacks?: TemplateCallbacks;
}

export function EditorHost<TRef>({
    config,
    projectId,
    projectName,
    hasThumbnail,
    isReadOnly,
    chromeVisibility,
    initialData,
    onInitialized,
    templateCallbacks,
}: EditorHostProps<TRef>) {
    const loadFromJSON = useEditorStore((s) => s.loadFromJSON);
    const markSaved = useEditorStore((s) => s.markSaved);
    const resetEditor = useEditorStore((s) => s.resetEditor);
    const setProjectId = useEditorStore((s) => s.setProjectId);
    const setTemplateCallbacks = useEditorStore((s) => s.setTemplateCallbacks);
    const setActiveRootGraph = useEditorStore((s) => s.setActiveRootGraph);

    const [isInitializing, setIsInitializing] = useState(true);
    const [loadedProjectName, setLoadedProjectName] = useState<string | undefined>(undefined);
    const initialDataRef = useRef(initialData);

    const capabilities = useMemo(
        () => ({
            ...DEFAULT_EDITOR_HOST_CAPABILITIES,
            ...config.capabilities,
        }),
        [config.capabilities]
    );

    const enabledGraphs = useMemo(
        () => normalizeEnabledGraphs(config.enabledGraphs),
        [config.enabledGraphs]
    );
    const defaultGraph = useMemo(
        () => resolveDefaultGraphKind(enabledGraphs, config.defaultGraph),
        [enabledGraphs, config.defaultGraph]
    );
    const defaultRootGraph = useMemo(
        () => graphKindToRootGraphMode(defaultGraph),
        [defaultGraph]
    );
    const enabledGraphSet = useMemo(
        () => new Set(enabledGraphs),
        [enabledGraphs]
    );

    const hostTemplateCallbacks = useMemo<TemplateCallbacks>(() => {
        const templates = config.services?.templates;
        if (!templates) return {};

        return {
            onSubgraphTemplateCreate: async (subgraph: SubgraphDefinition) => {
                const result = await templates.createSubgraphTemplate({
                    name: subgraph.name,
                    data: {
                        id: subgraph.id,
                        name: subgraph.name,
                        scope: subgraph.scope ?? 'project',
                        inputs: subgraph.inputs,
                        outputs: subgraph.outputs,
                        nodes: subgraph.nodes,
                        edges: subgraph.edges,
                        inputNodePosition: subgraph.inputNodePosition,
                        outputNodePosition: subgraph.outputNodePosition,
                    },
                    isPublic: false,
                });
                requestTemplateLibraryRefresh();
                return { templateId: result.templateId, version: result.version };
            },
            onSubgraphTemplateUpdate: async (templateId: string, subgraph: SubgraphDefinition) => {
                const result = await templates.updateSubgraphTemplate({
                    id: templateId,
                    name: subgraph.name,
                    data: {
                        id: subgraph.id,
                        name: subgraph.name,
                        scope: subgraph.scope ?? 'project',
                        inputs: subgraph.inputs,
                        outputs: subgraph.outputs,
                        nodes: subgraph.nodes,
                        edges: subgraph.edges,
                        inputNodePosition: subgraph.inputNodePosition,
                        outputNodePosition: subgraph.outputNodePosition,
                    },
                });
                requestTemplateLibraryRefresh();
                return { version: result.version };
            },
            onCodeNodeTemplateCreate: async (codeNode: CodeNodeDefinition) => {
                const result = await templates.createCodeNodeTemplate({
                    name: codeNode.name,
                    data: {
                        id: codeNode.id,
                        name: codeNode.name,
                        scope: codeNode.scope,
                        language: codeNode.language ?? 'tsl',
                        code: codeNode.code,
                        inputs: codeNode.inputs,
                        output: codeNode.output,
                    },
                    isPublic: false,
                });
                requestTemplateLibraryRefresh();
                return { templateId: result.templateId, version: result.version };
            },
            onCodeNodeTemplateUpdate: async (templateId: string, codeNode: CodeNodeDefinition) => {
                const result = await templates.updateCodeNodeTemplate({
                    id: templateId,
                    name: codeNode.name,
                    data: {
                        id: codeNode.id,
                        name: codeNode.name,
                        scope: codeNode.scope,
                        language: codeNode.language ?? 'tsl',
                        code: codeNode.code,
                        inputs: codeNode.inputs,
                        output: codeNode.output,
                    },
                });
                requestTemplateLibraryRefresh();
                return { version: result.version };
            },
        };
    }, [config.services?.templates]);

    const effectiveTemplateCallbacks = templateCallbacks ?? hostTemplateCallbacks;

    useEditorPersistence(config, {
        enabled: !isInitializing && !isReadOnly,
    });

    useEffect(() => {
        initialDataRef.current = initialData;
    }, [config.ref, initialData]);

    useEffect(() => {
        let cancelled = false;

        const initialize = async () => {
            setIsInitializing(true);
            resetEditor();

            setTemplateCallbacks(effectiveTemplateCallbacks);
            const shouldEnableProjectAssets = capabilities.canUploadAssets && !!projectId;
            setProjectId(shouldEnableProjectAssets ? projectId : null);

            try {
                // Bootstrap from initialData once. Live backend query refreshes should not
                // reinitialize the editor and overwrite in-progress local edits.
                const loaded = initialDataRef.current === undefined
                    ? await config.persistence.load(config.ref)
                    : initialDataRef.current;

                if (cancelled) return;

                const graphData = loaded?.graphData;
                if (graphData !== undefined && graphData !== null) {
                    const json = typeof graphData === 'string'
                        ? graphData
                        : JSON.stringify(graphData);

                    const success = loadFromJSON(json);
                    if (!success) {
                        console.error('Failed to initialize editor graph from host persistence payload.');
                    }
                }

                const hasLoadedGraphData = graphData !== undefined && graphData !== null;
                const currentRootGraph = useEditorStore.getState().activeRootGraph;
                const currentRootGraphKind = rootGraphModeToGraphKind(currentRootGraph);
                const activeGraphIsDisabled = !enabledGraphSet.has(currentRootGraphKind);
                const shouldApplyDefaultGraph = !hasLoadedGraphData || activeGraphIsDisabled;

                if (shouldApplyDefaultGraph && currentRootGraph !== defaultRootGraph) {
                    setActiveRootGraph(defaultRootGraph);
                }

                setLoadedProjectName(loaded?.projectName);
                markSaved();
            } catch (error) {
                console.error('Failed to initialize editor host:', error);
            } finally {
                if (!cancelled) {
                    setIsInitializing(false);
                    onInitialized?.();
                }
            }
        };

        void initialize();

        return () => {
            cancelled = true;
            resetEditor();
        };
    }, [
        capabilities.canUploadAssets,
        config.persistence,
        config.ref,
        loadFromJSON,
        markSaved,
        defaultRootGraph,
        enabledGraphSet,
        projectId,
        resetEditor,
        setActiveRootGraph,
        setProjectId,
        setTemplateCallbacks,
        effectiveTemplateCallbacks,
        onInitialized,
    ]);

    if (isInitializing) {
        return (
            <EditorHostProvider config={config}>
                <div className="flex items-center justify-center min-h-screen">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            </EditorHostProvider>
        );
    }

    return (
        <EditorHostProvider config={config}>
            <TemplateLibraryProvider>
                <div className="w-screen h-screen flex flex-col">
                    <main className="flex-1 overflow-hidden relative">
                        <Editor
                            projectName={projectName ?? loadedProjectName}
                            projectId={projectId}
                            hasThumbnail={hasThumbnail}
                            isReadOnly={isReadOnly}
                            chromeVisibility={chromeVisibility}
                            capabilities={capabilities}
                        />
                    </main>
                </div>
            </TemplateLibraryProvider>
        </EditorHostProvider>
    );
}
