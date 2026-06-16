"use client";

import { useMemo } from 'react';
import { EditorHost } from '@/components/editor-host/EditorHost';
import type { EditorHostConfig } from '@/lib/editor-host/types';
import { createTutorialIndexedDbAssetsAdapter } from '@/lib/editor-host/adapters/tutorial-indexeddb-assets';
import { createTutorialPersistenceAdapter } from '@/lib/editor-host/adapters/tutorial-persistence-adapter';

export default function TutorialEditorClient() {
    const persistence = useMemo(() => createTutorialPersistenceAdapter(), []);

    const hostConfig = useMemo<EditorHostConfig<{ docId: string }>>(
        () => ({
            ref: { docId: 'tutorial-sandbox' },
            persistence,
            autosaveDebounceMs: 500,
            capabilities: {
                canRenameProject: false,
                canShare: false,
                canUploadAssets: true,
                canUseAI: false,
            },
            enabledGraphs: ['material', 'postprocessing'], // Tutorials focus on material node shaders, post-processing needed for tutorial 14
            services: {
                assets: createTutorialIndexedDbAssetsAdapter(),
            },
        }),
        [persistence]
    );

    return (
        <EditorHost
            config={hostConfig}
            projectName="Tutorial Sandbox"
            isReadOnly={false}
        />
    );
}
