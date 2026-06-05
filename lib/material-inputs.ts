import type { TSLNodeData, NodeDef } from './types';

const normalizeKeys = (keys: readonly string[], def?: NodeDef): string[] => {
    if (!def?.inputs && !def?.outputs) return [...keys];
    const allowed = new Set([
        ...Object.keys(def.inputs ?? {}),
        ...Object.keys(def.outputs ?? {}),
    ]);
    return keys.filter((key) => allowed.has(key));
};

export function getMaterialStoredActiveInputs(
    data: TSLNodeData,
    def?: NodeDef
): string[] {
    const stored = Array.isArray(data.activeInputs) ? data.activeInputs : undefined;
    const base = stored === undefined ? (def?.defaultActiveInputs ?? []) : stored;
    return normalizeKeys(base, def);
}

export function getMaterialActiveInputsSet(
    data: TSLNodeData,
    def?: NodeDef,
    connectedInputs?: Iterable<string | null | undefined>
): Set<string> {
    const active = new Set(getMaterialStoredActiveInputs(data, def));
    if (connectedInputs) {
        for (const key of connectedInputs) {
            if (key) active.add(key);
        }
    }
    return active;
}
