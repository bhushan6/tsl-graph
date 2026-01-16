
import { constantNodes } from './constants';
import { mathNodes } from './math';
import { geometryNodes } from './geometry';
import { materialNodes } from './output';
import { subgraphNodes } from './subgraph';
import { textureNodes } from './texture';
import { modelNodes } from './model';
import { advancedNodes } from './advanced';
import { noiseNodes } from './noise';
import { utilsNodes } from './utils';


// Aggregate all nodes
export const allNodes = [
    ...constantNodes,
    ...mathNodes,
    ...geometryNodes,
    ...materialNodes,
    ...subgraphNodes,
    ...textureNodes,
    ...modelNodes,
    ...advancedNodes,
    ...noiseNodes,
    ...utilsNodes,
] as const;

// Derived types - derived from the source arrays directly to avoid widening during spread
export type NodeType = 'group' | (string & typeof allNodes[number]['type']);

export type MaterialNodeType = typeof materialNodes[number]['type'];

export type NodeCategory = typeof allNodes[number]['category'];

export type TSLFunction = typeof allNodes[number]['tsl'];
