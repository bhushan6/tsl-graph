'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useEditorStore, type ThumbnailMode } from '@/store/editor';
import { cn } from '@/lib/utils';
import { PreviewCanvas3D } from './preview/PreviewCanvas3D';
import { PreviewControls } from './preview/PreviewControls';
import type { PreviewCanvasHandle } from './preview/types';
import { useEditorHostConfig } from '@/lib/editor-host/context';
import { normalizeEnabledGraphs } from '@/lib/editor-host/types';

export function Preview(props: { projectId?: string; hasThumbnail?: boolean; onHide?: () => void }) {
    const canvasRef = useRef<PreviewCanvasHandle | null>(null);
    const hostConfig = useEditorHostConfig();
    const enabledGraphs = normalizeEnabledGraphs(hostConfig?.enabledGraphs);
    const postGraphEnabled = enabledGraphs.includes('postprocessing');

    const previewSettings = useEditorStore((state) => state.previewSettings);
    const updatePreviewSettings = useEditorStore((state) => state.updatePreviewSettings);
    const updatePreviewSettingsDebounced = useEditorStore((state) => state.updatePreviewSettingsDebounced);
    const nodeCount = useEditorStore((state) => state.nodes.length);

    const [isFullScreen, setIsFullScreen] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [isSettingThumbnail, setIsSettingThumbnail] = useState(false);
    const [materialError, setMaterialError] = useState<string | null>(null);
    const [postError, setPostError] = useState<string | null>(null);
    const [geometryScriptError, setGeometryScriptError] = useState<string | null>(null);
    const [isGeometryScriptOpen, setIsGeometryScriptOpen] = useState(false);
    const [geometryScriptDraft, setGeometryScriptDraft] = useState(previewSettings.geometryScript ?? '');

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

    const handleUploadThumbnail = useCallback(async ({ blob, mimeType }: { blob: Blob; mimeType: string }) => {
        if (!projectService?.uploadThumbnail || hostRef === undefined) {
            throw new Error('Thumbnail upload is not available for this host.');
        }
        await projectService.uploadThumbnail({ ref: hostRef, blob, mimeType });
    }, [hostRef, projectService]);

    const captureSnapshot = useCallback(async (): Promise<boolean> => {
        if (!canUploadThumbnail || !canvasRef.current) return false;

        try {
            await canvasRef.current.captureThumbnail({
                format: 'jpeg',
                quality: 0.7,
            });
            return true;
        } catch (err) {
            console.error('Failed to update thumbnail:', err);
            return false;
        }
    }, [canUploadThumbnail]);

    const handleSetThumbnail = useCallback(async () => {
        if (isSettingThumbnail || !canUploadThumbnail) return;

        setIsSettingThumbnail(true);
        try {
            const didCapture = await captureSnapshot();
            if (!didCapture) {
                toast.error('Failed to update thumbnail');
                return;
            }

            if ((previewSettings.thumbnailMode ?? 'auto') === 'auto') {
                updatePreviewSettings({ thumbnailMode: 'manual' });
                toast.success('Thumbnail updated : auto-updates paused', {
                    action: {
                        label: 'Keep auto',
                        onClick: () => updatePreviewSettings({ thumbnailMode: 'auto' }),
                    },
                });
            } else {
                toast.success('Thumbnail updated');
            }
        } finally {
            setIsSettingThumbnail(false);
        }
    }, [
        canUploadThumbnail,
        captureSnapshot,
        isSettingThumbnail,
        previewSettings.thumbnailMode,
        updatePreviewSettings,
    ]);

    const handleThumbnailModeChange = useCallback((mode: ThumbnailMode) => {
        updatePreviewSettings({ thumbnailMode: mode });
    }, [updatePreviewSettings]);

    const handleDownloadSnapshot = useCallback(() => {
        canvasRef.current?.downloadSnapshot();
    }, []);

    const handleToggleFullScreen = useCallback(() => {
        setIsFullScreen((prev) => !prev);
    }, []);

    const thumbnailMode = previewSettings.thumbnailMode ?? 'auto';

    useEffect(() => {
        if (!isReady || !canUploadThumbnail || thumbnailMode !== 'auto') return;
        if (props.hasThumbnail || initialSnapshotTaken.current) return;

        const timeout = setTimeout(() => {
            captureSnapshot();
            initialSnapshotTaken.current = true;
        }, 1000);
        return () => clearTimeout(timeout);
    }, [canUploadThumbnail, isReady, props.hasThumbnail, captureSnapshot, thumbnailMode]);

    useEffect(() => {
        if (!isReady || !canUploadThumbnail || thumbnailMode !== 'auto') return;

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
    }, [nodeCount, canUploadThumbnail, isReady, captureSnapshot, thumbnailMode]);

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
                onHide={props.onHide}
                onDownloadSnapshot={handleDownloadSnapshot}
                canSetThumbnail={canUploadThumbnail}
                isSettingThumbnail={isSettingThumbnail}
                onSetThumbnail={handleSetThumbnail}
                thumbnailMode={thumbnailMode}
                onThumbnailModeChange={handleThumbnailModeChange}
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
                onUploadThumbnail={handleUploadThumbnail}
                onMaterialErrorChange={setMaterialError}
                onPostErrorChange={setPostError}
                onGeometryScriptErrorChange={setGeometryScriptError}
                onReadyChange={setIsReady}
            />
        </div>
    );
}
