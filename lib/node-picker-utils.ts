import { registry } from './registry';
import { NodeDef } from './types';

export interface GroupedNodeList {
    [category: string]: NodeDef[];
}

/**
 * Filter nodes that ACCEPT the sourceDataType (when dragging from Output)
 * We want nodes where at least one INPUT matches the sourceDataType.
 */
export const getCompatibleNodes = (sourceDataType: string): NodeDef[] => {
    const allDefs = registry.all();

    return allDefs.filter(def => {
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

export const getGroupedCompatibleNodes = (nodes: NodeDef[]): GroupedNodeList => {
    const grouped: GroupedNodeList = {};
    for (const def of nodes) {
        (grouped[def.category] ??= []).push(def);
    }
    return grouped;
};
