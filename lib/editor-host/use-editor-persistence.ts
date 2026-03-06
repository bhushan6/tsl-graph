'use client';

import { useEffect } from 'react';
import { useEditorStore } from '@/store/editor';
import type { EditorHostConfig, SaveReason } from './types';

interface EditorPersistenceControllerOptions<TRef> {
    ref: TRef;
    persistence: EditorHostConfig<TRef>['persistence'];
    autosaveDebounceMs: number;
    maxRetries?: number;
    retryBaseMs?: number;
}

export interface EditorPersistenceController {
    flush: () => Promise<void>;
    dispose: () => void;
}

interface UseEditorPersistenceOptions {
    enabled?: boolean;
    maxRetries?: number;
    retryBaseMs?: number;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE_MS = 1000;

const parseGraphData = (): unknown => {
    const json = useEditorStore.getState().saveToJSON();
    return JSON.parse(json) as unknown;
};

export function createEditorPersistenceController<TRef>({
    ref,
    persistence,
    autosaveDebounceMs,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryBaseMs = DEFAULT_RETRY_BASE_MS,
}: EditorPersistenceControllerOptions<TRef>): EditorPersistenceController {
    let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    let isSaving = false;
    let retryCount = 0;
    let hasPendingRetry = false;

    const clearAutosaveTimer = () => {
        if (!autosaveTimer) return;
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
    };

    const clearRetryTimer = () => {
        if (!retryTimer) return;
        clearTimeout(retryTimer);
        retryTimer = null;
        hasPendingRetry = false;
    };

    const clearTimers = () => {
        clearAutosaveTimer();
        clearRetryTimer();
    };

    const scheduleAutosave = (delayMs = autosaveDebounceMs) => {
        if (disposed) return;
        clearAutosaveTimer();
        autosaveTimer = setTimeout(() => {
            void performSave('autosave');
        }, Math.max(0, delayMs));
    };

    const scheduleRetry = () => {
        if (disposed || retryCount >= maxRetries) return false;

        retryCount += 1;
        const delay = retryBaseMs * (2 ** (retryCount - 1));

        clearRetryTimer();
        hasPendingRetry = true;
        retryTimer = setTimeout(() => {
            void performSave('autosave');
        }, delay);

        return true;
    };

    const performSave = async (reason: SaveReason) => {
        if (disposed || isSaving) return;

        const startState = useEditorStore.getState();
        if (reason === 'autosave' && !startState.isDirty) {
            return;
        }

        clearAutosaveTimer();
        clearRetryTimer();
        isSaving = true;
        startState.setSaving(true);

        // Mark this snapshot as persisted; if edits happen during save, markDirty()
        // will set the flag back to true and schedule another save.
        startState.markSaved();

        const graphData = parseGraphData();
        let retryScheduledFromError = false;

        try {
            await persistence.save({
                ref,
                graphData,
                reason,
            });

            retryCount = 0;

            const { projectId, trackEvent } = useEditorStore.getState();
            if (projectId) {
                trackEvent('project_saved', { project_id: projectId, reason });
            }
        } catch (error) {
            console.error('Editor persistence save failed:', error);
            useEditorStore.getState().markDirty();
            retryScheduledFromError = scheduleRetry();
        } finally {
            isSaving = false;
            useEditorStore.getState().setSaving(false);

            if (!disposed && useEditorStore.getState().isDirty && !retryScheduledFromError) {
                scheduleAutosave();
            }
        }
    };

    const unsubscribe = useEditorStore.subscribe((state) => {
        if (disposed) return;

        if (!state.isDirty) {
            clearAutosaveTimer();
            clearRetryTimer();
            return;
        }

        if (state.isSaving || hasPendingRetry) {
            return;
        }

        scheduleAutosave();
    });

    return {
        flush: async () => {
            clearTimers();
            await performSave('manual');
        },
        dispose: () => {
            disposed = true;
            clearTimers();
            unsubscribe();
        },
    };
}

export function useEditorPersistence<TRef>(
    config: EditorHostConfig<TRef>,
    options: UseEditorPersistenceOptions = {}
): void {
    const {
        enabled = true,
        maxRetries = DEFAULT_MAX_RETRIES,
        retryBaseMs = DEFAULT_RETRY_BASE_MS,
    } = options;

    useEffect(() => {
        if (!enabled) return;

        const controller = createEditorPersistenceController({
            ref: config.ref,
            persistence: config.persistence,
            autosaveDebounceMs: config.autosaveDebounceMs,
            maxRetries,
            retryBaseMs,
        });

        return () => {
            controller.dispose();
        };
    }, [
        config.autosaveDebounceMs,
        config.persistence,
        config.ref,
        enabled,
        maxRetries,
        retryBaseMs,
    ]);
}
