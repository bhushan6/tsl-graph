import { BaseNodeDef } from './definitions';

/**
 * Subgraph anchor nodes - special nodes that define the interface of a subgraph.
 * 
 * subgraph/input: Represents the inputs to the subgraph. Has outputs that connect
 *                 to internal nodes.
 * 
 * subgraph/output: Represents the outputs from the subgraph. Has inputs that receive
 *                  values from internal nodes.
 * 
 * Note: These nodes have dynamic ports that are managed at runtime via the node's
 * data.ports field, not through static registry definitions.
 */

export const subgraphNodes = [
    {
        type: 'subgraph/input',
        label: 'Subgraph Input',
        category: 'Subgraph',
        // Dynamic outputs - defined per-instance in node data
        // The registry definition provides defaults, actual ports come from node.data.ports
        inputs: {},
        outputs: {
            out: { label: 'Input 1', type: 'any' },
        },
        tsl: '__subgraph_input__', // Placeholder - handled specially by compiler
        pure: true,
    },
    {
        type: 'subgraph/output',
        label: 'Subgraph Output',
        category: 'Subgraph',
        // Dynamic inputs - defined per-instance in node data
        inputs: {
            in: { label: 'Output 1', type: 'any' },
        },
        outputs: {},
        tsl: '__subgraph_output__', // Placeholder - handled specially by compiler
    },
] as const;

// Type check to ensure conformity without widening the inferred type
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _subgraphNodesCheck: readonly BaseNodeDef[] = subgraphNodes;
