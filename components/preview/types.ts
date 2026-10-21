import type { PreviewSettings, ThumbnailMode } from '@/store/editor';

export interface PreviewCaptureOptions {
    format?: 'png' | 'jpeg';
    quality?: number;
}

export interface PreviewCanvasHandle {
    downloadSnapshot: () => void;
    captureThumbnail: (options?: PreviewCaptureOptions) => Promise<void>;
}

export interface PreviewCanvas3DProps {
    layoutMode: 'inline' | 'fullscreen';
    postGraphEnabled: boolean;
    onUploadThumbnail: (args: { blob: Blob; mimeType: string }) => Promise<void>;
    onMaterialErrorChange: (error: string | null) => void;
    onPostErrorChange: (error: string | null) => void;
    onGeometryScriptErrorChange: (error: string | null) => void;
    onReadyChange: (ready: boolean) => void;
}

export interface PreviewControlsProps {
    isFullScreen: boolean;
    onToggleFullScreen: () => void;
    onHide?: () => void;
    onDownloadSnapshot: () => void;
    canSetThumbnail: boolean;
    isSettingThumbnail: boolean;
    onSetThumbnail: () => void;
    thumbnailMode: ThumbnailMode;
    onThumbnailModeChange: (mode: ThumbnailMode) => void;
    isReady: boolean;
    allowPostProcessingToggle: boolean;
    previewSettings: PreviewSettings;
    updatePreviewSettings: (updates: Partial<PreviewSettings>) => void;
    updatePreviewSettingsDebounced: (updates: Partial<PreviewSettings>) => void;
    isGeometryScriptOpen: boolean;
    onGeometryScriptDialogOpenChange: (open: boolean) => void;
    geometryScriptDraft: string;
    onGeometryScriptDraftChange: (value: string) => void;
    onSaveGeometryScript: () => void;
    onCancelGeometryScript: () => void;
    materialError: string | null;
    postError: string | null;
    geometryScriptError: string | null;
}
