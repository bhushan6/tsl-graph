import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '@/store/editor';
import { readRecoverySnapshot } from './recovery-snapshot';
import {
    createEditorPersistenceController,
    saveEditorNow,
    type EditorPersistenceController,
} from './use-editor-persistence';

const createMemoryStorage = (): Storage => {
    const items = new Map<string, string>();
    return {
        get length() {
            return items.size;
        },
        clear: () => items.clear(),
        getItem: (key) => items.get(key) ?? null,
        key: (index) => [...items.keys()][index] ?? null,
        removeItem: (key) => {
            items.delete(key);
        },
        setItem: (key, value) => {
            items.set(key, String(value));
        },
    };
};

const createDeferred = () => {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

const edit = (instanceCount: number) => {
    useEditorStore.getState().updatePreviewSettings({ instanceCount });
};

const savedInstanceCount = (save: ReturnType<typeof vi.fn>, call: number) => (
    (save.mock.calls[call][0] as { graphData: { previewSettings: { instanceCount: number } } })
        .graphData.previewSettings.instanceCount
);

describe('editor persistence controller', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
    let controller: EditorPersistenceController | null;

    beforeEach(() => {
        useEditorStore.getState().resetEditor();
        vi.useFakeTimers();
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        controller = null;
    });

    afterEach(() => {
        controller?.dispose();
        vi.useRealTimers();
        vi.unstubAllGlobals();
        consoleErrorSpy.mockRestore();
    });

    it('debounces autosave for burst edits', async () => {
        const save = vi.fn().mockResolvedValue(undefined);
        controller = createEditorPersistenceController({
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
    });

    it('retries failed saves with backoff and eventually clears dirty on success', async () => {
        const save = vi
            .fn()
            .mockRejectedValueOnce(new Error('transient'))
            .mockResolvedValueOnce(undefined);

        controller = createEditorPersistenceController({
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
    });

    it('keeps dirty state after bounded retries are exhausted', async () => {
        const save = vi.fn().mockRejectedValue(new Error('always fails'));

        controller = createEditorPersistenceController({
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
        expect(useEditorStore.getState().saveFailed).toBe(true);
    });

    it('stops autosaving after retries are exhausted until a new edit', async () => {
        const save = vi.fn().mockRejectedValue(new Error('always fails'));

        controller = createEditorPersistenceController({
            ref: { docId: 'exhausted' },
            persistence: {
                load: vi.fn(),
                save,
            },
            autosaveDebounceMs: 25,
            retryBaseMs: 40,
            maxRetries: 1,
        });

        edit(2);
        await vi.advanceTimersByTimeAsync(65);
        expect(save).toHaveBeenCalledTimes(2);

        await vi.advanceTimersByTimeAsync(5000);
        expect(save).toHaveBeenCalledTimes(2);
        expect(useEditorStore.getState().saveFailed).toBe(true);

        edit(3);
        expect(useEditorStore.getState().saveFailed).toBe(false);
        await vi.advanceTimersByTimeAsync(25);
        expect(save).toHaveBeenCalledTimes(3);
        expect(savedInstanceCount(save, 2)).toBe(3);

        await vi.advanceTimersByTimeAsync(40);
        expect(save).toHaveBeenCalledTimes(4);
        expect(useEditorStore.getState().saveFailed).toBe(true);

        await vi.advanceTimersByTimeAsync(5000);
        expect(save).toHaveBeenCalledTimes(4);
    });

    it('resumes after exhausted retries when the browser reconnects', async () => {
        vi.stubGlobal('window', new EventTarget());
        const save = vi.fn().mockRejectedValue(new Error('offline'));

        controller = createEditorPersistenceController({
            ref: { docId: 'reconnect' },
            persistence: {
                load: vi.fn(),
                save,
            },
            autosaveDebounceMs: 25,
            retryBaseMs: 40,
            maxRetries: 1,
        });

        edit(2);
        await vi.advanceTimersByTimeAsync(5000);
        expect(save).toHaveBeenCalledTimes(2);

        save.mockResolvedValueOnce(undefined);
        window.dispatchEvent(new Event('online'));
        await vi.advanceTimersByTimeAsync(0);

        expect(save).toHaveBeenCalledTimes(3);
        expect(useEditorStore.getState().saveFailed).toBe(false);
        expect(useEditorStore.getState().isDirty).toBe(false);
    });

    it('resumes after exhausted retries on a manual save', async () => {
        const save = vi.fn().mockRejectedValue(new Error('always fails'));

        controller = createEditorPersistenceController({
            ref: { docId: 'manual' },
            persistence: {
                load: vi.fn(),
                save,
            },
            autosaveDebounceMs: 25,
            retryBaseMs: 40,
            maxRetries: 1,
        });

        edit(2);
        await vi.advanceTimersByTimeAsync(5000);
        expect(save).toHaveBeenCalledTimes(2);

        save.mockResolvedValueOnce(undefined);
        await saveEditorNow();

        expect(save).toHaveBeenCalledTimes(3);
        expect(save.mock.calls[2][0]).toMatchObject({ reason: 'manual' });
        expect(useEditorStore.getState().saveFailed).toBe(false);
        expect(useEditorStore.getState().isDirty).toBe(false);
    });

    it('keeps the editor dirty when edits land during a save', async () => {
        const firstSave = createDeferred();
        const save = vi
            .fn()
            .mockReturnValueOnce(firstSave.promise)
            .mockResolvedValue(undefined);

        controller = createEditorPersistenceController({
            ref: { docId: 'during-save' },
            persistence: {
                load: vi.fn(),
                save,
            },
            autosaveDebounceMs: 50,
        });

        edit(2);
        await vi.advanceTimersByTimeAsync(50);
        expect(save).toHaveBeenCalledTimes(1);

        edit(3);
        firstSave.resolve();
        await vi.advanceTimersByTimeAsync(0);
        expect(useEditorStore.getState().isDirty).toBe(true);

        await vi.advanceTimersByTimeAsync(50);
        expect(save).toHaveBeenCalledTimes(2);
        expect(savedInstanceCount(save, 1)).toBe(3);
        expect(useEditorStore.getState().isDirty).toBe(false);
    });

    it('saves pending edits when disposed before the store resets', async () => {
        const save = vi.fn().mockResolvedValue(undefined);

        controller = createEditorPersistenceController({
            ref: { docId: 'navigate' },
            persistence: {
                load: vi.fn(),
                save,
            },
            autosaveDebounceMs: 2000,
        });

        edit(7);
        const pendingGraph = JSON.parse(useEditorStore.getState().saveToJSON()) as unknown;

        controller.dispose();
        useEditorStore.getState().resetEditor();
        await vi.advanceTimersByTimeAsync(0);

        expect(save).toHaveBeenCalledTimes(1);
        expect(save.mock.calls[0][0]).toMatchObject({ graphData: pendingGraph });

        // The disposed controller must not touch the next editor session.
        edit(8);
        await vi.advanceTimersByTimeAsync(5000);
        expect(save).toHaveBeenCalledTimes(1);
        expect(useEditorStore.getState().isDirty).toBe(true);
    });

    it('waits for an in-flight save on dispose, then saves newer edits', async () => {
        const firstSave = createDeferred();
        const save = vi
            .fn()
            .mockReturnValueOnce(firstSave.promise)
            .mockResolvedValue(undefined);

        controller = createEditorPersistenceController({
            ref: { docId: 'in-flight' },
            persistence: {
                load: vi.fn(),
                save,
            },
            autosaveDebounceMs: 50,
        });

        edit(2);
        await vi.advanceTimersByTimeAsync(50);
        expect(save).toHaveBeenCalledTimes(1);

        edit(3);
        controller.dispose();
        useEditorStore.getState().resetEditor();
        await vi.advanceTimersByTimeAsync(0);
        expect(save).toHaveBeenCalledTimes(1);

        firstSave.resolve();
        await vi.advanceTimersByTimeAsync(0);
        expect(save).toHaveBeenCalledTimes(2);
        expect(savedInstanceCount(save, 1)).toBe(3);
    });

    it('does not resave on dispose when the in-flight save has the latest edits', async () => {
        const firstSave = createDeferred();
        const save = vi.fn().mockReturnValueOnce(firstSave.promise);

        controller = createEditorPersistenceController({
            ref: { docId: 'in-flight-latest' },
            persistence: {
                load: vi.fn(),
                save,
            },
            autosaveDebounceMs: 50,
        });

        edit(2);
        await vi.advanceTimersByTimeAsync(50);
        controller.dispose();
        useEditorStore.getState().resetEditor();

        firstSave.resolve();
        await vi.advanceTimersByTimeAsync(0);
        expect(save).toHaveBeenCalledTimes(1);
    });

    it('keeps a recovery snapshot when the final save on dispose fails', async () => {
        vi.stubGlobal('localStorage', createMemoryStorage());
        const finalSave = createDeferred();
        const save = vi.fn().mockReturnValueOnce(finalSave.promise);

        controller = createEditorPersistenceController({
            ref: { docId: 'offline-dispose' },
            persistence: {
                load: vi.fn(),
                save,
            },
            autosaveDebounceMs: 2000,
            recoveryKey: 'project:offline',
        });

        edit(9);
        const pendingJson = useEditorStore.getState().saveToJSON();

        controller.dispose();
        useEditorStore.getState().resetEditor();
        expect(readRecoverySnapshot('project:offline')?.graphJson).toBe(pendingJson);

        finalSave.reject(new Error('offline'));
        await vi.advanceTimersByTimeAsync(0);
        expect(readRecoverySnapshot('project:offline')?.graphJson).toBe(pendingJson);
    });

    it('clears the recovery snapshot once the final save on dispose lands', async () => {
        vi.stubGlobal('localStorage', createMemoryStorage());
        const save = vi.fn().mockResolvedValue(undefined);

        controller = createEditorPersistenceController({
            ref: { docId: 'online-dispose' },
            persistence: {
                load: vi.fn(),
                save,
            },
            autosaveDebounceMs: 2000,
            recoveryKey: 'project:online',
        });

        edit(4);
        controller.dispose();
        useEditorStore.getState().resetEditor();
        await vi.advanceTimersByTimeAsync(0);

        expect(save).toHaveBeenCalledTimes(1);
        expect(readRecoverySnapshot('project:online')).toBeNull();
    });

    it('writes a recovery snapshot while dirty and on pagehide, and clears it after saving', async () => {
        vi.stubGlobal('localStorage', createMemoryStorage());
        vi.stubGlobal('window', new EventTarget());
        const save = vi.fn().mockResolvedValue(undefined);

        controller = createEditorPersistenceController({
            ref: { docId: 'snapshot' },
            persistence: {
                load: vi.fn(),
                save,
            },
            autosaveDebounceMs: 2000,
            recoveryKey: 'project:snapshot',
        });

        edit(5);
        await vi.advanceTimersByTimeAsync(1000);
        expect(save).toHaveBeenCalledTimes(0);
        expect(readRecoverySnapshot('project:snapshot')?.graphJson)
            .toBe(useEditorStore.getState().saveToJSON());

        edit(6);
        window.dispatchEvent(new Event('pagehide'));
        expect(readRecoverySnapshot('project:snapshot')?.graphJson)
            .toBe(useEditorStore.getState().saveToJSON());

        // pagehide also starts the pending autosave right away.
        await vi.advanceTimersByTimeAsync(0);
        expect(save).toHaveBeenCalledTimes(1);
        expect(readRecoverySnapshot('project:snapshot')).toBeNull();
        expect(useEditorStore.getState().isDirty).toBe(false);
    });
});
