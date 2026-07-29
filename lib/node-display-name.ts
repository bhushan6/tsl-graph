import { registry } from './registry';
import type { AppNode, CodeNodeDefinition, SubgraphDefinition } from './types';

/**
 * Human-readable name for a node instance: registry label, subgraph/code
 * template name, or the raw type as a last resort.
 */
export function getNodeDisplayName(
    node: AppNode,
    subgraphs: Record<string, SubgraphDefinition>,
    codeNodes: Record<string, CodeNodeDefinition>
): string {
    const def = registry.get(node.data.type);
    if (def?.label) return def.label;
    if (node.data.type.startsWith('custom/')) {
        return subgraphs[node.data.type]?.name || node.data.type.replace('custom/', '');
    }
    if (node.data.type.startsWith('code/')) {
        return codeNodes[node.data.type]?.name || node.data.type.replace('code/', '');
    }
    return node.data.type;
}
