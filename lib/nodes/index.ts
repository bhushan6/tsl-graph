import { registry } from '../registry';
import { constantNodes } from './constants';
import { mathNodes } from './math';
import { easingNodes } from './easing';
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
import { localNodes } from './local';
import { postNodes, POST_ANCHOR_NODE_TYPES, POST_INPUT_DEFAULT_OUTPUTS, POST_INPUT_RAW_TEXTURE_OUTPUTS, POST_NODE_TYPES } from './post';
import { postEffectNodes, POST_FX_NODE_TYPES } from './post-effects';
import { withNodeDescriptions } from './descriptions';


// Register all nodes
export function initializeNodes() {
    registry.registerMany(withNodeDescriptions(constantNodes));
    registry.registerMany(withNodeDescriptions(mathNodes));
    registry.registerMany(withNodeDescriptions(easingNodes));
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
    registry.registerMany(withNodeDescriptions(localNodes));
    registry.registerMany(withNodeDescriptions(postNodes));
    registry.registerMany(withNodeDescriptions(postEffectNodes));
}


// Re-export for convenience
export { constantNodes, mathNodes, easingNodes, geometryNodes, materialNodes, subgraphNodes, MATERIAL_NODE_TYPES, textureNodes, modelNodes, advancedNodes, noiseNodes, utilsNodes, logicNodes, loopNodes, assignNodes, globalNodes, localNodes, postNodes, POST_ANCHOR_NODE_TYPES, POST_INPUT_DEFAULT_OUTPUTS, POST_INPUT_RAW_TEXTURE_OUTPUTS, POST_NODE_TYPES, postEffectNodes, POST_FX_NODE_TYPES };
