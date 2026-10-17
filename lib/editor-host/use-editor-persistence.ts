'use client';

import { useEffect } from 'react';
import { getEditRevision, subscribeToEdits, useEditorStore } from '@/store/editor';
import { clearRecoverySnapshot, writeRecoverySnapshot } from './recovery-snapshot';
import type { EditorAssetsAdapter, EditorHostConfig, SaveReason } from './types';

interface EditorPersistenceControllerOptions<TRef> {
    ref: TRef;
    persistence: EditorHostConfig<TRef>['persistence'];
    autosaveDebounceMs: number;
    maxRetries?: number;
    retryBaseMs?: number;
    recoveryKey?: string;
}

export interface EditorPersistenceController {
    flush: () => Promise<void>;
    /**
     * Stops autosave. Unsaved edits are captured synchronously (the host resets
     * the store right after) and saved in the background, after any in-flight
     * save; the recovery snapshot is kept until that save succeeds.
     */
    dispose: () => void;
}

interface UseEditorPersistenceOptions {
    enabled?: boolean;
    maxRetries?: number;
    retryBaseMs?: number;
}

interface EditorAssetReconcilerControllerOptions<TRef> {
    ref: TRef;
    assets: EditorAssetsAdapter<TRef>;
    debounceMs: number;
    hardDeleteAfterMs?: number;
}

export interface EditorAssetReconcilerController {
    dispose: () => void;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE_MS = 1000;
const RECOVERY_WRITE_THROTTLE_MS = 1000;

const parseGraphData = (): unknown => {
    const json = useEditorStore.getState().saveToJSON();
    return JSON.parse(json) as unknown;
};

let activeController: EditorPersistenceController | null = null;

/** Saves the mounted editor now, e.g. to retry after autosave gave up. */
export function saveEditorNow(): Promise<void> {
    return activeController?.flush() ?? Promise.resolve();
}

export function createEditorPersistenceController<TRef>({
    ref,
    persistence,
    autosaveDebounceMs,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryBaseMs = DEFAULT_RETRY_BASE_MS,
    recoveryKey,
}: EditorPersistenceControllerOptions<TRef>): EditorPersistenceController {
    let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    let retryCount = 0;
    let hasPendingRetry = false;
    // Retries are exhausted; autosave stays idle until an edit, reconnect or manual save.
    let failed = false;
    let currentSave: Promise<boolean> | null = null;
    let currentSaveRevision = 0;
    let recoverySnapshotId: string | null = null;

    const clearAutosaveTimer = () => {
        if (!autosaveTimer) return;
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
    };

    const clearRetryTimer = () => {
        hasPendingRetry = false;
        if (!retryTimer) return;
        clearTimeout(retryTimer);
        retryTimer = null;
    };

    const clearRecoveryTimer = () => {
        if (!recoveryTimer) return;
        clearTimeout(recoveryTimer);
        recoveryTimer = null;
    };

    const clearTimers = () => {
        clearAutosaveTimer();
        clearRetryTimer();
        clearRecoveryTimer();
    };

    const clearFailure = () => {
        retryCount = 0;
        if (!failed) return;
        failed = false;
        useEditorStore.getState().setSaveFailed(false);
    };

    const writeRecoveryNow = () => {
        clearRecoveryTimer();
        if (!recoveryKey || disposed || !useEditorStore.getState().isDirty) return;
        const id = writeRecoverySnapshot(recoveryKey, useEditorStore.getState().saveToJSON());
        if (id) recoverySnapshotId = id;
    };

    // Throttled rather than debounced so continuous editing still lands on disk.
    const scheduleRecoveryWrite = () => {
        if (!recoveryKey || disposed || recoveryTimer) return;
        recoveryTimer = setTimeout(() => {
            recoveryTimer = null;
            writeRecoveryNow();
        }, RECOVERY_WRITE_THROTTLE_MS);
    };

    const scheduleAutosave = (delayMs = autosaveDebounceMs) => {
        if (disposed) return;
        clearAutosaveTimer();
        autosaveTimer = setTimeout(() => {
            autosaveTimer = null;
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
            retryTimer = null;
            hasPendingRetry = false;
            void performSave('autosave');
        }, delay);

        return true;
    };

    const runSave = async (reason: SaveReason, revision: number): Promise<boolean> => {
        try {
            await persistence.save({
                ref,
                graphData: parseGraphData(),
                reason,
            });
        } catch (error) {
            console.error('Editor persistence save failed:', error);
            if (!disposed && !scheduleRetry()) {
                failed = true;
                useEditorStore.getState().setSaveFailed(true);
            }
            return false;
        }

        if (disposed) return true;

        clearFailure();
        if (getEditRevision() === revision) {
            if (recoveryKey && recoverySnapshotId) {
                clearRecoverySnapshot(recoveryKey, recoverySnapshotId);
                recoverySnapshotId = null;
            }
            useEditorStore.getState().markSaved();
        }

        const { projectId, trackEvent } = useEditorStore.getState();
        if (projectId) {
            trackEvent('project_saved', { project_id: projectId, reason });
        }
        return true;
    };

    const performSave = async (reason: SaveReason) => {
        if (disposed || currentSave) return;

        const startState = useEditorStore.getState();
        if (reason === 'autosave' && !startState.isDirty) {
            return;
        }

        clearAutosaveTimer();
        clearRetryTimer();
        if (reason === 'manual') {
            clearFailure();
        }
        startState.setSaving(true);

        // The graph is serialized synchronously here; edits after this point
        // bump the revision and keep the editor dirty for the next save.
        currentSaveRevision = getEditRevision();
        currentSave = runSave(reason, currentSaveRevision);
        try {
            await currentSave;
        } finally {
            currentSave = null;
        }

        if (disposed) return;
        useEditorStore.getState().setSaving(false);

        if (useEditorStore.getState().isDirty && !failed && !hasPendingRetry) {
            scheduleAutosave();
        }
    };

    const handleEdit = () => {
        if (disposed) return;
        scheduleRecoveryWrite();
        if (failed) {
            clearFailure();
        }
        // An in-flight save or pending retry picks up the latest graph when it runs.
        if (currentSave || hasPendingRetry) return;
        scheduleAutosave();
    };

    const handleOnline = () => {
        if (disposed || (!failed && !hasPendingRetry)) return;
        clearRetryTimer();
        clearFailure();
        scheduleAutosave(0);
    };

    const handlePageHidden = () => {
        if (disposed) return;
        writeRecoveryNow();
        // The page may not come back; start a pending autosave now.
        if (autosaveTimer) {
            scheduleAutosave(0);
        }
    };

    const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
            handlePageHidden();
        }
    };

    const unsubscribeEdits = subscribeToEdits(handleEdit);
    const unsubscribeStore = useEditorStore.subscribe((state, prevState) => {
        if (disposed || state.isDirty || !prevState.isDirty) return;
        // Clean again without this controller's help (host load, reset, ...).
        clearTimers();
        clearFailure();
    });

    const hasWindow = typeof window !== 'undefined' && typeof window.addEventListener === 'function';
    const hasDocument = typeof document !== 'undefined' && typeof document.addEventListener === 'function';
    if (hasWindow) {
        window.addEventListener('online', handleOnline);
        window.addEventListener('pagehide', handlePageHidden);
    }
    if (hasDocument) {
        document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    const controller: EditorPersistenceController = {
        flush: async () => {
            while (currentSave) {
                await currentSave.catch(() => false);
            }
            await performSave('manual');
        },
        dispose: () => {
            if (disposed) return;

            const state = useEditorStore.getState();
            const inFlight = currentSave;
            const inFlightRevision = currentSaveRevision;

            disposed = true;
            clearTimers();
            unsubscribeEdits();
            unsubscribeStore();
            if (hasWindow) {
                window.removeEventListener('online', handleOnline);
                window.removeEventListener('pagehide', handlePageHidden);
            }
            if (hasDocument) {
                document.removeEventListener('visibilitychange', handleVisibilityChange);
            }
            if (activeController === controller) {
                activeController = null;
            }
            if (inFlight) {
                state.setSaving(false);
            }

            if (!state.isDirty) return;

            // Capture now: the host resets the store right after dispose.
            const revision = getEditRevision();
            const graphJson = state.saveToJSON();
            const snapshotId = recoveryKey ? writeRecoverySnapshot(recoveryKey, graphJson) : null;

            const saveFinal = async () => {
                const inFlightSaved = inFlight ? await inFlight.catch(() => false) : false;
                if (inFlightSaved && inFlightRevision === revision) return;
                await persistence.save({
                    ref,
                    graphData: JSON.parse(graphJson) as unknown,
                    reason: 'autosave',
                });
            };

            void saveFinal().then(
                () => {
                    if (recoveryKey && snapshotId) {
                        clearRecoverySnapshot(recoveryKey, snapshotId);
                    }
                },
                (error) => {
                    console.error('Editor persistence final save failed; keeping recovery snapshot:', error);
                }
            );
        },
    };

    activeController = controller;

    // Edits made before this controller existed (React Flow measuring nodes on
    // mount, a restored recovery snapshot) still need saving.
    if (useEditorStore.getState().isDirty) {
        handleEdit();
    }

    return controller;
}

export function createEditorAssetReconcilerController<TRef>({
    ref,
    assets,
    debounceMs,
    hardDeleteAfterMs,
}: EditorAssetReconcilerControllerOptions<TRef>): EditorAssetReconcilerController {
    let reconcileTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    let lastGraphStructureVersion = useEditorStore.getState().graphStructureVersion;

    const clearReconcileTimer = () => {
        if (!reconcileTimer) return;
        clearTimeout(reconcileTimer);
        reconcileTimer = null;
    };

    const scheduleReconcile = () => {
        if (disposed) return;
        clearReconcileTimer();
        reconcileTimer = setTimeout(() => {
            const graphData = parseGraphData();
            void assets.reconcileGraphAssets?.({
                ref,
                graphData,
                hardDeleteAfterMs,
            }).catch((error) => {
                console.error('Editor asset reconciliation failed:', error);
            });
        }, Math.max(0, debounceMs));
    };

    scheduleReconcile();

    const unsubscribe = useEditorStore.subscribe((state) => {
        if (disposed) return;
        if (state.graphStructureVersion === lastGraphStructureVersion) return;

        lastGraphStructureVersion = state.graphStructureVersion;
        scheduleReconcile();
    });

    return {
        dispose: () => {
            disposed = true;
            clearReconcileTimer();
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
            recoveryKey: config.recoveryKey,
        });

        return () => {
            controller.dispose();
        };
    }, [
        config.autosaveDebounceMs,
        config.persistence,
        config.recoveryKey,
        config.ref,
        enabled,
        maxRetries,
        retryBaseMs,
    ]);
}
