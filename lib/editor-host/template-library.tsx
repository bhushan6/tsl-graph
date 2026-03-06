'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useEditorHostServices } from '@/lib/editor-host/context';
import type {
    EditorTemplateRecord,
    EditorTemplateVersionInfo,
    EditorTemplatesAdapter,
} from '@/lib/editor-host/types';

interface TemplateLibraryValue {
    enabled: boolean;
    loading: boolean;
    userSubgraphTemplates: EditorTemplateRecord[];
    userCodeNodeTemplates: EditorTemplateRecord[];
    publicSubgraphTemplates: EditorTemplateRecord[];
    publicCodeNodeTemplates: EditorTemplateRecord[];
    refresh: () => Promise<void>;
    deleteSubgraphTemplate: (id: string) => Promise<void>;
    deleteCodeNodeTemplate: (id: string) => Promise<void>;
    createSubgraphTemplate: (input: {
        name: string;
        data: unknown;
        description?: string;
        isPublic?: boolean;
    }) => Promise<{ templateId: string; version: number }>;
    updateSubgraphTemplate: (input: {
        id: string;
        name?: string;
        data?: unknown;
        description?: string;
        isPublic?: boolean;
    }) => Promise<{ version: number }>;
    createCodeNodeTemplate: (input: {
        name: string;
        data: unknown;
        description?: string;
        isPublic?: boolean;
    }) => Promise<{ templateId: string; version: number }>;
    updateCodeNodeTemplate: (input: {
        id: string;
        name?: string;
        data?: unknown;
        description?: string;
        isPublic?: boolean;
    }) => Promise<{ version: number }>;
    getSubgraphTemplate: (id: string) => Promise<EditorTemplateRecord | null>;
    getCodeNodeTemplate: (id: string) => Promise<EditorTemplateRecord | null>;
    getSubgraphTemplateVersions: (ids: string[]) => Promise<Record<string, EditorTemplateVersionInfo | null>>;
    getCodeNodeTemplateVersions: (ids: string[]) => Promise<Record<string, EditorTemplateVersionInfo | null>>;
}

const noopError = 'Template library service is not configured for this host.';

const EMPTY_VERSION_RESULT: Record<string, EditorTemplateVersionInfo | null> = {};
const refreshSubscribers = new Set<() => void>();

export function requestTemplateLibraryRefresh() {
    for (const notify of refreshSubscribers) {
        notify();
    }
}

const TemplateLibraryContext = createContext<TemplateLibraryValue>({
    enabled: false,
    loading: false,
    userSubgraphTemplates: [],
    userCodeNodeTemplates: [],
    publicSubgraphTemplates: [],
    publicCodeNodeTemplates: [],
    refresh: async () => undefined,
    deleteSubgraphTemplate: async () => {
        throw new Error(noopError);
    },
    deleteCodeNodeTemplate: async () => {
        throw new Error(noopError);
    },
    createSubgraphTemplate: async () => {
        throw new Error(noopError);
    },
    updateSubgraphTemplate: async () => {
        throw new Error(noopError);
    },
    createCodeNodeTemplate: async () => {
        throw new Error(noopError);
    },
    updateCodeNodeTemplate: async () => {
        throw new Error(noopError);
    },
    getSubgraphTemplate: async () => null,
    getCodeNodeTemplate: async () => null,
    getSubgraphTemplateVersions: async () => EMPTY_VERSION_RESULT,
    getCodeNodeTemplateVersions: async () => EMPTY_VERSION_RESULT,
});

async function loadTemplateLists(templates: EditorTemplatesAdapter) {
    const [
        userSubgraphTemplates,
        userCodeNodeTemplates,
        publicSubgraphTemplates,
        publicCodeNodeTemplates,
    ] = await Promise.all([
        templates.listSubgraphTemplates(),
        templates.listCodeNodeTemplates(),
        templates.listPublicSubgraphTemplates(),
        templates.listPublicCodeNodeTemplates(),
    ]);

    return {
        userSubgraphTemplates,
        userCodeNodeTemplates,
        publicSubgraphTemplates,
        publicCodeNodeTemplates,
    };
}

export function TemplateLibraryProvider({ children }: { children: React.ReactNode }) {
    const templates = useEditorHostServices()?.templates;
    const [loading, setLoading] = useState(false);
    const [userSubgraphTemplates, setUserSubgraphTemplates] = useState<EditorTemplateRecord[]>([]);
    const [userCodeNodeTemplates, setUserCodeNodeTemplates] = useState<EditorTemplateRecord[]>([]);
    const [publicSubgraphTemplates, setPublicSubgraphTemplates] = useState<EditorTemplateRecord[]>([]);
    const [publicCodeNodeTemplates, setPublicCodeNodeTemplates] = useState<EditorTemplateRecord[]>([]);

    const refresh = useCallback(async () => {
        if (!templates) {
            setUserSubgraphTemplates([]);
            setUserCodeNodeTemplates([]);
            setPublicSubgraphTemplates([]);
            setPublicCodeNodeTemplates([]);
            return;
        }

        setLoading(true);
        try {
            const data = await loadTemplateLists(templates);
            setUserSubgraphTemplates(data.userSubgraphTemplates);
            setUserCodeNodeTemplates(data.userCodeNodeTemplates);
            setPublicSubgraphTemplates(data.publicSubgraphTemplates);
            setPublicCodeNodeTemplates(data.publicCodeNodeTemplates);
        } finally {
            setLoading(false);
        }
    }, [templates]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    useEffect(() => {
        const subscriber = () => {
            void refresh();
        };
        refreshSubscribers.add(subscriber);
        return () => {
            refreshSubscribers.delete(subscriber);
        };
    }, [refresh]);

    const value = useMemo<TemplateLibraryValue>(() => {
        if (!templates) {
            return {
                enabled: false,
                loading: false,
                userSubgraphTemplates: [],
                userCodeNodeTemplates: [],
                publicSubgraphTemplates: [],
                publicCodeNodeTemplates: [],
                refresh: async () => undefined,
                deleteSubgraphTemplate: async () => {
                    throw new Error(noopError);
                },
                deleteCodeNodeTemplate: async () => {
                    throw new Error(noopError);
                },
                createSubgraphTemplate: async () => {
                    throw new Error(noopError);
                },
                updateSubgraphTemplate: async () => {
                    throw new Error(noopError);
                },
                createCodeNodeTemplate: async () => {
                    throw new Error(noopError);
                },
                updateCodeNodeTemplate: async () => {
                    throw new Error(noopError);
                },
                getSubgraphTemplate: async () => null,
                getCodeNodeTemplate: async () => null,
                getSubgraphTemplateVersions: async () => EMPTY_VERSION_RESULT,
                getCodeNodeTemplateVersions: async () => EMPTY_VERSION_RESULT,
            };
        }

        return {
            enabled: true,
            loading,
            userSubgraphTemplates,
            userCodeNodeTemplates,
            publicSubgraphTemplates,
            publicCodeNodeTemplates,
            refresh,
            deleteSubgraphTemplate: async (id) => {
                await templates.deleteSubgraphTemplate(id);
                await refresh();
            },
            deleteCodeNodeTemplate: async (id) => {
                await templates.deleteCodeNodeTemplate(id);
                await refresh();
            },
            createSubgraphTemplate: async (input) => {
                const result = await templates.createSubgraphTemplate(input);
                await refresh();
                return result;
            },
            updateSubgraphTemplate: async (input) => {
                const result = await templates.updateSubgraphTemplate(input);
                await refresh();
                return result;
            },
            createCodeNodeTemplate: async (input) => {
                const result = await templates.createCodeNodeTemplate(input);
                await refresh();
                return result;
            },
            updateCodeNodeTemplate: async (input) => {
                const result = await templates.updateCodeNodeTemplate(input);
                await refresh();
                return result;
            },
            getSubgraphTemplate: templates.getSubgraphTemplate,
            getCodeNodeTemplate: templates.getCodeNodeTemplate,
            getSubgraphTemplateVersions: templates.getSubgraphTemplateVersions,
            getCodeNodeTemplateVersions: templates.getCodeNodeTemplateVersions,
        };
    }, [
        loading,
        publicCodeNodeTemplates,
        publicSubgraphTemplates,
        refresh,
        templates,
        userCodeNodeTemplates,
        userSubgraphTemplates,
    ]);

    return (
        <TemplateLibraryContext.Provider value={value}>
            {children}
        </TemplateLibraryContext.Provider>
    );
}

export function useTemplateLibrary() {
    return useContext(TemplateLibraryContext);
}
