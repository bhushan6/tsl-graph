// Browser-local copy of unsaved edits, so a closed tab, crash or failed final
// save can be offered back the next time the project opens. localStorage is
// used because it is synchronous and therefore still lands during pagehide.

const STORAGE_PREFIX = 'tsl-graph:recovery:';

export interface RecoverySnapshot {
    id: string;
    savedAt: number;
    graphJson: string;
}

// Fields React Flow or the serializer change without a user edit.
const VOLATILE_KEYS = new Set(['measured', 'selected', 'dragging', 'resizing', 'updatedAt']);

const getStorage = (): Storage | null => {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
        // Access throws in some sandboxed or storage-blocked contexts.
        return null;
    }
};

let snapshotCounter = 0;

export function writeRecoverySnapshot(key: string, graphJson: string): string | null {
    const storage = getStorage();
    if (!storage) return null;

    snapshotCounter += 1;
    const snapshot: RecoverySnapshot = {
        id: `${Date.now().toString(36)}-${snapshotCounter}-${Math.random().toString(36).slice(2, 8)}`,
        savedAt: Date.now(),
        graphJson,
    };

    try {
        storage.setItem(STORAGE_PREFIX + key, JSON.stringify(snapshot));
        return snapshot.id;
    } catch (error) {
        console.warn('Failed to write editor recovery snapshot:', error);
        return null;
    }
}

export function readRecoverySnapshot(key: string): RecoverySnapshot | null {
    const storage = getStorage();
    if (!storage) return null;

    try {
        const raw = storage.getItem(STORAGE_PREFIX + key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<RecoverySnapshot>;
        if (
            typeof parsed.id !== 'string'
            || typeof parsed.savedAt !== 'number'
            || typeof parsed.graphJson !== 'string'
        ) {
            return null;
        }
        return parsed as RecoverySnapshot;
    } catch {
        return null;
    }
}

/** Removes the snapshot; with `expectedId`, only if it is still that snapshot. */
export function clearRecoverySnapshot(key: string, expectedId?: string): void {
    const storage = getStorage();
    if (!storage) return;

    try {
        if (expectedId !== undefined && readRecoverySnapshot(key)?.id !== expectedId) {
            return;
        }
        storage.removeItem(STORAGE_PREFIX + key);
    } catch {
        // Nothing useful to do if storage is unavailable.
    }
}

const stableStringify = (value: unknown): string => {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const keys = Object.keys(record)
            .filter((key) => !VOLATILE_KEYS.has(key) && record[key] !== undefined)
            .sort();
        return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
};

/** True when two serialized graphs differ only in layout measurement/selection noise. */
export function isSameGraphContent(a: string, b: string): boolean {
    try {
        return stableStringify(JSON.parse(a)) === stableStringify(JSON.parse(b));
    } catch {
        return false;
    }
}
