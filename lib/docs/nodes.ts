import type { BaseNodeDef, Port, TSLType } from '@/lib/nodes/definitions';
import { initializeNodes } from '@/lib/nodes';
import { registry } from '@/lib/registry';

export type PortDoc = {
    key: string;
    label: string;
    type: TSLType;
    default?: Port['default'];
    connectionOnly?: boolean;
    propertyOnly?: boolean;
    hidden?: boolean;
    isMaterialProp?: boolean;
    options?: Port['options'];
};

export type NodeDoc = {
    type: string;
    label: string;
    category: string;
    description: string;
    tsl: string;
    importFrom?: string;
    pure?: boolean;
    callable?: boolean;
    inputs: PortDoc[];
    outputs: PortDoc[];
};

export type CategoryDoc = {
    name: string;
    nodes: NodeDoc[];
};

const EXCLUDED_TYPES = new Set(['subgraph/input', 'subgraph/output']);
const EXCLUDED_CATEGORIES = new Set(['Material']);

function shouldIncludeNode(def: BaseNodeDef): boolean {
    if (EXCLUDED_CATEGORIES.has(def.category)) return false;
    if (EXCLUDED_TYPES.has(def.type)) return false;
    return true;
}

function generateDescription(def: BaseNodeDef): string {
    if (def.description) return def.description;
    if (def.type === 'post/input') {
        return 'Provides scene color, depth, and normal textures for post-processing.';
    }
    if (def.type === 'post/output') {
        return 'Defines the final color output for the post-processing pipeline.';
    }
    if (def.tsl.startsWith('__')) {
        return 'Special-purpose editor node.';
    }
    return `TSL node wrapping the \`${def.tsl}\` function.`;
}

function toPortDocs(ports?: Record<string, Port>): PortDoc[] {
    if (!ports) return [];
    return Object.entries(ports).map(([key, port]) => ({
        key,
        label: port.label,
        type: port.type,
        default: port.default,
        connectionOnly: port.connectionOnly,
        propertyOnly: port.propertyOnly,
        hidden: port.hidden,
        isMaterialProp: port.isMaterialProp,
        options: port.options,
    }));
}

export function slugFromType(type: string): string {
    return type.replace(/\//g, '--');
}

export function typeFromSlug(slug: string): string {
    return slug.replace(/--/g, '/');
}

function toNodeDoc(def: BaseNodeDef): NodeDoc {
    return {
        type: def.type,
        label: def.label,
        category: def.category,
        description: def.description ?? generateDescription(def),
        tsl: def.tsl,
        importFrom: def.importFrom,
        pure: def.pure,
        callable: def.callable,
        inputs: toPortDocs(def.inputs),
        outputs: toPortDocs(def.outputs),
    };
}

export function getNodeDocs(): { categories: CategoryDoc[]; nodesByType: Record<string, NodeDoc> } {
    initializeNodes();
    const nodes = registry
        .all()
        .filter(shouldIncludeNode)
        .map(toNodeDoc)
        .sort((a, b) => a.label.localeCompare(b.label));

    const nodesByType: Record<string, NodeDoc> = {};
    for (const node of nodes) nodesByType[node.type] = node;

    const categoriesMap = new Map<string, NodeDoc[]>();
    for (const node of nodes) {
        const list = categoriesMap.get(node.category);
        if (list) list.push(node);
        else categoriesMap.set(node.category, [node]);
    }

    const categories: CategoryDoc[] = [...categoriesMap.entries()]
        .map(([name, nodes]) => ({
            name,
            nodes: nodes.sort((a, b) => a.label.localeCompare(b.label)),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

    return { categories, nodesByType };
}

export function getNodeDocBySlug(slug: string): NodeDoc | null {
    const type = typeFromSlug(slug);
    const { nodesByType } = getNodeDocs();
    return nodesByType[type] ?? null;
}
