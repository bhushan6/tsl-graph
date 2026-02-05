'use client';

import { create } from 'zustand';
import type { PreviewStatus } from '@/lib/ai/types';
import type { WebGPURenderer } from 'three/webgpu';

interface PreviewState {
  renderer: WebGPURenderer | null;
  lastError: string | null;
  registerRenderer: (renderer: WebGPURenderer | null) => void;
  setLastError: (error: string | null) => void;
  getPreviewStatus: () => PreviewStatus;
  capturePreview: () => string | null;
}

export const usePreviewStore = create<PreviewState>((set, get) => ({
  renderer: null,
  lastError: null,
  registerRenderer: (renderer) => set({ renderer }),
  setLastError: (error) => set({ lastError: error }),
  getPreviewStatus: () => ({
    hasRenderer: Boolean(get().renderer),
    lastError: get().lastError,
  }),
  capturePreview: () => {
    const renderer = get().renderer;
    if (!renderer) return null;
    try {
      const canvas = renderer.domElement as HTMLCanvasElement;
      return canvas.toDataURL('image/png');
    } catch (error) {
      console.error('capturePreview failed:', error);
      return null;
    }
  },
}));
