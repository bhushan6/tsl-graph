import { registry } from '../registry';
import { constantNodes } from './constants';
import { mathNodes } from './math';
import { geometryNodes } from './geometry';
import { materialNodes, MATERIAL_NODE_TYPES } from './output';

// Register all nodes
export function initializeNodes() {
    registry.registerMany(constantNodes);
    registry.registerMany(mathNodes);
    registry.registerMany(geometryNodes);
    registry.registerMany(materialNodes);
}

// Re-export for convenience
export { constantNodes, mathNodes, geometryNodes, materialNodes, MATERIAL_NODE_TYPES };
