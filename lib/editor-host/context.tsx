'use client';

import { createContext, useContext } from 'react';
import type { EditorHostConfig, EditorHostServices } from '@/lib/editor-host/types';

const EditorHostContext = createContext<EditorHostConfig<unknown> | null>(null);

export function EditorHostProvider<TRef>({
    config,
    children,
}: {
    config: EditorHostConfig<TRef>;
    children: React.ReactNode;
}) {
    return (
        <EditorHostContext.Provider value={config as EditorHostConfig<unknown>}>
            {children}
        </EditorHostContext.Provider>
    );
}

export function useEditorHostConfig<TRef = unknown>() {
    return useContext(EditorHostContext) as EditorHostConfig<TRef> | null;
}

export function useEditorHostServices<TRef = unknown>() {
    return useEditorHostConfig<TRef>()?.services as EditorHostServices<TRef> | undefined;
}
