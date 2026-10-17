import type { TSLValueType } from '@/lib/types';
import { coerceUniformValue, type UniformKind } from './uniform-utils';

type UniformNodeLike = {
    value: unknown;
};

const uniformStore = new Map<string, { node: UniformNodeLike; kind: UniformKind }>();
let uniformFactory: ((value: unknown) => UniformNodeLike) | null = null;
export type UniformEvent =
    | { type: 'update'; id: string; kind: UniformKind; value: TSLValueType }
    | { type: 'remove'; id: string }
    | { type: 'clear' };
const listeners = new Set<(event: UniformEvent) => void>();

/** Mirror uniform changes into isolated renderers, which own the real uniform nodes. */
export function subscribeUniformEvents(listener: (event: UniformEvent) => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

const emit = (event: UniformEvent) => {
    for (const listener of listeners) listener(event);
};

export function applyUniformEvent(event: UniformEvent) {
    if (event.type === 'update') updateUniformValue(event.id, event.kind, event.value);
    else if (event.type === 'remove') removeUniform(event.id);
    else clearUniforms();
}

export function setUniformFactory(factory: (value: unknown) => UniformNodeLike) {
    uniformFactory = factory;
}

function getUniformFactory() {
    if (!uniformFactory) {
        throw new Error('Uniform factory not set. Call setUniformFactory() before building materials.');
    }
    return uniformFactory;
}

function setUniformValue(node: UniformNodeLike, kind: UniformKind, value: TSLValueType) {
    if (kind === 'vec2' || kind === 'vec3' || kind === 'vec4') {
        const arr = Array.isArray(value) ? value : [Number(value ?? 0)];
        const x = Number(arr[0] ?? 0);
        const y = Number(arr[1] ?? 0);
        const z = Number(arr[2] ?? 0);
        const w = Number(arr[3] ?? 1);
        if (node.value && typeof node.value === 'object' && 'set' in (node.value as object)) {
            if (kind === 'vec2') {
                (node.value as { set: (x: number, y: number) => void }).set(x, y);
            } else if (kind === 'vec3') {
                (node.value as { set: (x: number, y: number, z: number) => void }).set(x, y, z);
            } else {
                (node.value as { set: (x: number, y: number, z: number, w: number) => void }).set(x, y, z, w);
            }
        } else {
            node.value = value;
        }
        return;
    }

    if (kind === 'color') {
        const hex = typeof value === 'string' ? value : '#ffffff';
        if (node.value && typeof node.value === 'object' && 'set' in (node.value as object)) {
            (node.value as { set: (hex: string) => void }).set(hex);
        } else {
            node.value = value;
        }
        return;
    }

    node.value = value;
}

export function ensureUniform(id: string, value: unknown, kind: UniformKind) {
    const existing = uniformStore.get(id);
    if (existing && existing.kind === kind) {
        return existing.node;
    }

    const node = getUniformFactory()(value) as UniformNodeLike;
    uniformStore.set(id, { node, kind });
    return node;
}

export function updateUniformValue(id: string, kind: UniformKind, value: TSLValueType) {
    emit({ type: 'update', id, kind, value });
    const entry = uniformStore.get(id);
    if (!entry || entry.kind !== kind) return;

    const coerced = coerceUniformValue(kind, value);
    setUniformValue(entry.node, kind, coerced);
}

export function removeUniform(id: string) {
    emit({ type: 'remove', id });
    uniformStore.delete(id);
}

export function clearUniforms() {
    emit({ type: 'clear' });
    uniformStore.clear();
}
