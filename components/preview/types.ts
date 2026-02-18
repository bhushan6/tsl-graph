import type { Edge, Node } from '@xyflow/react';
import type { CodeNodeDefinition, GlobalContextEntry, SubgraphDefinition, TSLNodeData } from '@/lib/types';
import type { PreviewSettings } from '@/store/editor';

export type PreviewCapturePurpose = 'ai' | 'thumbnail';

export interface PreviewCaptureOptions {
    format?: 'png' | 'jpeg';
    quality?: number;
    purpose?: PreviewCapturePurpose;
}

export interface PreviewCaptureUploadArgs {
    blob: Blob;
    mimeType: string;
    width: number;
    height: number;
    format: string;
    purpose: PreviewCapturePurpose;
}

export interface PreviewCaptureResult {
    imageUrl: string;
    storageId: string;
    width: number;
    height: number;
    format: string;
}

export interface PreviewCanvasHandle {
    downloadSnapshot: () => void;
    capturePreviewForAi: (options?: PreviewCaptureOptions) => Promise<PreviewCaptureResult>;
}

export interface PreviewRootGraph {
    nodes: Node<TSLNodeData>[];
    edges: Edge[];
}

export interface PreviewCanvas3DProps {
    layoutMode: 'inline' | 'fullscreen';
    previewSettings: PreviewSettings;
    graphStructureVersion: number;
    materialGraph: PreviewRootGraph;
    postGraph: PreviewRootGraph;
    subgraphs: Record<string, SubgraphDefinition>;
    codeNodes: Record<string, CodeNodeDefinition>;
    globals: GlobalContextEntry[];
    onUploadPreviewBlob: (args: PreviewCaptureUploadArgs) => Promise<PreviewCaptureResult>;
    onMaterialErrorChange: (error: string | null) => void;
    onPostErrorChange: (error: string | null) => void;
    onGeometryScriptErrorChange: (error: string | null) => void;
    onReadyChange: (ready: boolean) => void;
}

export interface PreviewControlsProps {
    isFullScreen: boolean;
    onToggleFullScreen: () => void;
    onDownloadSnapshot: () => void;
    isReady: boolean;
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
