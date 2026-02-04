'use client';

import { createEditorStore } from '@/packages/editor-store';
import { registerEditorEffects } from './editor.effects';

export * from '@/packages/editor-store';

export const useEditorStore = createEditorStore();

registerEditorEffects(useEditorStore);
