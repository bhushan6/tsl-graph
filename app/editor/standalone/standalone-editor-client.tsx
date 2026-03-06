"use client";

import { useMemo } from 'react';
import { EditorHost } from '@/components/editor-host/EditorHost';
import {
    createLocalStorageEditorAdapter,
    createLocalStorageEditorServices,
    type LocalStorageEditorRef,
} from '@/lib/editor-host/adapters/local-storage-adapter';
import type { EditorHostConfig } from '@/lib/editor-host/types';

export default function StandaloneEditorClient() {
    const persistence = useMemo(() => createLocalStorageEditorAdapter(), []);
    const services = useMemo(() => createLocalStorageEditorServices(), []);

    const hostConfig = useMemo<EditorHostConfig<LocalStorageEditorRef>>(
        () => ({
            ref: { docId: 'standalone' },
            persistence,
            services,
            autosaveDebounceMs: 2000,
            capabilities: {
                canRenameProject: false,
                canShare: false,
                canUploadAssets: true,
                canUseAI: false,
            },
            enabledGraphs: ['material'],

        }),
        [persistence, services]
    );

    return <EditorHost config={hostConfig} projectName="" />;
}
