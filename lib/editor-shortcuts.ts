export interface EditorShortcut {
    code: string;
    display: string;
    mod?: boolean;
    alt?: boolean;
    shift?: boolean;
}

export const EDITOR_SHORTCUTS = {
    undo: { code: 'KeyZ', display: 'Ctrl/Cmd + Z', mod: true },
    redo: { code: 'KeyZ', display: 'Ctrl/Cmd + Shift + Z / Ctrl/Cmd + Y', mod: true, shift: true },
    copy: { code: 'KeyC', display: 'Ctrl/Cmd + C', mod: true },
    paste: { code: 'KeyV', display: 'Ctrl/Cmd + V', mod: true },
    findNotes: { code: 'KeyF', display: 'Ctrl/Cmd + F', mod: true },
    panMode: { code: 'KeyH', display: 'H' },
    selectMode: { code: 'KeyV', display: 'V' },
    createSubgraph: { code: 'KeyS', display: 'Ctrl/Cmd + Alt + S', mod: true, alt: true },
    createCodeNode: { code: 'KeyC', display: 'Ctrl/Cmd + Alt + C', mod: true, alt: true },
    createLoop: { code: 'KeyL', display: 'L' },
    groupNodes: { code: 'KeyG', display: 'Ctrl/Cmd + G', mod: true },
    ungroupNodes: { code: 'KeyG', display: 'Ctrl/Cmd + Shift + G', mod: true, shift: true },
    removeFromGroup: { code: 'KeyG', display: 'Alt + G', alt: true },
    convertToMultiOp: { code: 'KeyM', display: 'M' },
    expandMultiOp: { code: 'KeyM', display: 'Shift + M', shift: true },
    exportImage: { code: 'KeyE', display: 'Ctrl/Cmd + Shift + E', mod: true, shift: true },
    viewCode: { code: 'KeyV', display: 'Ctrl/Cmd + Alt + V', mod: true, alt: true },
    saveAndExitSubgraph: { code: 'Enter', display: 'Ctrl/Cmd + Enter', mod: true },
    cancelSubgraph: { code: 'Escape', display: 'Esc' },
} as const satisfies Record<string, EditorShortcut>;

type ShortcutEvent = Pick<KeyboardEvent, 'altKey' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey'>;

export function matchesEditorShortcut(event: ShortcutEvent, shortcut: EditorShortcut): boolean {
    const hasMod = event.ctrlKey || event.metaKey;

    return (
        event.code === shortcut.code &&
        hasMod === Boolean(shortcut.mod) &&
        event.altKey === Boolean(shortcut.alt) &&
        event.shiftKey === Boolean(shortcut.shift)
    );
}

export function isEditorShortcutBlocked(event: KeyboardEvent): boolean {
    if (event.defaultPrevented) return true;

    const target = event.target;
    if (!(target instanceof HTMLElement)) return false;

    if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable ||
        target.closest('[contenteditable="true"], [role="dialog"], [role="menu"]')
    ) {
        return true;
    }

    return Boolean(document.querySelector('[role="dialog"][data-state="open"]'));
}

export function shortcutTooltip(label: string, shortcut: EditorShortcut): string {
    return `${label} (${shortcut.display})`;
}
