'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { createPreviewBridge, registerMainPreview, type PreviewBridge } from '@/lib/preview-sandbox/bridge';
import type { PreviewCanvas3DProps, PreviewCanvasHandle } from './types';

/**
 * Hosts the shader preview in a sandboxed, opaque-origin iframe. Graph code
 * (custom nodes, geometry scripts) only ever executes inside that frame.
 */
export const PreviewCanvas3D = forwardRef<PreviewCanvasHandle, PreviewCanvas3DProps>(function PreviewCanvas3D(props, ref) {
    const container = useRef<HTMLDivElement>(null);
    const bridge = useRef<PreviewBridge | null>(null);
    const callbacks = useRef(props);
    useEffect(() => { callbacks.current = props; });
    useEffect(() => {
        if (!container.current) return;
        const instance = createPreviewBridge(container.current, {
            mode: 'main', postGraphEnabled: callbacks.current.postGraphEnabled,
            onReady: (ready) => callbacks.current.onReadyChange(ready),
            onError: (kind, error) => {
                if (kind === 'material') callbacks.current.onMaterialErrorChange(error);
                if (kind === 'post') callbacks.current.onPostErrorChange(error);
                if (kind === 'geometry') callbacks.current.onGeometryScriptErrorChange(error);
            },
        });
        bridge.current = instance;
        const unregister = registerMainPreview(instance);
        return () => { unregister(); instance.dispose(); bridge.current = null; };
    }, []);
    useEffect(() => { bridge.current?.setPostEnabled(props.postGraphEnabled); }, [props.postGraphEnabled]);
    useImperativeHandle(ref, () => ({
        downloadSnapshot: () => {
            void bridge.current?.capture({ format: 'png' }).then(({ blob }) => {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `snapshot-${new Date().toISOString()}.png`;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            }).catch((error) => console.error('Failed to capture preview snapshot:', error));
        },
        capturePreviewForAi: async (options) => {
            if (!bridge.current) throw new Error('Preview renderer not ready');
            const image = await bridge.current.capture({ format: options?.format, quality: options?.quality });
            return callbacks.current.onUploadPreviewBlob({ ...image, format: image.mimeType, purpose: options?.purpose ?? 'ai' });
        },
    }), []);
    return <div ref={container} className="w-full h-full" />;
});
