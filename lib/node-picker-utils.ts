import { registry } from './registry';
import { NodeDef, NodeType } from './types';
import type { Port, TSLType } from './types';

export interface GroupedNodeList<T> {
    [category: string]: T[];
}

export interface PickerHandle {
    id: string;
    label: string;
    type: TSLType;
}

export function isTypeMatch(portType: string, sourceDataType: string): boolean {
    if (!sourceDataType) return false;
    if (portType === 'any') return true;
    if (sourceDataType === 'any') return true;
    return portType === sourceDataType;
}

export function getTypeMatchRank(portType: string, sourceDataType: string): number {
    return isTypeMatch(portType, sourceDataType) ? 0 : 1;
}

export function isVisibleInputPort(port: Pick<Port, 'hidden' | 'propertyOnly'>): boolean {
    return !port.hidden && !port.propertyOnly;
}

export function isVisibleOutputPort(port: Pick<Port, 'hidden'>): boolean {
    return !port.hidden;
}

export function getVisibleInputHandles(inputs?: Record<string, Port>): PickerHandle[] {
    if (!inputs) return [];
    return Object.entries(inputs)
        .filter(([, port]) => isVisibleInputPort(port))
        .map(([id, port]) => ({
            id,
            label: port.label,
            type: port.type,
        }));
}

export function getVisibleOutputHandles(outputs?: Record<string, Port>): PickerHandle[] {
    if (!outputs) return [];
    return Object.entries(outputs)
        .filter(([, port]) => isVisibleOutputPort(port))
        .map(([id, port]) => ({
            id,
            label: port.label,
            type: port.type,
        }));
}

export function getHandleDisplayLabel(nodeLabel: string, handleLabel: string, totalHandlesForNode: number): string {
    if (totalHandlesForNode <= 1) return nodeLabel;
    return `${nodeLabel}.${handleLabel}`;
}

/**
 * Filter nodes that ACCEPT the sourceDataType (when dragging from Output)
 * We want nodes where at least one INPUT matches the sourceDataType.
 */
export const getCompatibleNodes = (sourceDataType: string): NodeDef[] => {
    const allDefs = registry.all();

    return allDefs.filter(def => {
        // MultiOp has dynamic inputs via operations, always compatible
        if (def.type === 'math/multiOp') return true;

        if (!def.inputs) return false;

        // Iterate through all inputs of the node
        return Object.values(def.inputs).some(input => {
            // Check if input type is compatible
            // If input.type is 'any', it accepts anything
            // If sourceDataType is 'any', it can go anywhere? (Not necessarily, but usually safer to allow)
            // Exact match
            if (input.type === 'any') return true;
            if (sourceDataType === 'any') return true;

            // Handle vector/matrix type matching broadly if needed, but strict for now
            // Special cases (e.g. all scalars compatible? float accepts int?)
            // TSL graph typically has strict types but 'any' hole

            return input.type === sourceDataType;
        });
    });
};

/**
 * Filter nodes that PROVIDE the targetDataType (when dragging from Input)
 * We want nodes where at least one OUTPUT matches the targetDataType.
 */
export const getNodesWithOutputType = (targetDataType: string): NodeDef[] => {
    const allDefs = registry.all();

    return allDefs.filter(def => {
        if (!def.outputs) return false;

        return Object.values(def.outputs).some(output => {
            if (output.type === 'any') return true;
            if (targetDataType === 'any') return true;

            return output.type === targetDataType;
        });
    });
};

export const getGroupedCompatibleNodes = <T extends { category: string }>(nodes: T[]): GroupedNodeList<T> => {
    const grouped: GroupedNodeList<T> = {};
    for (const def of nodes) {
        (grouped[def.category] ??= []).push(def);
    }
    return grouped;
};

export const getAllNodes = (): NodeDef[] => {
    return registry.all()
};

export const getAllNodesButExclud = (excludedNodes: NodeType[]): NodeDef[] => {
    return registry.allButExclud(excludedNodes)
};
