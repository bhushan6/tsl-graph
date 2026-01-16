import { registry } from '../registry';
import { constantNodes } from './constants';
import { mathNodes } from './math';
import { geometryNodes } from './geometry';
import { materialNodes, MATERIAL_NODE_TYPES } from './output';
import { subgraphNodes } from './subgraph';
import { textureNodes } from './texture';
import { modelNodes } from './model';
import { advancedNodes } from './advanced';
import { noiseNodes } from './noise';

// Register all nodes
export function initializeNodes() {
    registry.registerMany(constantNodes);
    registry.registerMany(mathNodes);
    registry.registerMany(geometryNodes);
    registry.registerMany(materialNodes);
    registry.registerMany(subgraphNodes);
    registry.registerMany(textureNodes);
    registry.registerMany(modelNodes);
    registry.registerMany(advancedNodes);
    registry.registerMany(noiseNodes);
}

// Re-export for convenience
export { constantNodes, mathNodes, geometryNodes, materialNodes, subgraphNodes, MATERIAL_NODE_TYPES, textureNodes, modelNodes, advancedNodes, noiseNodes };

