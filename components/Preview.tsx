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

export function Preview(props: { projectId?: string; hasThumbnail?: boolean }) {
    const canvasRef = useRef<PreviewCanvasHandle | null>(null);

    const previewSettings = useEditorStore((state) => state.previewSettings);
    const updatePreviewSettings = useEditorStore((state) => state.updatePreviewSettings);
    const updatePreviewSettingsDebounced = useEditorStore((state) => state.updatePreviewSettingsDebounced);
    const setPreviewSnapshotProvider = useEditorStore((state) => state.setPreviewSnapshotProvider);
    const nodes = useEditorStore((state) => state.nodes);
    const graphStructureVersion = useEditorStore((state) => state.graphStructureVersion);
    const getRootGraph = useEditorStore((state) => state.getRootGraph);
    const subgraphs = useEditorStore((state) => state.subgraphs);
    const codeNodes = useEditorStore((state) => state.codeNodes);
    const globals = useEditorStore((state) => state.globals);

    const [isFullScreen, setIsFullScreen] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [materialError, setMaterialError] = useState<string | null>(null);
    const [postError, setPostError] = useState<string | null>(null);
    const [geometryScriptError, setGeometryScriptError] = useState<string | null>(null);
    const [isGeometryScriptOpen, setIsGeometryScriptOpen] = useState(false);
    const [geometryScriptDraft, setGeometryScriptDraft] = useState(previewSettings.geometryScript ?? '');

    const convex = useConvex();
    const generateThumbnailUploadUrl = useMutation(api.projects.generateThumbnailUploadUrl);
    const updateThumbnail = useMutation(api.projects.updateThumbnail);
    const generatePreviewUploadUrl = useMutation(api.ai.generatePreviewUploadUrl);

    const lastSnapshotNodeCount = useRef(nodes.length);
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

    const materialGraph = getRootGraph('material');
    const postGraph = getRootGraph('post');

    const handleUploadPreviewBlob = useCallback(async ({
        blob,
        mimeType,
        width,
        height,
        format,
        purpose,
    }: PreviewCaptureUploadArgs) => {
        if (purpose === 'thumbnail') {
            if (!props.projectId) {
                throw new Error('Project ID is required for thumbnail capture');
            }

            const uploadUrl = await generateThumbnailUploadUrl();
            const response = await fetch(uploadUrl, {
                method: 'POST',
                headers: { 'Content-Type': mimeType },
                body: blob,
            });

            if (!response.ok) {
                throw new Error('Failed to upload thumbnail');
            }

            const { storageId } = await response.json();
            await updateThumbnail({
                id: props.projectId as Id<'projects'>,
                storageId,
            });

            return {
                imageUrl: '',
                storageId,
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
        generateThumbnailUploadUrl,
        props.projectId,
        updateThumbnail,
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
        if (!props.projectId || !canvasRef.current) return;

        try {
            await canvasRef.current.capturePreviewForAi({
                format: 'jpeg',
                quality: 0.7,
                purpose: 'thumbnail',
            });
        } catch (err) {
            console.error('Failed to update thumbnail:', err);
        }
    }, [props.projectId]);

    const handleDownloadSnapshot = useCallback(() => {
        canvasRef.current?.downloadSnapshot();
    }, []);

    useEffect(() => {
        if (isReady && props.projectId && !props.hasThumbnail && !initialSnapshotTaken.current) {
            const timeout = setTimeout(() => {
                captureSnapshot();
                initialSnapshotTaken.current = true;
            }, 1000);
            return () => clearTimeout(timeout);
        }
    }, [isReady, props.projectId, props.hasThumbnail, captureSnapshot]);

    useEffect(() => {
        if (!isReady || !props.projectId) return;

        if (nodes.length < lastSnapshotNodeCount.current) {
            lastSnapshotNodeCount.current = nodes.length;
            return;
        }

        if (nodes.length - lastSnapshotNodeCount.current >= 5) {
            const timeout = setTimeout(() => {
                captureSnapshot();
                lastSnapshotNodeCount.current = nodes.length;
            }, 1000);
            return () => clearTimeout(timeout);
        }
    }, [nodes.length, isReady, props.projectId, captureSnapshot]);

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
            className={cn(
                'pointer-events-auto bg-card border border-border overflow-hidden transition-all duration-200',
                isFullScreen
                    ? 'fixed inset-4 z-50 rounded-xl shadow-2xl '
                    : 'relative rounded-xl shadow-lg w-72 h-72'
            )}
        >
            <PreviewControls
                isFullScreen={isFullScreen}
                onToggleFullScreen={() => setIsFullScreen((prev) => !prev)}
                onDownloadSnapshot={handleDownloadSnapshot}
                isReady={isReady}
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
                previewSettings={previewSettings}
                graphStructureVersion={graphStructureVersion}
                materialGraph={materialGraph}
                postGraph={postGraph}
                subgraphs={subgraphs}
                codeNodes={codeNodes}
                globals={globals}
                onUploadPreviewBlob={handleUploadPreviewBlob}
                onMaterialErrorChange={setMaterialError}
                onPostErrorChange={setPostError}
                onGeometryScriptErrorChange={setGeometryScriptError}
                onReadyChange={setIsReady}
            />
        </div>
    );
}
