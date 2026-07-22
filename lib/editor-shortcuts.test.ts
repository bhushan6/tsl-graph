import { describe, expect, it } from 'vitest';
import { EDITOR_SHORTCUTS, matchesEditorShortcut } from './editor-shortcuts';

function keyboardEvent(
    code: string,
    modifiers: Partial<Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>> = {},
) {
    return {
        code,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        ...modifiers,
    };
}

describe('editor shortcuts', () => {
    it('accepts either platform modifier for grouping', () => {
        expect(matchesEditorShortcut(keyboardEvent('KeyG', { ctrlKey: true }), EDITOR_SHORTCUTS.groupNodes)).toBe(true);
        expect(matchesEditorShortcut(keyboardEvent('KeyG', { metaKey: true }), EDITOR_SHORTCUTS.groupNodes)).toBe(true);
    });

    it('keeps group and ungroup distinct', () => {
        const ungroupEvent = keyboardEvent('KeyG', { ctrlKey: true, shiftKey: true });

        expect(matchesEditorShortcut(ungroupEvent, EDITOR_SHORTCUTS.groupNodes)).toBe(false);
        expect(matchesEditorShortcut(ungroupEvent, EDITOR_SHORTCUTS.ungroupNodes)).toBe(true);
    });

    it('does not match shortcuts when extra modifiers are pressed', () => {
        const modifiedPan = keyboardEvent('KeyH', { shiftKey: true });

        expect(matchesEditorShortcut(modifiedPan, EDITOR_SHORTCUTS.panMode)).toBe(false);
    });
});
