"use client";

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
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
    isHostMessage,
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
    const graphStructureVersion = useEditorStore((s) => s.graphStructureVersion);
    const nodes = useEditorStore((s) => s.nodes);
    const globals = useEditorStore((s) => s.globals);
    const lastUniformsSignatureRef = useRef<string>('');

    const targetOrigin = searchParams.get('targetOrigin') ?? '*';
    const docId = searchParams.get('docId') ?? 'standalone';
    const requestedEnabledGraphs = useMemo(
        () => parseEnabledGraphs(searchParams.get('graphs')),
        [searchParams]
    );
    const enabledGraphs = useMemo(
        () => normalizeEnabledGraphs(requestedEnabledGraphs),
        [requestedEnabledGraphs]
    );

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

    useEffect(() => {
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
    }, [enabledGraphs, targetOrigin]);

    useEffect(() => {
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
    }, [graphStructureVersion, targetOrigin]);

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
    }, [globals, nodes, targetOrigin]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleMessage = async (event: MessageEvent) => {
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
        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, [buildCodePayload, targetOrigin]);

    const hostConfig = useMemo<EditorHostConfig<StandaloneRef>>(
        () => ({
            ref: { docId },
            persistence,
            autosaveDebounceMs: 2000,
            capabilities: {
                canRenameProject: false,
                canShare: false,
                canUploadAssets: true,
                canUseAI: false,
            },
            enabledGraphs,
            services: {
                assets,
            },
        }),
        [assets, docId, enabledGraphs, persistence]
    );

    return <EditorHost config={hostConfig} projectName="" />;
}
