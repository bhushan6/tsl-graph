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
import { utilsNodes } from './utils';
import { logicNodes } from './logic';
import { loopNodes } from './loop';
import { assignNodes } from './assign';
import { globalNodes } from './globals';


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
    registry.registerMany(utilsNodes);
    registry.registerMany(logicNodes);
    registry.registerMany(loopNodes);
    registry.registerMany(assignNodes);
    registry.registerMany(globalNodes);
}


// Re-export for convenience
export { constantNodes, mathNodes, geometryNodes, materialNodes, subgraphNodes, MATERIAL_NODE_TYPES, textureNodes, modelNodes, advancedNodes, noiseNodes, utilsNodes, logicNodes, loopNodes, assignNodes, globalNodes };
