import type { GlobalContextEntry, TSLType } from './types';

export interface GlobalPickerEntry {
    pickerKey: string;
    label: string;
    searchText: string;
    nodeType: 'global/ref';
    globalId: string;
    outputType: TSLType;
}

export const formatGlobalPickerLabel = (entry: Pick<GlobalContextEntry, 'name' | 'kind' | 'type'>): string => {
    return `${entry.name} · ${entry.kind} ${entry.type}`;
};

export const buildGlobalPickerEntries = (globals: GlobalContextEntry[]): GlobalPickerEntry[] => {
    return [...globals]
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
        .map((entry) => {
            const label = formatGlobalPickerLabel(entry);
            return {
                pickerKey: `global/ref:${entry.id}`,
                label,
                searchText: `${entry.name} ${entry.kind} ${entry.type}`.toLowerCase(),
                nodeType: 'global/ref' as const,
                globalId: entry.id,
                outputType: entry.type,
            };
        });
};
