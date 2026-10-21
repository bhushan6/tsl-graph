"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useConvex } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCcw } from 'lucide-react';
import { EditorHost } from '@/components/editor-host/EditorHost';
import { compileGraph, compilePostGraph, getRequiredImportsByModule, type ImportGroup } from '@/lib/compiler';
import { createEditorAssetReconcilerController } from '@/lib/editor-host/use-editor-persistence';
import { inlineCustomTslImports } from '@/lib/editor-host/tsl-utils-inline';
import { UNIFORM_KINDS, coerceUniformValue, getUniformKindFromNode, getUniformRange, type UniformKind } from '@/lib/uniform-utils';
import { useEditorStore, type MaterialNodeType } from '@/store/editor';
import {
    postEditorResponse,
} from '@/lib/editor-host/adapters/postmessage-adapter';
import {
    createStandaloneIndexedDbAssetsAdapter,
    rehydrateStandaloneIndexedDbAssetUrls,
} from '@/lib/editor-host/adapters/standalone-indexeddb-assets';
import {
    EDITOR_POSTMESSAGE_SOURCE,
    isFromHostWindow,
    isHostMessage,
    resolveHostTargetOrigin,
    type LoadCommandPayload,
    type LoadCommandResponsePayload,
    type ClearGraphResponsePayload,
    postMessageToHost,
    type EditorGraphChangedPayload,
    type EditorReadyPayload,
    type GetCodeResponsePayload,
    type GetUniformSchemaResponsePayload,
    type SetUniformValuesPayload,
    type SetUniformValuesResponsePayload,
    type UniformSchemaEntry,
    type UniformsChangedPayload,
} from '@/lib/editor-host/postmessage';
import type { EditorGraphKind, EditorHostConfig, EditorPersistenceAdapter } from '@/lib/editor-host/types';
import { normalizeEnabledGraphs } from '@/lib/editor-host/types';
import { parseStandaloneUiVisibility } from '@/lib/editor-host/standalone-ui';

const parseEnabledGraphs = (rawValue: string | null): EditorGraphKind[] | undefined => {
    if (!rawValue) return undefined;

    const parsed = rawValue
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry): entry is EditorGraphKind => entry === 'material' || entry === 'postprocessing');

    return parsed.length > 0 ? normalizeEnabledGraphs(parsed) : undefined;
};

const isMaterialNodeType = (value: string): value is MaterialNodeType => (
    value === 'material/node'
    || value === 'material/standard'
    || value === 'material/basic'
    || value === 'material/physical'
    || value === 'material/phong'
    || value === 'material/sprite'
);

const resolveRootMaterialType = (payload: unknown): MaterialNodeType | null => {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const commandPayload = payload as { materialType?: string };
    return typeof commandPayload.materialType === 'string' && isMaterialNodeType(commandPayload.materialType)
        ? commandPayload.materialType
        : null;
};

const isUniformKind = (value: string): value is UniformKind =>
    UNIFORM_KINDS.includes(value as UniformKind);

const buildUniformSchema = (): UniformSchemaEntry[] => {
    const state = useEditorStore.getState();
    const nodes = state.getRootGraph('material').nodes;
    const globals = state.globals;

    const nodeUniforms: UniformSchemaEntry[] = nodes
        .filter((node) => node.data.type === 'const/uniform')
        .map((node) => {
            const uniformType = getUniformKindFromNode(node);
            const rawName = node.data.values?.localName;
            const name = typeof rawName === 'string' && rawName.trim().length > 0
                ? rawName.trim()
                : node.id;

            return {
                scope: 'node',
                id: node.id,
                name,
                uniformType,
                value: coerceUniformValue(uniformType, node.data.values?.value),
                ...getUniformRange(node.data.values, uniformType),
            };
        });

    const globalUniforms: UniformSchemaEntry[] = globals
        .filter((entry) => entry.kind === 'uniform' && isUniformKind(entry.type))
        .map((entry) => {
            const uniformType = entry.type as UniformKind;
            return {
                scope: 'global',
                id: entry.id,
                name: entry.name,
                uniformType,
                value: coerceUniformValue(uniformType, entry.defaultValue),
                ...getUniformRange(entry, uniformType),
            };
        });

    return [...globalUniforms, ...nodeUniforms].sort((a, b) => {
        if (a.scope !== b.scope) return a.scope.localeCompare(b.scope);
        return a.name.localeCompare(b.name);
    });
};

const getUniformEntryKey = (entry: Pick<UniformSchemaEntry, 'scope' | 'id'>): string =>
    `${entry.scope}:${entry.id}`;

const createUniformsSignature = (uniforms: UniformSchemaEntry[]): string => JSON.stringify(
    uniforms.map((entry) => ({
        scope: entry.scope,
        id: entry.id,
        uniformType: entry.uniformType,
        value: entry.value,
        min: entry.min,
        max: entry.max,
        step: entry.step,
    }))
);

type StandaloneRef = { docId: string };
const ASSET_RECONCILE_DEBOUNCE_MS = 2000;

const createNoopPersistenceAdapter = (): EditorPersistenceAdapter<StandaloneRef> => ({
    load: async () => null,
    save: async () => undefined,
});

const serializeGraphDataForLoad = async (graphData: unknown): Promise<string | null> => {
    if (graphData === null || graphData === undefined) {
        return null;
    }

    try {
        if (typeof graphData === 'string') {
            const parsedGraphData = JSON.parse(graphData) as unknown;
            const rehydratedGraphData = await rehydrateStandaloneIndexedDbAssetUrls(parsedGraphData);
            return JSON.stringify(rehydratedGraphData);
        }

        const rehydratedGraphData = await rehydrateStandaloneIndexedDbAssetUrls(graphData);
        return JSON.stringify(rehydratedGraphData);
    } catch (error) {
        console.error('Failed to rehydrate standalone editor assets:', error);
        return typeof graphData === 'string' ? graphData : JSON.stringify(graphData);
    }
};

const MATERIAL_DECLARATION_LINE_PATTERN = /^const material = new ([A-Za-z0-9_]+)\(\);$/;
const RUNTIME_UNIFORM_LINE_PATTERN = /^const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*__uniform\("([^"]+)",\s*(.*),\s*"[^"]+"\);$/;

const compileMaterialApplierCode = (code: string, helperCode: string | null = null): string => {
    const sourceLines = code.split('\n');
    const bodyLines: string[] = [];
    const uniformEntries: Array<{ id: string; variableName: string }> = [];
    let materialClass: string | null = null;

    sourceLines.forEach((line) => {
        const trimmed = line.trim();
        if (trimmed === '// Generated TSL Code') return;

        const declarationMatch = trimmed.match(MATERIAL_DECLARATION_LINE_PATTERN);
        if (declarationMatch) {
            materialClass = declarationMatch[1];
            return;
        }
        if (trimmed === '// Material') return;

        const runtimeUniformMatch = trimmed.match(RUNTIME_UNIFORM_LINE_PATTERN);
        if (runtimeUniformMatch) {
            const [, variableName, uniformId, initialValueExpression] = runtimeUniformMatch;
            uniformEntries.push({ id: uniformId, variableName });
            bodyLines.push(`const ${variableName} = uniform(${initialValueExpression});`);
            return;
        }

        bodyLines.push(line);
    });

    while (bodyLines.length > 0 && bodyLines[0].trim() === '') {
        bodyLines.shift();
    }
    while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === '') {
        bodyLines.pop();
    }

    const contentBlocks: string[] = [];
    const trimmedHelpers = helperCode?.trim();
    if (trimmedHelpers) {
        contentBlocks.push(trimmedHelpers);
    }
    if (bodyLines.length > 0) {
        contentBlocks.push(bodyLines.join('\n'));
    }

    const uniformMapLines = uniformEntries.length > 0
        ? uniformEntries.map(({ id, variableName }) => `        "${id}": ${variableName},`)
        : [];
    const uniformsBlock = uniformMapLines.length > 0
        ? `const uniforms = {\n${uniformMapLines.join('\n')}\n    };`
        : 'const uniforms = {};';
    contentBlocks.push(uniformsBlock);

    const indentedBody = contentBlocks
        .map((block) => block
            .split('\n')
            .map((line) => (line.trim().length > 0 ? `    ${line}` : ''))
            .join('\n'))
        .join('\n\n');

    const header = materialClass ? `// Expected material: ${materialClass}\n` : '';
    const functionBody = indentedBody ? `${indentedBody}\n\n` : '';
    return `${header}function tslGraph(material) {\n`
        + `${functionBody}`
        + '    return { uniforms };\n'
        + '}';
};

const stripMaterialClassImports = (imports: ImportGroup[]): ImportGroup[] => imports
    .map((group) => ({
        from: group.from,
        imports: group.imports.filter((name) => !name.endsWith('NodeMaterial')),
    }))
    .filter((group) => group.imports.length > 0);

export default function StandaloneEditorClient() {
    const searchParams = useSearchParams();
    const sessionKey = JSON.stringify([
        searchParams.get('projectId'),
        searchParams.get('docId') ?? 'standalone',
        searchParams.get('show'),
    ]);

    return <StandaloneEditorSession key={sessionKey} />;
}

function StandaloneEditorSession() {
    const searchParams = useSearchParams();
    const convex = useConvex();
    const graphStructureVersion = useEditorStore((s) => s.graphStructureVersion);
    const nodes = useEditorStore((s) => s.nodes);
    const globals = useEditorStore((s) => s.globals);
    const lastUniformsSignatureRef = useRef<string>('');

    const targetOriginParam = searchParams.get('targetOrigin');
    // null (an invalid value) disables the host channel rather than widening it to '*'.
    const targetOrigin = useMemo(() => resolveHostTargetOrigin(targetOriginParam), [targetOriginParam]);
    useEffect(() => {
        if (targetOrigin === null) {
            console.error('[tsl-graph] Ignoring host messages: targetOrigin must be "*" or an http(s) origin.');
        }
    }, [targetOrigin]);
    const docId = searchParams.get('docId') ?? 'standalone';
    const projectId = searchParams.get('projectId');
    const showParam = searchParams.get('show');
    const chromeVisibility = useMemo(
        () => parseStandaloneUiVisibility(showParam),
        [showParam]
    );
    const requestedEnabledGraphs = useMemo(
        () => parseEnabledGraphs(searchParams.get('graphs')),
        [searchParams]
    );
    const enabledGraphs = useMemo(
        () => normalizeEnabledGraphs(requestedEnabledGraphs),
        [requestedEnabledGraphs]
    );

    type ProjectLoadState = 'loading' | 'ready' | 'unavailable' | 'error';
    const [projectLoadState, setProjectLoadState] = useState<ProjectLoadState>(
        projectId ? 'loading' : 'ready'
    );
    const [projectBootstrap, setProjectBootstrap] = useState<{
        graphData: unknown;
        projectName?: string;
    } | null>(null);
    const [projectBootstrapKey, setProjectBootstrapKey] = useState<string | null>(null);
    const [retryToken, setRetryToken] = useState(0);
    const listenerInstalledRef = useRef(false);
    const [editorInitialized, setEditorInitialized] = useState(false);

    useEffect(() => {
        if (!projectId) return;

        let active = true;

        void convex.query(api.projects.getPublicStandalone, { id: projectId })
            .then(async (project) => {
                if (!active) return;
                if (!project) {
                    setProjectLoadState('unavailable');
                    return;
                }

                // Reuse the standalone asset rehydrator for public JSON/object
                // payloads before handing the one-time bootstrap to EditorHost.
                const graphData = await serializeGraphDataForLoad(project.graphData);
                if (!active) return;

                setProjectBootstrap({
                    graphData,
                    projectName: project.name,
                });
                setProjectBootstrapKey(projectId);
                setProjectLoadState('ready');
            })
            .catch((error) => {
                if (!active) return;
                console.error('Failed to load public standalone project:', error);
                setProjectLoadState('error');
            });

        return () => {
            active = false;
        };
    }, [convex, projectId, retryToken]);

    const persistence = useMemo(() => createNoopPersistenceAdapter(), []);
    const assets = useMemo(() => createStandaloneIndexedDbAssetsAdapter(), []);

    const buildCodePayload = useCallback((): GetCodeResponsePayload => {
        const { getRootGraph, subgraphs, codeNodes, globals } = useEditorStore.getState();
        const materialEnabled = enabledGraphs.includes('material');
        const postEnabled = enabledGraphs.includes('postprocessing');

        let materialCode: string | null = null;
        let materialError: string | null = null;
        let materialImports: ImportGroup[] = [];
        if (materialEnabled) {
            try {
                const materialGraph = getRootGraph('material');
                const hasMaterialRootNode = materialGraph.nodes.some((node) => isMaterialNodeType(node.data.type));
                if (!hasMaterialRootNode) {
                    materialCode = null;
                    materialError = null;
                    materialImports = [];
                } else {
                    const fullMaterialCode = compileGraph(
                        materialGraph.nodes,
                        materialGraph.edges,
                        subgraphs,
                        codeNodes,
                        { globals, uniformMode: 'runtime' }
                    );
                    const importsWithoutMaterialClass = stripMaterialClassImports(
                        getRequiredImportsByModule(materialGraph.nodes, subgraphs, codeNodes, globals)
                    );
                    const { helperCode, imports } = inlineCustomTslImports(importsWithoutMaterialClass);
                    materialCode = compileMaterialApplierCode(fullMaterialCode, helperCode);
                    materialImports = imports;
                }
            } catch (error) {
                materialError = error instanceof Error ? error.message : 'Failed to compile material graph';
            }
        }

        let postCode: string | null = null;
        let postFunctionName: string | null = null;
        let postError: string | null = null;
        let postImports: ImportGroup[] = [];
        if (postEnabled) {
            try {
                const postGraph = getRootGraph('post');
                const compiled = compilePostGraph(postGraph.nodes, postGraph.edges, subgraphs, codeNodes, { globals });
                const inlined = inlineCustomTslImports(
                    getRequiredImportsByModule(postGraph.nodes, subgraphs, codeNodes, globals)
                );
                postCode = inlined.helperCode
                    ? `${inlined.helperCode}\n\n${compiled.code}`
                    : compiled.code;
                postFunctionName = compiled.functionName;
                postImports = inlined.imports;
            } catch (error) {
                postError = error instanceof Error ? error.message : 'Failed to compile post graph';
            }
        }

        return {
            enabledGraphs,
            material: {
                code: materialCode,
                error: materialError,
                imports: materialImports,
            },
            postprocessing: {
                code: postCode,
                functionName: postFunctionName,
                error: postError,
                imports: postImports,
            },
        };
    }, [enabledGraphs]);

    const readySentRef = useRef(false);
    const graphReadyRevisionRef = useRef<number | null>(null);

    useEffect(() => {
        if (
            !listenerInstalledRef.current
            || !editorInitialized
            || projectLoadState !== 'ready'
            || (!!projectId && projectBootstrapKey !== projectId)
            || readySentRef.current
        ) return;

        const payload: EditorReadyPayload = {
            version: 1,
            enabledGraphs,
        };

        postMessageToHost(
            {
                source: EDITOR_POSTMESSAGE_SOURCE,
                type: 'tsl:event:ready',
                payload,
            },
            targetOrigin
        );
        readySentRef.current = true;
    }, [
        docId,
        editorInitialized,
        enabledGraphs,
        projectBootstrapKey,
        projectId,
        projectLoadState,
        targetOrigin,
    ]);

    useEffect(() => {
        if (
            !listenerInstalledRef.current
            || !editorInitialized
            || graphReadyRevisionRef.current === null
            || graphStructureVersion === graphReadyRevisionRef.current
        ) return;

        const payload: EditorGraphChangedPayload = {
            revision: graphStructureVersion,
        };

        postMessageToHost(
            {
                source: EDITOR_POSTMESSAGE_SOURCE,
                type: 'tsl:event:graph-changed',
                payload,
            },
            targetOrigin
        );
    }, [editorInitialized, graphStructureVersion, targetOrigin]);

    useEffect(() => {
        if (!assets.reconcileGraphAssets) {
            return;
        }

        const controller = createEditorAssetReconcilerController({
            ref: { docId },
            assets,
            debounceMs: ASSET_RECONCILE_DEBOUNCE_MS,
        });

        return () => {
            controller.dispose();
        };
    }, [assets, docId]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleMessage = async (event: MessageEvent) => {
            if (!isFromHostWindow(event, targetOrigin)) return;
            const data = event.data;
            if (!isHostMessage(data)) return;

            if (data.type === 'tsl:command:get-graph') {
                const graphData = JSON.parse(useEditorStore.getState().saveToJSON()) as unknown;
                postEditorResponse({
                    type: 'tsl:response:get-graph',
                    requestId: data.requestId,
                    payload: { graphData },
                }, targetOrigin);
                return;
            }

            if (data.type === 'tsl:command:load') {
                const payload = data.payload as LoadCommandPayload | undefined;
                if (!payload || !Object.prototype.hasOwnProperty.call(payload, 'graphData')) {
                    postEditorResponse({
                        type: 'tsl:response:load',
                        requestId: data.requestId,
                        error: 'Invalid payload: expected { graphData }',
                    }, targetOrigin);
                    return;
                }

                const graphData = payload.graphData;
                const graphJson = await serializeGraphDataForLoad(graphData);
                const store = useEditorStore.getState();
                const loaded = graphJson === null
                    ? (() => {
                        store.clearGraph();
                        return true;
                    })()
                    : store.loadFromJSON(graphJson);

                if (!loaded) {
                    postEditorResponse({
                        type: 'tsl:response:load',
                        requestId: data.requestId,
                        error: 'Failed to load graph JSON',
                    }, targetOrigin);
                    return;
                }

                store.clearHistory();
                store.markSaved();

                const responsePayload: LoadCommandResponsePayload = { ok: true };
                postEditorResponse({
                    type: 'tsl:response:load',
                    requestId: data.requestId,
                    payload: responsePayload,
                }, targetOrigin);
                return;
            }

            if (data.type === 'tsl:command:clear-graph') {
                const store = useEditorStore.getState();
                store.clearGraph();
                store.clearHistory();
                store.markSaved();

                const responsePayload: ClearGraphResponsePayload = { ok: true };
                postEditorResponse(
                    {
                        type: 'tsl:response:clear-graph',
                        requestId: data.requestId,
                        payload: responsePayload,
                    },
                    targetOrigin
                );
                return;
            }

            if (data.type === 'tsl:command:get-code') {
                const codePayload = buildCodePayload();
                postEditorResponse({
                    type: 'tsl:response:get-code',
                    requestId: data.requestId,
                    payload: codePayload,
                }, targetOrigin);
                return;
            }

            if (data.type === 'tsl:command:get-uniform-schema') {
                const payload: GetUniformSchemaResponsePayload = {
                    uniforms: buildUniformSchema(),
                };

                postEditorResponse({
                    type: 'tsl:response:get-uniform-schema',
                    requestId: data.requestId,
                    payload,
                }, targetOrigin);
                return;
            }

            if (data.type === 'tsl:command:set-uniform-values') {
                const payload = data.payload as SetUniformValuesPayload | undefined;
                if (!payload || !Array.isArray(payload.updates)) {
                    postEditorResponse({
                        type: 'tsl:response:set-uniform-values',
                        requestId: data.requestId,
                        error: 'Invalid payload: expected { updates: [...] }',
                    }, targetOrigin);
                    return;
                }

                const uniformMap = new Map(
                    buildUniformSchema().map((entry) => [getUniformEntryKey(entry), entry])
                );

                const store = useEditorStore.getState();
                const rejected: SetUniformValuesResponsePayload['rejected'] = [];

                payload.updates.forEach((update) => {
                    if (!update || typeof update !== 'object') {
                        return;
                    }

                    const scope = update.scope;
                    const id = update.id;
                    if ((scope !== 'node' && scope !== 'global') || typeof id !== 'string') {
                        return;
                    }

                    const uniform = uniformMap.get(getUniformEntryKey({ scope, id }));
                    if (!uniform) {
                        rejected?.push({ scope, id, reason: 'Uniform not found' });
                        return;
                    }

                    const value = coerceUniformValue(uniform.uniformType, update.value);
                    if (scope === 'node') {
                        if (store.editorMode !== 'main' || store.activeRootGraph !== 'material') {
                            rejected?.push({
                                scope,
                                id,
                                reason: 'Node uniform updates require material root to be active',
                            });
                            return;
                        }
                        store.updateNodeValue(id, 'value', value);
                    } else {
                        // Live path: mutates the running uniform without a recompile
                        store.updateGlobalUniformValueLive(id, value);
                        store.commitUniformGesture(`global:${id}`);
                    }
                });

                const responsePayload: SetUniformValuesResponsePayload = {
                    ok: rejected.length === 0,
                    uniforms: buildUniformSchema(),
                    ...(rejected.length > 0 ? { rejected } : {}),
                };

                postEditorResponse({
                    type: 'tsl:response:set-uniform-values',
                    requestId: data.requestId,
                    payload: responsePayload,
                }, targetOrigin);
                return;
            }

            if (data.type === 'tsl:command:set-root-material') {
                const materialType = resolveRootMaterialType(data.payload);
                if (!materialType) {
                    postEditorResponse({
                        type: 'tsl:response:set-root-material',
                        requestId: data.requestId,
                        error: 'Invalid material payload: expected { materialType }',
                    }, targetOrigin);
                    return;
                }

                const success = useEditorStore.getState().setRootMaterial(materialType);
                if (!success) {
                    postEditorResponse({
                        type: 'tsl:response:set-root-material',
                        requestId: data.requestId,
                        error: 'Failed to set root material',
                    }, targetOrigin);
                    return;
                }

                useEditorStore.getState().markSaved();
                postEditorResponse({
                    type: 'tsl:response:set-root-material',
                    requestId: data.requestId,
                    payload: { ok: true, materialType },
                }, targetOrigin);
            }
        };

        window.addEventListener('message', handleMessage);
        listenerInstalledRef.current = true;
        return () => {
            listenerInstalledRef.current = false;
            window.removeEventListener('message', handleMessage);
        };
    }, [buildCodePayload, targetOrigin]);

    useEffect(() => {
        if (!listenerInstalledRef.current || !editorInitialized) return;

        const uniforms = buildUniformSchema();
        const signature = createUniformsSignature(uniforms);
        if (signature === lastUniformsSignatureRef.current) {
            return;
        }

        lastUniformsSignatureRef.current = signature;
        const payload: UniformsChangedPayload = { uniforms };

        postMessageToHost(
            {
                source: EDITOR_POSTMESSAGE_SOURCE,
                type: 'tsl:event:uniforms-changed',
                payload,
            },
            targetOrigin
        );
    }, [editorInitialized, globals, nodes, targetOrigin]);

    const hostConfig = useMemo<EditorHostConfig<StandaloneRef>>(
        () => ({
            ref: { docId },
            persistence,
            autosaveDebounceMs: 2000,
            capabilities: {
                canRenameProject: false,
                canShare: false,
                canUploadAssets: true,
            },
            enabledGraphs,
            services: {
                assets,
            },
        }),
        [assets, docId, enabledGraphs, persistence]
    );

    const isBootstrapReady = projectLoadState === 'ready'
        && (!projectId || projectBootstrapKey === projectId);
    const initialData = projectId && projectBootstrapKey === projectId
        ? projectBootstrap
        : null;
    const handleEditorInitialized = useCallback(() => {
        graphReadyRevisionRef.current = useEditorStore.getState().graphStructureVersion;
        setEditorInitialized(true);
    }, []);
    const handleOpenEmpty = useCallback(() => {
        setProjectBootstrap(null);
        setProjectBootstrapKey(projectId);
        setProjectLoadState('ready');
    }, [projectId]);

    if (!isBootstrapReady) {
        if (projectLoadState === 'unavailable' || projectLoadState === 'error') {
            const isNetworkError = projectLoadState === 'error';
            return (
                <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
                    <div className="w-full max-w-md space-y-4 text-center">
                        <h1 className="text-lg font-medium">
                            {isNetworkError ? 'Unable to load public project' : 'Project unavailable'}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {isNetworkError
                                ? 'Check your connection and try again, or open an empty editor.'
                                : 'This project may be private, missing, or no longer shared.'}
                        </p>
                        <div className="flex justify-center gap-2">
                            {isNetworkError && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        setProjectLoadState('loading');
                                        setRetryToken((value) => value + 1);
                                    }}
                                >
                                    <RefreshCcw className="mr-2 h-4 w-4" />
                                    Retry
                                </Button>
                            )}
                            <Button type="button" onClick={handleOpenEmpty}>
                                Open empty editor
                            </Button>
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
                <Loader2 className="h-7 w-7 animate-spin text-primary" aria-label="Loading editor" />
            </div>
        );
    }

    return (
        <EditorHost
            key={`${projectId ?? 'empty'}:${docId}`}
            config={hostConfig}
            projectName={projectBootstrap?.projectName ?? ''}
            initialData={initialData}
            onInitialized={handleEditorInitialized}
            chromeVisibility={chromeVisibility}
        />
    );
}
