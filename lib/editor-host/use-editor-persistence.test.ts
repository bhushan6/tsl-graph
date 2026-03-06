import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '@/store/editor';
import { createEditorPersistenceController } from './use-editor-persistence';

describe('editor persistence controller', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        useEditorStore.getState().resetEditor();
        vi.useFakeTimers();
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
        consoleErrorSpy.mockRestore();
    });

    it('debounces autosave for burst edits', async () => {
        const save = vi.fn().mockResolvedValue(undefined);
        const controller = createEditorPersistenceController({
            ref: { docId: 'burst' },
            persistence: {
                load: vi.fn(),
                save,
            },
            autosaveDebounceMs: 200,
        });

        const store = useEditorStore.getState();
        store.markDirty();

        await vi.advanceTimersByTimeAsync(100);
        store.markDirty();

        await vi.advanceTimersByTimeAsync(199);
        expect(save).toHaveBeenCalledTimes(0);

        await vi.advanceTimersByTimeAsync(1);
        expect(save).toHaveBeenCalledTimes(1);
        expect(useEditorStore.getState().isDirty).toBe(false);
        expect(useEditorStore.getState().isSaving).toBe(false);

        controller.dispose();
    });

    it('retries failed saves with backoff and eventually clears dirty on success', async () => {
        const save = vi
            .fn()
            .mockRejectedValueOnce(new Error('transient'))
            .mockResolvedValueOnce(undefined);

        const controller = createEditorPersistenceController({
            ref: { docId: 'retry' },
            persistence: {
                load: vi.fn(),
                save,
            },
            autosaveDebounceMs: 50,
            retryBaseMs: 100,
            maxRetries: 2,
        });

        useEditorStore.getState().markDirty();

        await vi.advanceTimersByTimeAsync(50);
        expect(save).toHaveBeenCalledTimes(1);
        expect(useEditorStore.getState().isDirty).toBe(true);

        await vi.advanceTimersByTimeAsync(99);
        expect(save).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(1);
        expect(save).toHaveBeenCalledTimes(2);
        expect(useEditorStore.getState().isDirty).toBe(false);
        expect(useEditorStore.getState().isSaving).toBe(false);

        controller.dispose();
    });

    it('keeps dirty state after bounded retries are exhausted', async () => {
        const save = vi.fn().mockRejectedValue(new Error('always fails'));

        const controller = createEditorPersistenceController({
            ref: { docId: 'bounded' },
            persistence: {
                load: vi.fn(),
                save,
            },
            autosaveDebounceMs: 25,
            retryBaseMs: 40,
            maxRetries: 1,
        });

        useEditorStore.getState().markDirty();

        await vi.advanceTimersByTimeAsync(25); // initial attempt
        await vi.advanceTimersByTimeAsync(40); // single retry

        expect(save).toHaveBeenCalledTimes(2);
        expect(useEditorStore.getState().isDirty).toBe(true);
        expect(useEditorStore.getState().isSaving).toBe(false);

        controller.dispose();
    });
});
