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
import { postNodes, POST_ANCHOR_NODE_TYPES } from './post';
import { postEffectNodes, POST_FX_NODE_TYPES } from './post-effects';
import { withNodeDescriptions } from './descriptions';


// Register all nodes
export function initializeNodes() {
    registry.registerMany(withNodeDescriptions(constantNodes));
    registry.registerMany(withNodeDescriptions(mathNodes));
    registry.registerMany(withNodeDescriptions(geometryNodes));
    registry.registerMany(withNodeDescriptions(materialNodes));
    registry.registerMany(withNodeDescriptions(subgraphNodes));
    registry.registerMany(withNodeDescriptions(textureNodes));
    registry.registerMany(withNodeDescriptions(modelNodes));
    registry.registerMany(withNodeDescriptions(advancedNodes));
    registry.registerMany(withNodeDescriptions(noiseNodes));
    registry.registerMany(withNodeDescriptions(utilsNodes));
    registry.registerMany(withNodeDescriptions(logicNodes));
    registry.registerMany(withNodeDescriptions(loopNodes));
    registry.registerMany(withNodeDescriptions(assignNodes));
    registry.registerMany(withNodeDescriptions(globalNodes));
    registry.registerMany(withNodeDescriptions(postNodes));
    registry.registerMany(withNodeDescriptions(postEffectNodes));
}


// Re-export for convenience
export { constantNodes, mathNodes, geometryNodes, materialNodes, subgraphNodes, MATERIAL_NODE_TYPES, textureNodes, modelNodes, advancedNodes, noiseNodes, utilsNodes, logicNodes, loopNodes, assignNodes, globalNodes, postNodes, POST_ANCHOR_NODE_TYPES, postEffectNodes, POST_FX_NODE_TYPES };
