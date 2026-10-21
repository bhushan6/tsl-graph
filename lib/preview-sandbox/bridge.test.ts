import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '@/store/editor';
import {
    closePreviewBitmaps,
    createSnapshot,
    placePreviewFrame,
    readCameraState,
    readCaptureImage,
    readPreviewFrames,
} from './bridge';

describe('readCaptureImage', () => {
    const png = (size = 4) => new Blob([new Uint8Array(size)], { type: 'image/png' });

    it('accepts a bounded PNG or JPEG capture', () => {
        const blob = png();
        expect(readCaptureImage({ blob, width: 2, height: 3 })).toEqual({ blob, width: 2, height: 3, mimeType: 'image/png' });
        const jpeg = new Blob(['x'], { type: 'image/jpeg' });
        expect(readCaptureImage({ blob: jpeg, width: 1, height: 1 })?.mimeType).toBe('image/jpeg');
    });

    it('rejects other types, non-blobs and implausible dimensions from the frame', () => {
        expect(readCaptureImage({ blob: new Blob(['<svg/>'], { type: 'image/svg+xml' }), width: 1, height: 1 })).toBeNull();
        expect(readCaptureImage({ blob: new Blob(['<p>'], { type: 'text/html' }), width: 1, height: 1 })).toBeNull();
        expect(readCaptureImage({ blob: 'data:image/png;base64,AA', width: 1, height: 1 })).toBeNull();
        expect(readCaptureImage({ blob: png(), width: 0, height: 1 })).toBeNull();
        expect(readCaptureImage({ blob: png(), width: 1.5, height: 1 })).toBeNull();
        expect(readCaptureImage({ blob: png(), width: 1, height: 100_000 })).toBeNull();
    });
});

describe('readPreviewFrames', () => {
    class FakeImageBitmap {
        closed = false;
        constructor(public width = 240, public height = 224) {}
        close() { this.closed = true; }
    }
    beforeEach(() => { vi.stubGlobal('ImageBitmap', FakeImageBitmap); });
    afterEach(() => { vi.unstubAllGlobals(); });

    const preview = (overrides: Record<string, unknown> = {}) => ({
        id: 'node_1', bitmap: new FakeImageBitmap(), x: 0, y: 0, width: 120, height: 112, slotWidth: 120, slotHeight: 112,
        ...overrides,
    });

    it('accepts images that sit inside their slot', () => {
        const full = preview();
        const clipped = preview({ id: 'node_2', x: 20, y: 12, width: 100, height: 100 });
        expect(readPreviewFrames([full, clipped])).toEqual([full, clipped]);
        expect(readPreviewFrames([])).toEqual([]);
    });

    it('rejects anything else the frame might send', () => {
        expect(readPreviewFrames(null)).toBeNull();
        expect(readPreviewFrames({ 0: preview() })).toBeNull();
        expect(readPreviewFrames([preview({ bitmap: new Blob(['x']) })])).toBeNull();
        expect(readPreviewFrames([preview({ id: 42 })])).toBeNull();
        expect(readPreviewFrames([preview({ bitmap: new FakeImageBitmap(100_000, 10) })])).toBeNull();
        expect(readPreviewFrames([preview({ x: Number.NaN })])).toBeNull();
        expect(readPreviewFrames([preview({ x: -5 })])).toBeNull();
        expect(readPreviewFrames([preview({ x: 50, width: 120 })])).toBeNull();
        expect(readPreviewFrames([preview({ slotWidth: 0 })])).toBeNull();
        expect(readPreviewFrames(Array.from({ length: 65 }, (_, index) => preview({ id: `n${index}` })))).toBeNull();
    });

    it('frees every image in a batch it rejects', () => {
        const batch = [preview(), preview({ x: -1 }), { bitmap: 'not an image' }];
        closePreviewBitmaps(batch);
        expect((batch[0].bitmap as FakeImageBitmap).closed).toBe(true);
        expect(((batch[1] as { bitmap: FakeImageBitmap }).bitmap).closed).toBe(true);
    });
});

describe('placePreviewFrame', () => {
    it('sizes the node canvas to the slot on screen and keeps a clipped preview in its place', () => {
        expect(placePreviewFrame({ x: 0, y: 0, width: 120, height: 112, slotWidth: 120, slotHeight: 112 }, 2)).toEqual({
            canvasWidth: 240, canvasHeight: 224, x: 0, y: 0, width: 240, height: 224,
        });
        // A node half off the left edge: only its right half was rendered.
        expect(placePreviewFrame({ x: 60, y: 0, width: 60, height: 112, slotWidth: 120, slotHeight: 112 }, 1)).toEqual({
            canvasWidth: 120, canvasHeight: 112, x: 60, y: 0, width: 60, height: 112,
        });
    });

    it('falls back to a ratio of 1 for a bad device pixel ratio', () => {
        expect(placePreviewFrame({ x: 0, y: 0, width: 10, height: 10, slotWidth: 10, slotHeight: 10 }, 0).canvasWidth).toBe(10);
    });
});

describe('readCameraState', () => {
    it('copies a well-formed camera', () => {
        const camera = { position: [1, 2, 3], quaternion: [0, 0, 0, 1], zoom: 1, extra: 'ignored' };
        expect(readCameraState(camera)).toEqual({ position: [1, 2, 3], quaternion: [0, 0, 0, 1], zoom: 1 });
    });

    it('rejects malformed or non-finite values', () => {
        expect(readCameraState(null)).toBeNull();
        expect(readCameraState({ position: [1, 2], quaternion: [0, 0, 0, 1], zoom: 1 })).toBeNull();
        expect(readCameraState({ position: [1, 2, NaN], quaternion: [0, 0, 0, 1], zoom: 1 })).toBeNull();
        expect(readCameraState({ position: [1, 2, 3], quaternion: [0, 0, 0, '1'], zoom: 1 })).toBeNull();
        expect(readCameraState({ position: [1, 2, 3], quaternion: [0, 0, 0, 1], zoom: 0 })).toBeNull();
    });
});

describe('createSnapshot', () => {
    afterEach(() => useEditorStore.getState().resetEditor());

    it('shares one serialized snapshot until relevant state changes', () => {
        const first = createSnapshot();
        expect(createSnapshot()).toBe(first);

        useEditorStore.setState({ graphStructureVersion: first.graphStructureVersion + 1 });
        const second = createSnapshot();
        expect(second).not.toBe(first);
        expect(second.graphStructureVersion).toBe(first.graphStructureVersion + 1);
    });

    it('is a plain copy that cannot alias editor state', () => {
        const snapshot = createSnapshot();
        expect(snapshot.previewSettings).toEqual(useEditorStore.getState().previewSettings);
        expect(snapshot.previewSettings).not.toBe(useEditorStore.getState().previewSettings);
    });
});
