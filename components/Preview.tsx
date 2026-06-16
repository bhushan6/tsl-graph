'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useConvex } from 'convex/react';
import { toast } from 'sonner';
import { useEditorStore } from '@/store/editor';
import { cn } from '@/lib/utils';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { PreviewCanvas3D } from './preview/PreviewCanvas3D';
import { PreviewControls } from './preview/PreviewControls';
import type { PreviewCanvasHandle, PreviewCaptureUploadArgs } from './preview/types';
import { useEditorHostConfig } from '@/lib/editor-host/context';
import { normalizeEnabledGraphs } from '@/lib/editor-host/types';

export function Preview(props: { projectId?: string; hasThumbnail?: boolean }) {
    const canvasRef = useRef<PreviewCanvasHandle | null>(null);
    const hostConfig = useEditorHostConfig();
    const enabledGraphs = normalizeEnabledGraphs(hostConfig?.enabledGraphs);
    const postGraphEnabled = enabledGraphs.includes('postprocessing');

    const previewSettings = useEditorStore((state) => state.previewSettings);
    const updatePreviewSettings = useEditorStore((state) => state.updatePreviewSettings);
    const updatePreviewSettingsDebounced = useEditorStore((state) => state.updatePreviewSettingsDebounced);
    const setPreviewSnapshotProvider = useEditorStore((state) => state.setPreviewSnapshotProvider);
    const nodeCount = useEditorStore((state) => state.nodes.length);

    const [isFullScreen, setIsFullScreen] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [materialError, setMaterialError] = useState<string | null>(null);
    const [postError, setPostError] = useState<string | null>(null);
    const [geometryScriptError, setGeometryScriptError] = useState<string | null>(null);
    const [isGeometryScriptOpen, setIsGeometryScriptOpen] = useState(false);
    const [geometryScriptDraft, setGeometryScriptDraft] = useState(previewSettings.geometryScript ?? '');

    const convex = useConvex();
    const generatePreviewUploadUrl = useMutation(api.ai.generatePreviewUploadUrl);
    const projectService = hostConfig?.services?.project;
    const hostRef = hostConfig?.ref;
    const canUploadThumbnail = Boolean(projectService?.uploadThumbnail && hostRef !== undefined);

    const lastSnapshotNodeCount = useRef(nodeCount);
    const initialSnapshotTaken = useRef(false);
    const lastGeometryScriptError = useRef<string | null>(null);

    useEffect(() => {
        if (geometryScriptError) {
            if (geometryScriptError !== lastGeometryScriptError.current) {
                toast.error(`Geometry script error: ${geometryScriptError}`);
                lastGeometryScriptError.current = geometryScriptError;
            }
        } else {
            lastGeometryScriptError.current = null;
        }
    }, [geometryScriptError]);

    const handleUploadPreviewBlob = useCallback(async ({
        blob,
        mimeType,
        width,
        height,
        format,
        purpose,
    }: PreviewCaptureUploadArgs) => {
        if (purpose === 'thumbnail') {
            if (!projectService?.uploadThumbnail || hostRef === undefined) {
                throw new Error('Thumbnail upload is not available for this host.');
            }

            const result = await projectService.uploadThumbnail({
                ref: hostRef,
                blob,
                mimeType,
            });

            return {
                imageUrl: '',
                storageId: result.storageId,
                width,
                height,
                format,
            };
        }

        const uploadUrl = await generatePreviewUploadUrl();
        const response = await fetch(uploadUrl, {
            method: 'POST',
            headers: { 'Content-Type': mimeType },
            body: blob,
        });

        if (!response.ok) {
            throw new Error('Failed to upload preview image');
        }

        const { storageId } = await response.json();
        const result = await convex.query(api.ai.getPreviewUrl, {
            storageId: storageId as Id<'_storage'>,
        });

        return {
            imageUrl: result.url,
            storageId,
            width,
            height,
            format,
        };
    }, [
        convex,
        generatePreviewUploadUrl,
        hostRef,
        projectService,
    ]);

    const capturePreviewForAi = useCallback(async (options?: { format?: 'png' | 'jpeg'; quality?: number }) => {
        if (!canvasRef.current) {
            throw new Error('Preview renderer not ready');
        }

        return canvasRef.current.capturePreviewForAi({
            ...options,
            purpose: 'ai',
        });
    }, []);

    useEffect(() => {
        setPreviewSnapshotProvider(capturePreviewForAi);
        return () => setPreviewSnapshotProvider(null);
    }, [capturePreviewForAi, setPreviewSnapshotProvider]);

    const captureSnapshot = useCallback(async () => {
        if (!canUploadThumbnail || !canvasRef.current) return;

        try {
            await canvasRef.current.capturePreviewForAi({
                format: 'jpeg',
                quality: 0.7,
                purpose: 'thumbnail',
            });
        } catch (err) {
            console.error('Failed to update thumbnail:', err);
        }
    }, [canUploadThumbnail]);

    const handleDownloadSnapshot = useCallback(() => {
        canvasRef.current?.downloadSnapshot();
    }, []);

    const handleToggleFullScreen = useCallback(() => {
        setIsFullScreen((prev) => !prev);
    }, []);

    useEffect(() => {
        if (isReady && canUploadThumbnail && !props.hasThumbnail && !initialSnapshotTaken.current) {
            const timeout = setTimeout(() => {
                captureSnapshot();
                initialSnapshotTaken.current = true;
            }, 1000);
            return () => clearTimeout(timeout);
        }
    }, [canUploadThumbnail, isReady, props.hasThumbnail, captureSnapshot]);

    useEffect(() => {
        if (!isReady || !canUploadThumbnail) return;

        if (nodeCount < lastSnapshotNodeCount.current) {
            lastSnapshotNodeCount.current = nodeCount;
            return;
        }

        if (nodeCount - lastSnapshotNodeCount.current >= 5) {
            const timeout = setTimeout(() => {
                captureSnapshot();
                lastSnapshotNodeCount.current = nodeCount;
            }, 1000);
            return () => clearTimeout(timeout);
        }
    }, [nodeCount, canUploadThumbnail, isReady, captureSnapshot]);

    useEffect(() => {
        const { nodes: currentNodes, updateNodeValue } = useEditorStore.getState();
        const instanceCountNodes = currentNodes.filter((node) => node.data.type === 'geo/instanceCount');

        instanceCountNodes.forEach((node) => {
            if (previewSettings.isInstanced) {
                if (node.data.values?.value !== previewSettings.instanceCount) {
                    updateNodeValue(node.id, 'value', previewSettings.instanceCount);
                }
            } else if (node.data.values?.value !== 1) {
                updateNodeValue(node.id, 'value', 1);
            }
        });
    }, [previewSettings.instanceCount, previewSettings.isInstanced]);

    const handleSaveGeometryScript = useCallback(() => {
        updatePreviewSettings({ geometryScript: geometryScriptDraft });
        setIsGeometryScriptOpen(false);
    }, [geometryScriptDraft, updatePreviewSettings]);

    const handleCancelGeometryScript = useCallback(() => {
        setGeometryScriptDraft(previewSettings.geometryScript ?? '');
        setIsGeometryScriptOpen(false);
    }, [previewSettings.geometryScript]);

    const handleGeometryScriptDialogOpenChange = useCallback((open: boolean) => {
        if (open) {
            setGeometryScriptDraft(previewSettings.geometryScript ?? '');
        }
        setIsGeometryScriptOpen(open);
    }, [previewSettings.geometryScript]);

    return (
        <div
            data-tutorial-target="preview-panel"
            className={cn(
                'pointer-events-auto bg-card border border-border overflow-hidden transition-all duration-200',
                isFullScreen
                    ? 'fixed inset-4 z-50 rounded-xl shadow-2xl '
                    : 'relative rounded-xl shadow-lg w-72 h-72'
            )}
        >
            <PreviewControls
                isFullScreen={isFullScreen}
                onToggleFullScreen={handleToggleFullScreen}
                onDownloadSnapshot={handleDownloadSnapshot}
                isReady={isReady}
                allowPostProcessingToggle={postGraphEnabled}
                previewSettings={previewSettings}
                updatePreviewSettings={updatePreviewSettings}
                updatePreviewSettingsDebounced={updatePreviewSettingsDebounced}
                isGeometryScriptOpen={isGeometryScriptOpen}
                onGeometryScriptDialogOpenChange={handleGeometryScriptDialogOpenChange}
                geometryScriptDraft={geometryScriptDraft}
                onGeometryScriptDraftChange={setGeometryScriptDraft}
                onSaveGeometryScript={handleSaveGeometryScript}
                onCancelGeometryScript={handleCancelGeometryScript}
                materialError={materialError}
                postError={postError}
                geometryScriptError={geometryScriptError}
            />

            <PreviewCanvas3D
                ref={canvasRef}
                layoutMode={isFullScreen ? 'fullscreen' : 'inline'}
                postGraphEnabled={postGraphEnabled}
                onUploadPreviewBlob={handleUploadPreviewBlob}
                onMaterialErrorChange={setMaterialError}
                onPostErrorChange={setPostError}
                onGeometryScriptErrorChange={setGeometryScriptError}
                onReadyChange={setIsReady}
            />
        </div>
    );
}
