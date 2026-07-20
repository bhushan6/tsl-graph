import type { AppNode, TSLType, TSLValueType } from '@/lib/types';

export type UniformKind = 'float' | 'int' | 'bool' | 'vec2' | 'vec3' | 'vec4' | 'color';

export const UNIFORM_KINDS: UniformKind[] = [
    'float',
    'int',
    'bool',
    'vec2',
    'vec3',
    'vec4',
    'color',
];

export function getUniformKindFromNode(node: Pick<AppNode, 'data'>): UniformKind {
    const raw = node.data?.values?.uniformType;
    return UNIFORM_KINDS.includes(raw as UniformKind) ? (raw as UniformKind) : 'float';
}

export function getUniformOutputs(kind: UniformKind): Record<string, { label: string; type: TSLType }> {
    switch (kind) {
        case 'vec2':
            return {
                x: { label: 'X', type: 'float' },
                y: { label: 'Y', type: 'float' },
                out: { label: 'XY', type: 'vec2' },
            };
        case 'vec3':
            return {
                x: { label: 'X', type: 'float' },
                y: { label: 'Y', type: 'float' },
                z: { label: 'Z', type: 'float' },
                out: { label: 'XYZ', type: 'vec3' },
            };
        case 'vec4':
            return {
                x: { label: 'X', type: 'float' },
                y: { label: 'Y', type: 'float' },
                z: { label: 'Z', type: 'float' },
                w: { label: 'W', type: 'float' },
                out: { label: 'XYZW', type: 'vec4' },
            };
        case 'color':
            return {
                r: { label: 'R', type: 'float' },
                g: { label: 'G', type: 'float' },
                b: { label: 'B', type: 'float' },
                out: { label: 'RGB', type: 'color' },
            };
        case 'bool':
            return {
                out: { label: 'Out', type: 'bool' },
            };
        case 'int':
            return {
                out: { label: 'Out', type: 'int' },
            };
        case 'float':
        default:
            return {
                out: { label: 'Out', type: 'float' },
            };
    }
}

function hexToRgb(hex: string): [number, number, number] {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
        return [
            parseInt(result[1], 16) / 255,
            parseInt(result[2], 16) / 255,
            parseInt(result[3], 16) / 255,
        ];
    }
    return [1, 1, 1];
}

function rgbToHex(r: number, g: number, b: number): string {
    const toHex = (v: number) => {
        const clamped = Math.max(0, Math.min(1, v));
        const hex = Math.round(clamped * 255).toString(16);
        return hex.length === 1 ? `0${hex}` : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function normalizeComponents(value: TSLValueType): number[] {
    if (typeof value === 'boolean') return [value ? 1 : 0];
    if (typeof value === 'string') {
        if (value.startsWith('#')) return hexToRgb(value);
        const parsed = parseFloat(value);
        return [Number.isFinite(parsed) ? parsed : 0];
    }
    if (Array.isArray(value)) return value.map((v) => Number(v) || 0);
    return [Number(value) || 0];
}

export function getUniformDefaultValue(kind: UniformKind): TSLValueType {
    switch (kind) {
        case 'color':
            return '#ffffff';
        case 'bool':
            return false;
        case 'vec2':
            return [0, 0];
        case 'vec3':
            return [0, 0, 0];
        case 'vec4':
            return [0, 0, 0, 1];
        case 'int':
        case 'float':
        default:
            return 0;
    }
}

export function coerceUniformValue(kind: UniformKind, prevValue: TSLValueType | undefined): TSLValueType {
    if (prevValue === undefined || prevValue === null) {
        return getUniformDefaultValue(kind);
    }

    const components = normalizeComponents(prevValue);

    switch (kind) {
        case 'float':
            return components[0] ?? 0;
        case 'int':
            return Math.round(components[0] ?? 0);
        case 'bool':
            return components.some((v) => v !== 0);
        case 'vec2': {
            const [x = 0, y = 0] = components;
            return [x, y];
        }
        case 'vec3': {
            const [x = 0, y = 0, z = 0] = components;
            return [x, y, z];
        }
        case 'vec4': {
            const [x = 0, y = 0, z = 0, w] = components;
            return [x, y, z, w ?? 1];
        }
        case 'color': {
            if (typeof prevValue === 'string' && prevValue.startsWith('#')) {
                return prevValue;
            }
            const [r = 1, g = 1, b = 1] = components;
            return rgbToHex(r, g, b);
        }
        default:
            return prevValue;
    }
}

export interface UniformRange {
    min?: number;
    max?: number;
    step?: number;
}

export function uniformKindSupportsRange(kind: UniformKind): boolean {
    return kind !== 'bool' && kind !== 'color';
}

const asFiniteNumber = (value: unknown): number | undefined => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return typeof num === 'number' && Number.isFinite(num) ? num : undefined;
};

export function getUniformRange(source: unknown, kind: UniformKind): UniformRange {
    if (!uniformKindSupportsRange(kind)) return {};

    const src = (source ?? {}) as { min?: unknown; max?: unknown; step?: unknown };
    let min = asFiniteNumber(src.min);
    let max = asFiniteNumber(src.max);
    let step = asFiniteNumber(src.step);

    if (min !== undefined && max !== undefined && min > max) {
        min = undefined;
        max = undefined;
    }
    if (step !== undefined && step <= 0) {
        step = undefined;
    }

    if (kind === 'int') {
        if (min !== undefined) min = Math.round(min);
        if (max !== undefined) max = Math.round(max);
        step = Math.max(1, Math.round(step ?? 1));
    }

    const range: UniformRange = {};
    if (min !== undefined) range.min = min;
    if (max !== undefined) range.max = max;
    if (step !== undefined) range.step = step;
    return range;
}

/** Returns a copy of the object with the range metadata keys removed. */
export function stripRangeFields<T extends object>(source: T): T {
    const next = { ...source } as Record<string, unknown>;
    delete next.min;
    delete next.max;
    delete next.step;
    return next as T;
}

export function hasSliderRange(range: UniformRange): boolean {
    return range.min !== undefined && range.max !== undefined;
}

export function getEffectiveStep(kind: UniformKind, range: UniformRange): number {
    if (kind === 'int') return Math.max(1, Math.round(range.step ?? 1));
    return range.step ?? 0.1;
}

export function clampUniformValue(
    kind: UniformKind,
    rawValue: TSLValueType | undefined,
    range: UniformRange
): TSLValueType {
    const value = coerceUniformValue(kind, rawValue);
    if (!uniformKindSupportsRange(kind)) return value;
    if (range.min === undefined && range.max === undefined) return value;

    const clamp = (v: number): number => {
        let next = v;
        if (range.min !== undefined) next = Math.max(range.min, next);
        if (range.max !== undefined) next = Math.min(range.max, next);
        return kind === 'int' ? Math.round(next) : next;
    };

    if (Array.isArray(value)) return (value as number[]).map((v) => clamp(Number(v)));
    if (typeof value === 'number') return clamp(value);
    return value;
}

export function formatUniformValueExpression(kind: UniformKind, rawValue: TSLValueType | undefined): string {
    const value = coerceUniformValue(kind, rawValue);

    switch (kind) {
        case 'float':
            return String(Number(value ?? 0));
        case 'int':
            return String(Math.round(Number(value ?? 0)));
        case 'bool':
            return value ? 'true' : 'false';
        case 'vec2': {
            const [x = 0, y = 0] = Array.isArray(value) ? value : [Number(value ?? 0), 0];
            return `new THREE.Vector2(${Number(x)}, ${Number(y)})`;
        }
        case 'vec3': {
            const [x = 0, y = 0, z = 0] = Array.isArray(value) ? value : [Number(value ?? 0), 0, 0];
            return `new THREE.Vector3(${Number(x)}, ${Number(y)}, ${Number(z)})`;
        }
        case 'vec4': {
            const [x = 0, y = 0, z = 0, w = 1] = Array.isArray(value) ? value : [Number(value ?? 0), 0, 0, 1];
            return `new THREE.Vector4(${Number(x)}, ${Number(y)}, ${Number(z)}, ${Number(w)})`;
        }
        case 'color': {
            const hex = typeof value === 'string' ? value : '#ffffff';
            return `new THREE.Color("${hex}")`;
        }
        default:
            return String(value ?? 0);
    }
}
