export type SaveReason = 'autosave' | 'manual';

export const EDITOR_GRAPH_KINDS = ['material', 'postprocessing'] as const;
export type EditorGraphKind = (typeof EDITOR_GRAPH_KINDS)[number];

type RootGraphMode = 'material' | 'post';

export interface EditorPersistenceAdapter<TRef = unknown> {
    load(ref: TRef): Promise<{ graphData: unknown; projectName?: string } | null>;
    save(input: { ref: TRef; graphData: unknown; reason: SaveReason }): Promise<void>;
}

export interface EditorHostCapabilities {
    canRenameProject: boolean;
    canShare: boolean;
    canUploadAssets: boolean;
    canUseAI: boolean;
}

export interface EditorTemplateRecord<TData = unknown> {
    _id: string;
    name: string;
    data: TData;
    version: number;
    isPublic?: boolean;
    description?: string;
    createdAt?: number;
    updatedAt?: number;
}

export interface EditorTemplateVersionInfo {
    version: number;
    updatedAt: number;
    isOwned: boolean;
}

export interface EditorTemplatesAdapter {
    listSubgraphTemplates(): Promise<EditorTemplateRecord[]>;
    listCodeNodeTemplates(): Promise<EditorTemplateRecord[]>;
    listPublicSubgraphTemplates(): Promise<EditorTemplateRecord[]>;
    listPublicCodeNodeTemplates(): Promise<EditorTemplateRecord[]>;
    getSubgraphTemplate(id: string): Promise<EditorTemplateRecord | null>;
    getCodeNodeTemplate(id: string): Promise<EditorTemplateRecord | null>;
    getSubgraphTemplateVersions(ids: string[]): Promise<Record<string, EditorTemplateVersionInfo | null>>;
    getCodeNodeTemplateVersions(ids: string[]): Promise<Record<string, EditorTemplateVersionInfo | null>>;
    createSubgraphTemplate(input: {
        name: string;
        data: unknown;
        description?: string;
        isPublic?: boolean;
    }): Promise<{ templateId: string; version: number }>;
    updateSubgraphTemplate(input: {
        id: string;
        name?: string;
        description?: string;
        isPublic?: boolean;
        data?: unknown;
    }): Promise<{ version: number }>;
    createCodeNodeTemplate(input: {
        name: string;
        data: unknown;
        description?: string;
        isPublic?: boolean;
    }): Promise<{ templateId: string; version: number }>;
    updateCodeNodeTemplate(input: {
        id: string;
        name?: string;
        description?: string;
        isPublic?: boolean;
        data?: unknown;
    }): Promise<{ version: number }>;
    deleteSubgraphTemplate(id: string): Promise<void>;
    deleteCodeNodeTemplate(id: string): Promise<void>;
}

export interface EditorProjectAdapter<TRef = unknown> {
    getProject(input: { ref: TRef }): Promise<{
        name?: string;
        isPublic?: boolean;
        thumbnail?: string | null;
    } | null>;
    renameProject(input: { ref: TRef; name: string }): Promise<void>;
    setProjectPublic(input: { ref: TRef; isPublic: boolean }): Promise<void>;
    uploadThumbnail?(input: {
        ref: TRef;
        blob: Blob;
        mimeType: string;
    }): Promise<{ storageId?: string }>;
}

export interface EditorAssetsAdapter<TRef = unknown> {
    uploadAndLinkAsset(input: {
        ref: TRef;
        nodeId: string;
        propertyName: string;
        file: File;
        replaceExisting?: boolean;
    }): Promise<{ assetId: string; url: string }>;
    unlinkAsset(input: {
        ref: TRef;
        nodeId: string;
        propertyName: string;
    }): Promise<void>;
    reconcileGraphAssets?(input: {
        ref: TRef;
        graphData: unknown;
        hardDeleteAfterMs?: number;
        now?: number;
    }): Promise<void>;
}

export interface EditorHostServices<TRef = unknown> {
    templates?: EditorTemplatesAdapter;
    project?: EditorProjectAdapter<TRef>;
    assets?: EditorAssetsAdapter<TRef>;
}

export interface EditorHostConfig<TRef = unknown> {
    ref: TRef;
    persistence: EditorPersistenceAdapter<TRef>;
    autosaveDebounceMs: number;
    /** Keeps unsaved edits in browser storage under this key and offers them back on load. */
    recoveryKey?: string;
    capabilities: EditorHostCapabilities;
    enabledGraphs?: EditorGraphKind[];
    defaultGraph?: EditorGraphKind;
    services?: EditorHostServices<TRef>;
}

export const DEFAULT_EDITOR_HOST_CAPABILITIES: EditorHostCapabilities = {
    canRenameProject: true,
    canShare: true,
    canUploadAssets: true,
    canUseAI: true,
};

export const DEFAULT_EDITOR_ENABLED_GRAPHS: readonly EditorGraphKind[] = EDITOR_GRAPH_KINDS;

export function normalizeEnabledGraphs(enabledGraphs?: readonly EditorGraphKind[]): EditorGraphKind[] {
    if (!Array.isArray(enabledGraphs) || enabledGraphs.length === 0) {
        return [...DEFAULT_EDITOR_ENABLED_GRAPHS];
    }

    const validSet = new Set<EditorGraphKind>(EDITOR_GRAPH_KINDS);
    const deduped: EditorGraphKind[] = [];

    for (const graph of enabledGraphs) {
        if (!validSet.has(graph)) continue;
        if (deduped.includes(graph)) continue;
        deduped.push(graph);
    }

    return deduped.length > 0
        ? deduped
        : [...DEFAULT_EDITOR_ENABLED_GRAPHS];
}

export function resolveDefaultGraphKind(
    enabledGraphs: readonly EditorGraphKind[],
    preferred?: EditorGraphKind
): EditorGraphKind {
    if (preferred && enabledGraphs.includes(preferred)) {
        return preferred;
    }

    if (enabledGraphs.includes('material')) {
        return 'material';
    }

    return enabledGraphs[0] ?? 'material';
}

export function graphKindToRootGraphMode(graph: EditorGraphKind): RootGraphMode {
    return graph === 'postprocessing' ? 'post' : 'material';
}

export function rootGraphModeToGraphKind(mode: RootGraphMode): EditorGraphKind {
    return mode === 'post' ? 'postprocessing' : 'material';
}
