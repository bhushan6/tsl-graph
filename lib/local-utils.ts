import type { Edge, Node } from '@xyflow/react';
import type { TSLNodeData } from '@/lib/types';

export { resolveNodeOutputTypeById } from './type-inference';

export const LOCAL_SET_NODE_TYPE = 'local/set' as const;
export const LOCAL_GET_NODE_TYPE = 'local/get' as const;
export const LOCAL_SET_INPUT_HANDLE = 'value' as const;

export function isLoopGroupNode(node: Node<TSLNodeData> | undefined): boolean {
    if (!node) return false;
    return node.type === 'loop' || node.data.type === 'loop';
}

export function isLocalSetType(type: string): boolean {
    return type === LOCAL_SET_NODE_TYPE;
}

export function isLocalGetType(type: string): boolean {
    return type === LOCAL_GET_NODE_TYPE;
}

export function isLocalSetNode(node: Node<TSLNodeData> | undefined): node is Node<TSLNodeData> {
    return !!node && isLocalSetType(node.data.type);
}

export function isLocalGetNode(node: Node<TSLNodeData> | undefined): node is Node<TSLNodeData> {
    return !!node && isLocalGetType(node.data.type);
}

export function getLocalName(node: Node<TSLNodeData> | undefined): string {
    if (!node) return '';
    const localName = node.data.values?.localName;
    if (typeof localName === 'string') return localName;
    const dataLocalName = node.data.localName;
    return typeof dataLocalName === 'string' ? dataLocalName : '';
}

export function normalizeLocalName(name: string): string {
    return name.trim().toLowerCase();
}

export function sanitizeLocalIdentifier(name: string, fallback: string): string {
    const trimmed = name.trim();
    const raw = trimmed.length > 0 ? trimmed : fallback;
    return raw.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&') || fallback;
}

export function getLocalSourceId(node: Node<TSLNodeData> | undefined): string | null {
    if (!node) return null;
    const localSourceId = node.data.values?.localSourceId;
    return typeof localSourceId === 'string' && localSourceId.length > 0 ? localSourceId : null;
}

export function getLocalSetSourceEdge(
    setNode: Node<TSLNodeData>,
    edges: Edge[]
): Edge | null {
    return edges.find((edge) => edge.target === setNode.id && edge.targetHandle === LOCAL_SET_INPUT_HANDLE) ?? null;
}

export function getLocalSetSourceNode(
    setNode: Node<TSLNodeData>,
    nodesById: Map<string, Node<TSLNodeData>>,
    edges: Edge[]
): Node<TSLNodeData> | null {
    const sourceEdge = getLocalSetSourceEdge(setNode, edges);
    if (!sourceEdge) return null;
    return nodesById.get(sourceEdge.source) ?? null;
}

export function getLocalSetReferenceLabel(
    setNode: Node<TSLNodeData>,
    nodesById: Map<string, Node<TSLNodeData>>,
    edges: Edge[]
): string {
    const sourceEdge = getLocalSetSourceEdge(setNode, edges);
    if (!sourceEdge) return setNode.id;

    const sourceNode = nodesById.get(sourceEdge.source);
    const sourceBaseName = getLocalName(sourceNode).trim() || sourceNode?.id || sourceEdge.source;
    const handle = sourceEdge.sourceHandle;
    if (!handle || handle === 'out') return sourceBaseName;
    return `${sourceBaseName}.${handle}`;
}

export function getLoopAncestorIds(
    node: Node<TSLNodeData>,
    nodesById: Map<string, Node<TSLNodeData>>
): string[] {
    const ids: string[] = [];
    let parentId = node.parentId;

    while (parentId) {
        const parent = nodesById.get(parentId);
        if (!parent) break;
        if (isLoopGroupNode(parent)) {
            ids.push(parent.id);
        }
        parentId = parent.parentId;
    }

    return ids;
}

export function isLocalScopeAccessible(
    setNode: Node<TSLNodeData>,
    getNode: Node<TSLNodeData>,
    nodesById: Map<string, Node<TSLNodeData>>
): boolean {
    const setLoopAncestors = getLoopAncestorIds(setNode, nodesById);

    // Set outside loops can be read from anywhere.
    if (setLoopAncestors.length === 0) return true;

    // Set is scoped to its nearest loop context.
    const setScopeLoopId = setLoopAncestors[0];
    const getLoopAncestors = getLoopAncestorIds(getNode, nodesById);
    return getLoopAncestors.includes(setScopeLoopId);
}

export function withLocalDependencyEdges(
    nodes: Node<TSLNodeData>[],
    edges: Edge[]
): Edge[] {
    const result = [...edges];
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edgeKeys = new Set(result.map((edge) => `${edge.source}->${edge.target}`));
    const nodesById = new Map(nodes.map((node) => [node.id, node]));

    for (const node of nodes) {
        if (!isLocalSetNode(node)) continue;
        const valueEdge = edges.find((edge) => edge.target === node.id && edge.targetHandle === LOCAL_SET_INPUT_HANDLE);
        if (!valueEdge || !nodeIds.has(valueEdge.source)) continue;

        const key = `${valueEdge.source}->${node.id}`;
        if (edgeKeys.has(key)) continue;

        result.push({
            id: `__local_set_dep__${valueEdge.source}__${node.id}`,
            source: valueEdge.source,
            target: node.id,
            sourceHandle: valueEdge.sourceHandle,
            targetHandle: LOCAL_SET_INPUT_HANDLE,
        });
        edgeKeys.add(key);
    }

    for (const node of nodes) {
        if (!isLocalGetType(node.data.type)) continue;

        const setId = getLocalSourceId(node);
        if (!setId || !nodeIds.has(setId)) continue;

        const setNode = nodesById.get(setId);
        if (!setNode || !isLocalSetNode(setNode)) continue;

        const key = `${setId}->${node.id}`;
        if (edgeKeys.has(key)) continue;

        result.push({
            id: `__local_dep__${setId}__${node.id}`,
            source: setId,
            target: node.id,
            sourceHandle: 'out',
            targetHandle: '__local_dep__',
        });
        edgeKeys.add(key);
    }

    return result;
}

export function getValidLocalSetNodesForGetNode(
    getNode: Node<TSLNodeData>,
    nodesById: Map<string, Node<TSLNodeData>>
): Node<TSLNodeData>[] {
    const results: Node<TSLNodeData>[] = [];
    for (const candidate of nodesById.values()) {
        if (!isLocalSetNode(candidate)) continue;
        if (!isLocalScopeAccessible(candidate, getNode, nodesById)) continue;
        results.push(candidate);
    }
    return results;
}

export function collectLocalSetNames(nodes: Node<TSLNodeData>[]): Map<string, string[]> {
    const result = new Map<string, string[]>();

    for (const node of nodes) {
        if (!isLocalSetNode(node)) continue;
        const name = normalizeLocalName(getLocalName(node));
        if (!name) continue;
        const list = result.get(name) ?? [];
        list.push(node.id);
        result.set(name, list);
    }

    return result;
}
