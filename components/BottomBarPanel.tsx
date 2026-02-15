'use client';

import { useState } from 'react';
import { Toolbar } from './Toolbar';
import { AiChatDock } from './AiChatDock';
import { useEditorStore } from '@/store/editor';

/**
 * Self-contained bottom bar that manages the toolbar/AI chat toggle.
 * In subgraph mode, only the Toolbar is shown.
 * In main mode, users can toggle between the Toolbar and AI chat dock.
 */
export function BottomBarPanel() {
    const editorMode = useEditorStore((s) => s.editorMode);
    const [mode, setMode] = useState<'ai' | 'toolbar'>('toolbar');

    if (editorMode === 'subgraph') {
        return <Toolbar />;
    }

    return (
        <div className="pointer-events-auto">
            <div className={mode === 'toolbar' ? 'block' : 'hidden'}>
                <Toolbar onOpenAiDock={() => setMode('ai')} />
            </div>
            <div className={mode === 'ai' ? 'block' : 'hidden'}>
                <AiChatDock onOpenToolbar={() => setMode('toolbar')} isOpen={mode === 'ai'} />
            </div>
        </div>
    );
}
