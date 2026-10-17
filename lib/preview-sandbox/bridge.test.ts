import { afterEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '@/store/editor';
import { createSnapshot, readCameraState, readCaptureImage } from './bridge';

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
