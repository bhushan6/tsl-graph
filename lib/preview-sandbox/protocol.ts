import type { Edge, Node } from '@xyflow/react';
import type { TSLNodeData, SubgraphDefinition, CodeNodeDefinition, GlobalContextEntry } from '@/lib/types';
import type { PreviewSettings, RootGraphMode } from '@/store/editor';
import type { UniformEvent } from '@/lib/uniform-store';

export const PREVIEW_CHANNEL = 'tsl-isolated-preview-v1';
export type PreviewMode = 'main' | 'overlay';
export interface PreviewSnapshot {
    nodes: Node<TSLNodeData>[];
    edges: Edge[];
    material: { nodes: Node<TSLNodeData>[]; edges: Edge[] };
    post: { nodes: Node<TSLNodeData>[]; edges: Edge[] };
    subgraphs: Record<string, SubgraphDefinition>;
    codeNodes: Record<string, CodeNodeDefinition>;
    globals: GlobalContextEntry[];
    previewSettings: PreviewSettings;
    graphStructureVersion: number;
    activeRootGraph: RootGraphMode;
    editorMode: 'main' | 'subgraph';
    editingSubgraphId: string | null;
}
export interface PreviewSlot { id: string; x: number; y: number; width: number; height: number }
/** Main preview perspective camera, mirrored into overlay frames for post-graph node previews. */
export interface PreviewCameraState { position: number[]; quaternion: number[]; zoom: number }
export interface CaptureRequest {
    nodeId?: string;
    /** Node captures: CSS-pixel size of the standalone render. */
    width?: number;
    height?: number;
    pixelRatio?: number;
    /**
     * Node captures: reproduce the overlay by rendering into a canvas-sized target
     * with the slot as the viewport, then cropping (matters for screen-space nodes).
     */
    viewport?: { canvasWidth: number; canvasHeight: number; x: number; y: number; width: number; height: number };
    format?: 'png' | 'jpeg';
    quality?: number;
}
export interface PreviewImage { blob: Blob; width: number; height: number; mimeType: string }
/**
 * One node preview rendered by an overlay frame. The parent paints it into a
 * canvas inside the node, so the preview moves with the node.
 */
export interface PreviewFrame {
    id: string;
    bitmap: ImageBitmap;
    /** The rendered (on-screen) part of the slot, in CSS pixels relative to the slot. */
    x: number;
    y: number;
    width: number;
    height: number;
    /** The slot size the frame rendered for, in CSS pixels. */
    slotWidth: number;
    slotHeight: number;
}
/** Browser-local files the opaque frame cannot fetch by the parent's `blob:` URL. */
export interface PreviewAsset { url: string; blob: Blob }
export type PreviewCommand =
    | { type: 'init'; mode: PreviewMode }
    | { type: 'state'; snapshot: PreviewSnapshot; postGraphEnabled: boolean; assets: PreviewAsset[] }
    /** Overlay frames: render node previews for these slots and send them back as images. */
    | { type: 'slots'; slots: PreviewSlot[] }
    | { type: 'uniform'; event: UniformEvent }
    | { type: 'camera'; camera: PreviewCameraState }
    | { type: 'capture'; requestId: string; options: CaptureRequest };
