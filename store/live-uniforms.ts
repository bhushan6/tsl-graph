import { create } from 'zustand';

import type { TSLValueType } from '@/lib/types';

interface LiveUniformState {
    values: Record<string, TSLValueType>;
    setValue: (key: string, value: TSLValueType) => void;
    clearValue: (key: string) => void;
    clearAll: () => void;
}

/**
 * High-frequency uniform values live outside the editor graph store.
 *
 * A slider can emit many values per second. Keeping those transient values in
 * the graph's `nodes`/`globals` arrays makes the controlled React Flow tree and
 * every editor-store selector observe each pointer move, even though the
 * shader only needs the underlying Three.js uniform to change.
 */
export const useLiveUniformStore = create<LiveUniformState>((set) => ({
    values: {},
    setValue: (key, value) => {
        set((state) => (
            Object.is(state.values[key], value)
                ? state
                : { values: { ...state.values, [key]: value } }
        ));
    },
    clearValue: (key) => {
        set((state) => {
            if (!(key in state.values)) return state;
            const values = { ...state.values };
            delete values[key];
            return { values };
        });
    },
    clearAll: () => {
        set((state) => (
            Object.keys(state.values).length === 0 ? state : { values: {} }
        ));
    },
}));

export const nodeUniformKey = (nodeId: string) => `node:${nodeId}`;
export const globalUniformKey = (entryId: string) => `global:${entryId}`;
