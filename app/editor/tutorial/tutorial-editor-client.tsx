"use client";

import { useEffect, useMemo } from 'react';
import { EditorHost } from '@/components/editor-host/EditorHost';
import { createEditorAssetReconcilerController } from '@/lib/editor-host/use-editor-persistence';
import type { EditorHostConfig } from '@/lib/editor-host/types';
import { createTutorialIndexedDbAssetsAdapter } from '@/lib/editor-host/adapters/tutorial-indexeddb-assets';
import { createTutorialPersistenceAdapter } from '@/lib/editor-host/adapters/tutorial-persistence-adapter';

const ASSET_RECONCILE_DEBOUNCE_MS = 2000;

export default function TutorialEditorClient() {
    const persistence = useMemo(() => createTutorialPersistenceAdapter(), []);
    const assets = useMemo(() => createTutorialIndexedDbAssetsAdapter(), []);

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
                assets,
            },
        }),
        [assets, persistence]
    );

    useEffect(() => {
        if (!assets.reconcileGraphAssets) {
            return;
        }

        const controller = createEditorAssetReconcilerController({
            ref: { docId: 'tutorial-sandbox' },
            assets,
            debounceMs: ASSET_RECONCILE_DEBOUNCE_MS,
        });

        return () => {
            controller.dispose();
        };
    }, [assets]);

    return (
        <EditorHost
            config={hostConfig}
            projectName="Tutorial Sandbox"
            isReadOnly={false}
        />
    );
}
